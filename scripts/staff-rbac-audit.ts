/**
 * Phase 3.5 staff / RBAC audit
 * Usage: npm run audit:staff-rbac
 */
import { PrismaClient, RoleType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DASHBOARD_ROUTE_RULES } from "../src/lib/route-permissions";
import { hasPermission, Permission, ROLE_PERMISSIONS } from "../src/lib/rbac";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const SEED_EMAILS = [
  "admin@medflow.ai",
  "manager@medflow.ai",
  "frontdesk@medflow.ai",
  "billing@medflow.ai",
  "records@medflow.ai",
  "clinical@medflow.ai",
  "readonly@medflow.ai",
];

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`OK: ${msg}`);
}

async function main() {
  console.log("\n=== Phase 3.5 Staff & RBAC Audit ===\n");

  const roles = await prisma.role.count();
  if (roles !== 7) fail(`Expected 7 roles, found ${roles}`);
  ok("All RBAC roles exist");

  for (const email of SEED_EMAILS) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
    if (!user) fail(`Missing seed user ${email}`);
    if (user.status !== "ACTIVE") fail(`${email} not ACTIVE`);
    if (!user.passwordHash.startsWith("$2")) {
      fail(`${email} password is not bcrypt hashed`);
    }
    if (email === "admin@medflow.ai") {
      const valid = await bcrypt.compare("Admin123!", user.passwordHash);
      if (!valid) fail("Admin password mismatch");
    }
  }
  ok(`All ${SEED_EMAILS.length} staff users exist with bcrypt hashes`);

  const dupHash = await prisma.user.groupBy({
    by: ["passwordHash"],
    _count: true,
    having: { passwordHash: { _count: { gt: 1 } } },
  });
  if (dupHash.length > 0) {
    fail("Duplicate password hashes detected — shared passwords not allowed");
  }
  ok("No shared password hashes across staff users");

  for (const role of Object.keys(ROLE_PERMISSIONS) as RoleType[]) {
    if (!ROLE_PERMISSIONS[role]?.length) fail(`No permissions for ${role}`);
  }
  ok("RBAC permission matrix defined for every role");

  if (!hasPermission("READ_ONLY", "clients:read")) {
    fail("READ_ONLY missing clients:read");
  }
  if (hasPermission("READ_ONLY", "clients:write")) {
    fail("READ_ONLY must not have clients:write");
  }
  if (!hasPermission("ADMIN", "users:manage")) {
    fail("ADMIN missing users:manage");
  }
  if (!hasPermission("MANAGER", "users:manage")) {
    fail("MANAGER missing users:manage");
  }
  if (hasPermission("BILLING_STAFF", "users:manage")) {
    fail("BILLING_STAFF must not manage users");
  }
  ok("Role access rules match Phase 3.5 spec");

  if (DASHBOARD_ROUTE_RULES.length < 10) {
    fail("Dashboard route rules incomplete");
  }
  ok(`${DASHBOARD_ROUTE_RULES.length} protected dashboard route rules`);

  const middlewarePath = path.join(process.cwd(), "src", "middleware.ts");
  const middlewareSrc = fs.readFileSync(middlewarePath, "utf8");
  if (!middlewareSrc.includes("canAccessDashboardRoute")) {
    fail("Middleware missing RBAC route check");
  }
  if (!middlewareSrc.includes("forcePasswordReset")) {
    fail("Middleware missing force password reset redirect");
  }
  ok("RBAC middleware guards dashboard routes");

  const staffPage = path.join(
    process.cwd(),
    "src",
    "app",
    "dashboard",
    "staff",
    "page.tsx"
  );
  if (!fs.existsSync(staffPage)) fail("Missing /dashboard/staff page");
  ok("Staff dashboard page exists");

  const overrideRow = await prisma.staffOverride.findFirst();
  const auditWithActor = await prisma.auditLog.findFirst({
    where: { actorName: { not: null }, actorRole: { not: null } },
  });
  if (!auditWithActor) {
    console.warn("WARN: No audit logs with actorName yet — run seed or cross-phase audit");
  } else {
    ok("Audit logs include actor name and role");
  }

  if (!overrideRow) {
    console.warn("WARN: No StaffOverride rows yet — run cross-phase audit or staff API");
  } else {
    ok("Staff override ownership records exist");
  }

  const resetModel = await prisma.passwordResetToken.findMany({ take: 1 });
  ok(`PasswordResetToken model available (${resetModel.length} rows sample)`);

  console.log("\n=== Phase 3.5 audit passed ===\n");
}

export async function runStaffRbacAudit() {
  await main();
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").includes("staff-rbac-audit");

if (isDirectRun) {
  runStaffRbacAudit()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
