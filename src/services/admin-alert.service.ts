import {
  AdminAlertSeverity,
  AdminAlertStatus,
  Prisma,
} from "@prisma/client";
import { createAuditLog } from "@/lib/audit";
import { sanitizeMetadataForAudit } from "@/lib/security/phi-safe-log";
import { ALERTING_RULES } from "@/lib/supervisor/rules";
import { prisma } from "@/lib/prisma";

export type CreateAdminAlertInput = {
  severity: AdminAlertSeverity;
  code: string;
  title: string;
  message: string;
  clientId?: string;
  agentActionId?: string;
  appointmentId?: string;
  metadata?: Record<string, unknown>;
  actorUserId?: string;
};

export const adminAlertService = {
  async create(input: CreateAdminAlertInput) {
    const since = new Date();
    since.setHours(since.getHours() - ALERTING_RULES.openAlertDedupHours);

    const existing = await prisma.adminAlert.findFirst({
      where: {
        code: input.code,
        status: "OPEN",
        clientId: input.clientId ?? null,
        agentActionId: input.agentActionId ?? null,
        createdAt: { gte: since },
      },
    });
    if (existing) return existing;

    const alert = await prisma.adminAlert.create({
      data: {
        severity: input.severity,
        code: input.code,
        title: input.title,
        message: input.message,
        clientId: input.clientId,
        agentActionId: input.agentActionId,
        appointmentId: input.appointmentId,
        metadata: sanitizeMetadataForAudit(input.metadata) as Prisma.InputJsonValue,
      },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "AdminAlert",
      entityId: alert.id,
      userId: input.actorUserId,
      clientId: input.clientId,
      metadata: sanitizeMetadataForAudit({
        code: input.code,
        severity: input.severity,
        supervisor: true,
      }),
    });

    return alert;
  },

  async listOpen(limit = 50) {
    return prisma.adminAlert.findMany({
      where: { status: "OPEN" },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
  },

  async acknowledge(id: string, userId: string) {
    const alert = await prisma.adminAlert.update({
      where: { id },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedById: userId,
        acknowledgedAt: new Date(),
      },
    });
    await createAuditLog({
      action: "UPDATE",
      entityType: "AdminAlert",
      entityId: id,
      userId,
      metadata: { status: "ACKNOWLEDGED" },
    });
    return alert;
  },

  async resolve(id: string, userId?: string) {
    const alert = await prisma.adminAlert.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        acknowledgedById: userId,
        acknowledgedAt: new Date(),
      },
    });
    await createAuditLog({
      action: "UPDATE",
      entityType: "AdminAlert",
      entityId: id,
      userId,
      metadata: { status: "RESOLVED" },
    });
    return alert;
  },

  async summary() {
    const grouped = await prisma.adminAlert.groupBy({
      by: ["severity", "status"],
      _count: true,
    });
    const open = await prisma.adminAlert.count({ where: { status: "OPEN" } });
    return { open, grouped };
  },
};
