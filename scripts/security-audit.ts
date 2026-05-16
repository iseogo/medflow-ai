/**
 * Phase 8 security audit — static + optional DB checks.
 * Usage: npm run audit:security
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { auditApiRouteSecurity } from "./lib/api-route-security";
import { isMockModeForced } from "../src/lib/integrations/env";

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

function auditStatic() {
  const required = [
    "src/lib/security/phi-safe-log.ts",
    "src/middleware/security.ts",
    "src/middleware/rbac.ts",
    "src/middleware/audit.ts",
    "src/lib/security/ai-safety.ts",
    "src/lib/security/data-access.ts",
    "src/lib/integrations/webhook-auth.ts",
    "docs/HIPAA-CONSCIOUS.md",
    "docs/SECURITY.md",
    "README-PHASE8.md",
    // Phase 9 planning (docs only — no runtime scheduling)
    "README-PHASE9.md",
    "docs/phase9/ROADMAP.md",
    "docs/phase9/REQUIREMENTS.md",
    "docs/phase9/COORDINATION.md",
    "src/lib/scheduling/planning/provider-matching.service.ts",
    "src/lib/scheduling/planning/availability-checking.service.ts",
    "src/lib/scheduling/planning/intelligent-scheduling.service.ts",
  ];
  for (const f of required) {
    if (!existsSync(path.join(process.cwd(), f))) fail(`Missing ${f}`);
    else ok(`Present ${f}`);
  }

  const hipaa = readFileSync(path.join(process.cwd(), "docs/HIPAA-CONSCIOUS.md"), "utf8");
  if (!hipaa.includes("Final HIPAA compliance requires legal review")) {
    fail("HIPAA doc missing legal disclaimer");
  } else {
    ok("HIPAA legal disclaimer present");
  }

  const ai = readFileSync(path.join(process.cwd(), "src/lib/security/ai-safety.ts"), "utf8");
  if (!ai.includes("911") || !ai.includes("diagnos")) {
    fail("AI safety rules incomplete");
  } else {
    ok("AI safety: no diagnosis + emergency 911 guidance");
  }

  const mw = readFileSync(path.join(process.cwd(), "src/middleware.ts"), "utf8");
  if (!mw.includes("applySecurityMiddleware") || !mw.includes("applyApiRbacMiddleware")) {
    fail("Root middleware missing Phase 8 composition");
  } else {
    ok("Root middleware composes security + RBAC");
  }

  const api = auditApiRouteSecurity();
  if (api.score < 100) fail(`API auth score ${api.score}`);
  else ok("Webhook vs session API separation");

  if (isMockModeForced()) ok("MOCK_MODE default safe");
  else warn("MOCK_MODE off in this environment");
}

async function auditDb() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    warn("Database unreachable — skipping DB checks");
    return;
  }

  const exportEnum = await prisma.$queryRaw<{ e: string }[]>`
    SELECT unnest(enum_range(NULL::"AuditAction"))::text AS e`;
  const values = exportEnum.map((r) => r.e);
  if (!values.includes("EXPORT") || !values.includes("FILE_ACCESS")) {
    fail("AuditAction enum missing EXPORT or FILE_ACCESS — run migration");
  } else {
    ok("AuditAction includes EXPORT and FILE_ACCESS");
  }
}

async function main() {
  console.log("\n=== MedFlow AI — Security Audit (Phase 8) ===\n");
  auditStatic();
  await auditDb();

  console.log("PASSED:");
  for (const p of passed) console.log(`  ✓ ${p}`);
  console.log("\nFAILED:");
  if (failed.length === 0) console.log("  (none)");
  else for (const f of failed) console.log(`  ✗ ${f}`);
  console.log("\nWARNINGS:");
  if (warnings.length === 0) console.log("  (none)");
  else for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log(`\nScore: ${passed.length} passed, ${failed.length} failed\n`);

  await prisma.$disconnect().catch(() => undefined);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
