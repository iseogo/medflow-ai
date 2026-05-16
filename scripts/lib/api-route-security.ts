/**
 * Shared API route security classification for production & integration audits.
 * Webhooks are machine-to-machine (secret / signature / HMAC), not session/RBAC.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

export type ApiRouteSecurityKind = "public" | "webhook" | "session";

export function collectApiRouteFiles(): string[] {
  const root = path.join(process.cwd(), "src", "app", "api");
  const out: string[] = [];
  function walk(dir: string) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith("_")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name === "route.ts") out.push(full);
    }
  }
  walk(root);
  return out;
}

export function relFromApiRoot(file: string): string {
  return path.relative(path.join(process.cwd(), "src", "app", "api"), file);
}

export function isPublicApiRoute(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/").toLowerCase();
  return (
    norm.startsWith("health/") ||
    norm.includes("/auth/[...nextauth]/") ||
    norm.includes("auth/[...nextauth]") ||
    norm.includes("auth/forgot-password")
  );
}

export function isWebhookApiRoute(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/").toLowerCase();
  return norm.startsWith("webhooks/");
}

export function classifyApiRoute(rel: string): ApiRouteSecurityKind {
  if (isPublicApiRoute(rel)) return "public";
  if (isWebhookApiRoute(rel)) return "webhook";
  return "session";
}

const SESSION_RBAC_MARKERS = [
  "requirePermission",
  "requireAnyPermission",
  "requireSession",
  "getServerSession",
] as const;

const WEBHOOK_ROUTE_MARKERS = [
  "handleMedflowWebhook",
  "handleTwilioSmsWebhook",
  "handleTwilioVoiceWebhook",
] as const;

const WEBHOOK_INLINE_AUTH_MARKERS = [
  "validateMedflowWebhookSecret",
  "validateTwilioSignature",
] as const;

/** Resolves re-export shims (e.g. emails/send → emails/route). */
export function readRouteSource(file: string): string {
  let src = readFileSync(file, "utf8");
  if (/export\s+\{[^}]+\}\s+from\s+["']([^"']+)["']/.test(src)) {
    const m = src.match(/from\s+["']([^"']+)["']/);
    if (m) {
      const target = path.normalize(
        path.join(path.dirname(file), `${m[1]}.ts`)
      );
      if (existsSync(target)) {
        src = readFileSync(target, "utf8");
      }
    }
  }
  return src;
}

export function hasSessionRbacGuard(src: string): boolean {
  return SESSION_RBAC_MARKERS.some((m) => src.includes(m));
}

export function routeDelegatesToWebhookHandler(src: string): boolean {
  return WEBHOOK_ROUTE_MARKERS.some((m) => src.includes(m));
}

export function routeHasInlineWebhookAuth(src: string): boolean {
  return WEBHOOK_INLINE_AUTH_MARKERS.some((m) => src.includes(m));
}

export function webhookHandlerModuleSecured(): boolean {
  const handlerPath = path.join(
    process.cwd(),
    "src",
    "lib",
    "integrations",
    "webhook-handler.ts"
  );
  const authPath = path.join(
    process.cwd(),
    "src",
    "lib",
    "integrations",
    "webhook-auth.ts"
  );
  if (!existsSync(handlerPath) || !existsSync(authPath)) return false;
  const handler = readFileSync(handlerPath, "utf8");
  const auth = readFileSync(authPath, "utf8");
  return (
    handler.includes("validateMedflowWebhookSecret") &&
    handler.includes("validateTwilioSignature") &&
    auth.includes("createHmac") &&
    auth.includes("timingSafeEqual")
  );
}

export function hasWebhookMachineAuth(rel: string, src: string): boolean {
  if (!isWebhookApiRoute(rel)) return false;
  if (routeDelegatesToWebhookHandler(src) || routeHasInlineWebhookAuth(src)) {
    return webhookHandlerModuleSecured();
  }
  return false;
}

export function routeExportsHandlers(src: string): boolean {
  return /\bexport\s+async\s+function\s+(GET|POST|PATCH|DELETE|PUT)\b/.test(
    src
  );
}

export type ApiSecurityAuditResult = {
  sessionRoutes: { rel: string; ok: boolean }[];
  webhookRoutes: { rel: string; ok: boolean; twilio: boolean }[];
  publicSkipped: string[];
  score: number;
};

export function auditApiRouteSecurity(): ApiSecurityAuditResult {
  const sessionRoutes: { rel: string; ok: boolean }[] = [];
  const webhookRoutes: { rel: string; ok: boolean; twilio: boolean }[] = [];
  const publicSkipped: string[] = [];

  const handlerOk = webhookHandlerModuleSecured();

  for (const file of collectApiRouteFiles()) {
    const rel = relFromApiRoot(file);
    const kind = classifyApiRoute(rel);
    const src = readRouteSource(file);

    if (!routeExportsHandlers(src)) continue;

    if (kind === "public") {
      publicSkipped.push(rel);
      continue;
    }

    if (kind === "webhook") {
      const norm = rel.replace(/\\/g, "/").toLowerCase();
      const twilio = norm.includes("webhooks/twilio/");
      const ok =
        handlerOk &&
        (routeDelegatesToWebhookHandler(src) || routeHasInlineWebhookAuth(src));
      webhookRoutes.push({ rel, ok, twilio });
      continue;
    }

    sessionRoutes.push({ rel, ok: hasSessionRbacGuard(src) });
  }

  const sessionOk = sessionRoutes.filter((r) => r.ok).length;
  const webhookOk = webhookRoutes.filter((r) => r.ok).length;
  const total = sessionRoutes.length + webhookRoutes.length;
  const score =
    total === 0 ? 100 : Math.round(((sessionOk + webhookOk) / total) * 100);

  return {
    sessionRoutes,
    webhookRoutes,
    publicSkipped,
    score,
  };
}
