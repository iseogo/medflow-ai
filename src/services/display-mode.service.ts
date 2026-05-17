import { RoleType } from "@prisma/client";
import type { LiveDisplayMode } from "@/lib/command-center/live-types";

const MODES: LiveDisplayMode[] = ["executive", "clinical", "front_desk", "manager"];

export function isLiveDisplayMode(value: string | null | undefined): value is LiveDisplayMode {
  return MODES.includes(value as LiveDisplayMode);
}

export function canSelectDisplayMode(role: RoleType): boolean {
  return role === "ADMIN";
}

export function defaultDisplayModeForRole(role: RoleType): LiveDisplayMode {
  switch (role) {
    case "ADMIN":
      return "executive";
    case "MANAGER":
      return "manager";
    case "CLINICAL_STAFF":
      return "clinical";
    case "FRONT_DESK_STAFF":
      return "front_desk";
    case "READ_ONLY":
      return "executive";
    default:
      return "manager";
  }
}

export function resolveDisplayMode(
  role: RoleType,
  requested?: string | null
): LiveDisplayMode {
  if (canSelectDisplayMode(role) && isLiveDisplayMode(requested)) {
    return requested;
  }
  return defaultDisplayModeForRole(role);
}

export function listSelectableModes(role: RoleType): LiveDisplayMode[] {
  if (canSelectDisplayMode(role)) return [...MODES];
  return [defaultDisplayModeForRole(role)];
}
