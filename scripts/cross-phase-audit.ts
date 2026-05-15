/**
 * Cross-phase coordination audit (Phases 1–4).
 * Usage: npx tsx scripts/cross-phase-audit.ts
 */
import { PrismaClient, RoleType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AGENT_DEFINITIONS } from "../src/lib/agents/definitions";
import { detectEmergencyLanguage } from "../src/lib/emergency-detect";
import {
  DuplicateCommunicationError,
  orchestratorService,
} from "../src/services/orchestrator.service";
import {
  MasterOrchestratorError,
  masterOrchestratorService,
} from "../src/services/master-orchestrator.service";
import { physicalClientService } from "../src/services/physical-client.service";
import {
  ACTIVE_WAITING_ROOM_STATES,
  TERMINAL_WAITING_ROOM_STATES,
} from "../src/lib/waiting-room";

const prisma = new PrismaClient();

const REQUIRED_ROLES: RoleType[] = [
  "ADMIN",
  "MANAGER",
  "FRONT_DESK_STAFF",
  "BILLING_STAFF",
  "MEDICAL_RECORDS_STAFF",
  "CLINICAL_STAFF",
  "READ_ONLY",
];

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`OK: ${msg}`);
}

async function auditPhase1() {
  console.log("\n=== Phase 1 ===");

  const roles = await prisma.role.findMany();
  for (const r of REQUIRED_ROLES) {
    if (!roles.some((x) => x.type === r)) fail(`Missing role ${r}`);
  }
  ok(`All ${REQUIRED_ROLES.length} RBAC roles present`);

  const counts = await Promise.all([
    prisma.user.count(),
    prisma.client.count(),
    prisma.appointment.count(),
    prisma.staffTask.count(),
    prisma.staffIntervention.count(),
    prisma.auditLog.count(),
    prisma.clientTimelineEvent.count(),
    prisma.consentRecord.count(),
  ]);
  if (counts.some((c) => c === 0)) {
    fail(`Phase 1 seed counts low: ${counts.join(", ")}`);
  }
  ok("Core models populated (User, Client, Appointment, StaffTask, StaffIntervention, AuditLog, Timeline, Consent)");

  const admin = await prisma.user.findUnique({
    where: { email: "admin@medflow.ai" },
    include: { role: true },
  });
  if (!admin || admin.role.type !== "ADMIN") fail("Admin user missing");
  if (!(await bcrypt.compare("Admin123!", admin.passwordHash))) {
    fail("Admin password mismatch");
  }
  ok("Admin user and credentials");

  const staffAudit = await prisma.auditLog.count({
    where: { userId: admin.id, action: { in: ["CREATE", "UPDATE", "STAFF_OVERRIDE"] } },
  });
  if (staffAudit === 0) fail("No staff audit logs");
  ok(`Staff audit trail (${staffAudit} entries)`);
}

async function auditPhase2() {
  console.log("\n=== Phase 2 ===");

  const [calls, sms, emails, agents] = await Promise.all([
    prisma.callLog.count(),
    prisma.smsLog.count(),
    prisma.emailLog.count(),
    prisma.agentAction.count(),
  ]);
  if (!calls || !sms || !emails || !agents) {
    fail("Communication models not seeded");
  }
  ok("CallLog, SmsLog, EmailLog, AgentAction exist");

  const smsWithAppt = await prisma.smsLog.findFirst({
    where: { appointmentId: { not: null } },
    include: { client: true, appointment: true },
  });
  if (!smsWithAppt?.client) fail("SMS missing client link");
  ok("Communications linked to Client (and Appointment when set)");

  const commTimeline = await prisma.clientTimelineEvent.count({
    where: {
      eventType: {
        in: ["COMMUNICATION_CALL", "COMMUNICATION_SMS", "COMMUNICATION_EMAIL"],
      },
    },
  });
  const commAudit = await prisma.auditLog.count({
    where: { entityType: { in: ["CallLog", "SmsLog", "EmailLog"] } },
  });
  if (commTimeline === 0 || commAudit === 0) {
    fail("Communication timeline or audit missing");
  }
  ok("Communication logs create ClientTimelineEvent and AuditLog");

  const purpose = `cross_phase_dup_${Date.now()}`;
  const client = await prisma.client.findFirstOrThrow({ where: { mrn: "MRN-10001" } });
  await orchestratorService.sendSms(
    { clientId: client.id, purpose, messageBody: "coordination test" },
    { source: "staff" }
  );
  try {
    await orchestratorService.sendSms(
      { clientId: client.id, purpose, messageBody: "duplicate" },
      { source: "staff" }
    );
    fail("Duplicate communication was allowed");
  } catch (e) {
    if (!(e instanceof DuplicateCommunicationError)) throw e;
  }
  ok("Duplicate communication prevention");

  try {
    await orchestratorService.sendSms(
      { clientId: client.id, purpose: `blocked_ai_${Date.now()}`, messageBody: "x" },
      {}
    );
    fail("Unguarded AI direct send was allowed");
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes("blocked")) throw e;
  }
  ok("Direct AI communication send blocked (orchestrator guard)");

  const envSample = await import("fs").then((fs) =>
    fs.readFileSync(".env.example", "utf8")
  );
  if (/TWILIO|GMAIL|API_KEY\s*=\s*sk-/i.test(envSample)) {
    fail(".env.example exposes provider API keys");
  }
  ok("No real API keys in .env.example");
}

async function auditPhase3() {
  console.log("\n=== Phase 3 ===");

  if (Object.keys(AGENT_DEFINITIONS).length !== 9) {
    fail("Expected 9 agent definitions");
  }
  ok("Nine AI agent definitions");

  if (!detectEmergencyLanguage("having a stroke call 911").isEmergency) {
    fail("Emergency detection");
  }
  ok("Emergency language detection");

  const client2 = await prisma.client.findFirstOrThrow({ where: { mrn: "MRN-10002" } });
  try {
    await masterOrchestratorService.submitProposal({
      agentType: "SMS_REMINDER_AI",
      clientId: client2.id,
      channel: "SMS",
      purpose: "should_be_blocked",
      actionType: "SEND_SMS",
    });
    fail("AI proposal allowed under staff override intervention");
  } catch (e) {
    if (
      !(e instanceof MasterOrchestratorError) ||
      e.code !== "STAFF_OVERRIDE_ACTIVE"
    ) {
      throw e;
    }
  }
  ok("Staff override blocks new AI proposals (client2 walk-in)");

  const orchestratorAudit = await prisma.auditLog.count({
    where: { entityType: { in: ["AgentAction", "EmergencyFlow"] } },
  });
  if (orchestratorAudit === 0) fail("No orchestrator audit logs");
  ok(`Orchestrator audit logs (${orchestratorAudit})`);
}

async function auditGlobalFlow() {
  console.log("\n=== Global coordination flow ===");

  await prisma.staffIntervention.deleteMany({
    where: { title: { startsWith: "Audit:" } },
  });

  const admin = await prisma.user.findFirstOrThrow({
    where: { email: "admin@medflow.ai" },
  });
  const client = await prisma.client.findFirstOrThrow({ where: { mrn: "MRN-10001" } });
  const appt = await prisma.appointment.findFirstOrThrow({
    where: { id: "seed-appt-10001" },
  });

  const purpose = `global_flow_${Date.now()}`;
  const proposal = await masterOrchestratorService.submitProposal({
    agentType: "SMS_REMINDER_AI",
    clientId: client.id,
    appointmentId: appt.id,
    channel: "SMS",
    purpose,
    actionType: "SEND_SMS",
    proposedPayload: { messageBody: "Cross-phase audit reminder" },
    contentForEmergencyScan: "Your appointment is tomorrow",
  });

  if (!proposal?.id) fail("Proposal not created");
  ok("AI agent submitted proposal");

  if (proposal.proposalStatus === "PENDING_APPROVAL") {
    await masterOrchestratorService.reviewProposal(proposal.id, "APPROVE", {
      userId: admin.id,
      staffOverride: true,
      orchestratorNotes: "Cross-phase audit approval",
      autoExecute: true,
    });
  }

  const executed = await prisma.agentAction.findUniqueOrThrow({
    where: { id: proposal.id },
  });
  if (executed.proposalStatus !== "EXECUTED") {
    fail(`Expected EXECUTED, got ${executed.proposalStatus}`);
  }
  if (!executed.smsLogId) fail("SMS log not linked after execution");
  ok("Master Orchestrator approved and executed → SmsLog");

  const sms = await prisma.smsLog.findUniqueOrThrow({ where: { id: executed.smsLogId } });
  if (sms.clientId !== client.id || sms.appointmentId !== appt.id) {
    fail("SmsLog client/appointment mismatch");
  }
  ok("Communication log linked to client and appointment");

  const timeline = await prisma.clientTimelineEvent.count({
    where: {
      clientId: client.id,
      OR: [
        { eventType: "AGENT_PROPOSAL_CREATED" },
        { eventType: "AGENT_PROPOSAL_APPROVED" },
        { eventType: "COMMUNICATION_SMS", title: { contains: purpose } },
      ],
    },
  });
  if (timeline < 2) fail("Timeline missing proposal or communication events");
  ok("ClientTimelineEvent records orchestrator + communication");

  const audit = await prisma.auditLog.count({
    where: {
      clientId: client.id,
      OR: [
        { entityType: "AgentAction", entityId: proposal.id },
        { entityType: "SmsLog", entityId: executed.smsLogId },
      ],
    },
  });
  if (audit < 2) fail("AuditLog missing for proposal or SMS");
  ok("AuditLog records orchestrator and communication");

  await prisma.staffIntervention.create({
    data: {
      clientId: client.id,
      status: "HUMAN_TAKEOVER",
      title: "Audit: staff blocks AI",
      staffOverride: true,
    },
  });

  try {
    await masterOrchestratorService.submitProposal({
      agentType: "EMAIL_AI",
      clientId: client.id,
      channel: "EMAIL",
      purpose: `blocked_after_staff_${Date.now()}`,
      actionType: "SEND_EMAIL",
    });
    fail("AI proposal after staff takeover should be blocked");
  } catch (e) {
    if (
      !(e instanceof MasterOrchestratorError) ||
      e.code !== "STAFF_OVERRIDE_ACTIVE"
    ) {
      throw e;
    }
  }
  ok("Staff override blocks subsequent AI proposals on same client");
}

async function auditPhase4() {
  console.log("\n=== Phase 4 ===");

  const [walkIns, checkIns, waitingRoom] = await Promise.all([
    prisma.walkInVisit.count(),
    prisma.physicalCheckIn.count(),
    prisma.waitingRoomStatus.count(),
  ]);
  if (!walkIns || !checkIns || !waitingRoom) {
    fail("Phase 4 physical models not seeded (WalkIn, PhysicalCheckIn, WaitingRoom)");
  }
  ok("WalkInVisit, PhysicalCheckIn, WaitingRoomStatus populated");

  const activeQueue = await physicalClientService.listWaitingRoom(true);
  if (activeQueue.length === 0) {
    fail("Active waiting room queue is empty — run db:seed");
  }
  for (const entry of activeQueue) {
    if (!ACTIVE_WAITING_ROOM_STATES.includes(entry.state)) {
      fail(`Active queue includes non-active state: ${entry.state}`);
    }
    if (!entry.client?.id) fail("Waiting room entry missing client link");
    if (!entry.physicalCheckIn?.id) {
      fail("Waiting room entry missing physical check-in link");
    }
  }
  ok(`Active waiting room board (${activeQueue.length} entries, correct states)`);

  const terminalInActive = await prisma.waitingRoomStatus.count({
    where: { state: { in: TERMINAL_WAITING_ROOM_STATES } },
  });
  if (terminalInActive > 0) {
    ok(`Terminal waiting room rows exist separately (${terminalInActive})`);
  }

  const wrOrphans = await prisma.waitingRoomStatus.findMany({
    include: { physicalCheckIn: true, client: true },
  });
  const brokenWr = wrOrphans.filter((w) => !w.physicalCheckIn || !w.client);
  if (brokenWr.length > 0) {
    fail(`${brokenWr.length} WaitingRoomStatus rows missing client or check-in`);
  }
  ok("No orphan WaitingRoomStatus records");

  const physicalTimeline = await prisma.clientTimelineEvent.count({
    where: {
      eventType: {
        in: ["PHYSICAL_CHECK_IN", "WAITING_ROOM_ARRIVED", "WALK_IN_REGISTERED"],
      },
    },
  });
  if (physicalTimeline === 0) {
    fail("No Phase 4 timeline events — seed or run check-in flow");
  }
  ok("Physical client timeline events present");
}

export async function runCrossPhaseAudit() {
  await auditPhase1();
  await auditPhase2();
  await auditPhase3();
  await auditPhase4();
  await auditGlobalFlow();
  console.log("\n=== Cross-phase audit passed ===\n");
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").includes("cross-phase-audit");

if (isDirectRun) {
  runCrossPhaseAudit()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
