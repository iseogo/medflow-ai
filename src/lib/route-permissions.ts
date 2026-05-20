import { RoleType } from "@prisma/client";
import { hasAnyPermission, Permission } from "./rbac";

type RouteRule = {
  prefix: string;
  permissions: Permission[];
  exact?: boolean;
};

/** Dashboard routes → required permissions (any match grants access). */
export const DASHBOARD_ROUTE_RULES: RouteRule[] = [
  { prefix: "/dashboard", permissions: ["settings:read"], exact: true },
  { prefix: "/dashboard/command-center", permissions: ["command-center:read"] },
  { prefix: "/dashboard/staff", permissions: ["users:manage"] },
  { prefix: "/dashboard/clients", permissions: ["clients:read", "clients:read-limited"] },
  { prefix: "/dashboard/appointments", permissions: ["appointments:read"] },
  { prefix: "/dashboard/walk-ins", permissions: ["walkins:read"] },
  { prefix: "/dashboard/check-ins", permissions: ["checkins:read"] },
  { prefix: "/dashboard/waiting-room", permissions: ["checkins:read", "walkins:read"] },
  {
    prefix: "/dashboard/staff-intervention",
    permissions: ["staff-intervention:read", "walkins:read"],
  },
  { prefix: "/dashboard/medical-records", permissions: ["medical-records:read"] },
  { prefix: "/dashboard/billing", permissions: ["billing:read"] },
  { prefix: "/dashboard/clinical-notes", permissions: ["clinical-notes:read"] },
  { prefix: "/dashboard/inbound-calls", permissions: ["communications:read"] },
  { prefix: "/dashboard/calls", permissions: ["communications:read"] },
  { prefix: "/dashboard/outbound-calls", permissions: ["communications:read"] },
  { prefix: "/dashboard/sms", permissions: ["communications:read"] },
  { prefix: "/dashboard/emails", permissions: ["communications:read"] },
  { prefix: "/dashboard/agent-coordination", permissions: ["orchestrator:read"] },
  { prefix: "/dashboard/supervisor", permissions: ["supervisor:read"] },
  { prefix: "/dashboard/reminders", permissions: ["reminders:read"] },
  { prefix: "/dashboard/notifications", permissions: ["notifications:read"] },
  { prefix: "/dashboard/audit-logs", permissions: ["audit:read"] },
  { prefix: "/dashboard/settings", permissions: ["settings:read"] },
  { prefix: "/dashboard/access-denied", permissions: ["settings:read"] },
];

export function canAccessDashboardRoute(role: RoleType, pathname: string): boolean {
  if (pathname === "/dashboard/access-denied") return true;

  const matches = DASHBOARD_ROUTE_RULES.filter((r) =>
    r.exact ? pathname === r.prefix : pathname.startsWith(r.prefix)
  ).sort((a, b) => b.prefix.length - a.prefix.length);

  const rule = matches[0];
  if (!rule) return false;
  return hasAnyPermission(role, rule.permissions);
}

export function listAccessibleNavHrefs(role: RoleType): string[] {
  return DASHBOARD_ROUTE_RULES.filter((r) => !r.exact && r.prefix !== "/dashboard/access-denied")
    .filter((r) => hasAnyPermission(role, r.permissions))
    .map((r) => r.prefix);
}
