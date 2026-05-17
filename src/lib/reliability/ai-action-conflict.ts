import { AgentType, CommunicationChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PendingActionScope = {
  clientId: string;
  appointmentId?: string | null;
  purpose: string;
  channel: CommunicationChannel;
  agentType: AgentType;
  actionType: string;
  excludeProposalId?: string;
};

export class ConflictingAgentActionError extends Error {
  constructor(
    message: string,
    public readonly conflictingId: string
  ) {
    super(message);
    this.name = "ConflictingAgentActionError";
  }
}

/**
 * Blocks conflicting pending orchestrator proposals for the same client/appointment/purpose.
 * All AI actions must still enter via Master Orchestrator — Supervisor observes only.
 */
export async function assertNoConflictingPendingActions(
  scope: PendingActionScope
): Promise<void> {
  const conflict = await prisma.agentAction.findFirst({
    where: {
      clientId: scope.clientId,
      appointmentId: scope.appointmentId ?? null,
      purpose: scope.purpose,
      proposalStatus: { in: ["PENDING_APPROVAL", "ESCALATED"] },
      ...(scope.excludeProposalId && { id: { not: scope.excludeProposalId } }),
      OR: [
        { channel: { not: scope.channel } },
        { actionType: { not: scope.actionType } },
        { agentType: { not: scope.agentType } },
      ],
    },
    select: { id: true, agentType: true, actionType: true, channel: true },
  });

  if (conflict) {
    throw new ConflictingAgentActionError(
      `Conflicting pending AI action (${conflict.agentType} / ${conflict.actionType} on ${conflict.channel}). Resolve via Master Orchestrator.`,
      conflict.id
    );
  }
}
