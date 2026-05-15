import { AuditAction, Prisma, TimelineEventType } from "@prisma/client";
import { createAuditLog } from "./audit";
import { notifyMasterOrchestratorPhysicalEvent } from "./orchestrator-notify";
import {
  actorFromSession,
  recordStaffOverride,
  staffOverrideOwnershipFields,
  StaffOverrideActor,
} from "./staff-override";
import { addTimelineEvent } from "./timeline";

export type PhysicalEventContext = {
  actor: StaffOverrideActor;
  clientId: string;
  ipAddress?: string;
  userAgent?: string;
};

export async function recordPhysicalEvent(input: {
  ctx: PhysicalEventContext;
  timelineType: TimelineEventType;
  timelineTitle: string;
  timelineDescription?: string;
  timelineMetadata?: Record<string, unknown>;
  auditAction: AuditAction;
  entityType: string;
  entityId: string;
  orchestratorEventType: string;
  orchestratorDescription: string;
  orchestratorMetadata?: Record<string, unknown>;
  appointmentId?: string | null;
  overrideReason?: string;
}) {
  const { ctx } = input;

  await addTimelineEvent({
    clientId: ctx.clientId,
    eventType: input.timelineType,
    title: input.timelineTitle,
    description: input.timelineDescription,
    metadata: input.timelineMetadata as Prisma.InputJsonValue | undefined,
    actorUserId: ctx.actor.userId,
  });

  await createAuditLog({
    action: input.auditAction,
    entityType: input.entityType,
    entityId: input.entityId,
    targetType: input.entityType,
    targetId: input.entityId,
    userId: ctx.actor.userId,
    clientId: ctx.clientId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: input.timelineMetadata as Prisma.InputJsonValue | undefined,
  });

  await recordStaffOverride({
    actor: { ...ctx.actor, reason: input.overrideReason ?? input.timelineTitle },
    targetType: input.entityType,
    targetId: input.entityId,
    clientId: ctx.clientId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  await notifyMasterOrchestratorPhysicalEvent({
    eventType: input.orchestratorEventType,
    clientId: ctx.clientId,
    appointmentId: input.appointmentId,
    description: input.orchestratorDescription,
    metadata: {
      entityType: input.entityType,
      entityId: input.entityId,
      ...input.orchestratorMetadata,
    },
    actor: ctx.actor,
  });
}

export { actorFromSession, staffOverrideOwnershipFields };
