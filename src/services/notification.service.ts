import {
  NotificationCategory,
  NotificationPriority,
  NotificationSource,
  NotificationStatus,
  Prisma,
  RoleType,
} from "@prisma/client";
import { createAuditLog } from "@/lib/audit";
import {
  canRoleViewNotification,
  primaryRoleForSource,
  targetRolesForSource,
} from "@/lib/notifications/notification-routing.service";
import {
  isCriticalPriority,
  requiresAuditLog,
  requiresStaffIntervention,
} from "@/lib/notifications/notification-priority.service";
import { NOTIFICATION_SOURCE_DEFAULTS } from "@/lib/notifications/notification-sources";
import { prisma } from "@/lib/prisma";
import { sanitizeMetadataForAudit } from "@/lib/security/phi-safe-log";
import { addTimelineEvent } from "@/lib/timeline";
import { applyStaffOverride } from "@/lib/staff-override";

const DEDUP_HOURS = 24;

export type NotificationActorChannel =
  | "orchestrator"
  | "supervisor"
  | "staff"
  | "system";

export type EmitStaffNotificationInput = {
  source: NotificationSource;
  sourceKey: string;
  title: string;
  message: string;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  recommendedNextAction?: string;
  clientId?: string;
  appointmentId?: string;
  staffTaskId?: string;
  agentActionId?: string;
  adminAlertId?: string;
  workflowKey?: string;
  assignedRole?: RoleType;
  assignedUserId?: string;
  metadata?: Record<string, unknown>;
  createdByUserId?: string;
  actorChannel: NotificationActorChannel;
};

const ALLOWED_EMIT_CHANNELS: NotificationActorChannel[] = [
  "orchestrator",
  "supervisor",
  "staff",
  "system",
];

function assertEmitChannel(channel: NotificationActorChannel) {
  if (!ALLOWED_EMIT_CHANNELS.includes(channel)) {
    throw new Error("Invalid notification emit channel");
  }
}

export const notificationService = {
  async emit(input: EmitStaffNotificationInput) {
    assertEmitChannel(input.actorChannel);

    const defaults = NOTIFICATION_SOURCE_DEFAULTS[input.source];
    const category = input.category ?? defaults.category;
    const priority = input.priority ?? defaults.priority;
    const recommendedNextAction =
      input.recommendedNextAction ?? defaults.recommendedNextAction;
    const assignedRole = input.assignedRole ?? primaryRoleForSource(input.source);

    const since = new Date();
    since.setHours(since.getHours() - DEDUP_HOURS);

    const existing = await prisma.staffNotification.findFirst({
      where: {
        sourceKey: input.sourceKey,
        status: { notIn: ["RESOLVED", "DISMISSED"] },
        createdAt: { gte: since },
      },
    });
    if (existing) return existing;

    let staffInterventionId: string | undefined;

    if (
      requiresStaffIntervention({ category, priority }) ||
      input.source === "EMERGENCY_RISK_DETECTED"
    ) {
      const open = input.clientId
        ? await prisma.staffIntervention.findFirst({
            where: {
              clientId: input.clientId,
              status: { in: ["URGENT", "STAFF_REVIEW_REQUIRED", "AI_ESCALATED"] },
              resolvedAt: null,
            },
          })
        : null;

      if (!open) {
        const intervention = await prisma.staffIntervention.create({
          data: {
            clientId: input.clientId,
            status: category === "EMERGENCY" ? "URGENT" : "STAFF_REVIEW_REQUIRED",
            title: input.title,
            description: input.message,
            staffOverride: true,
            aiContext: sanitizeMetadataForAudit({
              notificationSource: input.source,
              sourceKey: input.sourceKey,
            }),
          },
        });
        staffInterventionId = intervention.id;
      } else {
        staffInterventionId = open.id;
      }
    }

    if (
      input.source === "STAFF_OVERRIDE_ACTIVATED" &&
      input.appointmentId
    ) {
      await prisma.appointment.update({
        where: { id: input.appointmentId },
        data: {
          reminderAutomationPaused: true,
          staffOverride: applyStaffOverride(true),
        },
      });
    }

    const notification = await prisma.staffNotification.create({
      data: {
        title: input.title,
        message: input.message,
        category,
        priority,
        source: input.source,
        sourceKey: input.sourceKey,
        recommendedNextAction,
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        staffTaskId: input.staffTaskId,
        agentActionId: input.agentActionId,
        adminAlertId: input.adminAlertId,
        workflowKey: input.workflowKey,
        assignedRole,
        assignedUserId: input.assignedUserId,
        staffInterventionId,
        metadata: sanitizeMetadataForAudit({
          ...input.metadata,
          targetRoles: targetRolesForSource(input.source),
          actorChannel: input.actorChannel,
          mockDelivery: true,
        }) as Prisma.InputJsonValue,
        createdByUserId: input.createdByUserId,
      },
    });

    if (requiresAuditLog(priority) || isCriticalPriority(priority)) {
      await createAuditLog({
        action: "CREATE",
        entityType: "StaffNotification",
        entityId: notification.id,
        userId: input.createdByUserId,
        clientId: input.clientId,
        metadata: sanitizeMetadataForAudit({
          source: input.source,
          category,
          priority,
          actorChannel: input.actorChannel,
        }),
      });
    }

    if (defaults.patientFacingTimeline && input.clientId) {
      await addTimelineEvent({
        clientId: input.clientId,
        eventType: "STAFF_NOTIFICATION",
        title: input.title,
        description: input.message,
        metadata: sanitizeMetadataForAudit({
          notificationId: notification.id,
          source: input.source,
          staffFacing: true,
        }),
        actorUserId: input.createdByUserId,
      });
    }

    return notification;
  },

  async listForUser(role: RoleType, userId: string, limit = 50) {
    const rows = await prisma.staffNotification.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: limit * 3,
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        assignedUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return rows
      .filter((n) =>
        canRoleViewNotification(role, {
          source: n.source,
          category: n.category,
          assignedRole: n.assignedRole,
          assignedUserId: n.assignedUserId,
          userId,
        })
      )
      .slice(0, limit);
  },

  async unreadCount(role: RoleType, userId: string) {
    const open = await prisma.staffNotification.findMany({
      where: { status: "UNREAD" },
      select: {
        id: true,
        source: true,
        category: true,
        assignedRole: true,
        assignedUserId: true,
      },
    });
    return open.filter((n) =>
      canRoleViewNotification(role, {
        source: n.source,
        category: n.category,
        assignedRole: n.assignedRole,
        assignedUserId: n.assignedUserId,
        userId,
      })
    ).length;
  },

  async transition(
    id: string,
    action: "read" | "acknowledge" | "resolve" | "escalate" | "dismiss" | "in_progress",
    userId: string,
    role: RoleType
  ) {
    const current = await prisma.staffNotification.findUnique({ where: { id } });
    if (!current) return null;

    if (
      !canRoleViewNotification(role, {
        source: current.source,
        category: current.category,
        assignedRole: current.assignedRole,
        assignedUserId: current.assignedUserId,
        userId,
      }) &&
      role !== "ADMIN"
    ) {
      throw new Error("Forbidden");
    }

    const now = new Date();
    const data: Prisma.StaffNotificationUpdateInput = {};

    let status: NotificationStatus = current.status;

    switch (action) {
      case "read":
        status = "READ";
        data.readAt = current.readAt ?? now;
        break;
      case "acknowledge":
        status = "ACKNOWLEDGED";
        data.acknowledgedAt = now;
        data.readAt = current.readAt ?? now;
        break;
      case "in_progress":
        status = "IN_PROGRESS";
        data.readAt = current.readAt ?? now;
        break;
      case "resolve":
        status = "RESOLVED";
        data.resolvedAt = now;
        break;
      case "dismiss":
        status = "DISMISSED";
        data.dismissedAt = now;
        break;
      case "escalate":
        status = "ESCALATED";
        data.escalatedAt = now;
        break;
    }

    data.status = status;

    const updated = await prisma.staffNotification.update({
      where: { id },
      data,
    });

    await createAuditLog({
      action: "STATUS_CHANGE",
      entityType: "StaffNotification",
      entityId: id,
      userId,
      clientId: current.clientId ?? undefined,
      metadata: sanitizeMetadataForAudit({
        action,
        status,
        source: current.source,
      }),
    });

    return updated;
  },
};
