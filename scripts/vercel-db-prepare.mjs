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
execSync("npx prisma migrate deploy", { stdio: "inherit" });

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
