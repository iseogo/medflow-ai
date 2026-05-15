import { prisma } from "./prisma";

const BLOCKING_INTERVENTION_STATUSES = [
  "WALK_IN",
  "HUMAN_TAKEOVER",
  "AI_ESCALATED",
  "STAFF_REVIEW_REQUIRED",
  "URGENT",
] as const;

export class AiAutomationBlockedError extends Error {
  constructor(
    message: string,
    public readonly code: "AUTOMATION_HALTED" | "STAFF_OVERRIDE_ACTIVE"
  ) {
    super(message);
    this.name = "AiAutomationBlockedError";
  }
}

/**
 * Staff override and emergency halt take priority over new AI proposals.
 */
export async function assertAiAutomationAllowed(clientId: string) {
  const haltedCase = await prisma.agentAction.findFirst({
    where: {
      clientId,
      automationHalted: true,
      proposalStatus: { in: ["ESCALATED", "PENDING_APPROVAL"] },
    },
    select: { id: true },
  });
  if (haltedCase) {
    throw new AiAutomationBlockedError(
      "Automation is halted for this client (emergency or escalation)",
      "AUTOMATION_HALTED"
    );
  }

  const staffBlock = await prisma.staffIntervention.findFirst({
    where: {
      clientId,
      staffOverride: true,
      status: { in: [...BLOCKING_INTERVENTION_STATUSES] },
    },
    select: { id: true, status: true },
  });
  if (staffBlock) {
    throw new AiAutomationBlockedError(
      `Staff override active (${staffBlock.status}) — AI proposals blocked`,
      "STAFF_OVERRIDE_ACTIVE"
    );
  }

}
