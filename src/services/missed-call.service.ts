import {
  CallDirection,
  CommunicationStatus,
  NotificationPriority,
  StaffTaskPriority,
} from "@prisma/client";
import { createAuditLog } from "@/lib/audit";
import { recordCommunicationTimelineAndAudit } from "@/lib/communication-log";
import {
  assessMissedCallDedup,
  MISSED_TASK_TITLE,
} from "@/lib/missed-call/missed-call-dedup";
import {
  isMissedInboundCallStatus,
  type MissedCallTriggerReason,
} from "@/lib/missed-call/missed-call-statuses";
import { logger } from "@/lib/logger";
import { buildMissedCallMetadata } from "@/lib/missed-call/missed-call-metadata";
import { notifyStaff } from "@/lib/notifications/notification-bridge";
import { prisma } from "@/lib/prisma";
import { masterOrchestratorService } from "./master-orchestrator.service";
import { supervisorAgentService } from "./supervisor-agent.service";

export const MISSED_CALL_PURPOSE = "missed_inbound_call_follow_up";

export const MISSED_INBOUND_STATUSES: CommunicationStatus[] = [
  "NO_ANSWER",
  "MISSED",
  "ABANDONED",
  "FAILED",
];

/** Prisma filter for open missed inbound rows in analytics. */
export function openMissedInboundCallLogWhere() {
  return {
    direction: "INBOUND" as const,
    status: { in: MISSED_INBOUND_STATUSES },
    purpose: MISSED_CALL_PURPOSE,
  };
}
const FOLLOW_UP_DUE_MINUTES = 15;
const INBOUND_UNKNOWN_MRN = "INBOUND-UNKNOWN";

export type CaptureMissedInboundCallInput = {
  phoneNumber: string;
  status: CommunicationStatus;
  clientId?: string | null;
  appointmentId?: string | null;
  callLogId?: string | null;
  externalRef?: string | null;
  triggerReason: MissedCallTriggerReason;
  systemUserId?: string;
};

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-10) || phone.trim();
}

async function resolveSystemUserId(explicit?: string) {
  if (explicit) return explicit;
  const admin = await prisma.user.findFirst({
    where: { email: "admin@medflow.ai", status: "ACTIVE" },
    select: { id: true },
  });
  return admin?.id ?? null;
}

async function resolveClientForInbound(
  phoneNumber: string,
  clientId?: string | null
): Promise<{ clientId: string; identified: boolean }> {
  if (clientId) {
    const existing = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (existing) return { clientId: existing.id, identified: true };
  }

  const digits = normalizePhone(phoneNumber);
  if (digits.length >= 7) {
    const byPhone = await prisma.client.findFirst({
      where: {
        OR: [
          { phone: { contains: digits } },
          { phone: phoneNumber },
        ],
      },
      select: { id: true },
    });
    if (byPhone) return { clientId: byPhone.id, identified: true };
  }

  const placeholder = await prisma.client.findFirst({
    where: { mrn: INBOUND_UNKNOWN_MRN },
    select: { id: true },
  });
  if (placeholder) {
    return { clientId: placeholder.id, identified: false };
  }

  const fallback = await prisma.client.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!fallback) {
    throw new Error("No client record available for missed call logging");
  }
  return { clientId: fallback.id, identified: false };
}

export const missedCallService = {
  isMissedStatus: isMissedInboundCallStatus,

  async captureMissedInboundCall(input: CaptureMissedInboundCallInput) {
    if (!isMissedInboundCallStatus(input.status)) {
      throw new Error(`Not a missed inbound status: ${input.status}`);
    }

    const systemUserId = await resolveSystemUserId(input.systemUserId);
    if (!systemUserId) {
      throw new Error("No system user — seed admin@medflow.ai");
    }

    const phoneKey = normalizePhone(input.phoneNumber);
    const { clientId, identified } = await resolveClientForInbound(
      input.phoneNumber,
      input.clientId
    );

    logger.info("missed_call_service_capture", {
      status: input.status,
      triggerReason: input.triggerReason,
      phoneKey,
      callLogId: input.callLogId,
      clientIdentified: identified,
    });

    const metadataBase = buildMissedCallMetadata({
      phoneNumber: input.phoneNumber,
      phoneKey,
      status: input.status,
      triggerReason: input.triggerReason,
      clientIdentified: identified,
      externalRef: input.externalRef ?? undefined,
      provider: input.externalRef ? "twilio" : undefined,
    });

    let callLog = input.callLogId
      ? await prisma.callLog.findUnique({ where: { id: input.callLogId } })
      : null;

    if (callLog) {
      callLog = await prisma.callLog.update({
        where: { id: callLog.id },
        data: {
          status: input.status,
          phoneNumber: input.phoneNumber,
          direction: "INBOUND",
          purpose: MISSED_CALL_PURPOSE,
          metadata: buildMissedCallMetadata({
            phoneNumber: input.phoneNumber,
            phoneKey,
            status: input.status,
            triggerReason: input.triggerReason,
            clientIdentified: identified,
            externalRef: input.externalRef ?? undefined,
            existing:
              typeof callLog.metadata === "object" && callLog.metadata
                ? (callLog.metadata as Record<string, unknown>)
                : null,
          }),
        },
      });
    } else {
      callLog = await prisma.callLog.create({
        data: {
          clientId,
          appointmentId: input.appointmentId ?? undefined,
          purpose: MISSED_CALL_PURPOSE,
          direction: "INBOUND",
          phoneNumber: input.phoneNumber,
          status: input.status,
          externalRef: input.externalRef ?? undefined,
          initiatedById: systemUserId,
          metadata: metadataBase,
        },
      });
      logger.info("missed_call_calllog_created", { callLogId: callLog.id, clientId });
    }

    await createAuditLog({
      action: "CREATE",
      entityType: "MissedInboundCall",
      entityId: callLog.id,
      userId: systemUserId,
      clientId,
      metadata: {
        status: input.status,
        triggerReason: input.triggerReason,
        phoneKey,
        clientIdentified: identified,
        callLogId: callLog.id,
      },
    });

    const voiceNoteCallLogId = callLog.id;
    await masterOrchestratorService
      .submitProposal(
        {
          agentType: "VOICE_CALL_AI",
          clientId,
          appointmentId: input.appointmentId,
          channel: "CALL",
          purpose: "inbound_missed_call_observed",
          actionType: "LOG_NOTE",
          description: `Inbound missed call observed (${input.status}).`,
          proposedPayload: {
            callLogId: voiceNoteCallLogId,
            phoneKey,
            status: input.status,
            triggerReason: input.triggerReason,
          },
        },
        { userId: systemUserId }
      )
      .catch((err) => {
        logger.warn("missed_call_voice_ai_note_failed", {
          error: err instanceof Error ? err.message : String(err),
          callLogId: voiceNoteCallLogId,
        });
      });

    if (identified) {
      await recordCommunicationTimelineAndAudit({
        clientId,
        channel: "CALL",
        entityType: "CallLog",
        entityId: callLog.id,
        title: "Missed inbound call",
        description: `Status: ${input.status}. Staff callback required.`,
        purpose: MISSED_CALL_PURPOSE,
        status: input.status,
        userId: systemUserId,
        appointmentId: input.appointmentId,
        metadata: {
          missedCall: true,
          triggerReason: input.triggerReason,
          direction: "INBOUND",
        },
      });
    }

    const dedup = await assessMissedCallDedup(input.phoneNumber);

    let staffTaskId: string | undefined = dedup.existingTaskId;

    if (!dedup.skipNewTask) {
      await prisma.callLog.update({
        where: { id: callLog.id },
        data: {
          metadata: buildMissedCallMetadata({
            phoneNumber: input.phoneNumber,
            phoneKey,
            status: input.status,
            triggerReason: input.triggerReason,
            clientIdentified: identified,
            aiFollowUpStatus: "ORCHESTRATOR_QUEUED",
            existing: callLog.metadata as Record<string, unknown> | null,
          }),
        },
      });

      await masterOrchestratorService.submitProposal(
        {
          agentType: "STAFF_ASSISTANT_AI",
          clientId,
          appointmentId: input.appointmentId,
          channel: "CALL",
          purpose: MISSED_CALL_PURPOSE,
          actionType: "CREATE_STAFF_TASK",
          description: `${MISSED_TASK_TITLE}. Phone: ${input.phoneNumber}. Trigger: ${input.triggerReason}.`,
          proposedPayload: {
            title: MISSED_TASK_TITLE,
            priority: dedup.priority,
            dueAtMinutes: FOLLOW_UP_DUE_MINUTES,
            phoneKey,
            callLogId: callLog.id,
            assignedRole: "FRONT_DESK_STAFF",
          },
        },
        { userId: systemUserId }
      );

      const task = await prisma.staffTask.findFirst({
        where: {
          clientId,
          title: MISSED_TASK_TITLE,
          description: { contains: phoneKey },
          createdAt: { gte: new Date(Date.now() - 120_000) },
        },
        orderBy: { createdAt: "desc" },
      });
      staffTaskId = task?.id;
    } else if (dedup.existingTaskId && dedup.priority !== "HIGH") {
      await prisma.staffTask.update({
        where: { id: dedup.existingTaskId },
        data: { priority: dedup.priority },
      });
    }

    const notificationPriority: NotificationPriority = dedup.escalateToManager
      ? "CRITICAL"
      : dedup.priority === "URGENT"
        ? "HIGH"
        : "HIGH";

    const assignedRole = dedup.escalateToManager
      ? ("MANAGER" as const)
      : ("FRONT_DESK_STAFF" as const);

    callLog = await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        metadata: buildMissedCallMetadata({
          phoneNumber: input.phoneNumber,
          phoneKey,
          status: input.status,
          triggerReason: input.triggerReason,
          clientIdentified: identified,
          aiFollowUpStatus: "NOTIFICATION_SENT",
          existing: callLog.metadata as Record<string, unknown> | null,
        }),
      },
    });

    const notification = await notifyStaff({
      channel: "orchestrator",
      source: "MISSED_INBOUND_CALL",
      sourceKey: `missed-call:event:${callLog.id}`,
      title: "Missed inbound call needs follow-up",
      message: identified
        ? `Inbound call not completed (${input.status}). Callback required within ${FOLLOW_UP_DUE_MINUTES} minutes.`
        : `Unknown caller ••••${phoneKey.slice(-4)} — inbound not completed (${input.status}).`,
      recommendedNextAction:
        "Call patient back and document outcome",
      clientId: identified ? clientId : undefined,
      appointmentId: input.appointmentId ?? undefined,
      staffTaskId,
      assignedRole,
      priority: notificationPriority,
      metadata: {
        callLogId: callLog.id,
        phoneKey,
        status: input.status,
        triggerReason: input.triggerReason,
        recentMissedCount1h: dedup.recentCount1h,
        escalateToManager: dedup.escalateToManager,
        taskDedupSkipped: dedup.skipNewTask,
      },
      createdByUserId: systemUserId,
    });

    if (dedup.escalateToManager) {
      await notifyStaff({
        channel: "orchestrator",
        source: "ORCHESTRATOR_ESCALATION",
        sourceKey: `missed-call-escalation:${phoneKey}:${Date.now()}`,
        title: "Repeated missed calls — manager review",
        message: `${dedup.recentCount1h} missed call(s) from the same number within 1 hour.`,
        clientId: identified ? clientId : undefined,
        assignedRole: "ADMIN",
        priority: "CRITICAL",
        metadata: { phoneKey, callLogId: callLog.id },
        createdByUserId: systemUserId,
      });
    }

    const savedCallLogId = callLog.id;
    await supervisorAgentService
      .observeMissedInboundCall({
        clientId,
        callLogId: savedCallLogId,
        phoneKey,
        status: input.status,
        recentCount1h: dedup.recentCount1h,
        escalateToManager: dedup.escalateToManager,
      })
      .catch((err) => {
        logger.warn("missed_call_supervisor_observe_failed", {
          error: err instanceof Error ? err.message : String(err),
          callLogId: savedCallLogId,
        });
      });

    callLog = await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        metadata: buildMissedCallMetadata({
          phoneNumber: input.phoneNumber,
          phoneKey,
          status: input.status,
          triggerReason: input.triggerReason,
          clientIdentified: identified,
          aiFollowUpStatus: "SUPERVISOR_OBSERVED",
          existing: callLog.metadata as Record<string, unknown> | null,
        }),
      },
    });

    return {
      callLog,
      notification,
      staffTaskId,
      dedup,
      clientIdentified: identified,
    };
  },

  async handleCallLogStatusUpdate(input: {
    callLogId: string;
    status: CommunicationStatus;
    triggerReason?: MissedCallTriggerReason;
    systemUserId?: string;
  }) {
    const log = await prisma.callLog.findUnique({
      where: { id: input.callLogId },
      include: { client: { select: { phone: true } } },
    });
    if (!log || log.direction !== "INBOUND") return null;
    if (!isMissedInboundCallStatus(input.status)) return null;

    return this.captureMissedInboundCall({
      phoneNumber: log.phoneNumber ?? log.client.phone ?? "+10000000000",
      status: input.status,
      clientId: log.clientId,
      appointmentId: log.appointmentId,
      callLogId: log.id,
      triggerReason: input.triggerReason ?? "status_update",
      systemUserId: input.systemUserId,
    });
  },
};
