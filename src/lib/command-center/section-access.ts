import { RoleType } from "@prisma/client";
import { hasPermission, Permission } from "@/lib/rbac";

export type SectionKey =
  | "criticalAlerts"
  | "liveOperations"
  | "aiSupervisor"
  | "communications"
  | "appointmentsWaitingRoom"
  | "workflowHealth"
  | "securityAudit"
  | "integrationStatus";

const SECTION_PERMISSIONS: Record<SectionKey, Permission[]> = {
  criticalAlerts: ["notifications:read"],
  liveOperations: [
    "walkins:read",
    "checkins:read",
    "staff-intervention:read",
  ],
  aiSupervisor: ["orchestrator:read", "supervisor:read"],
  communications: ["communications:read", "reminders:read"],
  appointmentsWaitingRoom: ["appointments:read", "checkins:read", "walkins:read"],
  workflowHealth: ["supervisor:read", "orchestrator:read"],
  securityAudit: ["audit:read"],
  integrationStatus: ["settings:read"],
};

export function canViewCommandCenterSection(
  role: RoleType,
  section: SectionKey
): boolean {
  if (role === "ADMIN") return true;
  if (role === "MANAGER" && section !== "integrationStatus") {
    return hasAnyForSection(role, section);
  }
  return hasAnyForSection(role, section);
}

function hasAnyForSection(role: RoleType, section: SectionKey) {
  const perms = SECTION_PERMISSIONS[section];
  return perms.some((p) => hasPermission(role, p));
}
