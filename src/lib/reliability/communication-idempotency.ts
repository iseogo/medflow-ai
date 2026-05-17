import { CommunicationChannel } from "@prisma/client";
import { createAuditLog } from "@/lib/audit";
import { sanitizeMetadataForAudit } from "@/lib/security/phi-safe-log";
import { prisma } from "@/lib/prisma";
import { notifyStaff } from "@/lib/notifications/notification-bridge";
import {
  COMMUNICATION_IDEMPOTENCY_WINDOW_MINUTES,
  DUPLICATE_NOTIFY_LOOKBACK_HOURS,
  DUPLICATE_NOTIFY_THRESHOLD,
} from "./constants";
import {
  assertNoDuplicateCommunication,
  buildCommunicationIdempotencyKey,
  CommunicationDedupKey,
  DuplicateCommunicationError,
  findDuplicateCommunication,
} from "@/lib/communication-dedup";

export { DuplicateCommunicationError };

export async function logDuplicateCommunicationPrevented(input: {
  key: CommunicationDedupKey;
  idempotencyKey: string;
  existingId: string;
  userId?: string;
}) {
  await createAuditLog({
    action: "CREATE",
    entityType: "ReliabilityGuard",
    entityId: input.idempotencyKey,
    userId: input.userId,
    clientId: input.key.clientId,
    metadata: sanitizeMetadataForAudit({
      guard: "duplicate_communication",
      channel: input.key.channel,
      purpose: input.key.purpose,
      existingId: input.existingId,
      idempotencyKey: input.idempotencyKey,
      windowMinutes: COMMUNICATION_IDEMPOTENCY_WINDOW_MINUTES,
    }),
  });

  const since = new Date();
  since.setHours(since.getHours() - DUPLICATE_NOTIFY_LOOKBACK_HOURS);

  const repeatCount = await prisma.auditLog.count({
    where: {
      entityType: "ReliabilityGuard",
      entityId: input.idempotencyKey,
      createdAt: { gte: since },
    },
  });

  if (repeatCount >= DUPLICATE_NOTIFY_THRESHOLD) {
    await notifyStaff({
      channel: "system",
      source: "DUPLICATE_ACTION_PREVENTED",
      sourceKey: `duplicate-comm-repeat:${input.idempotencyKey}`,
      title: "Repeated duplicate communication blocked",
      message: `Multiple duplicate ${input.key.channel} sends blocked for purpose "${input.key.purpose}". Review client outreach.`,
      clientId: input.key.clientId,
      appointmentId: input.key.appointmentId ?? undefined,
      createdByUserId: input.userId,
      metadata: { idempotencyKey: input.idempotencyKey, repeatCount },
    }).catch(() => undefined);
  }
}

/** Block duplicate outbound comms; audit + optional staff alert on repeat risk. */
export async function assertOutboundCommunicationAllowed(
  key: CommunicationDedupKey,
  options?: { userId?: string }
) {
  const idempotencyKey = buildCommunicationIdempotencyKey(key);
  const existing = await findDuplicateCommunication(key);
  if (existing) {
    await logDuplicateCommunicationPrevented({
      key,
      idempotencyKey,
      existingId: existing.id,
      userId: options?.userId,
    });
    throw new DuplicateCommunicationError(existing.id, key.channel);
  }
  await assertNoDuplicateCommunication(key);
}
