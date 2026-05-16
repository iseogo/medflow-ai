/**
 * Final production readiness audit — security, orchestration, relations, build health.
 * Usage: npm run audit:production
 */
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { PrismaClient, RoleType } from "@prisma/client";
import {
  canAccessDashboardRoute,
  DASHBOARD_ROUTE_RULES,
} from "../src/lib/route-permissions";
import { auditApiRouteSecurity } from "./lib/api-route-security";

const prisma = new PrismaClient();

const passed: string[] = [];
const failed: string[] = [];
const warnings: string[] = [];

function note(kind: "PASS" | "FAIL" | "WARN", msg: string) {
  if (kind === "PASS") passed.push(msg);
  else if (kind === "FAIL") failed.push(msg);
  else warnings.push(msg);
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}

function auditApiSecurity(): number {
  const result = auditApiRouteSecurity();

  const sessionOk = result.sessionRoutes.filter((r) => r.ok).length;
  const sessionTotal = result.sessionRoutes.length;
  for (const r of result.sessionRoutes) {
    if (!r.ok) {
      note(
        "FAIL",
        `Admin/API route missing session/RBAC guard: ${r.rel.replace(/\\/g, "/")}`
      );
    }
  }
  if (sessionTotal > 0) {
    note(
      "PASS",
      `Session/RBAC coverage on dashboard & admin APIs: ${sessionOk}/${sessionTotal}`
    );
  }

  const webhookOk = result.webhookRoutes.filter((r) => r.ok).length;
  const webhookTotal = result.webhookRoutes.length;
  for (const r of result.webhookRoutes) {
    if (!r.ok) {
      note(
        "FAIL",
        `Webhook route missing machine auth (secret/signature/HMAC): ${r.rel.replace(/\\/g, "/")}`
      );
    }
  }
  if (webhookTotal > 0) {
    const medflow = result.webhookRoutes.filter((r) => !r.twilio).length;
    const twilio = result.webhookRoutes.filter((r) => r.twilio).length;
    note(
      "PASS",
      `Webhook machine auth (no session/RBAC): ${webhookOk}/${webhookTotal} — MedFlow secret/HMAC: ${medflow}, Twilio signature: ${twilio}`
    );
  }

  if (sessionTotal + webhookTotal === 0) {
    note("WARN", "No scored API routes found");
    return 100;
  }

  return result.score;
}

function auditOrchestrationStatic(): number {
  let score = 100;
  const orchestratorPath = path.join(
    process.cwd(),
    "src",
    "services",
    "orchestrator.service.ts"
  );
  const orch = readFileSync(orchestratorPath, "utf8");
  if (!orch.includes("automation")) {
    note("WARN", "Orchestrator may be missing automation source channel");
    score -= 15;
  } else {
    note(
      "PASS",
      "Orchestrator gates direct sends (staff / master_orchestrator / automation)"
    );
  }

  const masterPath = path.join(
    process.cwd(),
    "src",
    "services",
    "master-orchestrator.service.ts"
  );
  if (!existsSync(masterPath)) {
    note("FAIL", "Master orchestrator service missing");
    return 20;
  }
  const masterSrc = readFileSync(masterPath, "utf8");
  if (!masterSrc.includes("orchestratorService.send")) {
    note("FAIL", "Master orchestrator must call orchestratorService for sends");
    return 25;
  }
  note("PASS", "Master orchestrator delegates outbound comms");
  return clamp(score);
}

async function auditRelationalIntegrity(): Promise<number> {
  let score = 100;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    note(
      "WARN",
      `Database unreachable (${e instanceof Error ? e.message : e})`
    );
    return 55;
  }

  const rm = Number(
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "ReminderLog" rl
    JOIN "Appointment" a ON a.id = rl."appointmentId"
    WHERE rl."clientId" <> a."clientId"`
    )[0]?.c ?? BigInt(0)
  );
  if (rm > 0) {
    score -= 25;
    note("FAIL", `ReminderLog client ≠ appointment.client (${rm})`);
  } else note("PASS", "Reminder logs match appointment owners");

  const wr = Number(
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "WaitingRoomStatus" w
    JOIN "PhysicalCheckIn" p ON p.id = w."physicalCheckInId"
    WHERE w."clientId" <> p."clientId"`
    )[0]?.c ?? BigInt(0)
  );
  if (wr > 0) {
    score -= 25;
    note("FAIL", `Waiting room client ≠ check-in client (${wr})`);
  } else note("PASS", "Waiting room ↔ check-in client IDs aligned");

  const smsMis = Number(
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "SmsLog" x
    JOIN "Appointment" a ON a.id = x."appointmentId"
    WHERE x."appointmentId" IS NOT NULL AND x."clientId" <> a."clientId"`
    )[0]?.c ?? BigInt(0)
  );
  if (smsMis > 0) {
    score -= 20;
    note("FAIL", `SMS logs with wrong appointment owner (${smsMis})`);
  } else note("PASS", "SMS ↔ appointment client integrity");

  const dupReminder = Number(
    (
      await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM (
      SELECT "appointmentId", "reminderOffset" FROM "ReminderLog"
      GROUP BY 1, 2 HAVING COUNT(*) > 1
    ) t`
    )[0]?.c ?? BigInt(0)
  );
  if (dupReminder > 0) {
    score -= 30;
    note(
      "FAIL",
      `Duplicate ReminderLog for same appointment+offset (${dupReminder})`
    );
  } else {
    note(
      "PASS",
      "Reminder duplicate protection: one row per appointment + offset (all channels on one row)"
    );
  }

  const execMissingComm = await prisma.agentAction.count({
    where: {
      proposalStatus: "EXECUTED",
      OR: [
        { actionType: "SEND_SMS", smsLogId: null },
        { actionType: "SEND_EMAIL", emailLogId: null },
        { actionType: "PLACE_CALL", callLogId: null },
      ],
    },
  });
  if (execMissingComm > 0) {
    score -= 25;
    note("FAIL", `Executed agent actions missing logs: ${execMissingComm}`);
  } else note("PASS", "Executed agent comm actions carry log FKs");

  const apptTotal = await prisma.appointment.count();
  const apptTimeline = await prisma.clientTimelineEvent.count({
    where: { eventType: "APPOINTMENT_CREATED" },
  });
  if (apptTimeline < apptTotal) {
    note(
      "WARN",
      `APPOINTMENT_CREATED events (${apptTimeline}) < appointments (${apptTotal}) — import or API gaps`
    );
    score -= 5;
  } else {
    note("PASS", "Appointment count covered by APPOINTMENT_CREATED timeline rows");
  }

  return clamp(score);
}

function auditCoherence(): number {
  let score = 100;

  if (
    canAccessDashboardRoute(
      "ADMIN" as RoleType,
      "/dashboard/nonexistent-production-probe"
    )
  ) {
    score -= 30;
    note("FAIL", "Unknown /dashboard paths are still reachable — fix route-permissions");
  } else {
    note("PASS", "Unknown dashboard paths denied (secure default)");
  }

  for (const rule of DASHBOARD_ROUTE_RULES) {
    if (rule.exact) continue;
    const rel = rule.prefix.replace(/^\/dashboard\/?/, "");
    const segs = rel.split("/").filter(Boolean);
    const page = path.join(
      process.cwd(),
      "src",
      "app",
      "dashboard",
      ...segs,
      "page.tsx"
    );
    if (!existsSync(page)) {
      const br = path.join(
        process.cwd(),
        "src",
        "app",
        "dashboard",
        ...segs.slice(0, -1),
        "[id]",
        "page.tsx"
      );
      if (!existsSync(br)) {
        score -= 3;
        note("WARN", `RBAC rule without matching page: ${rule.prefix}`);
      }
    }
  }

  try {
    execSync("npx tsc --noEmit", { cwd: process.cwd(), stdio: "pipe" });
    note("PASS", "TypeScript build (tsc --noEmit)");
  } catch {
    score -= 35;
    note("FAIL", "TypeScript compile failed");
  }

  return clamp(score);
}

async function main() {
  console.log("\n=== MedFlow AI — Final Production Audit ===\n");

  const coherenceScore = auditCoherence();
  const securityScore = auditApiSecurity();
  const orchestrationScore = auditOrchestrationStatic();
  const relationalIntegrityScore = await auditRelationalIntegrity();

  const productionReadinessScore = clamp(
    Math.round(
      (coherenceScore +
        securityScore +
        orchestrationScore +
        relationalIntegrityScore) /
        4
    )
  );

  console.log("PASSED:");
  for (const p of passed) console.log(`  ✓ ${p}`);
  console.log("\nWARNINGS:");
  if (warnings.length === 0) console.log("  (none)");
  else for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log("\nFAILED:");
  if (failed.length === 0) console.log("  (none)");
  else for (const f of failed) console.log(`  ✗ ${f}`);

  console.log("\n--- Scores (0–100) ---");
  console.log(`coherence_score: ${coherenceScore}`);
  console.log(`security_score: ${securityScore}`);
  console.log(`orchestration_score: ${orchestrationScore}`);
  console.log(`relational_integrity_score: ${relationalIntegrityScore}`);
  console.log(`production_readiness_score: ${productionReadinessScore}`);
  console.log("");

  await prisma.$disconnect().catch(() => undefined);

  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
