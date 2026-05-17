import { CommunicationChannel, CommunicationStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { COMMUNICATION_IDEMPOTENCY_WINDOW_MINUTES } from "./reliability/constants";

export type CommunicationDedupKey = {
  clientId: string;
  appointmentId?: string | null;
  channel: CommunicationChannel;
  purpose: string;
};

export class DuplicateCommunicationError extends Error {
  constructor(
    public readonly existingId: string,
    public readonly channel: CommunicationChannel
  ) {
    super(
      `Duplicate ${channel} communication already exists for this client, appointment, and purpose`
    );
    this.name = "DuplicateCommunicationError";
  }
}

function timeWindowStart(): Date {
  const since = new Date();
  since.setMinutes(since.getMinutes() - COMMUNICATION_IDEMPOTENCY_WINDOW_MINUTES);
  return since;
}

function timeWindowBucket(): string {
  const ms = COMMUNICATION_IDEMPOTENCY_WINDOW_MINUTES * 60_000;
  return String(Math.floor(Date.now() / ms));
}

/** Stable idempotency key: client + appointment + channel + purpose + time window. */
export function buildCommunicationIdempotencyKey(key: CommunicationDedupKey): string {
  return [
    key.clientId,
    key.appointmentId ?? "none",
    key.channel,
    key.purpose,
    timeWindowBucket(),
  ].join(":");
}

function dedupWhere(key: CommunicationDedupKey) {
  const since = timeWindowStart();
  return {
    clientId: key.clientId,
    purpose: key.purpose,
    channel: key.channel,
    appointmentId: key.appointmentId ?? null,
    createdAt: { gte: since },
    status: { notIn: ["FAILED", "BOUNCED"] as CommunicationStatus[] },
  };
}

export async function findDuplicateCommunication(
  key: CommunicationDedupKey
): Promise<{ id: string } | null> {
  const where = dedupWhere(key);

  switch (key.channel) {
    case "CALL":
      return prisma.callLog.findFirst({ where, select: { id: true } });
    case "SMS":
      return prisma.smsLog.findFirst({ where, select: { id: true } });
    case "EMAIL":
      return prisma.emailLog.findFirst({ where, select: { id: true } });
    default:
      return null;
  }
}

export async function assertNoDuplicateCommunication(
  key: CommunicationDedupKey
): Promise<void> {
  const existing = await findDuplicateCommunication(key);
  if (existing) {
    throw new DuplicateCommunicationError(existing.id, key.channel);
  }
}

export async function findDuplicateAgentAction(
  key: CommunicationDedupKey
): Promise<{ id: string } | null> {
  const since = timeWindowStart();
  return prisma.agentAction.findFirst({
    where: {
      clientId: key.clientId,
      purpose: key.purpose,
      channel: key.channel,
      appointmentId: key.appointmentId ?? null,
      createdAt: { gte: since },
      proposalStatus: { in: ["PENDING_APPROVAL", "APPROVED", "ESCALATED", "EXECUTED"] },
    },
    select: { id: true },
  });
}

export async function assertNoDuplicateAgentAction(
  key: CommunicationDedupKey
): Promise<void> {
  const existing = await findDuplicateAgentAction(key);
  if (existing) {
    throw new DuplicateCommunicationError(existing.id, key.channel);
  }
}
