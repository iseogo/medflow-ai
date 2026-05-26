/**
 * Safe MOCK_MODE coordination probe — test phone + cleanup; no real patient PHI.
 */
import { isMockModeForced } from "@/lib/integrations/env";
import { logger } from "@/lib/logger";
import { sanitizeMetadataForAudit } from "@/lib/security/phi-safe-log";
import { prisma } from "@/lib/prisma";
import { missedCallService } from "@/services/missed-call.service";

const PROBE_PHONE = "+15550009999";
const PROBE_EXTERNAL_REF = "mock_coord_probe";

export type CoordinationProbeResult = {
  ok: boolean;
  mockMode: boolean;
  checks: Record<string, boolean>;
  errors: string[];
  cleanedUp: boolean;
};

export async function runCoordinationMockProbe(): Promise<CoordinationProbeResult> {
  const mockMode = isMockModeForced();
  const errors: string[] = [];
  const checks: Record<string, boolean> = { mock_mode: mockMode };
  let callLogId: string | undefined;
  let notificationId: string | undefined;
  let taskId: string | undefined;
  let cleanedUp = false;

  if (!mockMode) {
    return {
      ok: false,
      mockMode: false,
      checks,
      errors: ["COORDINATION_PROBE requires MOCK_MODE=true"],
      cleanedUp: false,
    };
  }

  try {
    logger.info("coordination_mock_probe_start", {
      phoneSuffix: "9999",
      externalRef: PROBE_EXTERNAL_REF,
    });

    const result = await missedCallService.captureMissedInboundCall({
      phoneNumber: PROBE_PHONE,
      status: "NO_ANSWER",
      externalRef: PROBE_EXTERNAL_REF,
      triggerReason: "status_update",
    });

    callLogId = result.callLog.id;
    notificationId = result.notification.id;
    taskId = result.staffTaskId;

    checks.call_log_created = Boolean(callLogId);
    checks.staff_notification_created = Boolean(notificationId);
    checks.staff_task_created = Boolean(taskId);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "MissedInboundCall", entityId: callLogId },
    });
    checks.audit_log_created = Boolean(audit);

    const voiceNote = await prisma.agentAction.findFirst({
      where: {
        agentType: "VOICE_CALL_AI",
        purpose: "inbound_missed_call_observed",
        clientId: result.callLog.clientId,
        createdAt: { gte: new Date(Date.now() - 120_000) },
      },
    });
    checks.voice_call_ai_log_note = Boolean(voiceNote);

    checks.staff_assistant_proposal = Boolean(
      await prisma.agentAction.findFirst({
        where: {
          agentType: "STAFF_ASSISTANT_AI",
          purpose: "missed_inbound_call_follow_up",
          createdAt: { gte: new Date(Date.now() - 120_000) },
        },
      })
    );

    checks.supervisor_recommendation = Boolean(
      await prisma.supervisorRecommendation.findFirst({
        where: {
          code: "MISSED_INBOUND_CALL",
          clientId: result.callLog.clientId,
          createdAt: { gte: new Date(Date.now() - 120_000) },
        },
      })
    );
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    logger.error("coordination_mock_probe_failed", {
      error: errors[0],
      metadata: sanitizeMetadataForAudit({ callLogId }),
    });
  } finally {
    if (callLogId) {
      await prisma.staffNotification
        .deleteMany({
          where: {
            OR: [
              { sourceKey: `missed-call:event:${callLogId}` },
              { sourceKey: { startsWith: "missed-call-escalation:" } },
            ],
          },
        })
        .catch(() => undefined);
      if (taskId) {
        await prisma.staffTask.delete({ where: { id: taskId } }).catch(() => undefined);
      }
      await prisma.agentAction
        .deleteMany({
          where: {
            purpose: {
              in: ["inbound_missed_call_observed", "missed_inbound_call_follow_up"],
            },
            createdAt: { gte: new Date(Date.now() - 300_000) },
          },
        })
        .catch(() => undefined);
      await prisma.supervisorRecommendation
        .deleteMany({
          where: {
            code: "MISSED_INBOUND_CALL",
            createdAt: { gte: new Date(Date.now() - 300_000) },
          },
        })
        .catch(() => undefined);
      // Audit logs are immutable compliance records — never deleted, even for probes.
      // Probe entries are distinguishable by their entityType and recent timestamp.
      await prisma.callLog.delete({ where: { id: callLogId } }).catch(() => undefined);
      cleanedUp = true;
      checks.cleaned_up = true;
      logger.info("coordination_mock_probe_cleanup", { callLogId });
    }
  }

  const ok =
    errors.length === 0 &&
    Object.entries(checks)
      .filter(([k]) => k !== "mock_mode")
      .every(([, v]) => v === true);

  return { ok, mockMode: true, checks, errors, cleanedUp };
}
