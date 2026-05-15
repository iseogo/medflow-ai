import { AgentType, PrismaClient } from "@prisma/client";
import { AGENT_DEFINITIONS } from "../src/lib/agents/definitions";
import { detectEmergencyLanguage } from "../src/lib/emergency-detect";

const REQUIRED_AGENTS: AgentType[] = [
  "MASTER_ORCHESTRATOR",
  "FRONT_DESK_AI",
  "INTAKE_AI",
  "APPOINTMENT_AI",
  "VOICE_CALL_AI",
  "SMS_REMINDER_AI",
  "EMAIL_AI",
  "STAFF_ASSISTANT_AI",
  "ESCALATION_AI",
];

const prisma = new PrismaClient();

async function main() {
  for (const type of REQUIRED_AGENTS) {
    const defn = AGENT_DEFINITIONS[type];
    if (!defn.systemPrompt || defn.allowedActions.length === 0) {
      console.error(`Invalid definition for ${type}`);
      process.exit(1);
    }
    if (
      !defn.escalationRules.length ||
      !defn.humanHandoffRules.length ||
      !defn.forbiddenActions.length
    ) {
      console.error(`Missing rules on ${type}`);
      process.exit(1);
    }
  }

  const emergency = detectEmergencyLanguage("patient has chest pain and cannot breathe");
  if (!emergency.isEmergency) {
    console.error("Emergency detector failed");
    process.exit(1);
  }

  const [pending, approved, rejected, escalated, orchestratorAudits, proposalTimeline] =
    await Promise.all([
      prisma.agentAction.count({ where: { proposalStatus: "PENDING_APPROVAL" } }),
      prisma.agentAction.count({ where: { proposalStatus: "APPROVED" } }),
      prisma.agentAction.count({ where: { proposalStatus: "REJECTED" } }),
      prisma.agentAction.count({
        where: { proposalStatus: "ESCALATED" },
      }),
      prisma.auditLog.count({
        where: { entityType: { in: ["AgentAction", "EmergencyFlow"] } },
      }),
      prisma.clientTimelineEvent.count({
        where: {
          eventType: {
            in: [
              "AGENT_PROPOSAL_CREATED",
              "AGENT_PROPOSAL_APPROVED",
              "AGENT_PROPOSAL_REJECTED",
              "AGENT_PROPOSAL_ESCALATED",
              "EMERGENCY_DETECTED",
            ],
          },
        },
      }),
    ]);

  const emergencyRow = await prisma.agentAction.findFirst({
    where: { OR: [{ isEmergency: true }, { proposalStatus: "ESCALATED" }] },
  });

  console.log(
    JSON.stringify(
      {
        agentDefinitions: REQUIRED_AGENTS.length,
        proposals: { pending, approved, rejected, escalated },
        orchestratorAudits,
        proposalTimeline,
        hasEmergencySeed: !!emergencyRow,
      },
      null,
      2
    )
  );

  if (pending === 0 && escalated === 0) {
    console.error("Expected seed proposals (pending or escalated)");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
