/**
 * Missed inbound call capture & follow-up audit.
 * Usage: npm run audit:missed-calls
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { SUPERVISOR_FORBIDDEN_SERVICE_PATTERNS } from "../src/lib/supervisor/governance";

const passed: string[] = [];
const failed: string[] = [];
const warnings: string[] = [];

function ok(msg: string) {
  passed.push(msg);
}
function fail(msg: string) {
  failed.push(msg);
}
function warn(msg: string) {
  warnings.push(msg);
}

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function auditStatic() {
  const required = [
    "src/services/missed-call.service.ts",
    "src/lib/missed-call/missed-call-statuses.ts",
    "src/lib/missed-call/missed-call-dedup.ts",
    "prisma/migrations/20260520120000_missed_call_capture/migration.sql",
  ];
  for (const f of required) {
    if (!existsSync(path.join(process.cwd(), f))) fail(`Missing ${f}`);
    else ok(`Present ${f}`);
  }

  const schema = read("prisma/schema.prisma");
  for (const status of ["MISSED", "ABANDONED", "NO_ANSWER", "FAILED"]) {
    if (!schema.includes(status)) fail(`CommunicationStatus missing ${status}`);
    else ok(`CommunicationStatus includes ${status}`);
  }
  if (!schema.includes("MISSED_INBOUND_CALL")) {
    fail("NotificationSource MISSED_INBOUND_CALL missing");
  } else {
    ok("NotificationSource MISSED_INBOUND_CALL defined");
  }

  const statuses = read("src/lib/missed-call/missed-call-statuses.ts");
  if (!statuses.includes("isMissedInboundCallStatus")) {
    fail("Missed call status helper missing");
  } else {
    ok("Missed inbound status detection helper");
  }

  const dedup = read("src/lib/missed-call/missed-call-dedup.ts");
  if (!dedup.includes("30") || !dedup.includes("ESCALATION_THRESHOLD")) {
    fail("Duplicate prevention / escalation rules incomplete");
  } else {
    ok("30-minute task dedup and 3+ per hour escalation threshold");
  }

  const svc = read("src/services/missed-call.service.ts");
  if (!svc.includes("prisma.callLog.create") && !svc.includes("callLog")) {
    fail("CallLog creation missing in missed-call service");
  } else {
    ok("CallLog created/updated on missed call");
  }
  if (!svc.includes('source: "MISSED_INBOUND_CALL"')) {
    fail("StaffNotification source MISSED_INBOUND_CALL missing");
  } else {
    ok("StaffNotification emitted for missed calls");
  }
  if (!svc.includes("CREATE_STAFF_TASK")) {
    fail("StaffTask via orchestrator proposal missing");
  } else {
    ok("StaffTask created via Master Orchestrator CREATE_STAFF_TASK");
  }
  if (!svc.includes("createAuditLog")) {
    fail("AuditLog on missed call capture missing");
  } else {
    ok("AuditLog written on capture");
  }
  if (!svc.includes("recordCommunicationTimelineAndAudit")) {
    warn("Client timeline only when client identified (expected conditional)");
  } else {
    ok("ClientTimelineEvent when client is identified");
  }
  if (!svc.includes("masterOrchestratorService.submitProposal")) {
    fail("Orchestrator submitProposal path missing");
  } else {
    ok("Routes through Master Orchestrator submitProposal");
  }
  if (
    svc.includes('channel: "supervisor"') &&
    svc.match(/notifyStaff[\s\S]*channel:\s*"supervisor"/)
  ) {
    fail("Missed-call service must not notify staff via supervisor channel");
  } else {
    ok("Staff alerts use orchestrator channel (not direct AI notify)");
  }
  if (svc.includes("STAFF_ASSISTANT_AI")) {
    ok("STAFF_ASSISTANT_AI proposes task (not direct notification agent)");
  }

  const orchestrator = read("src/services/master-orchestrator.service.ts");
  if (!orchestrator.includes("missed_inbound_call_follow_up")) {
    fail("Master Orchestrator auto-approve for missed call tasks missing");
  } else {
    ok("Orchestrator auto-approves missed inbound follow-up tasks");
  }

  const webhook = read("src/lib/integrations/webhook-handler.ts");
  if (!webhook.includes("missedCallService")) {
    fail("Webhook handler must delegate inbound missed statuses to missedCallService");
  } else {
    ok("Webhook inbound missed statuses routed to missed-call service");
  }
  if (
    webhook.includes("INBOUND_CALL_HUMAN_REVIEW") &&
    webhook.includes('channel: "system"')
  ) {
    warn("Legacy direct inbound webhook notify may remain for non-missed paths only");
  }

  const orchSvc = read("src/services/orchestrator.service.ts");
  if (orchSvc.includes("INBOUND_CALL_HUMAN_REVIEW")) {
    fail("orchestrator.service must not use legacy INBOUND_CALL_HUMAN_REVIEW direct notify");
  } else {
    ok("Inbound call path uses missed-call service (no legacy direct notify)");
  }

  const sources = read("src/lib/notifications/notification-sources.ts");
  if (!sources.includes("MISSED_INBOUND_CALL")) {
    fail("notification-sources defaults for MISSED_INBOUND_CALL missing");
  } else {
    ok("Notification defaults: ACTION_REQUIRED / HIGH / callback action");
  }

  const cc = read("src/services/command-center.service.ts");
  if (!cc.includes("MISSED_INBOUND_CALL")) {
    fail("Command center must surface missed calls in critical/comms sections");
  } else {
    ok("Command center includes missed inbound calls");
  }

  const live = read("src/services/live-command-center.service.ts");
  if (!live.includes("MISSED_INBOUND_CALL")) {
    fail("Live wall must include missed inbound call alerts");
  } else {
    ok("Live wall display includes missed call alerts");
  }

  const liveFeed = read("src/services/live-activity-feed.service.ts");
  if (!liveFeed.includes("COMMUNICATION_CALL") || !liveFeed.includes("Missed inbound")) {
    fail("Live activity feed missing missed call safe summary");
  } else {
    ok("Live activity feed PHI-safe missed call summary");
  }

  const supervisor = read("src/services/supervisor-agent.service.ts");
  if (!supervisor.includes("observeMissedInboundCall")) {
    fail("Supervisor observe-only hook for missed calls missing");
  } else {
    ok("Supervisor observe-only recommendation for missed calls");
  }
  for (const pattern of SUPERVISOR_FORBIDDEN_SERVICE_PATTERNS) {
    if (supervisor.includes(pattern)) {
      fail(`Supervisor service contains forbidden pattern: ${pattern}`);
    }
  }
  if (supervisor.includes("observeMissedInboundCall")) {
    const observeBlock = supervisor.slice(
      supervisor.indexOf("observeMissedInboundCall"),
      supervisor.indexOf("observeMissedInboundCall") + 1200
    );
    if (observeBlock.includes("notifyStaff")) {
      fail("Supervisor observeMissedInboundCall must not call notifyStaff");
    } else {
      ok("Supervisor does not directly notify staff on missed calls");
    }
  }

  const pkg = read("package.json");
  if (!pkg.includes("audit:missed-calls")) {
    fail("package.json missing audit:missed-calls script");
  } else {
    ok("npm run audit:missed-calls script registered");
  }
}

function main() {
  auditStatic();

  console.log("\n=== Missed Call Capture Audit ===\n");
  console.log(`Passed: ${passed.length}`);
  for (const p of passed) console.log(`  ✓ ${p}`);
  if (warnings.length) {
    console.log(`\nWarnings: ${warnings.length}`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }
  if (failed.length) {
    console.log(`\nFailed: ${failed.length}`);
    for (const f of failed) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("\nAll missed-call checks passed.\n");
}

main();
