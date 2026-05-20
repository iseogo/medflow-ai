/**
 * Full AI agent system audit — registry, wiring, missed-call handoffs, mock probe.
 * Usage: npm run audit:agent-system
 */
import { AgentType } from "@prisma/client";
import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  AGENT_HANDOFF_CHAIN,
  AGENT_REGISTRY,
  assertRegistryComplete,
} from "../src/lib/agents/agent-registry";
import { AGENT_DEFINITIONS } from "../src/lib/agents/definitions";
import { runCoordinationMockProbe } from "../src/lib/agents/coordination-mock-probe";
import { isMockModeForced } from "../src/lib/integrations/env";

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

function auditRegistry() {
  const prismaTypes = Object.values(AgentType);
  const missing = assertRegistryComplete(prismaTypes);
  if (missing.length) {
    fail(`Agent registry missing types: ${missing.join(", ")}`);
  } else {
    ok(`Agent registry complete (${prismaTypes.length} agents)`);
  }

  const defKeys = Object.keys(AGENT_DEFINITIONS);
  if (defKeys.length !== prismaTypes.length) {
    fail("AGENT_DEFINITIONS count mismatch with Prisma AgentType");
  } else {
    ok("AGENT_DEFINITIONS matches Prisma AgentType enum");
  }

  for (const type of prismaTypes) {
    const reg = AGENT_REGISTRY[type];
    ok(`${reg.displayName}: ${reg.responsibility.slice(0, 60)}…`);
    if (!reg.wiring.masterOrchestrator && type !== "SUPERVISOR_AI") {
      fail(`${type} must wire to Master Orchestrator`);
    }
    if (type === "SUPERVISOR_AI" && reg.wiring.notifications) {
      fail("SUPERVISOR_AI must not wire to direct notifications");
    }
  }
}

function auditMissedCallHandoff() {
  const missed = read("src/services/missed-call.service.ts");
  const probe = read("src/lib/agents/coordination-mock-probe.ts");
  const webhook = read("src/lib/integrations/webhook-handler.ts");

  const chain = [
    ["processInboundMissedWebhook", webhook],
    ["captureMissedInboundCall", missed],
    ["STAFF_ASSISTANT_AI", missed],
    ["CREATE_STAFF_TASK", missed],
    ["notifyStaff", missed],
    ["channel: \"orchestrator\"", missed],
    ["observeMissedInboundCall", missed],
    ["VOICE_CALL_AI", missed],
    ["inbound_missed_call_observed", missed],
    ["createAuditLog", missed],
    ["recordCommunicationTimelineAndAudit", missed],
  ] as const;

  for (const [label, src] of chain) {
    if (!src.includes(label)) fail(`Missed-call handoff missing: ${label}`);
    else ok(`Missed-call handoff: ${label}`);
  }

  if (!probe.includes("runCoordinationMockProbe")) {
    fail("coordination-mock-probe missing");
  } else {
    ok("Mock coordination probe module present");
  }

  if (AGENT_HANDOFF_CHAIN.length < 1) {
    fail("AGENT_HANDOFF_CHAIN empty");
  } else {
    ok("Documented agent handoff chain for inbound missed calls");
  }
}

function auditHealthAndApis() {
  const required = [
    "src/lib/agents/agent-registry.ts",
    "src/services/agent-health.service.ts",
    "src/app/api/agents/health/route.ts",
    "src/app/api/agents/coordination-mock/route.ts",
    "src/app/api/agents/definitions/route.ts",
    "src/services/master-orchestrator.service.ts",
    "src/services/supervisor-agent.service.ts",
    "src/app/dashboard/agent-coordination/page.tsx",
  ];
  for (const f of required) {
    if (!existsSync(path.join(process.cwd(), f))) fail(`Missing ${f}`);
    else ok(`Present ${f}`);
  }

  const health = read("src/services/agent-health.service.ts");
  if (!health.includes("getHealthReport")) {
    fail("agent-health.service missing getHealthReport");
  } else {
    ok("Per-agent health report service");
  }

  const mockRoute = read("src/app/api/agents/coordination-mock/route.ts");
  if (!mockRoute.includes("isMockModeForced")) {
    fail("coordination-mock API must gate on MOCK_MODE");
  } else {
    ok("Mock probe API gated by MOCK_MODE");
  }

  const phi = read("src/lib/security/phi-safe-log.ts");
  if (!phi.includes("sanitizeMetadataForAudit")) {
    fail("PHI-safe logging helper missing");
  } else {
    ok("PHI-safe audit metadata sanitization available");
  }
}

async function auditMockProbe() {
  if (!isMockModeForced()) {
    warn("MOCK_MODE off — skipping live coordination mock probe");
    return;
  }

  try {
    const result = await runCoordinationMockProbe();
    if (result.ok) {
      ok("Mock coordination probe passed (handoff chain verified + cleaned up)");
    } else {
      fail(
        `Mock coordination probe failed: ${result.errors.join("; ") || JSON.stringify(result.checks)}`
      );
    }
  } catch (e) {
    fail(`Mock probe threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  auditRegistry();
  auditMissedCallHandoff();
  auditHealthAndApis();
  await auditMockProbe();

  console.log("\n=== Agent System Audit ===\n");
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
  console.log("\nAgent system audit passed.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
