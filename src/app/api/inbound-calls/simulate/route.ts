import { CommunicationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { inboundCallDebug } from "@/lib/inbound-call/inbound-call-debug";
import { isMockModeForced } from "@/lib/integrations/env";
import { recordParsedMissedInbound } from "@/lib/missed-call/process-inbound-missed-webhook";
import { prisma } from "@/lib/prisma";

const PROBE_PHONE_DEFAULT = "+15550008888";
const PROBE_REF_PREFIX = "simulate_inbound_";

const ALLOWED: CommunicationStatus[] = [
  "NO_ANSWER",
  "MISSED",
  "ABANDONED",
  "FAILED",
];

/**
 * MOCK_MODE-only — simulates a missed inbound call through the full coordination pipeline.
 * Uses test phone + optional cleanup; no real patient data required.
 */
export async function POST(request: NextRequest) {
  const { error, user } = await requirePermission("communications:read");
  if (error) return error;

  if (!isMockModeForced()) {
    return NextResponse.json(
      { error: "Inbound simulate requires MOCK_MODE=true" },
      { status: 403 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const status = (String(body.status ?? "NO_ANSWER").toUpperCase() as CommunicationStatus);
  if (!ALLOWED.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${ALLOWED.join(", ")}` },
      { status: 400 }
    );
  }

  const phoneNumber = String(body.phoneNumber ?? PROBE_PHONE_DEFAULT);
  const provider = String(body.provider ?? "simulate");
  const cleanup = body.cleanup !== false;
  const externalRef =
    String(body.externalRef ?? "") ||
    `${PROBE_REF_PREFIX}${Date.now()}`;

  inboundCallDebug("simulate_start", {
    status,
    provider,
    phoneSuffix: phoneNumber.slice(-4),
    externalRef,
    userId: user?.id,
  });

  try {
    const recorded = await recordParsedMissedInbound(
      {
        phoneNumber,
        status,
        rawStatus: status,
        externalRef,
        triggerReason: "status_update",
        provider,
      },
      provider
    );

    const callLogId = recorded.result.callLog.id;
    inboundCallDebug("simulate_ok", {
      callLogId,
      notificationId: recorded.result.notification.id,
      staffTaskId: recorded.result.staffTaskId,
      clientIdentified: recorded.result.clientIdentified,
    });

    if (cleanup) {
      await cleanupSimulateRows(callLogId, recorded.result.staffTaskId);
      inboundCallDebug("simulate_cleanup", { callLogId });
    }

    return NextResponse.json({
      ok: true,
      simulated: true,
      cleanedUp: cleanup,
      callLogId,
      staffTaskId: recorded.result.staffTaskId,
      notificationId: recorded.result.notification.id,
      clientIdentified: recorded.result.clientIdentified,
      status,
      provider,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    inboundCallDebug("simulate_failed", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function cleanupSimulateRows(callLogId: string, taskId?: string) {
  await prisma.staffNotification.deleteMany({
    where: {
      OR: [
        { sourceKey: `missed-call:event:${callLogId}` },
        { sourceKey: { startsWith: "missed-call-escalation:" } },
      ],
    },
  });
  if (taskId) {
    await prisma.staffTask.delete({ where: { id: taskId } }).catch(() => undefined);
  }
  await prisma.agentAction.deleteMany({
    where: {
      purpose: {
        in: ["inbound_missed_call_observed", "missed_inbound_call_follow_up"],
      },
      createdAt: { gte: new Date(Date.now() - 300_000) },
    },
  });
  await prisma.supervisorRecommendation.deleteMany({
    where: {
      code: "MISSED_INBOUND_CALL",
      createdAt: { gte: new Date(Date.now() - 300_000) },
    },
  });
  await prisma.auditLog.deleteMany({
    where: {
      entityType: { in: ["MissedInboundCall", "SupervisorObservation"] },
      createdAt: { gte: new Date(Date.now() - 300_000) },
    },
  });
  await prisma.callLog.delete({ where: { id: callLogId } }).catch(() => undefined);
}
