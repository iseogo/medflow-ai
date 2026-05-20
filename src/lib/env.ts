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
