/**
 * Phase 13 — VPS deployment audit.
 * Usage: npm run audit:deployment
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

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

function auditFiles() {
  const required = [
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.dev.yml",
    ".env.production.example",
    "docker/entrypoint.sh",
    "README-DEPLOYMENT.md",
    "README-PHASE13.md",
    ".dockerignore",
  ];
  for (const f of required) {
    if (!existsSync(path.join(process.cwd(), f))) fail(`Missing ${f}`);
    else ok(`Present ${f}`);
  }
}

function auditComposeAndTraefik() {
  const compose = read("docker-compose.yml");
  if (!compose.includes("medflow.smartdeskai.cloud")) {
    fail("Traefik / compose must reference medflow.smartdeskai.cloud");
  } else {
    ok("medflow.smartdeskai.cloud referenced");
  }

  if (!compose.includes("traefik.enable=true")) {
    fail("Traefik labels missing");
  } else {
    ok("Traefik labels present");
  }

  if (!compose.includes("traefik_public")) {
    fail("Traefik external network traefik_public missing");
  } else {
    ok("Traefik network (traefik_public external)");
  }

  if (!compose.includes("n8n.smartdeskai.cloud") && !read(".env.production.example").includes("n8n.smartdeskai.cloud")) {
    fail("n8n.smartdeskai.cloud not referenced");
  } else {
    ok("n8n.smartdeskai.cloud referenced");
  }

  if (compose.includes("image: n8nio/n8n") || compose.match(/container_name:\s*n8n\b/)) {
    fail("docker-compose must not include n8n service (runs separately)");
  } else {
    ok("No n8n container in MedFlow compose");
  }
}

function auditEnvTemplate() {
  const env = read(".env.production.example");
  const requiredKeys = [
    "NEXTAUTH_URL=https://medflow.smartdeskai.cloud",
    "N8N_BASE_URL=https://n8n.smartdeskai.cloud",
    "MOCK_MODE=true",
    "DATABASE_URL=",
    "NEXTAUTH_SECRET=",
    "WEBHOOK_SECRET=",
  ];
  for (const key of requiredKeys) {
    if (!env.includes(key.split("=")[0])) {
      fail(`Missing ${key.split("=")[0]} in .env.production.example`);
    }
  }
  ok(".env.production.example has required keys");

  if (!env.includes("MOCK_MODE=true")) {
    fail("MOCK_MODE must default to true in .env.production.example");
  } else {
    ok("MOCK_MODE defaults true in production example");
  }

  if (env.match(/NEXTAUTH_SECRET=sk_|OPENAI_API_KEY=sk-[a-zA-Z0-9]{20,}/)) {
    fail("Real-looking secrets in .env.production.example");
  } else {
    ok("No real secrets in .env.production.example");
  }
}

function auditDockerfile() {
  const df = read("Dockerfile");
  if (!df.includes("prisma generate") || !df.includes("npm run build")) {
    fail("Dockerfile must run prisma generate and build");
  } else {
    ok("Dockerfile build steps");
  }
  if (!read("docker/entrypoint.sh").includes("prisma migrate deploy")) {
    fail("entrypoint must run prisma migrate deploy");
  } else {
    ok("Migration command in entrypoint");
  }
}

function auditDocs() {
  const deploy = read("README-DEPLOYMENT.md");
  const checks: [string, string][] = [
    ["docker compose up -d --build", "deployment up command"],
    ["docker compose logs -f medflow", "logs command"],
    ["docker compose restart medflow", "restart command"],
    ["docker compose down", "down command"],
    ["prisma migrate deploy", "migrate deploy documented"],
    ["prisma generate", "prisma generate documented"],
    ["prisma db seed", "seed documented"],
    ["backup", "backup instructions"],
    ["ollback", "rollback instructions"],
    ["/api/health", "health check instructions"],
    ["security checklist", "security checklist"],
  ];
  for (const [needle, label] of checks) {
    if (!deploy.toLowerCase().includes(needle.toLowerCase())) {
      fail(`README-DEPLOYMENT missing: ${label}`);
    }
  }
  ok("README-DEPLOYMENT commands and runbook sections");
}

function auditNoCommittedSecrets() {
  const suspicious =
    /(sk_live_[a-zA-Z0-9]+|AKIA[0-9A-Z]{16}|postgresql:\/\/[^:]+:[^@]+@)/;
  const scanRoots = [
    "Dockerfile",
    "docker-compose.yml",
    ".env.production.example",
    "README-DEPLOYMENT.md",
  ];
  for (const f of scanRoots) {
    const content = read(f);
    if (f === ".env.production.example" && content.includes("CHANGE_ME")) continue;
    if (suspicious.test(content) && !content.includes("CHANGE_ME")) {
      warn(`Review ${f} for possible embedded credentials`);
    }
  }

  if (existsSync(path.join(process.cwd(), ".env"))) {
    warn(".env exists locally — ensure it is gitignored and not committed");
  } else {
    ok("No committed .env file in workspace");
  }

  const gitignore = read(".gitignore");
  if (!gitignore.includes(".env")) {
    fail(".gitignore must exclude .env");
  } else {
    ok(".env gitignored");
  }
}

function auditNextStandalone() {
  const cfg = read("next.config.mjs");
  if (!cfg.includes('output: "standalone"') && !cfg.includes("output: 'standalone'")) {
    fail("next.config.mjs should set output standalone for Docker");
  } else {
    ok("Next.js standalone output enabled");
  }
}

async function main() {
  auditFiles();
  auditComposeAndTraefik();
  auditEnvTemplate();
  auditDockerfile();
  auditDocs();
  auditNoCommittedSecrets();
  auditNextStandalone();

  console.log("\n=== Phase 13 Deployment Audit ===\n");
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
