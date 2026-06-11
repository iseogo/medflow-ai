/**
 * Vercel build hook: apply migrations and (first deploy only) seed demo data.
 * Skips silently when DATABASE_URL is not configured yet so the very first
 * deploy — before storage is attached — still builds.
 */
import { execSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.log("[deploy-db] DATABASE_URL not set — skipping migrations/seed.");
  process.exit(0);
}

console.log("[deploy-db] Applying migrations...");
// Concurrent builds (e.g. a preview and a production deploy of the same
// commit) race for Prisma's migration advisory lock and fail with P1002.
// Retry with backoff instead of failing the whole build.
const MAX_ATTEMPTS = 4;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    break;
  } catch (err) {
    if (attempt === MAX_ATTEMPTS) throw err;
    const waitSeconds = attempt * 15;
    console.log(
      `[deploy-db] migrate deploy failed (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in ${waitSeconds}s...`
    );
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
  }
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
try {
  const users = await prisma.user.count();
  if (users > 0) {
    console.log(`[deploy-db] ${users} user(s) exist — skipping seed.`);
  } else {
    console.log("[deploy-db] Empty database — seeding demo data...");
    execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
  }
} finally {
  await prisma.$disconnect();
}
