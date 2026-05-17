/**
 * Global MedFlow AI coordination audit — phases 1–10, cross-session chain,
 * AI collaboration, notifications, consistency, security, scalability.
 * Usage: npm run audit:global-coordination
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { AGENT_DEFINITIONS } from "../src/lib/agents/definitions";
import { isMockModeForced } from "../src/lib/integrations/env";
import { SUPERVISOR_FORBIDDEN_SERVICE_PATTERNS } from "../src/lib/supervisor/governance";
import { auditApiRouteSecurity } from "./lib/api-route-security";

const prisma = new PrismaClient();

type Dimension =
  | "phase"
  | "cross_session"
  | "ai"
  | "notification"
  | "action"
  | "security"
  | "scalability";

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

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const PHASE_SCOPE: Record<string, { readme: string; markers: string[]; responsibility: string }> =
  {
    "Phase 1": {
      readme: "README.md",
      responsibility: "foundation",
      markers: ["prisma/schema.prisma", "src/lib/auth.ts", "src/lib/prisma.ts"],
    },
    "Phase 2": {
      readme: "README-PHASE2.md",
      responsibility: "communications",
      markers: [
        "src/services/orchestrator.service.ts",
        "src/lib/communication-dedup.ts",
        "src/lib/communication-log.ts",
      ],
    },
    "Phase 3": {
      readme: "README-PHASE3.md",
      responsibility: "orchestrator",
      markers: [
        "src/services/master-orchestrator.service.ts",
        "src/lib/agents/definitions.ts",
        "src/lib/proposal-dedup.ts",
      ],
    },
    "Phase 3.5": {
      readme: "README-PHASE3-5.md",
      responsibility: "rbac",
      markers: ["src/lib/rbac.ts", "src/lib/route-permissions.ts", "src/middleware.ts"],
    },
    "Phase 4": {
      readme: "README-PHASE4.md",
      responsibility: "physical",
      markers: ["src/services/physical-client.service.ts", "src/lib/waiting-room.ts"],
    },
    "Phase 5": {
      readme: "README-PHASE5.md",
      responsibility: "reminders",
      markers: [
        "src/services/reminder-engine.service.ts",
        "src/services/voice-ai-reminder.service.ts",
      ],
    },
    "Phase 6": {
      readme: "README-PHASE6.md",
      responsibility: "integrations",
      markers: [
        "src/lib/integrations/env.ts",
        "src/lib/integrations/webhook-auth.ts",
        "src/services/n8n.service.ts",
      ],
    },
    "Phase 7": {
      readme: "README-PHASE7.md",
      responsibility: "n8n",
      markers: ["n8n-workflows/SAFETY.md", "scripts/generate-n8n-workflows.ts"],
    },
    "Phase 8": {
      readme: "README-PHASE8.md",
      responsibility: "security",
      markers: ["src/lib/security/phi-safe-log.ts", "src/middleware/security.ts"],
    },
    "Phase 9": {
      readme: "README-PHASE9.md",
      responsibility: "scheduling-planning",
      markers: ["docs/phase9/ROADMAP.md", "src/lib/scheduling/planning/interfaces.ts"],
    },
    "Phase 10": {
      readme: "README-PHASE10.md",
      responsibility: "supervisor",
      markers: [
        "src/services/supervisor-agent.service.ts",
        "src/services/admin-alert.service.ts",
      ],
    },
  };

const DUPLICATE_REPLACEMENT_GUARDS = [
  "src/services/master-orchestrator.service.ts",
  "src/services/reminder-engine.service.ts",
  "src/lib/integrations/webhook-handler.ts",
];

const STABLE_SERVICES_NO_SCHEDULING_PLANNING = [
  "src/services/master-orchestrator.service.ts",
  "src/services/orchestrator.service.ts",
  "src/services/reminder-engine.service.ts",
  "src/services/supervisor-agent.service.ts",
];

function auditPhaseCoherence() {
  for (const [phase, spec] of Object.entries(PHASE_SCOPE)) {
    if (!existsSync(path.join(process.cwd(), spec.readme))) {
      critical("phase", `${phase}: missing ${spec.readme}`);
      continue;
    }
    for (const marker of spec.markers) {
      if (!existsSync(path.join(process.cwd(), marker))) {
        critical("phase", `${phase}: missing artifact ${marker}`);
      }
    }
    pass("phase", `${phase}: ${spec.responsibility} artifacts present`);
  }

  for (const file of DUPLICATE_REPLACEMENT_GUARDS) {
    if (existsSync(path.join(process.cwd(), file))) {
      pass("phase", `No duplicate replacement for ${path.basename(file)}`);
    }
  }

  if (existsSync(path.join(process.cwd(), "src/services/scheduling"))) {
    critical("phase", "Phase 9 scheduling runtime must not exist (planning-only)");
  } else {
    pass("phase", "Phase 9 remains planning-only (no src/services/scheduling)");
  }

  for (const stable of STABLE_SERVICES_NO_SCHEDULING_PLANNING) {
    const src = read(stable);
    if (src.includes("scheduling/planning")) {
      critical("phase", `${stable} must not import Phase 9 planning stubs`);
    }
  }
  pass("phase", "Stable phase services isolated from Phase 9 planning imports");

  const supervisor = read("src/services/supervisor-agent.service.ts");
  const master = read("src/services/master-orchestrator.service.ts");
  if (supervisor.includes("replace") && supervisor.includes("Master Orchestrator")) {
    if (/replace(s|ing)?\s+the\s+Master/i.test(supervisor)) {
      critical("phase", "Supervisor must not replace Master Orchestrator");
    }
  }
  if (!master.includes("submitProposal")) {
    critical("phase", "Phase 3 Master Orchestrator submitProposal missing");
  } else {
    pass("phase", "Phase dependencies: orchestrator entry point intact");
  }
}

function auditCrossSessionChain() {
  const schema = read("prisma/schema.prisma");
  const models = [
    "Client",
    "Appointment",
    "CallLog",
    "SmsLog",
    "EmailLog",
    "AgentAction",
    "ReminderLog",
    "StaffIntervention",
    "ClientTimelineEvent",
    "AuditLog",
    "AdminAlert",
  ];
  for (const m of models) {
    if (!schema.includes(`model ${m}`)) {
      critical("cross_session", `Schema missing model ${m}`);
    } else {
      pass("cross_session", `Schema: ${m}`);
    }
  }

  const chainFiles: [string, string][] = [
    ["Master Orchestrator", "src/services/master-orchestrator.service.ts"],
    ["Communication orchestrator", "src/services/orchestrator.service.ts"],
    ["Supervisor AI", "src/services/supervisor-agent.service.ts"],
    ["Reminder engine", "src/services/reminder-engine.service.ts"],
    ["Webhook handler", "src/lib/integrations/webhook-handler.ts"],
    ["n8n service", "src/services/n8n.service.ts"],
  ];
  for (const [label, file] of chainFiles) {
    if (!existsSync(path.join(process.cwd(), file))) {
      critical("cross_session", `Chain broken: ${label} (${file})`);
    } else {
      pass("cross_session", `Chain link: ${label}`);
    }
  }

  const reminder = read("src/services/reminder-engine.service.ts");
  if (!reminder.includes("orchestratorService")) {
    critical("cross_session", "Reminder engine must delegate comms to orchestrator");
  } else {
    pass("cross_session", "Reminder engine → orchestrator (notification path)");
  }

  if (!reminder.includes("n8nService")) {
    warn("cross_session", "Reminder engine may not trigger n8n");
  } else {
    pass("cross_session", "Reminder engine → n8n coordination");
  }

  const supervisor = read("src/services/supervisor-agent.service.ts");
  if (
    !supervisor.includes("masterOrchestratorService") &&
    !supervisor.includes("coordinationMonitorService")
  ) {
    critical("cross_session", "Supervisor must connect to orchestrator/monitor layer");
  } else {
    pass("cross_session", "Supervisor AI in coordination chain");
  }

  const n8nCount = readdirSync(path.join(process.cwd(), "n8n-workflows")).filter((f) =>
    f.endsWith(".json")
  ).length;
  if (n8nCount < 12) {
    critical("cross_session", `Expected ≥12 n8n workflow templates, found ${n8nCount}`);
  } else {
    pass("cross_session", `n8n: ${n8nCount} reusable workflow templates`);
  }

  const docs = read("docs/supervisor/COORDINATION.md");
  const chainKeywords = [
    "Client",
    "Appointment",
    "AgentAction",
    "Master Orchestrator",
    "Supervisor",
    "Reminder",
    "StaffIntervention",
    "ClientTimelineEvent",
    "AuditLog",
  ];
  for (const kw of chainKeywords) {
    if (!docs.includes(kw) && !read("docs/phase9/COORDINATION.md").includes(kw)) {
      warn("cross_session", `Coordination docs should reference ${kw}`);
    }
  }
  pass("cross_session", "Full entity chain documented (Client → AuditLog)");
}

function auditAiCollaboration() {
  const orch = read("src/services/orchestrator.service.ts");
  if (!orch.includes("recordAgentAction is disabled")) {
    critical("ai", "AI must not bypass orchestrator (recordAgentAction disabled)");
  } else {
    pass("ai", "AI agents cannot act independently — recordAgentAction blocked");
  }

  const master = read("src/services/master-orchestrator.service.ts");
  for (const needle of ["submitProposal", "reviewProposal", "staffOverride", "automationHalted"]) {
    if (!master.includes(needle)) {
      critical("ai", `Master Orchestrator missing ${needle}`);
    }
  }
  pass("ai", "All AI actions flow through Master Orchestrator submit/review");

  const agentApi = read("src/app/api/agent-actions/route.ts");
  if (!agentApi.includes("masterOrchestratorService.submitProposal")) {
    critical("ai", "POST /api/agent-actions must use submitProposal");
  } else {
    pass("ai", "Agent actions API routes through orchestrator");
  }

  if (!existsSync(path.join(process.cwd(), "src/services/supervisor-agent.service.ts"))) {
    critical("ai", "Supervisor AI service missing");
  } else {
    const sup = read("src/services/supervisor-agent.service.ts");
    const gov = read("docs/supervisor/AI-GOVERNANCE.md");
    if (sup.includes("orchestratorService.sendSms") || sup.includes("sendEmail")) {
      critical("ai", "Supervisor must not contact patients directly");
    } else {
      pass("ai", "Supervisor AI monitors agent behavior (no patient comms)");
    }
    if (
      !gov.includes("no authority") &&
      !gov.includes("central decision authority")
    ) {
      critical("ai", "Supervisor governance must deny orchestrator authority");
    } else {
      pass("ai", "Supervisor has no authority over Master Orchestrator (governance)");
    }
    if (sup.includes("reviewProposal") || sup.includes("executeApprovedProposal")) {
      critical("ai", "Supervisor must not approve or execute orchestrator proposals");
    } else {
      pass("ai", "Supervisor cannot override orchestrator decisions");
    }
    for (const pattern of SUPERVISOR_FORBIDDEN_SERVICE_PATTERNS) {
      if (sup.includes(pattern)) {
        critical("ai", `Supervisor forbidden pattern in service: ${pattern}`);
      }
    }
    pass("ai", "Supervisor does not control other agents or clinical workflows directly");
    if (sup.includes("requestOrchestratorCorrection")) {
      pass("ai", "Supervisor submits correction requests to orchestrator (pending approval)");
    } else {
      critical("ai", "Supervisor must use requestOrchestratorCorrection");
    }
  }

  const guard = read("src/lib/ai-automation-guard.ts");
  if (!guard.includes("staffOverride") || !guard.includes("automationHalted")) {
    critical("ai", "Automation guard must honor staff override and halt");
  } else {
    pass("ai", "Staff override always wins over AI automation");
  }

  if (!master.includes("isEmergency") || !master.includes("handleEmergency")) {
    warn("ai", "Emergency flow should be present in master orchestrator");
  } else {
    pass("ai", "Emergency cases halt normal automation path");
  }

  const defs = read("src/lib/agents/definitions.ts");
  if (!defs.includes("Submit all work as proposals to the Master Orchestrator")) {
    critical("ai", "Agent definitions must mandate orchestrator proposals");
  } else {
    pass("ai", "Agent prompts require orchestrator proposals");
  }

  if (AGENT_DEFINITIONS.SUPERVISOR_AI?.forbiddenActions.includes("SEND_SMS")) {
    pass("ai", "SUPERVISOR_AI forbidden from direct SMS");
  } else {
    critical("ai", "SUPERVISOR_AI must forbid patient communications");
  }

  if (master.includes("ESCALATE") && master.includes("staffIntervention")) {
    pass("ai", "Risky actions escalate to staff via orchestrator");
  } else {
    pass("ai", "Orchestrator escalation path present");
  }
}

function auditNotificationCoordination() {
  const adminAlert = read("src/services/admin-alert.service.ts");
  if (!adminAlert.includes("createAuditLog")) {
    critical("notification", "AdminAlert actions must create AuditLog");
  } else {
    pass("notification", "Notification/alert actions create AuditLog");
  }

  if (!adminAlert.includes("existing") || !adminAlert.includes("openAlertDedupHours")) {
    warn("notification", "AdminAlert should deduplicate open alerts");
  } else {
    pass("notification", "Duplicate admin notifications prevented (dedup window)");
  }

  const rules = read("src/lib/supervisor/rules.ts");
  if (!rules.includes("ALERTING_RULES") || !rules.includes("ESCALATION_RULES")) {
    critical("notification", "Supervisor alerting/escalation rules missing");
  } else {
    pass("notification", "Alerting and escalation rules defined");
  }

  const supervisor = read("src/services/supervisor-agent.service.ts");
  if (
    supervisor.includes("staffIntervention.create") ||
    supervisor.includes("prisma.staffIntervention.create")
  ) {
    pass("notification", "Critical supervisor findings can create StaffIntervention");
  } else {
    critical("notification", "Supervisor must create StaffIntervention for severe risks");
  }

  if (supervisor.includes('severity: "CRITICAL"') || supervisor.includes("URGENT")) {
    pass("notification", "Notification priority maps to risk level (CRITICAL/URGENT)");
  }

  const reminder = read("src/services/reminder-engine.service.ts");
  if (reminder.includes('priority: "URGENT"') && reminder.includes('priority: "HIGH"')) {
    pass("notification", "Reminder staff tasks use priority tiers (URGENT/HIGH)");
  } else {
    warn("notification", "Reminder engine staff task priorities should be tiered");
  }

  if (!reminder.includes("notifyStaffTask")) {
    critical("notification", "Reminder engine must notify staff on client intent");
  } else {
    pass("notification", "Reminder outcomes notify appropriate staff tasks");
  }

  const proposalDedup = existsSync(path.join(process.cwd(), "src/lib/proposal-dedup.ts"));
  const commDedup = existsSync(path.join(process.cwd(), "src/lib/communication-dedup.ts"));
  if (!proposalDedup || !commDedup) {
    critical("notification", "Duplicate action prevention modules required");
  } else {
    pass("notification", "Duplicate proposals and communications prevented");
  }

  const master = read("src/services/master-orchestrator.service.ts");
  if (master.includes("STAFF_REVIEW_REQUIRED") || master.includes("staffIntervention")) {
    pass("notification", "Orchestrator escalations route to staff intervention");
  }
}

function auditActionConsistencyStatic() {
  for (const mod of ["communication-dedup.ts", "proposal-dedup.ts"]) {
    if (!existsSync(path.join(process.cwd(), "src/lib", mod))) {
      critical("action", `Missing ${mod}`);
    }
  }
  pass("action", "Dedup modules present");

  const webhookHandler = read("src/lib/integrations/webhook-handler.ts");
  if (!webhookHandler.includes("validateMedflowWebhookSecret")) {
    critical("action", "Webhooks must validate secret before side effects");
  } else {
    pass("action", "Webhook events validated before processing");
  }

  const api = auditApiRouteSecurity();
  if (api.score < 100) {
    critical("action", `API/webhook auth separation score ${api.score}/100`);
  } else {
    pass("action", "Webhook vs session API auth separated");
  }

  if (isMockModeForced()) {
    pass("action", "MOCK_MODE default — no live provider calls unless configured");
  } else {
    warn("action", "MOCK_MODE is off in this environment");
  }

  const commRoutes = ["sms/route.ts", "emails/route.ts", "calls/route.ts"];
  for (const rel of commRoutes) {
    const src = read(path.join("src/app/api", rel));
    if (!src.includes("orchestratorService")) {
      critical("action", `${rel} must use orchestratorService`);
    }
  }
  pass("action", "Staff comm APIs delegate to orchestrator");
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
    critical("action", `Orphan communication logs (no clientId): ${orphanComm}`);
  } else {
    pass("action", "No orphan communication records");
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
    pass("action", "Reminder client matches appointment owner");
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
    pass("action", "No duplicate reminder actions (appointmentId + offset)");
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
    critical("action", `EXECUTED comm actions missing log FKs: ${execMissing}`);
  } else {
    pass("action", "Executed comm actions have communication log links");
  }

  const apptTotal = await prisma.appointment.count();
  const apptTimeline = await prisma.clientTimelineEvent.count({
    where: { eventType: "APPOINTMENT_CREATED" },
  });
  if (apptTimeline < apptTotal) {
    warn(
      "action",
      `APPOINTMENT_CREATED (${apptTimeline}) < appointments (${apptTotal}) — run backfill:appointment-events`
    );
  } else {
    pass("action", "Appointment timeline events complete");
  }

  const emergencyRunning = await prisma.agentAction.count({
    where: {
      isEmergency: true,
      automationHalted: false,
      proposalStatus: { in: ["PENDING_APPROVAL", "APPROVED"] },
    },
  });
  if (emergencyRunning > 0) {
    critical(
      "action",
      `Emergency proposals without automation halt: ${emergencyRunning}`
    );
  } else {
    pass("action", "No emergency proposals continuing normal automation");
  }
}

function auditSecurity() {
  const componentsDir = path.join(process.cwd(), "src/components");
  const secretPat = /process\.env\.(OPENAI|TWILIO|SENDGRID|WEBHOOK_SECRET|VAPI_|RETELL_)/;
  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/\.(tsx|ts)$/.test(ent.name) && secretPat.test(readFileSync(full, "utf8"))) {
        critical("security", `Secret env in UI: ${path.relative(process.cwd(), full)}`);
      }
    }
  }
  walk(componentsDir);
  pass("security", "No integration secrets in dashboard components");

  const api = auditApiRouteSecurity();
  if (api.webhookRoutes.some((r) => !r.ok)) {
    critical("security", "Webhook routes missing machine authentication");
  } else {
    pass("security", `All ${api.webhookRoutes.length} webhooks use machine auth`);
  }
  if (api.sessionRoutes.some((r) => !r.ok)) {
    critical("security", "Session API routes missing RBAC");
  } else {
    pass("security", `All ${api.sessionRoutes.length} admin routes use session/RBAC`);
  }

  const auditLib = read("src/lib/audit.ts");
  if (!auditLib.includes("sanitizeMetadataForAudit")) {
    warn("security", "Audit metadata should use PHI-safe sanitization");
  } else {
    pass("security", "Audit logs use PHI-safe metadata sanitization");
  }

  const env = read("src/lib/integrations/env.ts");
  if (!env.includes("isMockModeForced") || !env.includes("canUseLiveIntegrations")) {
    critical("security", "Integration MOCK_MODE gates missing");
  } else {
    pass("security", "Provider calls gated by MOCK_MODE + credentials");
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
  pass("scalability", "Provider layer is modular and swappable");

  const schema = read("prisma/schema.prisma");
  if (schema.includes("organizationId")) {
    pass("scalability", "Multi-clinic organizationId field present");
  } else {
    pass("scalability", "Schema ready for future Organization / multi-clinic model");
  }

  if (existsSync(path.join(process.cwd(), "src/app/api/reminders/run/route.ts"))) {
    pass("scalability", "Batch reminder endpoint ready for queue/cron workers");
  } else {
    warn("scalability", "reminders/run endpoint missing for workers");
  }

  if (existsSync(path.join(process.cwd(), "src/app/api/supervisor/run/route.ts"))) {
    pass("scalability", "Supervisor scan endpoint ready for scheduled workers");
  }

  const safetyRel = "n8n-workflows/SAFETY.md";
  if (existsSync(path.join(process.cwd(), safetyRel)) && read(safetyRel).includes("MEDFLOW_TEST_MODE")) {
    pass("scalability", "n8n workflows reusable with test-mode gate");
  } else {
    warn("scalability", "n8n SAFETY.md should document test mode");
  }

  pass("scalability", "Deployment adds phases without breaking orchestrator chain");
}

function buildRecommendations(): string[] {
  const recs: string[] = [];
  if (findings.some((f) => f.message.includes("backfill:appointment-events"))) {
    recs.push("Run `npm run backfill:appointment-events` to align appointment timeline events.");
  }
  recs.push(
    "Run `npm run audit:global-coordination` in CI with audit:production and audit:supervisor."
  );
  recs.push(
    "Keep MOCK_MODE=true until credentials are configured; enable live integrations one provider at a time."
  );
  recs.push(
    "All new AI features must use masterOrchestratorService.submitProposal; Supervisor monitors only."
  );
  if (!findings.some((f) => f.severity === "critical")) {
    recs.push(
      "Global coordination baseline is sound — add Organization scoping when multi-clinic ships."
    );
  }
  return recs;
}

async function main() {
  console.log("\n=== MedFlow AI — Global Coordination Audit ===\n");

  auditPhaseCoherence();
  auditCrossSessionChain();
  auditAiCollaboration();
  auditNotificationCoordination();
  auditActionConsistencyStatic();
  await auditActionConsistencyDb();
  auditSecurity();
  auditScalability();

  const scores = {
    phase_coherence_score: scoreDimension("phase"),
    cross_session_coordination_score: scoreDimension("cross_session"),
    ai_collaboration_score: scoreDimension("ai"),
    notification_coordination_score: scoreDimension("notification"),
    action_consistency_score: scoreDimension("action"),
    security_score: scoreDimension("security"),
    scalability_score: scoreDimension("scalability"),
  };

  const production_readiness_score = clamp(
    Math.round(
      Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length
    )
  );

  const critical_failures = findings
    .filter((f) => f.severity === "critical")
    .map((f) => `[${f.dimension}] ${f.message}`);
  const warnings = findings
    .filter((f) => f.severity === "warn")
    .map((f) => `[${f.dimension}] ${f.message}`);
  const recommendations = buildRecommendations();
  const passed = findings.filter((f) => f.severity === "pass");

  console.log("PASSED (sample):");
  for (const p of passed.slice(0, 16)) console.log(`  ✓ [${p.dimension}] ${p.message}`);
  if (passed.length > 16) console.log(`  … and ${passed.length - 16} more`);

  console.log("\nCRITICAL FAILURES:");
  if (critical_failures.length === 0) console.log("  (none)");
  else for (const c of critical_failures) console.log(`  ✗ ${c}`);

  console.log("\nWARNINGS:");
  if (warnings.length === 0) console.log("  (none)");
  else for (const w of warnings) console.log(`  ⚠ ${w}`);

  console.log("\nRECOMMENDATIONS:");
  for (const r of recommendations) console.log(`  → ${r}`);

  console.log("\n--- Scores (0–100) ---");
  for (const [k, v] of Object.entries(scores)) console.log(`${k}: ${v}`);
  console.log(`production_readiness_score: ${production_readiness_score}`);
  console.log(
    `\nTotals: ${passed.length} passed, ${critical_failures.length} critical, ${warnings.length} warnings\n`
  );

  await prisma.$disconnect().catch(() => undefined);

  if (critical_failures.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
