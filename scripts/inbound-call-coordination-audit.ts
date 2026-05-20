/**
 * Inbound call coordination workflow audit.
 */
import fs from "fs";
import path from "path";
import { AGENT_HANDOFF_CHAIN } from "../src/lib/agents/agent-registry";

const root = path.resolve(__dirname, "..");
const passed: string[] = [];
const failed: string[] = [];

function ok(msg: string) {
  passed.push(msg);
}
function fail(msg: string) {
  failed.push(msg);
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

function fileContains(rel: string, needle: string) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return false;
  return fs.readFileSync(p, "utf8").includes(needle);
}

function auditFiles() {
  const required = [
    "src/app/api/webhooks/retell/route.ts",
    "src/app/api/webhooks/twilio/voice/route.ts",
    "src/app/api/webhooks/inbound-call/route.ts",
    "src/lib/integrations/webhook-handler.ts",
    "src/lib/missed-call/process-inbound-missed-webhook.ts",
    "src/lib/missed-call/missed-call-handler.ts",
    "src/services/missed-call.service.ts",
    "src/services/inbound-calls.service.ts",
    "src/app/dashboard/inbound-calls/page.tsx",
    "src/app/api/inbound-calls/route.ts",
    "src/app/api/inbound-calls/simulate/route.ts",
    "src/lib/inbound-call/inbound-call-debug.ts",
    "prisma/schema.prisma",
    "Dockerfile",
    "docker/entrypoint.sh",
  ];
  for (const f of required) {
    if (exists(f)) ok(`Present ${f}`);
    else fail(`Missing ${f}`);
  }
}

function auditWebhooks() {
  if (fileContains("src/app/api/webhooks/retell/route.ts", "processInboundMissedWebhook"))
    ok("Retell webhook routes to missed-call pipeline");
  else fail("Retell webhook missing processInboundMissedWebhook");

  if (fileContains("src/lib/integrations/webhook-handler.ts", "handleTwilioVoiceWebhook"))
    ok("Twilio voice webhook handler present");
  else fail("Twilio voice handler missing");

  if (fileContains("src/lib/integrations/webhook-handler.ts", "processInboundMissedWebhook"))
    ok("Twilio/MedFlow inbound uses processInboundMissedWebhook");
  else fail("Inbound webhook pipeline not wired");

  if (fileContains("src/lib/integrations/webhook-auth.ts", "validateMedflowWebhookSecret"))
    ok("MedFlow webhook secret validation");
  else fail("Webhook auth missing");

  if (fileContains("src/lib/integrations/webhook-auth.ts", "validateTwilioSignature"))
    ok("Twilio signature validation");
  else fail("Twilio auth missing");
}

function auditPipeline() {
  const checks: [string, string][] = [
    ["src/services/missed-call.service.ts", "captureMissedInboundCall"],
    ["src/services/missed-call.service.ts", "STAFF_ASSISTANT_AI"],
    ["src/services/missed-call.service.ts", "notifyStaff"],
    ["src/services/missed-call.service.ts", "observeMissedInboundCall"],
    ["src/services/missed-call.service.ts", "VOICE_CALL_AI"],
    ["src/services/missed-call.service.ts", "createAuditLog"],
    ["src/services/inbound-calls.service.ts", "prisma.callLog.findMany"],
    ["src/app/dashboard/inbound-calls/page.tsx", "inboundCallsService.listMissedInboundCalls"],
  ];
  for (const [f, n] of checks) {
    if (fileContains(f, n)) ok(`${path.basename(f)}: ${n}`);
    else fail(`${f} missing ${n}`);
  }
}

function auditAgents() {
  const chain = AGENT_HANDOFF_CHAIN.find((c) => c.id === "inbound_missed");
  if (chain && chain.steps.length >= 5) ok("Agent handoff chain documented");
  else fail("AGENT_HANDOFF_CHAIN inbound_missed incomplete");
}

function auditSimulateAndDocker() {
  if (fileContains("src/app/api/inbound-calls/simulate/route.ts", "isMockModeForced"))
    ok("Simulate endpoint gated by MOCK_MODE");
  else fail("Simulate endpoint missing MOCK_MODE gate");

  if (fileContains("Dockerfile", "HEALTHCHECK"))
    ok("Docker HEALTHCHECK configured");
  else fail("Docker HEALTHCHECK missing");

  if (fileContains("docker/entrypoint.sh", "prisma"))
    ok("Docker entrypoint runs migrations");
  else fail("Docker entrypoint may skip prisma");
}

function main() {
  console.log("\n=== Inbound Call Coordination Audit ===\n");
  auditFiles();
  auditWebhooks();
  auditPipeline();
  auditAgents();
  auditSimulateAndDocker();

  console.log(`Passed: ${passed.length}`);
  for (const p of passed) console.log(`  ✓ ${p}`);
  if (failed.length) {
    console.log(`\nFailed: ${failed.length}`);
    for (const f of failed) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("\nInbound call coordination audit passed.\n");
}

main();
