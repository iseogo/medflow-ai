/**
 * Phase 12 — Command Center dashboard audit.
 * Usage: npm run audit:command-center
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { RoleType } from "@prisma/client";
import { ROLE_PERMISSIONS } from "../src/lib/rbac";
import { canViewCommandCenterSection } from "../src/lib/command-center/section-access";

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
    "src/lib/command-center/types.ts",
    "src/lib/command-center/section-access.ts",
    "src/lib/command-center/safe-summary.ts",
    "src/components/dashboard/command-center/CommandCenterSectionCard.tsx",
  ];
  for (const f of required) {
    if (!existsSync(path.join(process.cwd(), f))) fail(`Missing ${f}`);
    else ok(`Present ${f}`);
  }

  const sidebar = read("src/components/dashboard/Sidebar.tsx");
  if (!sidebar.includes('href: "/dashboard/command-center"') || !sidebar.includes("Command Center")) {
    fail("Sidebar missing Command Center link");
  } else {
    ok("Sidebar Command Center link");
  }

  const routes = read("src/lib/route-permissions.ts");
  if (!routes.includes("/dashboard/command-center") || !routes.includes("command-center:read")) {
    fail("Route permission missing for command center");
  } else {
    ok("RBAC route rule for /dashboard/command-center");
  }

  const rbac = read("src/lib/rbac.ts");
  if (!rbac.includes('"command-center:read"')) {
    fail("command-center:read permission not defined");
  } else {
    ok("command-center:read permission in RBAC");
  }

  if (!ROLE_PERMISSIONS.ADMIN.includes("command-center:read")) {
    fail("ADMIN must have command-center:read");
  } else {
    ok("ADMIN has command-center:read");
  }

  const svc = read("src/services/command-center.service.ts");
  const page = read("src/app/dashboard/command-center/page.tsx");
  const safe = read("src/lib/command-center/safe-summary.ts");
  const card = read("src/components/dashboard/command-center/CommandCenterSectionCard.tsx");
  const combined = `${svc}\n${page}\n${card}`;

  if (!safe.includes("safeClientRef") || safe.includes("firstName")) {
    fail("PHI-safe summary helpers missing or expose names");
  } else {
    ok("PHI-safe client references (no names)");
  }

  const phiSecretPattern =
    /\b(firstName|lastName|dateOfBirth|ssn|password|apiKey|SECRET_|process\.env\.)\b/i;
  if (phiSecretPattern.test(svc) || phiSecretPattern.test(page) || phiSecretPattern.test(card)) {
    fail("Command center UI/service may expose secrets or raw PHI fields");
  } else {
    ok("No raw PHI field names or secrets in command center surface");
  }

  if (!svc.includes("staffNotification")) {
    fail("Notifications not included in snapshot");
  } else {
    ok("Notifications aggregated");
  }

  if (!svc.includes("staffIntervention")) {
    fail("Staff interventions not included");
  } else {
    ok("Staff interventions included");
  }

  if (!svc.includes("adminAlert") || !svc.includes("coordinationIncident")) {
    fail("Supervisor findings not included");
  } else {
    ok("Supervisor findings (alerts + incidents) included");
  }

  if (!svc.includes("workflowHealthEvent") || !svc.includes("staffTask")) {
    fail("Workflow health not included");
  } else {
    ok("Workflow health (stuck events + staff tasks) included");
  }

  if (!svc.includes("integrationDashboardSnapshot") || !svc.includes("isMockModeForced")) {
    fail("Integration health / mock mode not included");
  } else {
    ok("Integration health and MOCK_MODE status included");
  }

  if (!svc.includes("auditLog")) {
    fail("Audit log summary not included");
  } else {
    ok("Audit/security summaries included");
  }

  const sections = [
    "criticalAlerts",
    "liveOperations",
    "aiSupervisor",
    "communications",
    "appointmentsWaitingRoom",
    "workflowHealth",
    "securityAudit",
    "integrationStatus",
  ];
  for (const key of sections) {
    if (!svc.includes(`"${key}"`) && !svc.includes(`'${key}'`)) {
      fail(`Section ${key} missing from service`);
    }
  }
  ok("All eight command center sections defined");

  if (!page.includes("command-center:read")) {
    fail("Page must gate on command-center:read");
  } else {
    ok("Page enforces command-center:read");
  }

  if (!canViewCommandCenterSection("ADMIN" as RoleType, "criticalAlerts")) {
    fail("ADMIN should see all sections");
  } else {
    ok("ADMIN section access");
  }

  if (canViewCommandCenterSection("ADMIN" as RoleType, "securityAudit") === false) {
    fail("ADMIN must view security audit section");
  }

  const managerSections = sections.filter((s) =>
    canViewCommandCenterSection("MANAGER" as RoleType, s as Parameters<typeof canViewCommandCenterSection>[1])
  );
  if (managerSections.length < 5) {
    warn(`MANAGER sees ${managerSections.length}/8 sections (operational summary)`);
  } else {
    ok(`MANAGER operational sections (${managerSections.length}/8)`);
  }
}

async function main() {
  auditStatic();

  console.log("\n=== Phase 12 Command Center Audit ===\n");
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
    passed.slice(0, 12).forEach((p) => console.log(`  ✓ ${p}`));
    if (passed.length > 12) console.log(`  … and ${passed.length - 12} more`);
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
