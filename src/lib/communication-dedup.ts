import { CommunicationChannel } from "@prisma/client";
import { prisma } from "./prisma";

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

function dedupWhere(key: CommunicationDedupKey) {
  return {
    clientId: key.clientId,
    purpose: key.purpose,
    channel: key.channel,
    appointmentId: key.appointmentId ?? null,
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
  return prisma.agentAction.findFirst({
    where: dedupWhere(key),
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
