import { CommunicationStatus, PrismaClient } from "@prisma/client";

const REQUIRED_STATUSES: CommunicationStatus[] = [
  "PENDING",
  "SENT",
  "DELIVERED",
  "ANSWERED",
  "FAILED",
  "NO_ANSWER",
  "BOUNCED",
  "RESPONDED",
  "ESCALATED",
];

const prisma = new PrismaClient();

async function main() {
  const [
    callCount,
    smsCount,
    emailCount,
    agentCount,
    callsWithClient,
    smsWithAppt,
    commTimeline,
    commAudit,
  ] = await Promise.all([
    prisma.callLog.count(),
    prisma.smsLog.count(),
    prisma.emailLog.count(),
    prisma.agentAction.count(),
    prisma.callLog.count({ where: { clientId: { not: "" } } }),
    prisma.smsLog.count({ where: { appointmentId: { not: null } } }),
    prisma.clientTimelineEvent.count({
      where: {
        eventType: {
          in: [
            "COMMUNICATION_CALL",
            "COMMUNICATION_SMS",
            "COMMUNICATION_EMAIL",
            "AGENT_ACTION",
          ],
        },
      },
    }),
    prisma.auditLog.count({
      where: {
        entityType: {
          in: ["CallLog", "SmsLog", "EmailLog", "AgentAction"],
        },
      },
    }),
  ]);

  const sampleCall = await prisma.callLog.findFirst({
    include: { client: true, appointment: true },
  });

  console.log(
    JSON.stringify(
      {
        models: { callCount, smsCount, emailCount, agentCount },
        allCallsLinkedToClient: callsWithClient === callCount,
        smsWithAppointment: smsWithAppt,
        communicationTimelineEvents: commTimeline,
        communicationAuditLogs: commAudit,
        sampleCallHasClient: !!sampleCall?.client,
        sampleCallAppointment: sampleCall?.appointmentId ?? null,
        statusEnumCount: REQUIRED_STATUSES.length,
      },
      null,
      2
    )
  );

  if (callCount > 0 && callsWithClient !== callCount) {
    console.error("Some call logs missing clientId");
    process.exit(1);
  }

  if (commTimeline > 0 && commAudit === 0) {
    console.error("Communication timeline events exist but no communication audit logs");
    process.exit(1);
  }

  const enumValues = Object.values(CommunicationStatus);
  const missingStatus = REQUIRED_STATUSES.filter((s) => !enumValues.includes(s));
  if (missingStatus.length) {
    console.error("Missing CommunicationStatus values:", missingStatus.join(", "));
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
