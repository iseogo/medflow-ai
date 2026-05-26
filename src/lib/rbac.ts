import { RoleType } from "@prisma/client";

export type Permission =
  | "clients:read"
  | "clients:write"
  | "clients:read-limited"
  | "appointments:read"
  | "appointments:write"
  | "walkins:read"
  | "walkins:write"
  | "checkins:read"
  | "checkins:write"
  | "staff-intervention:read"
  | "staff-intervention:write"
  | "staff-tasks:read"
  | "staff-tasks:write"
  | "billing:read"
  | "billing:write"
  | "medical-records:read"
  | "medical-records:write"
  | "clinical-notes:read"
  | "clinical-notes:write"
  | "users:manage"
  | "reports:read"
  | "audit:read"
  | "settings:read"
  | "settings:write"
  | "communications:read"
  | "communications:write"
  | "orchestrator:read"
  | "orchestrator:write"
  | "orchestrator:review"
  | "reminders:read"
  | "reminders:write"
  | "supervisor:read"
  | "supervisor:run"
  | "notifications:read"
  | "notifications:write"
  | "command-center:read";

export const ROLE_PERMISSIONS: Record<RoleType, Permission[]> = {
  ADMIN: [
    "clients:read",
    "clients:write",
    "appointments:read",
    "appointments:write",
    "walkins:read",
    "walkins:write",
    "checkins:read",
    "checkins:write",
    "staff-intervention:read",
    "staff-intervention:write",
    "staff-tasks:read",
    "staff-tasks:write",
    "billing:read",
    "billing:write",
    "medical-records:read",
    "medical-records:write",
    "clinical-notes:read",
    "clinical-notes:write",
    "users:manage",
    "reports:read",
    "audit:read",
    "settings:read",
    "settings:write",
    "communications:read",
    "communications:write",
    "orchestrator:read",
    "orchestrator:write",
    "orchestrator:review",
    "reminders:read",
    "reminders:write",
    "supervisor:read",
    "supervisor:run",
    "notifications:read",
    "notifications:write",
    "command-center:read",
  ],
  MANAGER: [
    "clients:read",
    "clients:write",
    "appointments:read",
    "appointments:write",
    "walkins:read",
    "walkins:write",
    "checkins:read",
    "checkins:write",
    "staff-intervention:read",
    "staff-intervention:write",
    "staff-tasks:read",
    "staff-tasks:write",
    "users:manage",
    "reports:read",
    "audit:read",
    "settings:read",
    "communications:read",
    "orchestrator:read",
    "reminders:read",
    "reminders:write",
    "supervisor:read",
    "supervisor:run",
    "notifications:read",
    "notifications:write",
    "command-center:read",
  ],
  FRONT_DESK_STAFF: [
    "clients:read",
    "clients:write",
    "appointments:read",
    "appointments:write",
    "walkins:read",
    "walkins:write",
    "checkins:read",
    "checkins:write",
    "staff-intervention:read",
    "staff-intervention:write",
    "settings:read",
    "communications:read",
    "orchestrator:read",
    "reminders:read",
    "reminders:write",
    "notifications:read",
    "notifications:write",
    "command-center:read",
  ],
  BILLING_STAFF: [
    "clients:read-limited",
    "billing:read",
    "billing:write",
    "staff-tasks:read",
    "staff-tasks:write",
    "settings:read",
    "notifications:read",
    "notifications:write",
    "command-center:read",
  ],
  MEDICAL_RECORDS_STAFF: [
    "clients:read-limited",
    "medical-records:read",
    "medical-records:write",
    "settings:read",
    "notifications:read",
    "notifications:write",
    "command-center:read",
  ],
  CLINICAL_STAFF: [
    "clients:read",
    "appointments:read",
    "appointments:write",
    "checkins:read",
    "checkins:write",
    "clinical-notes:read",
    "clinical-notes:write",
    "staff-intervention:read",
    "settings:read",
    "orchestrator:read",
    "reminders:read",
    "notifications:read",
    "notifications:write",
    "command-center:read",
  ],
  // audit:read is intentionally excluded — audit logs contain IP addresses, actor roles,
  // and operational metadata. Access is restricted to ADMIN and MANAGER roles (HIPAA).
  READ_ONLY: [
    "clients:read",
    "appointments:read",
    "walkins:read",
    "checkins:read",
    "staff-intervention:read",
    "staff-tasks:read",
    "billing:read",
    "medical-records:read",
    "clinical-notes:read",
    "reports:read",
    "settings:read",
    "communications:read",
    "orchestrator:read",
    "reminders:read",
    "notifications:read",
    "command-center:read",
  ],
};

export function hasPermission(role: RoleType, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(role: RoleType, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function canWriteClients(role: RoleType) {
  return hasPermission(role, "clients:write");
}

export function canReadClients(role: RoleType) {
  return hasPermission(role, "clients:read") || hasPermission(role, "clients:read-limited");
}

export function canWriteAppointments(role: RoleType) {
  return hasPermission(role, "appointments:write");
}

export function canManageUsers(role: RoleType) {
  return hasPermission(role, "users:manage");
}

export function canViewAudit(role: RoleType) {
  return hasPermission(role, "audit:read");
}

export function isReadOnlyRole(role: RoleType) {
  return role === "READ_ONLY";
}
