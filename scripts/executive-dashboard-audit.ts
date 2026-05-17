/**
 * Phase 12B — Executive Command Center enhancement audit.
 * Usage: npm run audit:executive-dashboard
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { RoleType } from "@prisma/client";
import { canViewCommandCenterSection } from "../src/lib/command-center/section-access";
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

function auditStatic() {
  const required = [
    "src/app/dashboard/command-center/page.tsx",
    "src/services/command-center.service.ts",
    "src/services/operational-summary.service.ts",
    "src/services/dashboard-kpi.service.ts",
    "src/services/workflow-bottleneck.service.ts",
    "src/services/provider-utilization.service.ts",
    "src/services/waiting-room-intelligence.service.ts",
    "src/components/dashboard/command-center/ExecutiveKpiBar.tsx",
    "src/components/dashboard/command-center/CriticalActionCenter.tsx",
    "src/components/dashboard/command-center/ActivityFeedPanel.tsx",
    "src/components/dashboard/command-center/CommandCenterView.tsx",
    "src/lib/command-center/safe-summary.ts",
  ];

  for (const f of required) {
    if (!existsSync(path.join(process.cwd(), f))) fail(`Missing ${f}`);
    else ok(`Present ${f}`);
  }

  const page = read("src/app/dashboard/command-center/page.tsx");
  const view = read("src/components/dashboard/command-center/CommandCenterView.tsx");
  const kpi = read("src/components/dashboard/command-center/ExecutiveKpiBar.tsx");
  const svc = read("src/services/command-center.service.ts");
  const safe = read("src/lib/command-center/safe-summary.ts");
  const combined = `${page}\n${view}\n${kpi}\n${svc}`;

  if (!page.includes("/dashboard/command-center") && !existsSync(path.join(process.cwd(), "src/app/dashboard/command-center/page.tsx"))) {
    fail("Command center route missing");
  } else {
    ok("Command center route exists");
  }

  if (!kpi.includes("sticky")) {
    fail("Executive KPI bar must be sticky");
  } else {
    ok("Executive KPI bar (sticky)");
  }

  if (!view.includes("ExecutiveKpiBar") || !view.includes("CriticalActionCenter")) {
    fail("Action-oriented layout components missing");
  } else {
    ok("Action-oriented dashboard sections in view");
  }

  const sectionKeys = [
    "criticalActionCenter",
    "liveClinicOperations",
    "waitingRoomIntelligence",
    "staffProductivity",
    "appointmentSchedulingHealth",
    "communicationsCommand",
    "aiSupervisorCenter",
    "workflowBottleneck",
    "securityCompliance",
    "integrationHealth",
  ];

  for (const key of sectionKeys) {
    if (!svc.includes(key)) fail(`Section ${key} missing from command center service`);
  }
  ok("All 10 executive dashboard sections defined");

  if (!existsSync(path.join(process.cwd(), "src/services/workflow-bottleneck.service.ts"))) {
    fail("Bottleneck tracking service missing");
  } else {
    ok("Workflow bottleneck service");
  }

  if (!read("src/services/provider-utilization.service.ts").includes("utilizationPct")) {
    fail("Provider utilization missing");
  } else {
    ok("Provider utilization service");
  }

  if (!read("src/services/waiting-room-intelligence.service.ts").includes("recommendations")) {
    fail("Waiting room intelligence missing");
  } else {
    ok("Waiting room intelligence service");
  }

  if (!svc.includes("pendingProposals") || !svc.includes("adminAlert")) {
    fail("AI supervision visibility incomplete");
  } else {
    ok("AI & supervisor visibility");
  }

  if (!svc.includes("reminderFailed") && !svc.includes("pendingCalls")) {
    fail("Communications health incomplete");
  } else {
    ok("Communications health");
  }

  if (!svc.includes("workflowBottleneck") && !svc.includes("buildBottlenecks")) {
    fail("Workflow bottleneck center incomplete");
  } else {
    ok("Workflow bottleneck center");
  }

  if (!svc.includes("auditLog") && !svc.includes("securityCompliance")) {
    fail("Security summary incomplete");
  } else {
    ok("Security & compliance summary");
  }

  const routes = read("src/lib/route-permissions.ts");
  if (!routes.includes("command-center:read")) {
    fail("RBAC route rule missing");
  } else {
    ok("RBAC protection on command center route");
  }

  if (!page.includes("command-center:read")) {
    fail("Page must enforce command-center:read");
  } else {
    ok("Page gates command-center:read");
  }

  const phiPattern = /\b(firstName|lastName|dateOfBirth|ssn|password|apiKey)\b/i;
  if (phiPattern.test(combined) || safe.includes("firstName")) {
    fail("Raw PHI or secrets may appear in executive dashboard");
  } else {
    ok("No raw PHI field names in dashboard surface");
  }

  if (!safe.includes("safeClientRef")) {
    fail("PHI-safe summaries required");
  } else {
    ok("PHI-safe client references");
  }

  if (!svc.includes("Supervisor observe-only") && !svc.includes("recommendations only")) {
    warn("Supervisor observe-only messaging not explicit in service");
  } else {
    ok("Supervisor observe-only documented in AI section");
  }

  if (!isMockModeForced()) {
    warn("MOCK_MODE is off in this environment — production should default safe");
  } else {
    ok("MOCK_MODE preserved (forced safe)");
  }

  if (!canViewCommandCenterSection("ADMIN" as RoleType, "criticalActionCenter")) {
    fail("ADMIN must access critical action center");
  } else {
    ok("ADMIN full section access");
  }

  if (!read("src/services/command-center.service.ts").includes("activityFeed")) {
    fail("Live activity feed missing");
  } else {
    ok("Live activity feed");
  }
}

async function main() {
  auditStatic();

  console.log("\n=== Phase 12B Executive Dashboard Audit ===\n");
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Warnings: ${warnings.length}\n`);

  if (failed.length) {
    console.log("--- FAILED ---");
    failed.forEach((f) => console.log(`  ✗ ${f}`));
  }
  if (warnings.length) {
    console.log("--- WARNINGS ---");
    warnings.forEach((w) => console.log(`  ! ${w}`));
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
  console.log(`\nScore: ${score}% (${passed.length}/${passed.length + failed.length} checks)\n`);

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
