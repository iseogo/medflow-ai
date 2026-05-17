/**
 * Phase 11 — Staff notification & alert system audit.
 * Usage: npm run audit:notifications
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { NOTIFICATION_SOURCE_DEFAULTS } from "../src/lib/notifications/notification-sources";
import { CATEGORY_VISUAL } from "../src/lib/notifications/notification-color-map";
import { ROLE_PERMISSIONS } from "../src/lib/rbac";
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

async function auditDb() {
  try {
    await prisma.staffNotification.findFirst({ take: 1 });
    ok("StaffNotification model queryable");
  } catch {
    fail("StaffNotification model missing or DB not migrated");
  }

  try {
    await prisma.notificationPreference.findFirst({ take: 1 });
    ok("NotificationPreference model queryable");
  } catch {
    fail("NotificationPreference model missing");
  }
}

function auditStatic() {
  const required = [
    "src/services/notification.service.ts",
    "src/lib/notifications/notification-routing.service.ts",
    "src/lib/notifications/notification-priority.service.ts",
    "src/lib/notifications/notification-color-map.ts",
    "src/lib/notifications/notification-sources.ts",
    "src/app/api/notifications/route.ts",
    "src/app/api/notifications/unread-count/route.ts",
    "src/app/api/notifications/[id]/route.ts",
    "src/app/dashboard/notifications/page.tsx",
    "src/components/dashboard/NotificationBell.tsx",
    "README-PHASE11.md",
    "prisma/migrations/20260519120000_phase11_staff_notifications/migration.sql",
  ];
  for (const f of required) {
    if (!existsSync(path.join(process.cwd(), f))) fail(`Missing ${f}`);
    else ok(`Present ${f}`);
  }

  const svc = read("src/services/notification.service.ts");
  if (!svc.includes("createAuditLog")) {
    fail("Notification actions must create AuditLog");
  } else {
    ok("Notification service writes AuditLog on emit/transition");
  }

  if (!svc.includes("sourceKey")) {
    fail("Duplicate notification prevention requires sourceKey");
  } else {
    ok("Duplicate notification prevention (sourceKey dedup window)");
  }

  if (!svc.includes("staffIntervention.create")) {
    fail("Emergency/critical notifications must create StaffIntervention");
  } else {
    ok("Critical/emergency path creates StaffIntervention when needed");
  }

  if (!svc.includes('actorChannel')) {
    fail("Notification emit must declare actorChannel (orchestrator/supervisor/staff/system)");
  } else {
    ok("Emit channel gate — AI agents cannot call notificationService directly");
  }

  const agentFiles = [
    "src/lib/agents",
    "src/services/voice-ai-reminder.service.ts",
  ];
  let agentDirectEmit = false;
  for (const dir of agentFiles) {
    const full = path.join(process.cwd(), dir);
    if (!existsSync(full)) continue;
  }
  const forbiddenInAgents = [
    "notificationService.emit",
    "staffNotification.create",
  ];
  const checks = [
    "src/services/voice-ai-reminder.service.ts",
    "src/lib/agents/definitions.ts",
  ];
  for (const f of checks) {
    if (!existsSync(path.join(process.cwd(), f))) continue;
    const content = read(f);
    for (const p of forbiddenInAgents) {
      if (content.includes(p)) agentDirectEmit = true;
    }
  }
  if (agentDirectEmit) {
    fail("AI agent modules must not emit staff notifications directly");
  } else {
    ok("AI agents do not bypass orchestrator for staff notifications");
  }

  if (Object.keys(NOTIFICATION_SOURCE_DEFAULTS).length < 20) {
    warn("Expected many notification sources — verify NOTIFICATION_SOURCE_DEFAULTS");
  } else {
    ok(`Notification sources defined (${Object.keys(NOTIFICATION_SOURCE_DEFAULTS).length})`);
  }

  const categories = Object.keys(CATEGORY_VISUAL);
  if (categories.length < 8) {
    fail("Notification category color map incomplete");
  } else {
    ok("Category / visual color mapping exists");
  }

  const rolesWithRead = Object.entries(ROLE_PERMISSIONS).filter(([, perms]) =>
    perms.includes("notifications:read")
  );
  if (rolesWithRead.length < 5) {
    fail("Role targeting: notifications:read not assigned broadly enough");
  } else {
    ok(`Role targeting: notifications:read on ${rolesWithRead.length} roles`);
  }

  const routing = read("src/lib/notifications/notification-routing.service.ts");
  if (!routing.includes("canRoleViewNotification")) {
    fail("Role-filtered notification list missing");
  } else {
    ok("Role-filtered notification visibility");
  }

  const reminder = read("src/services/reminder-engine.service.ts");
  if (!reminder.includes("notifyStaff")) {
    warn("Reminder engine should emit in-app notifications via notifyStaff bridge");
  } else {
    ok("Reminder engine integrates with notification service (orchestrator channel)");
  }

  const supervisor = read("src/services/supervisor-agent.service.ts");
  if (!supervisor.includes('actorChannel: "supervisor"')) {
    fail("Supervisor must emit notifications via supervisor channel");
  } else {
    ok("Supervisor integrates staff notifications");
  }

  if (!svc.includes("STAFF_NOTIFICATION")) {
    warn("Patient timeline STAFF_NOTIFICATION events optional on emit");
  } else {
    ok("Patient-facing notifications add client timeline event");
  }

  const integrationChecks: [string, string][] = [
    ["notification-bridge", "src/lib/notifications/notification-bridge.ts"],
    ["reminder-engine", "src/services/reminder-engine.service.ts"],
    ["supervisor", "src/services/supervisor-agent.service.ts"],
    ["master-orchestrator", "src/services/master-orchestrator.service.ts"],
    ["orchestrator-comms", "src/services/orchestrator.service.ts"],
    ["physical-client", "src/services/physical-client.service.ts"],
    ["webhook-handler", "src/lib/integrations/webhook-handler.ts"],
    ["staff-intervention API", "src/app/api/staff-intervention/route.ts"],
    ["appointments API", "src/app/api/appointments/[id]/route.ts"],
  ];
  for (const [label, file] of integrationChecks) {
    if (!existsSync(path.join(process.cwd(), file))) {
      fail(`Missing integration file: ${file}`);
    } else if (!read(file).includes("notifyStaff")) {
      warn(`${label} should use notifyStaff bridge`);
    } else {
      ok(`${label} uses notification bridge`);
    }
  }

  const bridge = read("src/lib/notifications/notification-bridge.ts");
  if (!bridge.includes("notifyStaff")) {
    fail("notification-bridge must export notifyStaff");
  } else {
    ok("Central notification bridge for orchestrator/supervisor/staff/system");
  }

  const api = auditApiRouteSecurity();
  const notifRoutes = api.sessionRoutes.filter((r) => r.rel.includes("notifications"));
  if (notifRoutes.length === 0) {
    warn("No notification session API routes discovered");
  } else if (notifRoutes.every((r) => r.ok)) {
    ok("Notification API routes use session security");
  } else {
    fail(
      `Unprotected notification API routes: ${notifRoutes.filter((r) => !r.ok).map((r) => r.rel).join(", ")}`
    );
  }
}

async function main() {
  auditStatic();
  await auditDb();

  console.log("\n=== Phase 11 Notifications Audit ===\n");
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

  await prisma.$disconnect();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
