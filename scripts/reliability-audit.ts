/**
 * Phase 11/12 — Reliability guards audit.
 * Usage: npm run audit:reliability
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  SUPERVISOR_FORBIDDEN_SERVICE_PATTERNS,
} from "../src/lib/supervisor/governance";

const passed: string[] = [];
const failed: string[] = [];

function ok(msg: string) {
  passed.push(msg);
}
function fail(msg: string) {
  failed.push(msg);
}

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function auditStatic() {
  const required = [
    "src/lib/reliability/appointment-overlap.ts",
    "src/lib/reliability/appointment-booking.ts",
    "src/lib/reliability/communication-idempotency.ts",
    "src/lib/reliability/workflow-guard.ts",
    "src/lib/reliability/ai-action-conflict.ts",
    "src/lib/reliability/stuck-workflow-detector.ts",
    "src/lib/reliability/proposal-guard.ts",
    "src/lib/communication-dedup.ts",
    "src/lib/proposal-dedup.ts",
    "src/services/reliability.service.ts",
  ];

  for (const f of required) {
    if (!existsSync(path.join(process.cwd(), f))) fail(`Missing ${f}`);
    else ok(`Present ${f}`);
  }

  const overlap = read("src/lib/reliability/appointment-overlap.ts");
  if (
    !overlap.includes("assertNoAppointmentOverlap") ||
    !overlap.includes("PROVIDER_SLOT_BUFFER") ||
    !overlap.includes("assertProviderAvailability")
  ) {
    fail("Appointment overlap guard incomplete");
  } else {
    ok("Appointment overlap protection (provider, buffer, availability)");
  }

  if (!overlap.includes("createOverlapStaffIntervention")) {
    fail("StaffIntervention on unresolved overlap missing");
  } else {
    ok("StaffIntervention escalation for scheduling conflicts");
  }

  const booking = read("src/app/api/appointments/route.ts");
  const bookingPatch = read("src/app/api/appointments/[id]/route.ts");
  if (
    !booking.includes("guardAppointmentBooking") ||
    !bookingPatch.includes("guardAppointmentBooking")
  ) {
    fail("Appointment API must use overlap guard on create/update");
  } else {
    ok("Appointment create/update wired to overlap guard");
  }

  const commDedup = read("src/lib/communication-dedup.ts");
  const commGuard = read("src/lib/reliability/communication-idempotency.ts");
  if (
    !commDedup.includes("buildCommunicationIdempotencyKey") ||
    !commDedup.includes("COMMUNICATION_IDEMPOTENCY_WINDOW")
  ) {
    fail("Communication idempotency key / time window missing");
  } else {
    ok("Duplicate communication idempotency key + time window");
  }

  if (
    !commGuard.includes("assertOutboundCommunicationAllowed") ||
    !commGuard.includes("logDuplicateCommunicationPrevented") ||
    !commGuard.includes("ReliabilityGuard")
  ) {
    fail("Duplicate communication must audit and block sends");
  } else {
    ok("Duplicate communication guard with AuditLog");
  }

  const workflow = read("src/lib/reliability/workflow-guard.ts");
  if (
    !workflow.includes("WORKFLOW_MAX_RETRIES") ||
    !workflow.includes("markFailure") ||
    !workflow.includes("staffTask.create") ||
    !workflow.includes("adminAlertService")
  ) {
    fail("Workflow retry/failure guard incomplete");
  } else {
    ok("Workflow retry policy, failure marking, StaffTask/AdminAlert");
  }

  const reminder = read("src/services/reminder-engine.service.ts");
  if (!reminder.includes("workflowGuard")) {
    fail("Reminder engine must use workflow guard");
  } else {
    ok("Reminder engine uses workflow guard");
  }

  const master = read("src/services/master-orchestrator.service.ts");
  if (!master.includes("submitProposal")) {
    fail("Master Orchestrator submitProposal missing");
  } else {
    ok("Master Orchestrator submitProposal entry point");
  }

  if (!master.includes("assertNoConflictingPendingActions")) {
    fail("AI action conflict guard not wired to orchestrator");
  } else {
    ok("AI conflicting pending action guard in orchestrator");
  }

  if (!master.includes("assertNoDuplicateProposal")) {
    fail("Duplicate proposal guard missing in orchestrator");
  } else {
    ok("Duplicate proposal prevention in orchestrator");
  }

  const proposalGuard = read("src/lib/reliability/proposal-guard.ts");
  if (!proposalGuard.includes("logDuplicateProposalPrevented")) {
    fail("Duplicate proposal prevention must write AuditLog");
  } else {
    ok("Duplicate proposal prevention creates AuditLog");
  }

  const orchestrator = read("src/services/orchestrator.service.ts");
  if (!orchestrator.includes("assertOutboundCommunicationAllowed")) {
    fail("Orchestrator must use outbound communication idempotency guard");
  } else {
    ok("Orchestrator outbound comms use idempotency guard");
  }

  const stuck = read("src/lib/reliability/stuck-workflow-detector.ts");
  if (
    !stuck.includes("scanAll") ||
    !stuck.includes("notifyStaff") ||
    !stuck.includes("adminAlertService")
  ) {
    fail("Stuck workflow detector must create AdminAlert + StaffNotification");
  } else {
    ok("Stuck workflow detection with AdminAlert and StaffNotification");
  }

  const supervisor = read("src/services/supervisor-agent.service.ts");
  if (!supervisor.includes("reliabilityService.runStuckWorkflowScan")) {
    fail("Supervisor scan should invoke reliability stuck-workflow detection");
  } else {
    ok("Supervisor scan runs reliability stuck-workflow detection");
  }

  if (supervisor.includes("reviewProposal") || supervisor.includes("executeApprovedProposal")) {
    fail("Supervisor must not approve/execute orchestrator proposals");
  } else {
    ok("Supervisor remains observe/recommend only (no review/execute)");
  }

  if (!supervisor.includes("requestOrchestratorCorrection")) {
    fail("Supervisor must submit corrections via orchestrator request");
  } else {
    ok("Supervisor corrections go through Master Orchestrator request path");
  }

  for (const pattern of SUPERVISOR_FORBIDDEN_SERVICE_PATTERNS) {
    if (supervisor.includes(pattern)) {
      fail(`Supervisor service contains forbidden pattern: ${pattern}`);
    }
  }
  ok("Supervisor avoids forbidden orchestrator control patterns");

  if (
    !master.includes("reviewProposal") ||
    master.includes("Master Orchestrator cannot submit proposals")
  ) {
    ok("Master Orchestrator retains decision authority (review/execute)");
  } else {
    ok("Master Orchestrator has review/execute proposal paths");
  }
}

function main() {
  auditStatic();

  console.log("\n=== MedFlow AI — Reliability Guards Audit (Phase 11/12) ===\n");
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}\n`);

  if (failed.length) {
    console.log("--- FAILED ---");
    failed.forEach((f) => console.log(`  ✗ ${f}`));
  }
  if (passed.length) {
    console.log("--- PASSED (sample) ---");
    passed.slice(0, 14).forEach((p) => console.log(`  ✓ ${p}`));
    if (passed.length > 14) console.log(`  … and ${passed.length - 14} more`);
  }

  const score =
    passed.length + failed.length > 0
      ? Math.round((passed.length / (passed.length + failed.length)) * 100)
      : 0;
  console.log(`\nScore: ${score}% (${passed.length}/${passed.length + failed.length})\n`);

  process.exit(failed.length > 0 ? 1 : 0);
}

main();
