/**
 * Cross-phase system coherence audit (Phases 1–5).
 * Usage: npm run audit:system-coherence
 */
import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { PrismaClient, RoleType } from "@prisma/client";
import {
  canAccessDashboardRoute,
  DASHBOARD_ROUTE_RULES,
} from "../src/lib/route-permissions";

const prisma = new PrismaClient();

type Severity = "PASS" | "FAIL" | "WARN";

const passed: string[] = [];
const failed: string[] = [];
const warnings: string[] = [];

let orphanRecords = 0;
let missingAuditActor = 0;
let missingTimelineActor = 0;
let missingActorTotal = 0;

let rbacPathsMatched = 0;
let rbacPathsTotal = 0;

function note(severity: Severity, msg: string) {
  if (severity === "PASS") passed.push(msg);
  else if (severity === "FAIL") failed.push(msg);
  else warnings.push(msg);
}

type RouteRule = (typeof DASHBOARD_ROUTE_RULES)[number];

function ruleMatchesPath(rule: RouteRule, pathname: string): boolean {
  return rule.exact ? pathname === rule.prefix : pathname.startsWith(rule.prefix);
}

function longestMatchingRule(pathname: string): RouteRule | undefined {
  const matches = DASHBOARD_ROUTE_RULES.filter((r) =>
    ruleMatchesPath(r, pathname)
  ).sort((a, b) => b.prefix.length - a.prefix.length);
  return matches[0];
}

function collectDashboardTestPaths(): string[] {
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
        tests.add(hasDynamic ? `${base}/__coherence_probe__` : base);
      }
    }
  }

  walk(dashboardRoot, []);
  return Array.from(tests);
}

function ruleHasDashboardPage(rule: RouteRule): boolean {
  if (rule.prefix === "/dashboard/access-denied") return true;
  const rel = rule.prefix.replace(/^\/dashboard\/?/, "");
  const segs = rel.split("/").filter(Boolean);
  const dashboardRoot = path.join(
    process.cwd(),
    "src",
    "app",
    "dashboard"
  );
  if (segs.length === 0) {
    return existsSync(path.join(dashboardRoot, "page.tsx"));
  }
  const direct = path.join(dashboardRoot, ...segs, "page.tsx");
  if (existsSync(direct)) return true;
  const parent = segs.slice(0, -1);
  const last = segs[segs.length - 1];
  const bracket = path.join(dashboardRoot, ...parent, `[${last}]`, "page.tsx");
  if (existsSync(bracket)) return true;
  const idFolder = path.join(dashboardRoot, ...parent, "[id]", "page.tsx");
  if (existsSync(idFolder) && last !== "access-denied") return true;
  return false;
}

async function auditDatabaseRelations() {
  const rmBad =
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM "ReminderLog" rl
      INNER JOIN "Appointment" a ON a.id = rl."appointmentId"
      WHERE rl."clientId" <> a."clientId"`
    )[0]?.c ?? BigInt(0);
  const reminderBad = Number(rmBad);
  if (reminderBad > 0) {
    orphanRecords += reminderBad;
    note(
      "FAIL",
      `ReminderLog rows where clientId ≠ appointment.clientId: ${reminderBad}`
    );
  } else {
    note("PASS", "ReminderLog.clientId matches Appointment.clientId");
  }

  const wrClientBad =
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM "WaitingRoomStatus" w
      INNER JOIN "PhysicalCheckIn" p ON p.id = w."physicalCheckInId"
      WHERE w."clientId" <> p."clientId"`
    )[0]?.c ?? BigInt(0);
  const wrC = Number(wrClientBad);
  if (wrC > 0) {
    orphanRecords += wrC;
    note(
      "FAIL",
      `WaitingRoomStatus clientId ≠ PhysicalCheckIn.clientId: ${wrC}`
    );
  } else {
    note("PASS", "WaitingRoomStatus.clientId matches PhysicalCheckIn.clientId");
  }

  const wrApptBad =
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM "WaitingRoomStatus" w
      INNER JOIN "PhysicalCheckIn" p ON p.id = w."physicalCheckInId"
      WHERE w."appointmentId" IS NOT NULL
        AND p."appointmentId" IS NOT NULL
        AND w."appointmentId" <> p."appointmentId"`
    )[0]?.c ?? BigInt(0);
  const wrA = Number(wrApptBad);
  if (wrA > 0) {
    orphanRecords += wrA;
    note(
      "FAIL",
      `WaitingRoomStatus.appointmentId disagrees with PhysicalCheckIn.appointmentId: ${wrA}`
    );
  } else {
    note(
      "PASS",
      "Waiting room appointment aligns with check-in appointment when both set"
    );
  }

  const agentApptMismatch =
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM "AgentAction" act
      INNER JOIN "Appointment" a ON a.id = act."appointmentId"
      WHERE act."appointmentId" IS NOT NULL AND act."clientId" <> a."clientId"`
    )[0]?.c ?? BigInt(0);
  const aa = Number(agentApptMismatch);
  if (aa > 0) {
    orphanRecords += aa;
    note("FAIL", `AgentAction rows whose clientId ≠ appointment.clientId: ${aa}`);
  } else {
    note("PASS", "AgentAction client aligns with linked appointment");
  }

  for (const [label, table] of [
    ["SmsLog", `"SmsLog"`],
    ["EmailLog", `"EmailLog"`],
    ["CallLog", `"CallLog"`],
  ] as const) {
    const r = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
      `SELECT COUNT(*)::bigint AS c FROM ${table} x
       INNER JOIN "Appointment" a ON a.id = x."appointmentId"
       WHERE x."appointmentId" IS NOT NULL AND x."clientId" <> a."clientId"`
    );
    const n = Number(r[0]?.c ?? 0);
    if (n > 0) {
      orphanRecords += n;
      note(
        "FAIL",
        `${label}: appointmentId points to appointment owned by different client (${n})`
      );
    } else {
      note("PASS", `${label}: linked appointments belong to the same client`);
    }
  }

  const apptOverrideBad = await prisma.appointment.count({
    where: {
      staffOverride: true,
      staffOverrideByUserId: null,
      staffOverrideAt: { not: null },
    },
  });
  if (apptOverrideBad > 0) {
    note(
      "WARN",
      `Appointments marked staff-overridden with recorded time but no override userId: ${apptOverrideBad}`
    );
  } else {
    note("PASS", "Appointment staff override metadata looks consistent");
  }

  const execMissingLog = await prisma.agentAction.count({
    where: {
      proposalStatus: "EXECUTED",
      OR: [
        { actionType: "SEND_SMS", smsLogId: null },
        { actionType: "SEND_EMAIL", emailLogId: null },
        { actionType: "PLACE_CALL", callLogId: null },
      ],
    },
  });
  if (execMissingLog > 0) {
    note(
      "FAIL",
      `EXECUTED AgentAction rows missing comm log for SMS/EMAIL/CALL: ${execMissingLog}`
    );
  } else {
    note(
      "PASS",
      "EXECUTED comm AgentActions have corresponding log foreign keys"
    );
  }

  const dupComms =
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM (
        SELECT 1 FROM "SmsLog"
        GROUP BY "clientId", COALESCE("appointmentId", ''), "purpose", "channel"::text
        HAVING COUNT(*) > 1
      ) dup_groups`
    )[0]?.c ?? BigInt(0);
  const dup = Number(dupComms);
  if (dup > 0) {
    note(
      "WARN",
      `SmsLog groups (client + appointment + purpose + channel) with duplicates: ${dup}`
    );
  } else {
    note("PASS", "No duplicate SMS groups in SmsLog aggregate check");
  }

  missingAuditActor = await prisma.auditLog.count({
    where: {
      userId: null,
      actorUserId: null,
      entityType: { notIn: ["System", "HealthCheck"] },
    },
  });
  if (missingAuditActor > 0) {
    note(
      "WARN",
      `AuditLog rows without userId/actorUserId (non-system entity types): ${missingAuditActor}`
    );
  } else {
    note("PASS", "No unexpected anonymous audit rows (heuristic)");
  }

  missingTimelineActor = await prisma.clientTimelineEvent.count({
    where: {
      actorUserId: null,
      eventType: {
        in: [
          "STAFF_INTERVENTION_CREATED",
          "STAFF_INTERVENTION_UPDATED",
          "STAFF_TASK_CREATED",
          "STAFF_OVERRIDE",
          "NOTE_ADDED",
        ],
      },
    },
  });
  if (missingTimelineActor > 0) {
    note(
      "WARN",
      `Staff-oriented timeline events without actorUserId: ${missingTimelineActor}`
    );
  } else {
    note(
      "PASS",
      "Staff-oriented timeline events include actorUserId where expected"
    );
  }

  missingActorTotal = missingAuditActor + missingTimelineActor;

  const openInterventionNoClient = await prisma.staffIntervention.count({
    where: {
      clientId: null,
      NOT: { status: "RESOLVED" },
    },
  });
  if (openInterventionNoClient > 0) {
    note(
      "WARN",
      `Open staff interventions without clientId: ${openInterventionNoClient}`
    );
  } else {
    note("PASS", "No open interventions missing client linkage (heuristic)");
  }
}

async function auditReminderFallbacks() {
  const rows = await prisma.reminderLog.findMany({
    select: {
      id: true,
      outcome: true,
      voiceCallLogId: true,
      smsLogId: true,
      emailLogId: true,
    },
  });
  let noChannel = 0;
  for (const r of rows) {
    if (!r.voiceCallLogId && !r.smsLogId && !r.emailLogId) noChannel++;
  }
  if (noChannel > 0) {
    note(
      "WARN",
      `ReminderLog rows with no voice/SMS/email log linkage: ${noChannel}`
    );
  } else if (rows.length > 0) {
    note("PASS", "ReminderLog rows reference at least one delivery channel log");
  } else {
    note("PASS", "No ReminderLog rows to verify channel linkage");
  }

  const escNoTask = await prisma.reminderLog.count({
    where: { outcome: "ESCALATED" },
  });
  if (escNoTask > 0) {
    const withTask = await prisma.staffTask.count({
      where: { title: { contains: "reminder", mode: "insensitive" } },
    });
    if (withTask === 0) {
      note(
        "WARN",
        "ESCALATED reminders exist but no staff tasks matched reminder heuristic — verify escalation wiring"
      );
    } else {
      note("PASS", "Escalated reminders present; staff tasks exist for follow-up");
    }
  }
}

function auditRbacAndNav() {
  const tests = collectDashboardTestPaths();
  rbacPathsTotal = tests.length;
  rbacPathsMatched = 0;

  for (const p of tests) {
    const rule = longestMatchingRule(p);
    if (!rule) {
      note("FAIL", `Dashboard page path has no RBAC rule: ${p}`);
    } else {
      rbacPathsMatched++;
    }
  }
  if (rbacPathsMatched === rbacPathsTotal && rbacPathsTotal > 0) {
    note(
      "PASS",
      `All ${rbacPathsTotal} dashboard route patterns have RBAC rules`
    );
  }

  for (const rule of DASHBOARD_ROUTE_RULES) {
    if (rule.exact) continue;
    if (!ruleHasDashboardPage(rule)) {
      note(
        "WARN",
        `RBAC rule has no dashboard page: ${rule.prefix} (reserved or stale)`
      );
    }
  }

  const adminOk = canAccessDashboardRoute(
    "ADMIN" as RoleType,
    "/dashboard/clients/__coherence_probe__"
  );
  if (!adminOk) {
    note(
      "WARN",
      "ADMIN cannot access /dashboard/clients/* probe (check permissions matrix)"
    );
  } else {
    note("PASS", "ADMIN can access client dashboard subtree (smoke check)");
  }

  const unknownAccessible = canAccessDashboardRoute(
    "ADMIN" as RoleType,
    "/dashboard/nonexistent-coherence-route"
  );
  if (unknownAccessible) {
    note(
      "FAIL",
      "Unknown dashboard paths are allowed — route-permissions must deny non-matching prefixes"
    );
  } else {
    note("PASS", "Unknown dashboard paths are denied by RBAC (no insecure fallback)");
  }
}

function auditTypeScript() {
  try {
    execSync("npx tsc --noEmit", {
      cwd: process.cwd(),
      stdio: "pipe",
      encoding: "utf8",
    });
    note("PASS", "TypeScript compiles (tsc --noEmit)");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    note("FAIL", `TypeScript errors: ${msg.slice(0, 500)}`);
  }
}

function auditReadme() {
  const readme = path.join(process.cwd(), "README.md");
  if (!existsSync(readme)) {
    note("WARN", "README.md missing");
    return;
  }
  const text = readFileSync(readme, "utf8");
  if (!text.includes("audit:system-coherence")) {
    note("WARN", "README.md scripts table should list audit:system-coherence");
  } else {
    note("PASS", "README mentions audit:system-coherence");
  }
  if (/^# MedFlow AI — Phase 1\s*$/m.test(text)) {
    note("WARN", "README title still scoped to Phase 1 only in the H1");
  } else {
    note("PASS", "README H1 is not locked to Phase 1 only");
  }
}

function score(): number {
  let s = 100;
  s -= failed.length * 8;
  s -= warnings.length * 2;
  return Math.max(0, Math.min(100, s));
}

async function main() {
  console.log("\n=== MedFlow AI — System Coherence Audit ===\n");

  auditRbacAndNav();
  auditTypeScript();
  auditReadme();

  try {
    await prisma.$queryRaw`SELECT 1`;
    await auditDatabaseRelations();
    await auditReminderFallbacks();
  } catch (e) {
    note(
      "WARN",
      `Database skipped or unreachable (${e instanceof Error ? e.message : e})`
    );
  } finally {
    await prisma.$disconnect();
  }

  console.log("PASSED:");
  for (const line of passed) console.log(`  ✓ ${line}`);
  console.log("\nFAILED:");
  if (failed.length === 0) console.log("  (none)");
  else for (const line of failed) console.log(`  ✗ ${line}`);
  console.log("\nWARNINGS:");
  if (warnings.length === 0) console.log("  (none)");
  else for (const line of warnings) console.log(`  ⚠ ${line}`);

  console.log("\n--- Metrics ---");
  console.log(`orphan_record_issues: ${orphanRecords}`);
  console.log(`missing_audit_actor_rows: ${missingAuditActor}`);
  console.log(`missing_timeline_actor_rows: ${missingTimelineActor}`);
  console.log(`missing_actor_rows (audit+timeline heuristic): ${missingActorTotal}`);
  console.log(
    `RBAC route coverage: ${rbacPathsMatched}/${rbacPathsTotal} dashboard paths matched rules`
  );
  const finalScore = score();
  console.log(`\nCoherence score: ${finalScore}/100\n`);

  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
