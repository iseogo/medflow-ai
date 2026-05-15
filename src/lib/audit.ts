import { AuditAction, Prisma, RoleType } from "@prisma/client";
import { prisma } from "./prisma";

export type AuditLogInput = {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  targetType?: string;
  targetId?: string;
  userId?: string;
  actorUserId?: string;
  actorName?: string;
  actorRole?: RoleType;
  clientId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
};

async function resolveActor(input: AuditLogInput) {
  const actorUserId = input.actorUserId ?? input.userId;
  if (!actorUserId) {
    return {
      actorUserId: undefined,
      actorName: input.actorName,
      actorRole: input.actorRole,
    };
  }
  if (input.actorName && input.actorRole) {
    return { actorUserId, actorName: input.actorName, actorRole: input.actorRole };
  }
  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    include: { role: true },
  });
  if (!user) {
    return {
      actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
    };
  }
  return {
    actorUserId,
    actorName: input.actorName ?? `${user.firstName} ${user.lastName}`,
    actorRole: input.actorRole ?? user.role.type,
  };
}

export async function createAuditLog(input: AuditLogInput) {
  const actor = await resolveActor(input);
  const targetType = input.targetType ?? input.entityType;
  const targetId = input.targetId ?? input.entityId;

  return prisma.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      targetType,
      targetId,
      userId: actor.actorUserId ?? input.userId,
      actorUserId: actor.actorUserId,
      actorName: actor.actorName,
      actorRole: actor.actorRole,
      clientId: input.clientId,
      metadata: input.metadata ?? undefined,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}
