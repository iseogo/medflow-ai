import { AgentType, CommunicationChannel, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { StaffOverrideActor } from "./staff-override";

export type PhysicalOrchestratorEvent = {
  eventType: string;
  clientId: string;
  appointmentId?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
  actor: StaffOverrideActor;
};

/**
 * Notifies Master Orchestrator of staff-originated physical events.
 * Recorded as an executed staff-override agent action (no AI automation).
 */
export async function notifyMasterOrchestratorPhysicalEvent(
  input: PhysicalOrchestratorEvent
) {
  const payload: Prisma.InputJsonValue = {
    source: "staff_physical",
    eventType: input.eventType,
    staffOverride: true,
    actorUserId: input.actor.userId,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    ...input.metadata,
  };

  return prisma.agentAction.create({
    data: {
      clientId: input.clientId,
      appointmentId: input.appointmentId ?? undefined,
      agentType: "FRONT_DESK_AI" as AgentType,
      agentName: "Staff Physical Event",
      proposalStatus: "EXECUTED",
      purpose: `physical_${input.eventType}`,
      channel: "SMS" as CommunicationChannel,
      actionType: "STAFF_PHYSICAL_EVENT",
      description: input.description,
      proposedPayload: payload,
      orchestratorNotes: `Staff physical event — ${input.actor.name}: ${input.description}`,
      staffOverride: true,
      staffOverrideByUserId: input.actor.userId,
      staffOverrideByName: input.actor.name,
      staffOverrideReason: input.actor.reason ?? input.eventType,
      staffOverrideAt: new Date(),
      executedAt: new Date(),
      initiatedById: input.actor.userId,
    },
  });
}
