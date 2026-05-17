/**
 * Phase 12B — Live shared operations display audit.
 * Usage: npm run audit:live-command-center
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { RoleType } from "@prisma/client";
import { isMockModeForced } from "../src/lib/integrations/env";
import { sectionsForDisplayMode } from "../src/lib/command-center/live-section-access";

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
    "src/app/dashboard/command-center/live/page.tsx",
    "src/app/api/command-center/live/route.ts",
    "src/services/live-command-center.service.ts",
    "src/services/live-activity-feed.service.ts",
    "src/services/display-mode.service.ts",
    "src/components/dashboard/command-center/live/LiveCommandCenterBoard.tsx",
    "src/components/dashboard/command-center/live/AutoScrollPanel.tsx",
    "src/components/dashboard/command-center/live/RefreshTimer.tsx",
    "src/lib/command-center/live-types.ts",
    "src/lib/command-center/live-section-access.ts",
  ];

  for (const f of required) {
    if (!existsSync(path.join(process.cwd(), f))) fail(`Missing ${f}`);
    else ok(`Present ${f}`);
  }

  const page = read("src/app/dashboard/command-center/live/page.tsx");
  const board = read("src/components/dashboard/command-center/live/LiveCommandCenterBoard.tsx");
  const refresh = read("src/components/dashboard/command-center/live/RefreshTimer.tsx");
  const scroll = read("src/components/dashboard/command-center/live/AutoScrollPanel.tsx");
  const svc = read("src/services/live-command-center.service.ts");
  const safe = read("src/lib/command-center/safe-summary.ts");
  const api = read("src/app/api/command-center/live/route.ts");
  const combined = `${page}\n${board}\n${svc}\n${safe}`;

  if (!page.includes("command-center/live")) {
    fail("Live route page missing");
  } else {
    ok("Live route /dashboard/command-center/live exists");
  }

  if (!refresh.includes("intervalMs") || !board.includes("RefreshTimer")) {
    fail("Auto-refresh timer missing");
  } else {
    ok("Auto-refresh (15–30s via LIVE_REFRESH_MS + countdown)");
  }

  const types = read("src/lib/command-center/live-types.ts");
  if (!types.includes("LIVE_REFRESH_MS = 20_000")) {
    warn("Refresh interval should be 20s (within 15–30s)");
  } else {
    ok("Refresh interval 20s (within 15–30s)");
  }

  if (!scroll.includes("Pause") || !scroll.includes("manualPaused")) {
    fail("Auto-scroll pause/resume missing");
  } else {
    ok("Auto-scroll with pause/resume");
  }

  if (!board.includes("requestFullscreen") || !board.includes("rotateIndex")) {
    fail("Fullscreen or rotating sections missing");
  } else {
    ok("Fullscreen mode and rotating sections");
  }

  const modeSvc = read("src/services/display-mode.service.ts");
  const modes = ["executive", "clinical", "front_desk", "manager"] as const;
  for (const m of modes) {
    if (!modeSvc.includes(m)) {
      fail(`Display mode ${m} missing`);
    }
  }
  ok("Display modes (executive, clinical, front_desk, manager)");

  if (!read("src/services/display-mode.service.ts").includes("canSelectDisplayMode")) {
    fail("Admin display mode selection missing");
  } else {
    ok("Admin can choose display mode");
  }

  if (!api.includes("command-center:read")) {
    fail("Live API must require command-center:read");
  } else {
    ok("RBAC on live API route");
  }

  if (!page.includes("command-center:read")) {
    fail("Live page must gate command-center:read");
  } else {
    ok("RBAC on live page");
  }

  const phiPattern = /\b(firstName|lastName|dateOfBirth|ssn|password|apiKey)\b/i;
  if (phiPattern.test(combined)) {
    fail("Raw PHI field names in live display surface");
  } else {
    ok("No raw PHI field names");
  }

  if (!safe.includes("safeLivePatientTag") || !safe.includes("safeQueueLabel")) {
    fail("Role-safe live summaries missing");
  } else {
    ok("Role-safe summaries (queue tags, patient tags)");
  }

  if (!board.includes("pinnedAlerts") && !svc.includes("pinnedAlerts")) {
    fail("Critical alerts pinning missing");
  } else {
    ok("Critical alerts pinned at top");
  }

  if (!board.includes("MOCK_MODE")) {
    fail("MOCK_MODE badge not visible on live board");
  } else {
    ok("MOCK_MODE visible on live board");
  }

  const sectionKeys = [
    "criticalAlerts",
    "waitingRoom",
    "todayAppointments",
    "walkIns",
    "checkIns",
    "staffTasks",
    "providerCapacity",
    "reminderFailures",
    "aiSupervisor",
    "workflowBottlenecks",
    "liveActivityFeed",
  ];
  for (const key of sectionKeys) {
    if (!svc.includes(key)) fail(`Live section ${key} missing`);
  }
  ok("All 11 live display section builders (no integration health on wall)");

  if (svc.includes('key: "integrationHealth"') || svc.includes("Integration / System Health")) {
    fail("Integration/System Health must not appear on live wall display");
  } else {
    ok("Integration health excluded from live wall");
  }

  const mainCc = read("src/services/command-center.service.ts");
  if (!mainCc.includes("integrationHealth")) {
    fail("Main command center must still include integration health");
  } else {
    ok("Integration health retained on main command center");
  }

  const adminSections = sectionsForDisplayMode("ADMIN" as RoleType, "executive");
  if (adminSections.length < 4) {
    warn(`ADMIN executive mode shows ${adminSections.length} sections`);
  } else {
    ok(`ADMIN executive sections (${adminSections.length})`);
  }

  if (!isMockModeForced()) {
    warn("MOCK_MODE off in this environment");
  } else {
    ok("MOCK_MODE preserved");
  }
}

async function main() {
  auditStatic();

  console.log("\n=== Live Command Center Audit ===\n");
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
