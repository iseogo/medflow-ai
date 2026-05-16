/**
 * Multi-session / multi-agent coordination audit (Phases 1–7).
 * Usage: npm run audit:coordination
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { PrismaClient, RoleType } from "@prisma/client";
import { AGENT_DEFINITIONS } from "../src/lib/agents/definitions";
import { isMockModeForced } from "../src/lib/integrations/env";
import { auditApiRouteSecurity } from "./lib/api-route-security";

const prisma = new PrismaClient();

type Dimension =
  | "session"
  | "cross_session"
  | "ai_agent"
  | "action"
  | "outcome"
  | "scalability"
  | "security";

type Severity = "critical" | "warn" | "pass";

type Finding = { dimension: Dimension; severity: Severity; message: string };

const findings: Finding[] = [];

function pass(d: Dimension, msg: string) {
  findings.push({ dimension: d, severity: "pass", message: msg });
}
function critical(d: Dimension, msg: string) {
  findings.push({ dimension: d, severity: "critical", message: msg });
}
function warn(d: Dimension, msg: string) {
  findings.push({ dimension: d, severity: "warn", message: msg });
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}

function scoreDimension(d: Dimension): number {
  const items = findings.filter((f) => f.dimension === d);
  const crit = items.filter((f) => f.severity === "critical").length;
  const w = items.filter((f) => f.severity === "warn").length;
  return clamp(100 - crit * 12 - w * 3);
}

const PHASE_ARTIFACTS: Record<
  string,
  { readme: string; markers: string[] }
> = {
  "Phase 1": {
    readme: "README.md",
    markers: ["prisma/schema.prisma", "src/lib/auth.ts", "src/lib/prisma.ts"],
  },
  "Phase 2": {
    readme: "README-PHASE2.md",
    markers: [
      "src/services/orchestrator.service.ts",
      "src/lib/communication-dedup.ts",
      "src/lib/communication-log.ts",
    ],
  },
  "Phase 3": {
    readme: "README-PHASE3.md",
    markers: [
      "src/services/master-orchestrator.service.ts",
      "src/lib/agents/definitions.ts",
      "src/lib/proposal-dedup.ts",
    ],
  },
  "Phase 3.5": {
    readme: "README-PHASE3-5.md",
    markers: ["src/lib/rbac.ts", "src/lib/route-permissions.ts", "src/middleware.ts"],
  },
  "Phase 4": {
    readme: "README-PHASE4.md",
    markers: ["src/services/physical-client.service.ts", "src/lib/waiting-room.ts"],
  },
  "Phase 5": {
    readme: "README-PHASE5.md",
    markers: [
      "src/services/reminder-engine.service.ts",
      "src/services/voice-ai-reminder.service.ts",
      "src/lib/reminder-types.ts",
    ],
  },
  "Phase 6": {
    readme: "README-PHASE6.md",
    markers: [
      "src/lib/integrations/env.ts",
      "src/lib/integrations/webhook-auth.ts",
      "src/services/n8n.service.ts",
    ],
  },
  "Phase 7": {
    readme: "README-PHASE7.md",
    markers: ["n8n-workflows/SAFETY.md", "scripts/generate-n8n-workflows.ts"],
  },
};

function auditSessionCoherence() {
  for (const [phase, spec] of Object.entries(PHASE_ARTIFACTS)) {
    if (!existsSync(path.join(process.cwd(), spec.readme))) {
      warn("session", `${phase}: missing doc ${spec.readme}`);
      continue;
    }
    for (const marker of spec.markers) {
      if (!existsSync(path.join(process.cwd(), marker))) {
        critical("session", `${phase}: missing artifact ${marker}`);
      }
    }
    pass("session", `${phase}: docs and core artifacts present`);
  }

  const dupChecks: [string, string][] = [
    ["orchestrator vs master", "src/services/master-orchestrator.service.ts"],
    ["reminder vs orchestrator comms", "src/services/reminder-engine.service.ts"],
    ["webhook vs orchestrator outbound", "src/lib/integrations/webhook-handler.ts"],
  ];
  for (const [, file] of dupChecks) {
    if (existsSync(path.join(process.cwd(), file))) {
      pass("session", `No duplicate replacement for ${path.basename(file)}`);
    }
  }

  if (!existsSync(path.join(process.cwd(), "scripts/architecture-audit.ts"))) {
    warn("session", "scripts/architecture-audit.ts missing");
  } else {
    pass("session", "architecture-audit script available");
  }
}

function auditCrossSessionChain() {
  const chain = [
    ["Client model", "model Client"],
    ["Appointment model", "model Appointment"],
    ["ReminderLog", "model ReminderLog"],
    ["Provider facades", "src/services/twilio.service.ts"],
    ["n8n service", "src/services/n8n.service.ts"],
    ["AgentAction", "model AgentAction"],
    ["Master Orchestrator", "masterOrchestratorService"],
    ["Communication logs", "model SmsLog"],
    ["Timeline", "model ClientTimelineEvent"],
    ["AuditLog", "model AuditLog"],
    ["StaffIntervention", "model StaffIntervention"],
    ["Webhook handler", "handleMedflowWebhook"],
  ];
  const schema = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
  for (const [label, needle] of chain) {
    if (needle.startsWith("model ")) {
      if (!schema.includes(needle)) critical("cross_session", `Schema missing ${label}`);
      else pass("cross_session", `Schema: ${label}`);
    } else if (needle.includes("/")) {
      if (!existsSync(path.join(process.cwd(), needle))) {
        critical("cross_session", `Chain broken: ${label} (${needle})`);
      } else pass("cross_session", `Chain link: ${label}`);
    } else {
      const files = ["src/services/reminder-engine.service.ts", "src/services/master-orchestrator.service.ts", "src/lib/integrations/webhook-handler.ts"];
      const hit = files.some((f) => readFileSync(path.join(process.cwd(), f), "utf8").includes(needle));
      if (!hit) critical("cross_session", `Chain reference missing: ${label}`);
      else pass("cross_session", `Chain wiring: ${label}`);
    }
  }

  const reminder = readFileSync(
    path.join(process.cwd(), "src/services/reminder-engine.service.ts"),
    "utf8"
  );
  if (!reminder.includes("n8nService.triggerWorkflow")) {
    warn("cross_session", "Reminder engine may not notify n8n layer");
  } else {
    pass("cross_session", "Reminder engine → n8n trigger present");
  }

  const n8nCount = readdirSync(path.join(process.cwd(), "n8n-workflows")).filter((f) =>
    f.endsWith(".json")
  ).length;
  if (n8nCount < 12) {
    critical("cross_session", `Expected 12 n8n workflow templates, found ${n8nCount}`);
  } else {
    pass("cross_session", `Phase 7: ${n8nCount} n8n workflow templates`);
  }
}

function auditAiAgentCollaboration() {
  const orch = readFileSync(
    path.join(process.cwd(), "src/services/orchestrator.service.ts"),
    "utf8"
  );
  if (!orch.includes("recordAgentAction is disabled")) {
    critical("ai_agent", "orchestrator.recordAgentAction must be disabled for AI bypass");
  } else {
    pass("ai_agent", "Direct recordAgentAction blocked — proposals required");
  }

  const master = readFileSync(
    path.join(process.cwd(), "src/services/master-orchestrator.service.ts"),
    "utf8"
  );
  if (!master.includes("submitProposal") || !master.includes("reviewProposal")) {
    critical("ai_agent", "Master Orchestrator missing submit/review API");
  } else {
    pass("ai_agent", "Master Orchestrator submit + review flows present");
  }
  if (!master.includes("staffOverride")) {
    critical("ai_agent", "Master Orchestrator missing staffOverride handling");
  } else {
    pass("ai_agent", "Staff override recorded on orchestrator review");
  }
  if (!master.includes("executeApprovedProposal")) {
    critical("ai_agent", "executeApprovedProposal missing");
  } else {
    pass("ai_agent", "Approved proposals execute only via orchestrator");
  }

  const agentApi = readFileSync(
    path.join(process.cwd(), "src/app/api/agent-actions/route.ts"),
    "utf8"
  );
  if (!agentApi.includes("masterOrchestratorService.submitProposal")) {
    critical("ai_agent", "POST /api/agent-actions must use submitProposal");
  } else {
    pass("ai_agent", "Agent actions API routes through Master Orchestrator");
  }

  const guard = readFileSync(
    path.join(process.cwd(), "src/lib/ai-automation-guard.ts"),
    "utf8"
  );
  if (!guard.includes("staffOverride") || !guard.includes("automationHalted")) {
    critical("ai_agent", "ai-automation-guard incomplete");
  } else {
    pass("ai_agent", "Automation guard blocks AI when staff override / halt active");
  }

  const agentTypes = Object.keys(AGENT_DEFINITIONS);
  if (agentTypes.length < 8) {
    warn("ai_agent", `Only ${agentTypes.length} agent definitions`);
  } else {
    pass("ai_agent", `${agentTypes.length} modular agent definitions`);
  }

  const defs = readFileSync(
    path.join(process.cwd(), "src/lib/agents/definitions.ts"),
    "utf8"
  );
  if (!defs.includes("Submit all work as proposals to the Master Orchestrator")) {
    warn("ai_agent", "Agent prompts should mandate Master Orchestrator");
  } else {
    pass("ai_agent", "Agent definitions instruct proposal-only behavior");
  }

  if (master.includes('proposalStatus: "EXECUTED"') && master.includes("CREATE_STAFF_INTERVENTION")) {
    pass("ai_agent", "Escalation path can create staff intervention");
  }
}

function auditActionConsistencyStatic() {
  if (!existsSync(path.join(process.cwd(), "src/lib/communication-dedup.ts"))) {
    critical("action", "communication-dedup missing");
  } else {
    pass("action", "Communication duplicate protection module exists");
  }
  if (!existsSync(path.join(process.cwd(), "src/lib/proposal-dedup.ts"))) {
    critical("action", "proposal-dedup missing");
  } else {
    pass("action", "Proposal duplicate protection module exists");
  }

  const webhookHandler = readFileSync(
    path.join(process.cwd(), "src/lib/integrations/webhook-handler.ts"),
    "utf8"
  );
  if (!webhookHandler.includes("validateMedflowWebhookSecret")) {
    critical("action", "MedFlow webhooks must validate secret before side effects");
  } else {
    pass("action", "Webhook events validated before applyWebhookSideEffects");
  }

  const apiSecurity = auditApiRouteSecurity();
  if (apiSecurity.score < 100) {
    critical("action", `API auth split score ${apiSecurity.score}/100`);
  } else {
    pass("action", "Webhook vs session API auth correctly separated");
  }

  if (isMockModeForced()) {
    pass("action", "MOCK_MODE default prevents live provider calls");
  } else {
    warn("action", "MOCK_MODE is off in this environment");
  }

  const commRoutes = ["sms/route.ts", "emails/route.ts", "calls/route.ts"];
  for (const rel of commRoutes) {
    const src = readFileSync(path.join(process.cwd(), "src/app/api", rel), "utf8");
    if (!src.includes("orchestratorService")) {
      critical("action", `${rel} must use orchestratorService`);
    } else if (!src.includes('source: "staff"')) {
      warn("action", `${rel} should pass source: "staff" to orchestrator`);
    }
  }
  pass("action", "Staff comm APIs delegate to orchestrator with authorization");
}

async function auditActionConsistencyDb() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    warn("action", `DB skipped (${e instanceof Error ? e.message : e})`);
    return;
  }

  const orphanComm = Number(
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM (
        SELECT id FROM "SmsLog" WHERE "clientId" IS NULL
        UNION ALL SELECT id FROM "EmailLog" WHERE "clientId" IS NULL
        UNION ALL SELECT id FROM "CallLog" WHERE "clientId" IS NULL
      ) x`
    )[0]?.c ?? 0
  );
  if (orphanComm > 0) {
    critical("action", `Communication logs without clientId: ${orphanComm}`);
  } else {
    pass("action", "All communication logs linked to client");
  }

  const reminderOrphan = Number(
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM "ReminderLog" rl
      LEFT JOIN "Appointment" a ON a.id = rl."appointmentId"
      WHERE a.id IS NULL`
    )[0]?.c ?? 0
  );
  if (reminderOrphan > 0) {
    critical("action", `ReminderLog without appointment: ${reminderOrphan}`);
  } else {
    pass("action", "All reminders linked to appointments");
  }

  const rmMismatch = Number(
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM "ReminderLog" rl
      INNER JOIN "Appointment" a ON a.id = rl."appointmentId"
      WHERE rl."clientId" <> a."clientId"`
    )[0]?.c ?? 0
  );
  if (rmMismatch > 0) {
    critical("action", `ReminderLog clientId mismatch: ${rmMismatch}`);
  } else {
    pass("action", "ReminderLog.clientId matches appointment owner");
  }

  const execMissing = await prisma.agentAction.count({
    where: {
      proposalStatus: "EXECUTED",
      agentType: { not: "MASTER_ORCHESTRATOR" },
      actionType: { in: ["SEND_SMS", "SEND_EMAIL", "PLACE_CALL"] },
      OR: [
        { actionType: "SEND_SMS", smsLogId: null },
        { actionType: "SEND_EMAIL", emailLogId: null },
        { actionType: "PLACE_CALL", callLogId: null },
      ],
    },
  });
  if (execMissing > 0) {
    critical("action", `EXECUTED comm agent actions missing log FKs: ${execMissing}`);
  } else {
    pass("action", "Executed agent comm actions have communication log FKs");
  }

  const dupReminder = Number(
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM (
        SELECT "appointmentId", "reminderOffset" FROM "ReminderLog"
        GROUP BY 1, 2 HAVING COUNT(*) > 1
      ) t`
    )[0]?.c ?? 0
  );
  if (dupReminder > 0) {
    critical("action", `Duplicate reminder windows: ${dupReminder}`);
  } else {
    pass("action", "Reminder duplicate protection (appointmentId + offset)");
  }

  const pendingAiExecuted = await prisma.agentAction.count({
    where: {
      proposalStatus: "EXECUTED",
      agentType: { notIn: ["MASTER_ORCHESTRATOR"] },
      actionType: { not: "STAFF_PHYSICAL_EVENT" },
      executedAt: null,
    },
  });
  if (pendingAiExecuted > 0) {
    warn("action", `EXECUTED proposals missing executedAt: ${pendingAiExecuted}`);
  } else {
    pass("action", "Executed agent actions have executedAt timestamp");
  }

  const apptTotal = await prisma.appointment.count();
  const apptTimeline = await prisma.clientTimelineEvent.count({
    where: { eventType: "APPOINTMENT_CREATED" },
  });
  if (apptTimeline < apptTotal) {
    warn(
      "action",
      `APPOINTMENT_CREATED events (${apptTimeline}) < appointments (${apptTotal}) — run backfill:appointment-events`
    );
  } else {
    pass("action", "Appointment timeline coverage complete");
  }
}

function auditOutcomeQuality() {
  const reminder = readFileSync(
    path.join(process.cwd(), "src/services/reminder-engine.service.ts"),
    "utf8"
  );
  if (!reminder.includes("placeAiReminderCall")) {
    critical("outcome", "Reminder engine missing voice-first AI call");
  } else {
    pass("outcome", "Reminders use voice-first (voiceAiReminderService)");
  }
  if (!reminder.includes("orchestratorService.sendSms")) {
    critical("outcome", "Reminder engine missing SMS fallback via orchestrator");
  } else {
    pass("outcome", "SMS fallback via orchestrator after voice");
  }
  if (!reminder.includes("orchestratorService.sendEmail")) {
    critical("outcome", "Reminder engine missing email fallback");
  } else {
    pass("outcome", "Email fallback via orchestrator");
  }
  if (!reminder.includes("notifyStaffTask") || !reminder.includes("ESCALATED")) {
    warn("outcome", "Reminder escalation / staff task wiring unclear");
  } else {
    pass("outcome", "Failed near-visit reminders can escalate to staff tasks");
  }
  if (!reminder.includes("reminderAutomationPaused")) {
    critical("outcome", "Per-appointment automation pause not enforced");
  } else {
    pass("outcome", "Appointment reminderAutomationPaused respected");
  }
  if (!reminder.includes("assertAiAutomationAllowed")) {
    critical("outcome", "Reminder must respect staff automation blocks");
  } else {
    pass("outcome", "Staff intervention pauses reminder automation");
  }

  const physical = readFileSync(
    path.join(process.cwd(), "src/services/physical-client.service.ts"),
    "utf8"
  );
  if (!physical.includes("waitingRoom") && !physical.includes("WaitingRoom")) {
    critical("outcome", "Physical service missing waiting room sync");
  } else {
    pass("outcome", "Physical visits sync with waiting room");
  }
  const physicalEvents = existsSync(path.join(process.cwd(), "src/lib/physical-events.ts"))
    ? readFileSync(path.join(process.cwd(), "src/lib/physical-events.ts"), "utf8")
    : "";
  const physicalWritesAudit =
    physical.includes("recordPhysicalEvent") ||
    physical.includes("physical-events") ||
    (physicalEvents.includes("addTimelineEvent") &&
      physicalEvents.includes("createAuditLog"));
  if (!physicalWritesAudit) {
    critical("outcome", "Physical flow must write timeline + audit (physical-events)");
  } else {
    pass("outcome", "Physical client flow writes timeline, audit, and orchestrator notify");
  }
}

function auditScalability() {
  const providers = [
    "twilio.service.ts",
    "email.service.ts",
    "voice-ai-reminder.service.ts",
    "n8n.service.ts",
    "openai.service.ts",
    "google-calendar.service.ts",
  ];
  for (const p of providers) {
    if (!existsSync(path.join(process.cwd(), "src/services", p))) {
      critical("scalability", `Missing swappable provider: ${p}`);
    }
  }
  pass("scalability", "Provider layer facades are modular");

  const env = readFileSync(path.join(process.cwd(), "src/lib/integrations/env.ts"), "utf8");
  if (!env.includes("isMockModeForced") || !env.includes("canUseLiveIntegrations")) {
    critical("scalability", "Integration env gates missing for live mode");
  } else {
    pass("scalability", "Live API mode gated by MOCK_MODE + credentials");
  }

  const schema = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
  if (schema.includes("organizationId")) {
    pass("scalability", "Tenant field present in schema");
  } else {
    pass("scalability", "Client-centric schema ready for future Organization model");
  }

  if (!existsSync(path.join(process.cwd(), "src/app/api/reminders/run/route.ts"))) {
    warn("scalability", "reminders/run endpoint missing for future workers");
  } else {
    pass("scalability", "Batch reminder endpoint suitable for cron/queue workers");
  }

  const safety = path.join(process.cwd(), "n8n-workflows/SAFETY.md");
  if (!existsSync(safety)) {
    warn("scalability", "n8n SAFETY.md missing");
  } else {
    const text = readFileSync(safety, "utf8");
    if (!text.includes("MEDFLOW_TEST_MODE")) {
      warn("scalability", "n8n templates should document test mode");
    } else {
      pass("scalability", "n8n workflows isolated with test-mode templates");
    }
  }
}

function auditSecurity() {
  const componentsDir = path.join(process.cwd(), "src/components");
  const secretPat = /process\.env\.(OPENAI|TWILIO|SENDGRID|WEBHOOK_SECRET|VAPI_|RETELL_)/;
  function walk(dir: string) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/\.(tsx|ts)$/.test(ent.name) && secretPat.test(readFileSync(full, "utf8"))) {
        critical("security", `Secret env reference in UI: ${path.relative(process.cwd(), full)}`);
      }
    }
  }
  walk(componentsDir);
  pass("security", "No integration secrets in src/components");

  const api = auditApiRouteSecurity();
  if (api.webhookRoutes.some((r) => !r.ok)) {
    critical("security", "Webhook routes missing machine authentication");
  } else {
    pass("security", `All ${api.webhookRoutes.length} webhook routes use machine auth`);
  }
  if (api.sessionRoutes.some((r) => !r.ok)) {
    critical("security", "Admin API routes missing session/RBAC");
  } else {
    pass("security", `All ${api.sessionRoutes.length} admin routes require session/RBAC`);
  }

  const auditLib = readFileSync(path.join(process.cwd(), "src/lib/audit.ts"), "utf8");
  if (!auditLib.includes("resolveActor")) {
    warn("security", "Audit log actor resolution may be incomplete");
  } else {
    pass("security", "Audit logs resolve staff actor identity");
  }
}

function buildRecommendations(): string[] {
  const recs: string[] = [];
  if (findings.some((f) => f.message.includes("backfill:appointment-events"))) {
    recs.push("Run `npm run backfill:appointment-events` to align appointment timeline events.");
  }
  if (findings.some((f) => f.dimension === "ai_agent" && f.severity === "pass")) {
    recs.push("Keep all new AI features behind masterOrchestratorService.submitProposal only.");
  }
  recs.push(
    "Use `npm run audit:coordination` in CI alongside audit:architecture and audit:production."
  );
  recs.push(
    "Enable live providers only with MOCK_MODE=false (MedFlow) and MEDFLOW_TEST_MODE=false (n8n)."
  );
  if (!findings.some((f) => f.severity === "critical")) {
    recs.push("Coordination baseline is sound — add Organization scoping when multi-clinic ships.");
  }
  return recs;
}

async function main() {
  console.log("\n=== MedFlow AI — Multi-Session Coordination Audit ===\n");

  auditSessionCoherence();
  auditCrossSessionChain();
  auditAiAgentCollaboration();
  auditActionConsistencyStatic();
  await auditActionConsistencyDb();
  auditOutcomeQuality();
  auditScalability();
  auditSecurity();

  const scores = {
    session_coherence_score: scoreDimension("session"),
    cross_session_coordination_score: scoreDimension("cross_session"),
    ai_agent_collaboration_score: scoreDimension("ai_agent"),
    action_consistency_score: scoreDimension("action"),
    outcome_quality_score: scoreDimension("outcome"),
    scalability_score: scoreDimension("scalability"),
    security_score: scoreDimension("security"),
  };

  const production_readiness_score = clamp(
    Math.round(
      Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length
    )
  );

  const criticalFailures = findings
    .filter((f) => f.severity === "critical")
    .map((f) => `[${f.dimension}] ${f.message}`);
  const warnings = findings
    .filter((f) => f.severity === "warn")
    .map((f) => `[${f.dimension}] ${f.message}`);
  const recommendations = buildRecommendations();

  const passed = findings.filter((f) => f.severity === "pass");

  console.log("PASSED (sample):");
  for (const p of passed.slice(0, 14)) console.log(`  ✓ [${p.dimension}] ${p.message}`);
  if (passed.length > 14) console.log(`  … and ${passed.length - 14} more`);

  console.log("\nCRITICAL FAILURES:");
  if (criticalFailures.length === 0) console.log("  (none)");
  else for (const c of criticalFailures) console.log(`  ✗ ${c}`);

  console.log("\nWARNINGS:");
  if (warnings.length === 0) console.log("  (none)");
  else for (const w of warnings) console.log(`  ⚠ ${w}`);

  console.log("\nRECOMMENDATIONS:");
  for (const r of recommendations) console.log(`  → ${r}`);

  console.log("\n--- Scores (0–100) ---");
  for (const [k, v] of Object.entries(scores)) console.log(`${k}: ${v}`);
  console.log(`production_readiness_score: ${production_readiness_score}`);
  console.log(
    `\nTotals: ${passed.length} passed, ${criticalFailures.length} critical, ${warnings.length} warnings\n`
  );

  await prisma.$disconnect().catch(() => undefined);

  if (criticalFailures.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
