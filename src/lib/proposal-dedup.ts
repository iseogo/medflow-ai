import { AgentType, CommunicationChannel } from "@prisma/client";
import { prisma } from "./prisma";

export type ProposalDedupKey = {
  clientId: string;
  appointmentId?: string | null;
  channel: CommunicationChannel;
  purpose: string;
  agentType: AgentType;
  actionType: string;
};

export class DuplicateProposalError extends Error {
  constructor(public readonly existingId: string) {
    super("Duplicate agent proposal for client, appointment, channel, purpose, and action");
    this.name = "DuplicateProposalError";
  }
}

export async function assertNoDuplicateProposal(key: ProposalDedupKey) {
  const existing = await prisma.agentAction.findFirst({
    where: {
      clientId: key.clientId,
      appointmentId: key.appointmentId ?? null,
      channel: key.channel,
      purpose: key.purpose,
      agentType: key.agentType,
      actionType: key.actionType,
      proposalStatus: { in: ["PENDING_APPROVAL", "APPROVED", "ESCALATED"] },
    },
    select: { id: true },
  });
  if (existing) {
    throw new DuplicateProposalError(existing.id);
  }
}
