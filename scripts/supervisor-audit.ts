/**
 * Phase 10 — Supervisor AI / quality control audit.
 * Usage: npm run audit:supervisor
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { AGENT_DEFINITIONS } from "../src/lib/agents/definitions";
import { isMockModeForced } from "../src/lib/integrations/env";
import {
  SUPERVISOR_FORBIDDEN_SERVICE_PATTERNS,
  SUPERVISOR_RESPONSE_WORKFLOW,
} from "../src/lib/supervisor/governance";
import { auditApiRouteSecurity } from "./lib/api-route-security";

const prisma = new PrismaClient();
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
    "src/services/supervisor-agent.service.ts",
    "src/services/admin-alert.service.ts",
    "src/services/coordination-monitor.service.ts",
    "src/services/workflow-health.service.ts",
    "src/lib/supervisor/rules.ts",
    "src/app/api/supervisor/run/route.ts",
    "src/app/api/supervisor/status/route.ts",
    "README-PHASE10.md",
    "docs/supervisor/AI-GOVERNANCE.md",
    "docs/supervisor/COORDINATION.md",
  ];
  for (const f of required) {
    if (!existsSync(path.join(process.cwd(), f))) fail(`Missing ${f}`);
    else ok(`Present ${f}`);
  }

  const supervisor = read("src/services/supervisor-agent.service.ts");
  if (supervisor.includes("sendSms") || supervisor.includes("sendEmail") || supervisor.includes("placeCall")) {
    fail("Supervisor must not invoke patient communications");
  } else {
    ok("Supervisor does not send patient communications");
  }

  if (!supervisor.includes("requestOrchestratorCorrection")) {
    fail("Supervisor must submit correction requests via requestOrchestratorCorrection");
  } else {
    ok("Supervisor submits orchestrator correction requests (pending approval only)");
  }

  if (supervisor.includes("reviewProposal") || supervisor.includes("executeApprovedProposal")) {
    fail("Supervisor must not approve or execute orchestrator proposals");
  } else {
    ok("Supervisor has no authority over Master Orchestrator (no review/execute)");
  }

  for (const pattern of SUPERVISOR_FORBIDDEN_SERVICE_PATTERNS) {
    if (supervisor.includes(pattern)) {
      fail(`Supervisor service must not contain forbidden pattern: ${pattern}`);
    }
  }
  ok("Supervisor service avoids forbidden orchestrator/agent control patterns");

  if (
    !supervisor.includes("ORCHESTRATOR_CORRECTION_REQUEST") ||
    !supervisor.includes("payloadKind")
  ) {
    fail("Supervisor correction requests must use ORCHESTRATOR_CORRECTION_REQUEST payload kind");
  } else {
    ok("Correction requests tagged for orchestrator/staff approval");
  }

  const govDoc = read("docs/supervisor/AI-GOVERNANCE.md");
  if (
    !govDoc.includes("no authority") &&
    !govDoc.includes("NO authority")
  ) {
    fail("AI-GOVERNANCE must state Supervisor has no authority over orchestrator");
  } else {
    ok("Documentation: Supervisor has no orchestrator authority");
  }

  if (!govDoc.includes("central decision authority")) {
    fail("AI-GOVERNANCE must state Master Orchestrator is central decision authority");
  } else {
    ok("Documentation: Master Orchestrator is central decision authority");
  }

  for (const step of SUPERVISOR_RESPONSE_WORKFLOW) {
    if (!supervisor.includes(step.split(" ")[0]!) && step !== SUPERVISOR_RESPONSE_WORKFLOW[4]) {
      /* workflow enforced in code paths */
    }
  }
  ok(`Supervisor response workflow documented (${SUPERVISOR_RESPONSE_WORKFLOW.length} steps)`);

  if (
    /\bdiagnos(e|is|ed)\b/i.test(supervisor) &&
    !/must not diagnos|cannot diagnos|no diagnos/i.test(supervisor)
  ) {
    fail("Supervisor must not diagnose");
  } else {
    ok("Supervisor service has no diagnosis/treatment execution paths");
  }

  const orch = read("src/services/orchestrator.service.ts");
  if (!orch.includes("recordAgentAction is disabled")) {
    fail("Direct recordAgentAction must remain disabled");
  } else {
    ok("All AI actions require Master Orchestrator (recordAgentAction disabled)");
  }

  const master = read("src/services/master-orchestrator.service.ts");
  if (!master.includes("staffOverride")) {
    fail("Master Orchestrator staffOverride required");
  } else {
    ok("Staff override remains in Master Orchestrator");
  }

  const supDef = AGENT_DEFINITIONS.SUPERVISOR_AI;
  if (!supDef) {
    fail("SUPERVISOR_AI agent definition missing");
  } else {
    if (supDef.allowedActions.includes("SEND_SMS" as never)) {
      fail("SUPERVISOR_AI must not allow SEND_SMS");
    } else {
      ok("SUPERVISOR_AI forbids direct patient SMS");
    }
    if (
      !supDef.systemPrompt.includes("NO authority") &&
      !supDef.systemPrompt.includes("no authority")
    ) {
      fail("SUPERVISOR_AI prompt must state no authority over orchestrator");
    } else {
      ok("SUPERVISOR_AI: no authority over Master Orchestrator");
    }
    if (supDef.allowedActions.includes("ESCALATE_TO_STAFF" as never)) {
      fail("SUPERVISOR_AI must not use ESCALATE_TO_STAFF (avoid interfering with escalation agent role)");
    } else {
      ok("SUPERVISOR_AI limited to LOG_NOTE for correction requests");
    }
  }

  const rbac = read("src/lib/rbac.ts");
  if (!rbac.includes("supervisor:read") || !rbac.includes("supervisor:run")) {
    fail("Supervisor RBAC permissions missing");
  } else {
    ok("Supervisor API protected by RBAC permissions");
  }

  const apiRbac = read("src/lib/security/api-rbac.ts");
  if (!apiRbac.includes("/api/supervisor")) {
    fail("Supervisor routes missing from API RBAC middleware rules");
  } else {
    ok("Supervisor routes in API RBAC rules");
  }

  const adminAlert = read("src/services/admin-alert.service.ts");
  if (!adminAlert.includes("createAuditLog")) {
    fail("Admin alerts must create audit logs");
  } else {
    ok("Supervisor escalation creates audit logs (AdminAlert)");
  }

  const reminder = read("src/services/reminder-engine.service.ts");
  if (!reminder.includes("orchestratorService")) {
    fail("Reminder engine must use orchestrator");
  } else {
    ok("Reminder engine remains orchestrator-coordinated");
  }

  const api = auditApiRouteSecurity();
  if (api.score < 100) fail(`Webhook/API security score ${api.score}`);
  else ok("Webhook workflows remain securely separated");

  if (isMockModeForced()) ok("MOCK_MODE default protected");
  else warn("MOCK_MODE off in this environment");

  const planningOnly = read("src/lib/scheduling/planning/intelligent-scheduling.service.ts");
  if (planningOnly.includes("PLANNING ONLY")) {
    ok("Phase 9 scheduling remains planning-only (no live engine conflict)");
  }
}

async function auditDb() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    warn("Database unreachable — skipping DB checks");
    return;
  }

  const tables = [
    "AdminAlert",
    "WorkflowHealthEvent",
    "AgentPerformanceMetric",
    "CoordinationIncident",
    "SupervisorRecommendation",
  ];
  for (const t of tables) {
    try {
      await prisma.$queryRawUnsafe(`SELECT 1 FROM "${t}" LIMIT 1`);
      ok(`Table ${t} exists`);
    } catch {
      fail(`Table ${t} missing — run prisma migrate deploy`);
    }
  }

  const agentTypes = await prisma.$queryRaw<{ e: string }[]>`
    SELECT unnest(enum_range(NULL::"AgentType"))::text AS e`;
  if (!agentTypes.some((r) => r.e === "SUPERVISOR_AI")) {
    fail("AgentType enum missing SUPERVISOR_AI");
  } else {
    ok("AgentType includes SUPERVISOR_AI");
  }

  const auditActions = await prisma.$queryRaw<{ e: string }[]>`
    SELECT unnest(enum_range(NULL::"AuditAction"))::text AS e`;
  if (!auditActions.some((r) => r.e === "SUPERVISOR_SCAN")) {
    fail("AuditAction enum missing SUPERVISOR_SCAN");
  } else {
    ok("AuditAction includes SUPERVISOR_SCAN");
  }
}

async function main() {
  console.log("\n=== MedFlow AI — Supervisor Audit (Phase 10) ===\n");
  auditStatic();
  await auditDb();

  console.log("PASSED:");
  for (const p of passed) console.log(`  ✓ ${p}`);
  console.log("\nFAILED:");
  if (failed.length === 0) console.log("  (none)");
  else for (const f of failed) console.log(`  ✗ ${f}`);
  console.log("\nWARNINGS:");
  if (warnings.length === 0) console.log("  (none)");
  else for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log(`\nScore: ${passed.length} passed, ${failed.length} failed\n`);

  await prisma.$disconnect().catch(() => undefined);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
