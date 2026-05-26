/**
 * Central env helpers — re-exports integration flags and adds app-level accessors.
 * Prefer this file for new code; legacy imports may still use `@/lib/integrations/env`.
 */
export * from "@/lib/integrations/env";

export function getNodeEnv(): "development" | "production" | "test" {
  const e = process.env.NODE_ENV;
  if (e === "production" || e === "test") return e;
  return "development";
}

export function isProductionNodeEnv(): boolean {
  return getNodeEnv() === "production";
}

/**
 * Run once at server startup in production to catch misconfigured secrets.
 * Call from instrumentation.ts or a top-level server component layout.
 */
export function assertProductionEnv(): void {
  if (getNodeEnv() !== "production") return;

  const secret = process.env.NEXTAUTH_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error(
      "[medflow] NEXTAUTH_SECRET must be at least 32 characters in production. " +
      "Generate with: openssl rand -base64 32"
    );
  }
  if (secret === "change-me-in-production") {
    throw new Error(
      "[medflow] NEXTAUTH_SECRET is set to the example placeholder value. " +
      "Set a strong random secret before deploying."
    );
  }

  const sessionAge = parseInt(process.env.SESSION_MAX_AGE_SECONDS ?? "0", 10);
  if (!sessionAge || sessionAge > 1800) {
    console.warn(
      "[medflow] WARNING: SESSION_MAX_AGE_SECONDS is unset or exceeds 1800 (30 min). " +
      "HIPAA recommends automatic session timeout ≤ 30 minutes. " +
      "Set SESSION_MAX_AGE_SECONDS=1800 in production."
    );
  }
}
