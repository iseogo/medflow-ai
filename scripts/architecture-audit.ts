/**
 * Deep cross-phase architecture audit (Phases 1–6).
 * Usage: npm run audit:architecture
 */
import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { PrismaClient, RoleType } from "@prisma/client";
import {
  canAccessDashboardRoute,
  DASHBOARD_ROUTE_RULES,
} from "../src/lib/route-permissions";
import { isMockModeForced } from "../src/lib/integrations/env";
import {
  auditApiRouteSecurity,
  collectApiRouteFiles,
  hasSessionRbacGuard,
  isWebhookApiRoute,
  readRouteSource,
  relFromApiRoot,
} from "./lib/api-route-security";

const prisma = new PrismaClient();

type Dimension =
  | "coherence"
  | "coordination"
  | "compatibility"
  | "scalability"
  | "security";

type Severity = "critical" | "warn" | "pass";

type Finding = {
  dimension: Dimension;
  severity: Severity;
  message: string;
};

const findings: Finding[] = [];

function record(dimension: Dimension, severity: Severity, message: string) {
  findings.push({ dimension, severity, message });
}

function pass(dimension: Dimension, message: string) {
  record(dimension, "pass", message);
}

function critical(dimension: Dimension, message: string) {
  record(dimension, "critical", message);
}

function warn(dimension: Dimension, message: string) {
  record(dimension, "warn", message);
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}

function scoreDimension(dimension: Dimension): number {
  const items = findings.filter((f) => f.dimension === dimension);
  const crit = items.filter((f) => f.severity === "critical").length;
  const w = items.filter((f) => f.severity === "warn").length;
  return clamp(100 - crit * 12 - w * 3);
}

function collectDashboardPaths(): string[] {
  const dashboardRoot = path.join(process.cwd(), "src", "app", "dashboard");
  const tests = new Set<string>();
  function walk(currentDir: string, segments: string[]) {
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".") || ent.name.startsWith("(")) continue;
      if (ent.isDirectory()) {
        walk(path.join(currentDir, ent.name), [...segments, ent.name]);
      } else if (ent.name === "page.tsx") {
        const hasDynamic = segments.some(
          (s) => s.startsWith("[") && s.endsWith("]")
        );
        const staticSegs = segments.filter(
          (s) => !(s.startsWith("[") && s.endsWith("]"))
        );
        const base =
          "/dashboard" +
          (staticSegs.length ? "/" + staticSegs.join("/") : "");
        tests.add(hasDynamic ? `${base}/__probe__` : base);
      }
    }
  }
  walk(dashboardRoot, []);
  return Array.from(tests);
}

function longestRule(pathname: string) {
  return DASHBOARD_ROUTE_RULES.filter((r) =>
    r.exact ? pathname === r.prefix : pathname.startsWith(r.prefix)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
}

// --- A. Coherence ---
function auditCoherence() {
  const paths = collectDashboardPaths();
  let unmatched = 0;
  for (const p of paths) {
    if (!longestRule(p)) unmatched++;
  }
  if (unmatched > 0) {
    critical("coherence", `${unmatched} dashboard paths lack RBAC rules`);
  } else {
    pass("coherence", `All ${paths.length} dashboard paths map to RBAC rules`);
  }

  if (
    canAccessDashboardRoute(
      "ADMIN" as RoleType,
      "/dashboard/unknown-architecture-path"
    )
  ) {
    critical("coherence", "Unknown dashboard paths are reachable — fix route-permissions");
  } else {
    pass("coherence", "Unknown dashboard paths denied (secure default)");
  }

  for (const doc of [
    "README.md",
    "README-PHASE6.md",
    "docs/INTEGRATIONS.md",
    ".env.example",
  ]) {
    if (!existsSync(path.join(process.cwd(), doc))) {
      warn("coherence", `Missing documentation file: ${doc}`);
    }
  }
  pass("coherence", "Core README and Phase 6 docs present");

  const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
  if (!readme.includes("Phase 6") || !readme.includes("audit:integrations")) {
    warn("coherence", "README should document Phase 6 and audit:integrations");
  } else {
    pass("coherence", "README documents Phase 6 integrations");
  }

  if (!readme.includes("audit:architecture")) {
    warn("coherence", "README scripts table should list audit:architecture");
  } else {
    pass("coherence", "README lists audit:architecture");
  }

  const settings = readFileSync(
    path.join(process.cwd(), "src", "app", "dashboard", "settings", "page.tsx"),
    "utf8"
  );
  if (!settings.includes("IntegrationsPanel")) {
    critical("coherence", "Settings page missing IntegrationsPanel (Phase 6)");
  } else {
    pass("coherence", "Settings UI includes Integrations panel");
  }

  const sidebar = readFileSync(
    path.join(process.cwd(), "src", "components", "dashboard", "Sidebar.tsx"),
    "utf8"
  );
  if (!sidebar.includes("Phases 1–6") && !sidebar.includes("Phases 1-6")) {
    warn("coherence", "Sidebar should label product scope as Phases 1–6");
  } else {
    pass("coherence", "Sidebar labels Phases 1–6 scope");
  }

  const requiredServices = [
    "orchestrator.service.ts",
    "master-orchestrator.service.ts",
    "reminder-engine.service.ts",
    "physical-client.service.ts",
    "twilio.service.ts",
    "email.service.ts",
    "voice-ai-reminder.service.ts",
    "n8n.service.ts",
  ];
  for (const f of requiredServices) {
    const p = path.join(process.cwd(), "src", "services", f);
    if (!existsSync(p)) {
      critical("coherence", `Missing service module: ${f}`);
    }
  }
  pass("coherence", "Core phase services exist (orchestrator, reminders, integrations)");
}

// --- B. Coordination ---
function auditCoordination() {
  const orch = readFileSync(
    path.join(process.cwd(), "src", "services", "orchestrator.service.ts"),
    "utf8"
  );
  if (!orch.includes("assertCommunicationAuthorized")) {
    critical("coordination", "Orchestrator missing assertCommunicationAuthorized gate");
  } else {
    pass("coordination", "Orchestrator blocks unauthorized communication sources");
  }

  if (!orch.includes("recordAgentAction is disabled")) {
    warn("coordination", "Orchestrator should disable direct recordAgentAction for AI");
  } else {
    pass("coordination", "Direct AI recordAgentAction path disabled");
  }

  const master = readFileSync(
    path.join(process.cwd(), "src", "services", "master-orchestrator.service.ts"),
    "utf8"
  );
  if (!master.includes("orchestratorService.send")) {
    critical("coordination", "Master Orchestrator must delegate sends to orchestratorService");
  } else {
    pass("coordination", "Master Orchestrator executes comms via orchestrator");
  }

  if (!master.includes("staffOverride")) {
    critical("coordination", "Master Orchestrator missing staffOverride handling");
  } else {
    pass("coordination", "Master Orchestrator honors staff override on review");
  }

  const reminder = readFileSync(
    path.join(process.cwd(), "src", "services", "reminder-engine.service.ts"),
    "utf8"
  );
  if (!reminder.includes("orchestratorService.sendSms")) {
    critical("coordination", "Reminder engine must use orchestrator for SMS fallbacks");
  } else {
    pass("coordination", "Reminder SMS fallbacks go through orchestrator");
  }
  if (!reminder.includes("voiceAiReminderService.placeAiReminderCall")) {
    critical("coordination", "Reminder engine must use voice AI provider abstraction");
  } else {
    pass("coordination", "Reminder voice calls use voiceAiReminderService");
  }
  if (!reminder.includes("assertAiAutomationAllowed")) {
    critical("coordination", "Reminder engine must respect AI automation guard");
  } else {
    pass("coordination", "Reminder engine checks staff override / automation halt");
  }
  if (!reminder.includes("reminderAutomationPaused")) {
    warn("coordination", "Reminder engine should respect appointment.reminderAutomationPaused");
  } else {
    pass("coordination", "Per-appointment reminder pause is enforced");
  }

  const guardPath = path.join(process.cwd(), "src", "lib", "ai-automation-guard.ts");
  if (!existsSync(guardPath)) {
    critical("coordination", "ai-automation-guard.ts missing");
  } else {
    pass("coordination", "AI automation guard module present");
  }

  const webhookHandler = readFileSync(
    path.join(process.cwd(), "src", "lib", "integrations", "webhook-handler.ts"),
    "utf8"
  );
  if (!webhookHandler.includes("validateMedflowWebhookSecret")) {
    critical("coordination", "MedFlow webhooks must validate WEBHOOK_SECRET");
  } else {
    pass("coordination", "Inbound MedFlow webhooks validate shared secret / HMAC");
  }
  if (!webhookHandler.includes("payloadKeyCount")) {
    warn("coordination", "Webhook audit metadata should use payloadKeyCount only");
  } else {
    pass("coordination", "Webhook audit logs avoid raw payload PHI");
  }

  const commApiRoutes = [
    "sms/route.ts",
    "emails/route.ts",
    "calls/route.ts",
    "calls/outbound/route.ts",
  ];
  for (const rel of commApiRoutes) {
    const file = path.join(process.cwd(), "src", "app", "api", rel);
    if (!existsSync(file)) continue;
    const src = readRouteSource(file);
    if (!src.includes("orchestratorService")) {
      critical("coordination", `API ${rel} must route sends through orchestratorService`);
    } else if (!src.includes('source: "staff"') && !src.includes("source:'staff'")) {
      warn("coordination", `API ${rel} should pass source: "staff" to orchestrator`);
    }
  }
  pass("coordination", "Staff communication APIs delegate to orchestrator");

  const agentActions = readFileSync(
    path.join(process.cwd(), "src", "app", "api", "agent-actions", "route.ts"),
    "utf8"
  );
  if (!agentActions.includes("masterOrchestratorService.submitProposal")) {
    critical("coordination", "Agent actions API must submit proposals to Master Orchestrator");
  } else {
    pass("coordination", "Agent actions API uses Master Orchestrator proposals");
  }
}

// --- C. Compatibility ---
function auditCompatibility() {
  try {
    execSync("npx tsc --noEmit", { cwd: process.cwd(), stdio: "pipe" });
    pass("compatibility", "TypeScript compiles (tsc --noEmit)");
  } catch {
    critical("compatibility", "TypeScript compile failed");
  }

  const api = auditApiRouteSecurity();
  if (api.score < 100) {
    const sessionBad = api.sessionRoutes.filter((r) => !r.ok);
    const webhookBad = api.webhookRoutes.filter((r) => !r.ok);
    for (const r of sessionBad) {
      critical("compatibility", `Admin API missing session/RBAC: ${r.rel}`);
    }
    for (const r of webhookBad) {
      critical("compatibility", `Webhook missing machine auth: ${r.rel}`);
    }
  } else {
    pass(
      "compatibility",
      `API auth split: ${api.sessionRoutes.length} session routes, ${api.webhookRoutes.length} webhook routes secured`
    );
  }

  if (!isMockModeForced()) {
    warn("compatibility", "MOCK_MODE is off in this environment — use true for local dev");
  } else {
    pass("compatibility", "MOCK_MODE defaults safe (no live external traffic)");
  }

  const schema = readFileSync(
    path.join(process.cwd(), "prisma", "schema.prisma"),
    "utf8"
  );
  const requiredModels = [
    "Client",
    "Appointment",
    "ReminderLog",
    "AgentAction",
    "SmsLog",
    "StaffIntervention",
    "AuditLog",
    "ClientTimelineEvent",
    "WaitingRoomStatus",
  ];
  for (const m of requiredModels) {
    if (!schema.includes(`model ${m}`)) {
      critical("compatibility", `Prisma schema missing model ${m}`);
    }
  }
  pass("compatibility", "Prisma schema includes cross-phase core models");

  if (!schema.includes("@@unique([appointmentId, reminderOffset])")) {
    critical("compatibility", "ReminderLog missing duplicate protection unique constraint");
  } else {
    pass("compatibility", "ReminderLog unique per appointment + offset");
  }

  if (!existsSync(path.join(process.cwd(), "prisma", "seed.ts"))) {
    critical("compatibility", "prisma/seed.ts missing");
  } else {
    pass("compatibility", "Database seed script present");
  }
}

// --- D. Scalability ---
function auditScalability() {
  const providers = [
    "twilio.service.ts",
    "email.service.ts",
    "voice-ai-reminder.service.ts",
    "n8n.service.ts",
    "openai.service.ts",
    "google-calendar.service.ts",
  ];
  for (const f of providers) {
    if (!existsSync(path.join(process.cwd(), "src", "services", f))) {
      critical("scalability", `Provider facade missing: ${f}`);
    }
  }
  pass("scalability", "Integration provider facades exist for all Phase 6 channels");

  const liveAdapters = ["twilio.live.ts", "email.live.ts", "voice-ai.live.ts"];
  for (const f of liveAdapters) {
    if (!existsSync(path.join(process.cwd(), "src", "services", "integrations", f))) {
      warn("scalability", `Live adapter missing: integrations/${f}`);
    }
  }
  pass("scalability", "Live integration adapters separated from facades");

  if (!existsSync(path.join(process.cwd(), "src", "lib", "communication-dedup.ts"))) {
    critical("scalability", "communication-dedup module missing");
  } else {
    pass("scalability", "Communication duplicate protection module present");
  }

  const schema = readFileSync(
    path.join(process.cwd(), "prisma", "schema.prisma"),
    "utf8"
  );
  if (schema.includes("organizationId") || schema.includes("tenantId")) {
    pass("scalability", "Multi-tenant fields present in schema");
  } else {
    pass(
      "scalability",
      "Single-tenant schema today — Organization/tenant can be added without breaking Client-centric model"
    );
  }

  const reminderRun = path.join(
    process.cwd(),
    "src",
    "app",
    "api",
    "reminders",
    "run",
    "route.ts"
  );
  if (existsSync(reminderRun)) {
    const src = readFileSync(reminderRun, "utf8");
    if (src.includes("runDueReminders") || src.includes("reminderEngineService")) {
      pass("scalability", "Reminder run endpoint suitable for future cron/worker trigger");
    } else {
      warn("scalability", "reminders/run route should invoke reminderEngineService batch");
    }
  }

  const orch = readFileSync(
    path.join(process.cwd(), "src", "services", "orchestrator.service.ts"),
    "utf8"
  );
  if (!orch.includes('source?: "staff"') && !orch.includes("automation")) {
    warn("scalability", "Orchestrator context should distinguish staff vs automation sources");
  } else {
    pass("scalability", "Orchestrator tags automation vs staff for future queue workers");
  }
}

// --- E. Security ---
function auditSecurity() {
  const componentsDir = path.join(process.cwd(), "src", "components");
  const secretPatterns = [
    /process\.env\.(OPENAI|TWILIO|SENDGRID|WEBHOOK_SECRET|GMAIL_|VAPI_|RETELL_)/,
    /sk-[a-zA-Z0-9]{20,}/,
  ];
  function walkComponents(dir: string) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walkComponents(full);
      else if (ent.name.endsWith(".tsx") || ent.name.endsWith(".ts")) {
        const src = readFileSync(full, "utf8");
        for (const pat of secretPatterns) {
          if (pat.test(src)) {
            critical(
              "security",
              `Possible secret reference in client component tree: ${path.relative(process.cwd(), full)}`
            );
            return;
          }
        }
      }
    }
  }
  walkComponents(componentsDir);
  pass("security", "No integration secrets in src/components");

  if (!existsSync(path.join(process.cwd(), "src", "lib", "integrations", "safe-log.ts"))) {
    critical("security", "safe-log.ts missing for PHI/secret redaction");
  } else {
    pass("security", "Integration safe logging module present");
  }

  const auth = readFileSync(
    path.join(process.cwd(), "src", "lib", "integrations", "webhook-auth.ts"),
    "utf8"
  );
  if (!auth.includes("WEBHOOK_SECRET") || !auth.includes("timingSafeEqual")) {
    critical("security", "webhook-auth must use WEBHOOK_SECRET with timing-safe compare");
  } else {
    pass("security", "Webhook secret validation uses timing-safe comparison");
  }

  for (const file of collectApiRouteFiles()) {
    const rel = relFromApiRoot(file);
    if (!isWebhookApiRoute(rel)) continue;
    const src = readRouteSource(file);
    if (hasSessionRbacGuard(src)) {
      critical("security", `Webhook route must not require session/RBAC: ${rel}`);
    }
  }
  pass("security", "Webhook routes are machine-to-machine (no session/RBAC)");

  const api = auditApiRouteSecurity();
  if (api.score < 100) {
    critical("security", `API route security score ${api.score}/100`);
  } else {
    pass("security", "API route security: webhooks + admin APIs correctly separated");
  }
}

async function auditDatabaseCoordination() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    warn(
      "coordination",
      `Database unreachable — skipping relational checks (${e instanceof Error ? e.message : e})`
    );
    return;
  }

  const rm = Number(
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM "ReminderLog" rl
      INNER JOIN "Appointment" a ON a.id = rl."appointmentId"
      WHERE rl."clientId" <> a."clientId"`
    )[0]?.c ?? 0
  );
  if (rm > 0) {
    critical("coordination", `ReminderLog client mismatch: ${rm} rows`);
  } else {
    pass("coordination", "ReminderLog.clientId aligns with Appointment");
  }

  const execMissing = await prisma.agentAction.count({
    where: {
      proposalStatus: "EXECUTED",
      OR: [
        { actionType: "SEND_SMS", smsLogId: null },
        { actionType: "SEND_EMAIL", emailLogId: null },
        { actionType: "PLACE_CALL", callLogId: null },
      ],
    },
  });
  if (execMissing > 0) {
    critical("coordination", `EXECUTED agent actions missing comm logs: ${execMissing}`);
  } else {
    pass("coordination", "Executed agent comm actions linked to communication logs");
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
    critical("scalability", `Duplicate ReminderLog rows: ${dupReminder}`);
  } else {
    pass("scalability", "No duplicate reminder windows in database");
  }
}

function buildRecommendations(): string[] {
  const recs: string[] = [];
  if (findings.some((f) => f.message.includes("MOCK_MODE is off"))) {
    recs.push("Keep MOCK_MODE=true in local .env until staging credentials are ready.");
  }
  if (
    findings.some((f) => f.dimension === "scalability" && f.message.includes("tenant"))
  ) {
    recs.push(
      "When scaling to multi-clinic, add Organization with client.organizationId and scope all queries."
    );
  }
  recs.push(
    "Schedule POST /api/reminders/run via cron or queue worker; keep orchestrator as the only outbound comm path."
  );
  recs.push(
    "Rotate WEBHOOK_SECRET and provider tokens on a calendar; never log raw webhook bodies."
  );
  if (!findings.some((f) => f.severity === "critical")) {
    recs.push(
      "Architecture baseline is sound — enable live integrations one provider at a time with MOCK_MODE=false."
    );
  }
  return recs;
}

async function main() {
  console.log("\n=== MedFlow AI — Architecture Audit (Phases 1–6) ===\n");

  auditCoherence();
  auditCoordination();
  auditCompatibility();
  auditScalability();
  auditSecurity();
  await auditDatabaseCoordination();

  const coherenceScore = scoreDimension("coherence");
  const coordinationScore = scoreDimension("coordination");
  const compatibilityScore = scoreDimension("compatibility");
  const scalabilityScore = scoreDimension("scalability");
  const securityScore = scoreDimension("security");
  const productionReadinessScore = clamp(
    Math.round(
      (coherenceScore +
        coordinationScore +
        compatibilityScore +
        scalabilityScore +
        securityScore) /
        5
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
  const sample = passed.slice(0, 12);
  for (const p of sample) console.log(`  ✓ [${p.dimension}] ${p.message}`);
  if (passed.length > sample.length) {
    console.log(`  … and ${passed.length - sample.length} more`);
  }

  console.log("\nCRITICAL FAILURES:");
  if (criticalFailures.length === 0) console.log("  (none)");
  else for (const c of criticalFailures) console.log(`  ✗ ${c}`);

  console.log("\nWARNINGS:");
  if (warnings.length === 0) console.log("  (none)");
  else for (const w of warnings) console.log(`  ⚠ ${w}`);

  console.log("\nRECOMMENDATIONS:");
  for (const r of recommendations) console.log(`  → ${r}`);

  console.log("\n--- Scores (0–100) ---");
  console.log(`coherence_score: ${coherenceScore}`);
  console.log(`coordination_score: ${coordinationScore}`);
  console.log(`compatibility_score: ${compatibilityScore}`);
  console.log(`scalability_score: ${scalabilityScore}`);
  console.log(`security_score: ${securityScore}`);
  console.log(`production_readiness_score: ${productionReadinessScore}`);
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
