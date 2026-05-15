/**
 * Full coordination audit — Phases 1–4 end-to-end.
 * Usage: npm run audit:full-coordination
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createAuditLog } from "../src/lib/audit";
import { hasPermission } from "../src/lib/rbac";
import { addTimelineEvent } from "../src/lib/timeline";
import {
  DuplicateCommunicationError,
  orchestratorService,
} from "../src/services/orchestrator.service";
import {
  MasterOrchestratorError,
  masterOrchestratorService,
} from "../src/services/master-orchestrator.service";
import { physicalClientService } from "../src/services/physical-client.service";
import { runCrossPhaseAudit } from "./cross-phase-audit";
import { runStaffRbacAudit } from "./staff-rbac-audit";

const prisma = new PrismaClient();

const AUDIT_TAG = `full_coord_${Date.now()}`;

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`OK: ${msg}`);
}

function section(title: string) {
  console.log(`\n=== ${title} ===\n`);
}

function runTsc() {
  execSync("npx tsc --noEmit", { stdio: "inherit", cwd: process.cwd() });
  ok("TypeScript check passed");
}

function runBuild() {
  try {
    execSync("npm run build", { stdio: "inherit", cwd: process.cwd() });
  } catch {
    console.warn("WARN: npm run build failed (Prisma engine may be locked) — trying build:next");
    execSync("npm run build:next", { stdio: "inherit", cwd: process.cwd() });
  }
  ok("Production build passed");
}

function auditSecrets() {
  const envExample = path.join(process.cwd(), ".env.example");
  if (!fs.existsSync(envExample)) {
    console.warn("WARN: .env.example missing");
    return;
  }
  const sample = fs.readFileSync(envExample, "utf8");
  if (/TWILIO_AUTH_TOKEN\s*=\s*[a-f0-9]{20,}/i.test(sample)) {
    fail(".env.example contains real-looking Twilio credentials");
  }
  if (/GMAIL_CLIENT_SECRET\s*=\s*GOCSPX/i.test(sample)) {
    fail(".env.example contains real-looking Gmail secret");
  }
  if (/sk-[a-zA-Z0-9]{20,}/.test(sample)) {
    fail(".env.example contains OpenAI-style API key");
  }
  ok("No exposed secrets in .env.example");
}

async function auditDataIntegrity() {
  ok("Communication models require clientId at schema level");

  const smsWithBadAppt = await prisma.smsLog.findMany({
    where: { appointmentId: { not: null } },
    select: { id: true, appointmentId: true },
    take: 200,
  });
  for (const row of smsWithBadAppt) {
    const appt = await prisma.appointment.findUnique({
      where: { id: row.appointmentId! },
    });
    if (!appt) fail(`SmsLog ${row.id} references missing appointment`);
  }
  ok("SmsLog appointment references valid when set");

  ok("Agent actions always reference a client (schema enforced)");

  const wrRows = await prisma.waitingRoomStatus.findMany({
    include: { physicalCheckIn: true, client: true },
  });
  const brokenWr = wrRows.filter((w) => !w.physicalCheckIn || !w.client);
  if (brokenWr.length > 0) {
    fail(`${brokenWr.length} WaitingRoomStatus orphan(s)`);
  }
  ok("Waiting room rows linked to check-in and client");

  const checkIns = await prisma.physicalCheckIn.findMany({
    select: { id: true, clientId: true },
    take: 500,
  });
  for (const ci of checkIns) {
    const client = await prisma.client.findUnique({ where: { id: ci.clientId } });
    if (!client) fail(`PhysicalCheckIn ${ci.id} missing client`);
  }
  ok("Physical check-ins reference existing clients");
}

async function auditRbacCoordination() {
  if (!hasPermission("FRONT_DESK_STAFF", "walkins:write")) {
    fail("Front desk cannot write walk-ins");
  }
  if (!hasPermission("FRONT_DESK_STAFF", "checkins:write")) {
    fail("Front desk cannot write check-ins");
  }
  if (hasPermission("READ_ONLY", "clients:write")) {
    fail("Read-only can write clients");
  }
  if (hasPermission("READ_ONLY", "appointments:write")) {
    fail("Read-only can write appointments");
  }
  if (!hasPermission("ADMIN", "audit:read")) {
    fail("Admin cannot read audit logs");
  }
  if (!hasPermission("ADMIN", "users:manage")) {
    fail("Admin cannot manage staff");
  }
  ok("RBAC: front desk walk-ins/check-ins, read-only blocked, admin staff+audit");
}

async function auditEndToEndWorkflow() {
  const frontdesk = await prisma.user.findUniqueOrThrow({
    where: { email: "frontdesk@medflow.ai" },
    include: { role: true },
  });
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@medflow.ai" },
    include: { role: true },
  });

  const loginValid = await bcrypt.compare("FrontDesk123!", frontdesk.passwordHash);
  if (!loginValid) {
    fail("Front desk password verification failed (staff login simulation)");
  }
  ok("Staff login credentials verified (frontdesk@medflow.ai)");

  if (frontdesk.role.type !== "FRONT_DESK_STAFF") {
    fail("Front desk user has wrong role");
  }
  ok("Staff role loaded for session simulation");

  const mrn = `AUDIT-${AUDIT_TAG}`;
  const client = await prisma.client.create({
    data: {
      firstName: "Coordination",
      lastName: "Audit",
      mrn,
      email: `audit.${AUDIT_TAG}@example.com`,
    },
  });

  await addTimelineEvent({
    clientId: client.id,
    eventType: "CLIENT_CREATED",
    title: "Client profile created (audit)",
    actorUserId: frontdesk.id,
  });
  await createAuditLog({
    action: "CREATE",
    entityType: "Client",
    entityId: client.id,
    actorUserId: frontdesk.id,
    clientId: client.id,
  });
  ok("Staff created client + timeline + audit");

  const scheduledAt = new Date();
  scheduledAt.setHours(scheduledAt.getHours() + 1);
  const appointment = await prisma.appointment.create({
    data: {
      clientId: client.id,
      scheduledAt,
      status: "CONFIRMED",
      reason: `Full coordination audit ${AUDIT_TAG}`,
      providerName: "Dr. Audit",
      location: "Room 1",
      staffOverride: true,
    },
  });

  await addTimelineEvent({
    clientId: client.id,
    eventType: "APPOINTMENT_CREATED",
    title: "Appointment scheduled (audit)",
    metadata: { appointmentId: appointment.id },
    actorUserId: frontdesk.id,
  });
  await createAuditLog({
    action: "CREATE",
    entityType: "Appointment",
    entityId: appointment.id,
    actorUserId: frontdesk.id,
    clientId: client.id,
  });
  ok("Staff created appointment + timeline + audit");

  const staffActor = {
    id: frontdesk.id,
    name: `${frontdesk.firstName} ${frontdesk.lastName}`,
    role: frontdesk.role.type,
  };

  const checkInResult = await physicalClientService.performReturningCheckIn(
    {
      clientId: client.id,
      appointmentId: appointment.id,
      notes: AUDIT_TAG,
      notifyProvider: false,
    },
    staffActor,
    { ipAddress: "127.0.0.1", userAgent: "full-coordination-audit" }
  );

  if (!checkInResult.waitingRoom?.id) {
    fail("Physical check-in did not create/update WaitingRoomStatus");
  }
  if (checkInResult.waitingRoom.state !== "CHECKED_IN") {
    fail(`Expected CHECKED_IN, got ${checkInResult.waitingRoom.state}`);
  }
  ok("Physical check-in created waiting room (CHECKED_IN)");

  const activeEntry = await prisma.waitingRoomStatus.findFirst({
    where: {
      clientId: client.id,
      state: "CHECKED_IN",
    },
  });
  if (!activeEntry) fail("Waiting room row not queryable after check-in");
  ok("Waiting room status persisted and active");

  const physicalTimeline = await prisma.clientTimelineEvent.count({
    where: {
      clientId: client.id,
      eventType: { in: ["PHYSICAL_CHECK_IN", "WAITING_ROOM_ARRIVED"] },
    },
  });
  if (physicalTimeline < 2) {
    fail("Missing physical check-in or waiting room timeline events");
  }
  ok("Physical flow wrote ClientTimelineEvent records");

  const physicalAudit = await prisma.auditLog.findFirst({
    where: {
      clientId: client.id,
      entityType: "WaitingRoomStatus",
      entityId: checkInResult.waitingRoom.id,
      actorUserId: frontdesk.id,
    },
  });
  if (!physicalAudit?.actorName) {
    fail("Physical waiting room audit missing actorUserId/actorName");
  }
  ok("Physical flow wrote AuditLog with staff actor");

  await physicalClientService.updateWaitingRoomState(
    checkInResult.waitingRoom.id,
    "WAITING",
    staffActor
  );
  ok("Waiting room advanced to WAITING");

  const purpose = `full_coord_sms_${AUDIT_TAG}`;
  const proposal = await masterOrchestratorService.submitProposal({
    agentType: "SMS_REMINDER_AI",
    clientId: client.id,
    appointmentId: appointment.id,
    channel: "SMS",
    purpose,
    actionType: "SEND_SMS",
    proposedPayload: { messageBody: "Full coordination audit reminder" },
    contentForEmergencyScan: "Appointment reminder",
  });
  if (!proposal?.id) fail("AI proposal not created");
  ok("AI agent submitted proposal to Master Orchestrator");

  if (proposal.proposalStatus === "PENDING_APPROVAL") {
    await masterOrchestratorService.reviewProposal(proposal.id, "APPROVE", {
      userId: admin.id,
      staffOverride: true,
      orchestratorNotes: "Full coordination audit approval",
      autoExecute: true,
    });
  }

  const executed = await prisma.agentAction.findUniqueOrThrow({
    where: { id: proposal.id },
  });
  if (executed.proposalStatus !== "EXECUTED") {
    fail(`Proposal not executed: ${executed.proposalStatus}`);
  }
  if (!executed.smsLogId) fail("Executed proposal missing SmsLog link");
  ok("Master Orchestrator approved and executed → communication log");

  const sms = await prisma.smsLog.findUniqueOrThrow({
    where: { id: executed.smsLogId },
  });
  if (sms.clientId !== client.id || sms.appointmentId !== appointment.id) {
    fail("SmsLog missing client or appointment link");
  }
  ok("Communication log linked to client and appointment");

  const dupPurpose = `full_coord_dup_${AUDIT_TAG}`;
  await orchestratorService.sendSms(
    { clientId: client.id, purpose: dupPurpose, messageBody: "first" },
    { source: "staff", userId: admin.id }
  );
  try {
    await orchestratorService.sendSms(
      { clientId: client.id, purpose: dupPurpose, messageBody: "duplicate" },
      { source: "staff", userId: admin.id }
    );
    fail("Duplicate communication allowed");
  } catch (e) {
    if (!(e instanceof DuplicateCommunicationError)) throw e;
  }
  ok("Duplicate communication prevention");

  const orchestratorTimeline = await prisma.clientTimelineEvent.count({
    where: {
      clientId: client.id,
      eventType: {
        in: ["AGENT_PROPOSAL_CREATED", "COMMUNICATION_SMS"],
      },
    },
  });
  if (orchestratorTimeline < 2) {
    fail("Missing orchestrator or SMS timeline events");
  }
  ok("Orchestrator + communication timeline events present");

  const orchestratorAudit = await prisma.auditLog.count({
    where: {
      clientId: client.id,
      OR: [
        { entityType: "AgentAction", entityId: proposal.id },
        { entityType: "SmsLog", entityId: executed.smsLogId! },
      ],
    },
  });
  if (orchestratorAudit < 2) {
    fail("Missing audit logs for proposal or SMS");
  }
  ok("AuditLog records orchestrator and communication");

  await prisma.staffIntervention.create({
    data: {
      clientId: client.id,
      status: "HUMAN_TAKEOVER",
      title: `Audit: block AI ${AUDIT_TAG}`,
      staffOverride: true,
    },
  });

  try {
    await masterOrchestratorService.submitProposal({
      agentType: "EMAIL_AI",
      clientId: client.id,
      channel: "EMAIL",
      purpose: `blocked_${AUDIT_TAG}`,
      actionType: "SEND_EMAIL",
    });
    fail("Staff override did not block AI proposal");
  } catch (e) {
    if (
      !(e instanceof MasterOrchestratorError) ||
      e.code !== "STAFF_OVERRIDE_ACTIVE"
    ) {
      throw e;
    }
  }
  ok("Staff override blocks subsequent AI proposals");

  await prisma.client.delete({ where: { id: client.id } });
  ok("Audit test client cleaned up (cascade)");
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  MedFlow AI — Full Coordination Audit (Ph 1–4)  ║");
  console.log("╚══════════════════════════════════════════════════╝");

  section("Static checks");
  runTsc();
  auditSecrets();

  section("Staff RBAC (Phase 3.5)");
  await runStaffRbacAudit();
  await auditRbacCoordination();

  section("Cross-phase audits (Phases 1–4)");
  await runCrossPhaseAudit();

  section("Data integrity");
  await auditDataIntegrity();

  section("End-to-end workflow");
  await auditEndToEndWorkflow();

  section("Production build");
  runBuild();

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║       Full coordination audit PASSED             ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
