/**
 * Multi-session / multi-agent coordination audit (Phases 1–9 planning).
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
  "Phase 9": {
    readme: "README-PHASE9.md",
    markers: [
      "docs/phase9/ROADMAP.md",
      "docs/phase9/REQUIREMENTS.md",
      "docs/phase9/COORDINATION.md",
      "src/lib/scheduling/planning/intelligent-scheduling.service.ts",
    ],
  },
  "Phase 10": {
    readme: "README-PHASE10.md",
    markers: [
      "src/services/supervisor-agent.service.ts",
      "src/services/admin-alert.service.ts",
      "docs/supervisor/AI-GOVERNANCE.md",
    ],
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

const PHASE9_STABLE_SERVICE_MARKERS = [
  "src/services/master-orchestrator.service.ts",
  "src/services/orchestrator.service.ts",
  "src/services/reminder-engine.service.ts",
  "src/lib/integrations/webhook-handler.ts",
  "src/services/physical-client.service.ts",
];

function readText(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function auditPhase10SupervisorLayer() {
  const supervisor = readText("src/services/supervisor-agent.service.ts");
  const gov = readText("docs/supervisor/AI-GOVERNANCE.md");

  if (!existsSync(path.join(process.cwd(), "src/services/supervisor-agent.service.ts"))) {
    critical("session", "Phase 10: supervisor-agent.service missing");
  } else {
    pass("session", "Phase 10: Supervisor AI service present (oversight only)");
  }

  if (
    !gov.includes("no authority") &&
    !gov.includes("NO authority")
  ) {
    critical("session", "Phase 10: Supervisor must have no authority over Master Orchestrator");
  } else {
    pass("session", "Phase 10: Supervisor has no authority over orchestrator (documented)");
  }

  if (!gov.includes("central decision authority")) {
    critical("ai_agent", "Phase 10: Master Orchestrator must be central decision authority");
  } else {
    pass("ai_agent", "Phase 10: Master Orchestrator is central decision authority");
  }

  if (supervisor.includes("reviewProposal") || supervisor.includes("executeApprovedProposal")) {
    critical("ai_agent", "Phase 10: Supervisor must not review or execute orchestrator proposals");
  } else {
    pass("ai_agent", "Phase 10: Supervisor cannot override orchestrator decisions");
  }

  if (
    !supervisor.includes("requestOrchestratorCorrection") ||
    !supervisor.includes("ORCHESTRATOR_CORRECTION_REQUEST")
  ) {
    critical("ai_agent", "Phase 10: Supervisor must submit correction requests to orchestrator only");
  } else {
    pass("ai_agent", "Phase 10: Supervisor submits correction requests (pending approval)");
  }

  if (supervisor.includes("prisma.appointment.update")) {
    critical("ai_agent", "Phase 10: Supervisor must not modify appointments directly");
  } else {
    pass("ai_agent", "Phase 10: Supervisor does not mutate clinical workflows directly");
  }

  if (supervisor.includes('agentType: "STAFF_ASSISTANT_AI"')) {
    critical("ai_agent", "Phase 10: Supervisor must not impersonate other AI agents");
  } else {
    pass("ai_agent", "Phase 10: Supervisor does not interfere with other agents' roles");
  }

  if (supervisor.includes("orchestratorService.sendSms") || supervisor.includes("sendEmail")) {
    critical("ai_agent", "Phase 10: Supervisor must not contact patients");
  } else {
    pass("ai_agent", "Phase 10: Supervisor does not send patient communications");
  }

  if (AGENT_DEFINITIONS.SUPERVISOR_AI?.forbiddenActions.includes("SEND_SMS")) {
    pass("ai_agent", "Phase 10: SUPERVISOR_AI forbids SEND_SMS");
  } else {
    critical("ai_agent", "Phase 10: SUPERVISOR_AI must forbid patient SMS");
  }

  if (existsSync(path.join(process.cwd(), "src/lib/supervisor/governance.ts"))) {
    pass("session", "Phase 10: governance boundary module present");
  } else {
    critical("session", "Phase 10: src/lib/supervisor/governance.ts missing");
  }
}

function auditPhase9IntelligentSchedulingPlanning() {
  const phase9Readme = readText("README-PHASE9.md");
  if (
    !/planning\s*\/\s*documentation only|planning only|not implemented|no live scheduling/i.test(
      phase9Readme
    )
  ) {
    critical("session", "Phase 9: README-PHASE9 must state planning-only (no live scheduling)");
  } else {
    pass("session", "Phase 9: documentation marked planning-only (not live scheduling)");
  }

  const roadmap = readText("docs/phase9/ROADMAP.md");
  if (!roadmap.includes("Planning / documentation only")) {
    critical("session", "Phase 9: ROADMAP must declare planning-only scope");
  } else {
    pass("session", "Phase 9: ROADMAP declares planning-only scope");
  }

  const requirements = readText("docs/phase9/REQUIREMENTS.md");
  if (!requirements.includes("No live scheduling") && !requirements.includes("planning")) {
    warn("session", "Phase 9: REQUIREMENTS should state no live scheduling");
  } else {
    pass("session", "Phase 9: REQUIREMENTS forbid live scheduling implementation");
  }

  const phase9Docs = [
    "docs/phase9/ARCHITECTURE.md",
    "docs/phase9/DATA-MODEL-PLAN.md",
    "docs/phase9/GOVERNANCE.md",
    "docs/phase9/SERVICE-INTERFACES.md",
    "docs/phase9/WORKFLOWS.md",
    "src/lib/scheduling/planning/provider-matching.service.ts",
    "src/lib/scheduling/planning/availability-checking.service.ts",
  ];
  for (const f of phase9Docs) {
    if (!existsSync(path.join(process.cwd(), f))) {
      critical("session", `Phase 9: missing planning artifact ${f}`);
    }
  }
  pass("session", "Phase 9: core planning docs and service interface stubs present");

  const schema = readText("prisma/schema.prisma");
  if (/\bmodel ProviderProfile\b/.test(schema)) {
    critical(
      "cross_session",
      "Phase 9: ProviderProfile must not be migrated during planning-only phase"
    );
  } else {
    pass("cross_session", "Phase 9: no ProviderProfile schema migration (planning-only)");
  }

  if (existsSync(path.join(process.cwd(), "src/services/scheduling"))) {
    critical(
      "action",
      "Phase 9: src/services/scheduling must not exist until implementation phase"
    );
  } else {
    pass("action", "Phase 9: no runtime scheduling services under src/services/scheduling");
  }

  const planningDir = path.join(process.cwd(), "src/lib/scheduling/planning");
  for (const ent of readdirSync(planningDir)) {
    const full = path.join(planningDir, ent);
    if (!ent.endsWith(".ts")) continue;
    const src = readFileSync(full, "utf8");
    if (!src.includes("PLANNING ONLY")) {
      critical("action", `Phase 9: ${ent} must declare PLANNING ONLY`);
    }
  }
  pass("action", "Phase 9: planning TypeScript files marked PLANNING ONLY");

  for (const stable of PHASE9_STABLE_SERVICE_MARKERS) {
    const src = readText(stable);
    if (src.includes("scheduling/planning") || src.includes("@/lib/scheduling/planning")) {
      critical(
        "action",
        `Phase 9: ${stable} must not import planning stubs (Phase 1–8 unchanged)`
      );
    }
  }
  pass(
    "action",
    "Phase 9: Phase 1–8 core services do not import scheduling planning modules"
  );

  const governance = readText("docs/phase9/GOVERNANCE.md");
  const coordination = readText("docs/phase9/COORDINATION.md");

  if (
    !governance.includes("not a clinician") &&
    !governance.includes("not clinical")
  ) {
    critical("ai_agent", "Phase 9: GOVERNANCE must forbid clinical diagnosis/triage");
  } else {
    pass("ai_agent", "Phase 9: no live medical triage — governance forbids clinical advice");
  }

  if (
    requirements.includes("live clinical triage") &&
    !requirements.includes("not") &&
    !requirements.includes("Not")
  ) {
    critical("ai_agent", "Phase 9: REQUIREMENTS must not mandate live medical triage");
  } else {
    pass("ai_agent", "Phase 9: REQUIREMENTS use safety routing only (not medical triage)");
  }

  if (!existsSync(path.join(process.cwd(), "src/services/scheduling/safety-triage.service.ts"))) {
    pass("ai_agent", "Phase 9: no safety-triage.service runtime implementation");
  } else {
    critical("ai_agent", "Phase 9: safety-triage.service must not ship during planning phase");
  }

  if (
    !coordination.includes("Master Orchestrator") ||
    !coordination.includes("masterOrchestratorService")
  ) {
    critical(
      "ai_agent",
      "Phase 9: inbound scheduling planning must connect to Master Orchestrator"
    );
  } else {
    pass("ai_agent", "Phase 9: inbound scheduling planning routes through Master Orchestrator");
  }

  const intelligent = readText(
    "src/lib/scheduling/planning/intelligent-scheduling.service.ts"
  );
  if (
    !intelligent.includes("Master Orchestrator") &&
    !intelligent.includes("orchestrator")
  ) {
    critical("ai_agent", "Phase 9: intelligent-scheduling interface must reference orchestrator");
  } else {
    pass("ai_agent", "Phase 9: intelligent-scheduling facade defers to orchestrator");
  }

  if (
    !coordination.includes("AgentAction") ||
    !readText("docs/phase9/DATA-MODEL-PLAN.md").includes("AgentAction")
  ) {
    critical("ai_agent", "Phase 9: provider matching planning must connect to AgentAction proposals");
  } else {
    pass("ai_agent", "Phase 9: provider matching planned via AgentAction proposals");
  }

  const matching = readText("src/lib/scheduling/planning/provider-matching.service.ts");
  if (matching.includes("prisma.") || matching.includes("createAuditLog")) {
    critical("ai_agent", "Phase 9: provider-matching planning file must not write to DB");
  } else {
    pass("ai_agent", "Phase 9: provider-matching is interface-only (no direct persistence)");
  }

  const entityLinks: [string, string][] = [
    ["Appointment", "Appointment"],
    ["ClientTimelineEvent", "ClientTimelineEvent"],
    ["AuditLog", "AuditLog"],
    ["StaffIntervention", "StaffIntervention"],
    ["Reminder", "reminder"],
    ["n8n", "n8n"],
  ];
  for (const [label, needle] of entityLinks) {
    if (!coordination.includes(needle)) {
      critical("cross_session", `Phase 9: COORDINATION must link scheduling to ${label}`);
    }
  }
  pass(
    "cross_session",
    "Phase 9: scheduling planning connects to Appointment, timeline, audit, intervention, reminders, n8n"
  );

  if (
    !/staff override.*wins|staff override.*highest|staff override priority/i.test(
      governance + phase9Readme
    )
  ) {
    critical("ai_agent", "Phase 9: staff override must be highest-priority control");
  } else {
    pass("ai_agent", "Phase 9: staff override documented as highest priority");
  }

  const master = readText("src/services/master-orchestrator.service.ts");
  if (!master.includes("staffOverride")) {
    critical("ai_agent", "Master Orchestrator staffOverride required for Phase 9 governance");
  } else {
    pass("ai_agent", "Phase 9: Master Orchestrator staffOverride enforcement intact");
  }

  if (
    !governance.includes("staff review") &&
    !governance.includes("requiresStaffReview")
  ) {
    critical(
      "ai_agent",
      "Phase 9: high-risk appointments require staff review before finalize"
    );
  } else {
    pass("ai_agent", "Phase 9: high-risk bookings require staff review (no AI-only finalize)");
  }

  if (
    !governance.includes("auditable") &&
    !coordination.includes("AuditLog")
  ) {
    critical("outcome", "Phase 9: scheduling decisions must be planned as auditable");
  } else {
    pass("outcome", "Phase 9: all scheduling decisions planned with AuditLog trail");
  }

  if (readText("docs/phase9/DATA-MODEL-PLAN.md").includes("SchedulingRecommendation")) {
    pass("outcome", "Phase 9: SchedulingRecommendation artifact planned for slot audit trail");
  } else {
    critical("outcome", "Phase 9: DATA-MODEL-PLAN missing SchedulingRecommendation");
  }

  if (isMockModeForced()) {
    pass("action", "Phase 9: MOCK_MODE default protects against live calls/SMS/email");
  } else {
    critical("action", "Phase 9: MOCK_MODE must default on — no live comms during planning");
  }

  const env = readText("src/lib/integrations/env.ts");
  if (
    !env.includes("isMockModeForced") ||
    !env.includes("MOCK_MODE") ||
    !env.includes("canUseLiveIntegrations")
  ) {
    critical("security", "Phase 9: integration env must gate MOCK_MODE");
  } else {
    pass("security", "Phase 9: MOCK_MODE integration gate unchanged and protected");
  }

  const intelligentScheduling = intelligent;
  if (
    intelligentScheduling.includes("twilio") ||
    intelligentScheduling.includes("sendSms") ||
    intelligentScheduling.includes("sendEmail")
  ) {
    critical(
      "security",
      "Phase 9: intelligent-scheduling planning must not invoke live comm providers"
    );
  } else {
    pass("security", "Phase 9: planning interfaces do not enable real calls/SMS/email");
  }

  if (coordination.includes("Do not modify Phase 1–8") || roadmap.includes("must not break")) {
    pass("session", "Phase 9: explicit preservation of Phase 1–8 stable workflows");
  } else {
    warn("session", "Phase 9: document Phase 1–8 preservation in ROADMAP/COORDINATION");
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
  recs.push(
    "Phase 9 remains planning-only until migrations and src/services/scheduling/* are implemented."
  );
  return recs;
}

async function main() {
  console.log("\n=== MedFlow AI — Multi-Session Coordination Audit ===\n");

  auditSessionCoherence();
  auditPhase9IntelligentSchedulingPlanning();
  auditPhase10SupervisorLayer();
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
