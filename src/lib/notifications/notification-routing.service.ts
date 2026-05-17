import {
  NotificationCategory,
  NotificationSource,
  RoleType,
} from "@prisma/client";
import { NOTIFICATION_SOURCE_DEFAULTS } from "./notification-sources";

const MANAGER_CATEGORIES = new Set<NotificationCategory>([
  "URGENT",
  "WARNING",
  "SYSTEM",
  "SECURITY",
  "AI_REVIEW",
  "STAFF_OVERRIDE",
  "ACTION_REQUIRED",
]);

const READ_ONLY_CATEGORIES = new Set<NotificationCategory>(["INFO", "SUCCESS"]);

export function primaryRoleForSource(source: NotificationSource): RoleType {
  const defaults = NOTIFICATION_SOURCE_DEFAULTS[source];
  return defaults.roles[0] ?? "FRONT_DESK_STAFF";
}

export function targetRolesForSource(source: NotificationSource): RoleType[] {
  return NOTIFICATION_SOURCE_DEFAULTS[source].roles;
}

export function canRoleViewNotification(
  role: RoleType,
  input: {
    source: NotificationSource;
    category: NotificationCategory;
    assignedRole: RoleType | null;
    assignedUserId: string | null;
    userId: string;
  }
): boolean {
  if (role === "ADMIN") return true;

  if (input.assignedUserId && input.assignedUserId === input.userId) return true;

  if (input.assignedRole && input.assignedRole === role) return true;

  const targets = targetRolesForSource(input.source);
  if (!targets.includes(role)) {
    if (role === "MANAGER" && MANAGER_CATEGORIES.has(input.category)) return true;
    if (role === "READ_ONLY" && READ_ONLY_CATEGORIES.has(input.category)) return true;
    return false;
  }

  if (role === "READ_ONLY") {
    return READ_ONLY_CATEGORIES.has(input.category);
  }

  return true;
}

export function roleFilterForList(role: RoleType, userId: string) {
  if (role === "ADMIN") return {};

  if (role === "MANAGER") {
    return {
      OR: [
        { assignedRole: role },
        { category: { in: Array.from(MANAGER_CATEGORIES) } },
        { source: { in: managerSources() } },
      ],
    };
  }

  if (role === "READ_ONLY") {
    return {
      category: { in: Array.from(READ_ONLY_CATEGORIES) },
    };
  }

  return {
    OR: [
      { assignedUserId: userId },
      { assignedRole: role },
      { source: { in: sourcesForRole(role) } },
    ],
  };
}

function sourcesForRole(role: RoleType): NotificationSource[] {
  return (Object.keys(NOTIFICATION_SOURCE_DEFAULTS) as NotificationSource[]).filter(
    (s) => NOTIFICATION_SOURCE_DEFAULTS[s].roles.includes(role)
  );
}

function managerSources(): NotificationSource[] {
  return sourcesForRole("MANAGER");
}
