import { RoleType } from "@prisma/client";
import { hasPermission, Permission } from "@/lib/rbac";

export type SectionKey =
  | "criticalActionCenter"
  | "liveClinicOperations"
  | "waitingRoomIntelligence"
  | "staffProductivity"
  | "appointmentSchedulingHealth"
  | "communicationsCommand"
  | "aiSupervisorCenter"
  | "workflowBottleneck"
  | "securityCompliance"
  | "integrationHealth";

const SECTION_PERMISSIONS: Record<SectionKey, Permission[]> = {
  criticalActionCenter: ["notifications:read"],
  liveClinicOperations: [
    "walkins:read",
    "checkins:read",
    "staff-intervention:read",
    "appointments:read",
  ],
  waitingRoomIntelligence: ["checkins:read", "walkins:read"],
  staffProductivity: ["staff-tasks:read", "staff-intervention:read", "appointments:read"],
  appointmentSchedulingHealth: ["appointments:read", "reminders:read"],
  communicationsCommand: ["communications:read", "reminders:read"],
  aiSupervisorCenter: ["orchestrator:read", "supervisor:read"],
  workflowBottleneck: ["supervisor:read", "orchestrator:read", "staff-intervention:read"],
  securityCompliance: ["audit:read"],
  integrationHealth: ["settings:read"],
};

export function canViewCommandCenterSection(
  role: RoleType,
  section: SectionKey
): boolean {
  if (role === "ADMIN") return true;
  return hasAnyForSection(role, section);
}

function hasAnyForSection(role: RoleType, section: SectionKey) {
  const perms = SECTION_PERMISSIONS[section];
  return perms.some((p) => hasPermission(role, p));
}
