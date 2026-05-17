import { RoleType } from "@prisma/client";
import { Permission, hasAnyPermission, hasPermission } from "@/lib/rbac";

type ApiRule = {
  prefix: string;
  method?: string;
  permissions: Permission[];
  any?: boolean;
};

/** Coarse API RBAC for middleware enforcement (routes still call requirePermission). */
export const API_RBAC_RULES: ApiRule[] = [
  { prefix: "/api/staff", permissions: ["users:manage"] },
  { prefix: "/api/audit", permissions: ["audit:read"] },
  { prefix: "/api/clients", permissions: ["clients:read", "clients:read-limited"], any: true },
  { prefix: "/api/appointments", permissions: ["appointments:read"] },
  { prefix: "/api/walk-ins", permissions: ["walkins:read", "walkins:write"], any: true },
  { prefix: "/api/check-ins", permissions: ["checkins:read", "checkins:write"], any: true },
  { prefix: "/api/waiting-room", permissions: ["checkins:read", "walkins:read"], any: true },
  { prefix: "/api/staff-intervention", permissions: ["staff-intervention:read"], any: true },
  { prefix: "/api/staff-tasks", permissions: ["staff-tasks:read", "staff-tasks:write"], any: true },
  { prefix: "/api/sms", permissions: ["communications:read"], any: true },
  { prefix: "/api/emails", permissions: ["communications:read"], any: true },
  { prefix: "/api/calls", permissions: ["communications:read"], any: true },
  { prefix: "/api/orchestrator", permissions: ["orchestrator:read"], any: true },
  { prefix: "/api/agent-actions", permissions: ["orchestrator:read", "orchestrator:write"], any: true },
  { prefix: "/api/reminders", permissions: ["reminders:read", "reminders:write"], any: true },
  { prefix: "/api/integrations/status", permissions: ["settings:read"] },
  { prefix: "/api/agents/definitions", permissions: ["orchestrator:read"] },
  { prefix: "/api/supervisor", permissions: ["supervisor:read", "supervisor:run"], any: true },
  {
    prefix: "/api/notifications",
    permissions: ["notifications:read", "notifications:write"],
    any: true,
  },
];

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const WRITE_PERMISSION_OVERRIDES: Record<string, Permission> = {
  "/api/clients": "clients:write",
  "/api/appointments": "appointments:write",
  "/api/reminders/run": "reminders:write",
  "/api/supervisor/run": "supervisor:run",
  "/api/notifications": "notifications:write",
};

export function isPublicApiPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return (
    p.startsWith("/api/health") ||
    p.startsWith("/api/auth") ||
    p.startsWith("/api/webhooks")
  );
}

export function matchApiRule(pathname: string, method: string): ApiRule | undefined {
  const sorted = [...API_RBAC_RULES].sort((a, b) => b.prefix.length - a.prefix.length);
  return sorted.find((r) => pathname.startsWith(r.prefix));
}

export function apiRbacAllowed(
  role: RoleType,
  pathname: string,
  method: string
): boolean {
  if (isPublicApiPath(pathname)) return true;

  const rule = matchApiRule(pathname, method);
  if (!rule) return true;

  if (WRITE_METHODS.has(method.toUpperCase())) {
    for (const [prefix, perm] of Object.entries(WRITE_PERMISSION_OVERRIDES)) {
      if (pathname.startsWith(prefix)) {
        return hasPermission(role, perm);
      }
    }
  }

  if (rule.any) {
    return hasAnyPermission(role, rule.permissions);
  }
  return rule.permissions.every((p) => hasPermission(role, p));
}
