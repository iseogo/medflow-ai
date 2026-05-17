import { NotificationCategory, NotificationPriority } from "@prisma/client";

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function comparePriority(a: NotificationPriority, b: NotificationPriority) {
  return PRIORITY_RANK[b] - PRIORITY_RANK[a];
}

export function isCriticalPriority(priority: NotificationPriority) {
  return priority === "CRITICAL";
}

export function requiresStaffIntervention(input: {
  category: NotificationCategory;
  priority: NotificationPriority;
}) {
  return input.category === "EMERGENCY" || input.priority === "CRITICAL";
}

export function requiresAuditLog(priority: NotificationPriority) {
  return priority === "CRITICAL" || priority === "HIGH";
}

export function mergePriority(
  a: NotificationPriority,
  b: NotificationPriority
): NotificationPriority {
  return comparePriority(a, b) >= 0 ? a : b;
}
