import { RoleType } from "@prisma/client";
import { createAuditLog } from "./audit";
import { prisma } from "./prisma";

export const STAFF_OVERRIDE_DEFAULTS = {
  staffTask: true,
  staffIntervention: true,
  appointmentOnStaffWrite: true,
} as const;

export type StaffOverrideActor = {
  userId: string;
  name: string;
  role: RoleType;
  reason?: string;
};

export function applyStaffOverride(explicit?: boolean): boolean {
  return explicit ?? STAFF_OVERRIDE_DEFAULTS.appointmentOnStaffWrite;
}

export function staffOverrideOwnershipFields(actor: StaffOverrideActor) {
  const at = new Date();
  return {
    staffOverride: true,
    staffOverrideByUserId: actor.userId,
    staffOverrideByName: actor.name,
    staffOverrideReason: actor.reason,
    staffOverrideAt: at,
  };
}

/** Records ownership row + STAFF_OVERRIDE audit — staff actions trump AI automation. */
export async function recordStaffOverride(input: {
  actor: StaffOverrideActor;
  targetType: string;
  targetId: string;
  clientId?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  await prisma.staffOverride.create({
    data: {
      actorUserId: input.actor.userId,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.actor.reason,
    },
  });

  await createAuditLog({
    action: "STAFF_OVERRIDE",
    entityType: input.targetType,
    entityId: input.targetId,
    targetType: input.targetType,
    targetId: input.targetId,
    userId: input.actor.userId,
    actorUserId: input.actor.userId,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    clientId: input.clientId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: { reason: input.actor.reason },
  });
}

export function actorFromSession(user: {
  id: string;
  name: string;
  role: RoleType;
}): StaffOverrideActor {
  return {
    userId: user.id,
    name: user.name,
    role: user.role,
  };
}
