import { RoleType } from "@prisma/client";
import { hasPermission, Permission } from "@/lib/rbac";
import type { LiveDisplayMode, LiveSectionKey } from "./live-types";

const SECTION_PERMISSIONS: Record<LiveSectionKey, Permission[]> = {
  criticalAlerts: ["notifications:read"],
  waitingRoom: ["checkins:read", "walkins:read"],
  todayAppointments: ["appointments:read"],
  walkIns: ["walkins:read"],
  checkIns: ["checkins:read"],
  staffTasks: ["staff-tasks:read"],
  providerCapacity: ["appointments:read"],
  reminderFailures: ["reminders:read"],
  aiSupervisor: ["orchestrator:read", "supervisor:read"],
  workflowBottlenecks: ["supervisor:read", "orchestrator:read"],
  liveActivityFeed: ["notifications:read", "settings:read"],
};

const MODE_SECTIONS: Record<LiveDisplayMode, LiveSectionKey[]> = {
  executive: [
    "criticalAlerts",
    "workflowBottlenecks",
    "providerCapacity",
    "staffTasks",
    "liveActivityFeed",
    "waitingRoom",
    "todayAppointments",
  ],
  clinical: [
    "criticalAlerts",
    "waitingRoom",
    "providerCapacity",
    "aiSupervisor",
    "workflowBottlenecks",
    "liveActivityFeed",
    "todayAppointments",
  ],
  front_desk: [
    "criticalAlerts",
    "checkIns",
    "walkIns",
    "todayAppointments",
    "waitingRoom",
    "reminderFailures",
    "liveActivityFeed",
  ],
  manager: [
    "criticalAlerts",
    "staffTasks",
    "workflowBottlenecks",
    "providerCapacity",
    "liveActivityFeed",
    "waitingRoom",
  ],
};

export function canViewLiveSection(role: RoleType, section: LiveSectionKey): boolean {
  if (role === "ADMIN") return true;
  return SECTION_PERMISSIONS[section].some((p) => hasPermission(role, p));
}

export function sectionsForDisplayMode(
  role: RoleType,
  mode: LiveDisplayMode
): LiveSectionKey[] {
  return MODE_SECTIONS[mode].filter((s) => canViewLiveSection(role, s));
}

export function allLiveSectionKeys(): LiveSectionKey[] {
  return Object.keys(SECTION_PERMISSIONS) as LiveSectionKey[];
}
