import { createAuditLog } from "@/lib/audit";
import { sanitizeMetadataForAudit } from "@/lib/security/phi-safe-log";
import { prisma } from "@/lib/prisma";
import { adminAlertService } from "@/services/admin-alert.service";
import { notifyStaff } from "@/lib/notifications/notification-bridge";
import { workflowHealthService } from "@/services/workflow-health.service";
import {
  STUCK_COMMUNICATION_HOURS,
  STUCK_PROPOSAL_HOURS,
  STUCK_REMINDER_GRACE_HOURS,
} from "./constants";

export type StuckFinding = {
  workflowKey: string;
  title: string;
  message: string;
  clientId?: string;
  appointmentId?: string;
  agentActionId?: string;
};

export const stuckWorkflowDetector = {
  async scanAll(): Promise<StuckFinding[]> {
    const findings: StuckFinding[] = [];

    const stuckProposals = await workflowHealthService.scanStuckProposals();
    for (const p of stuckProposals) {
      findings.push({
        workflowKey: p.workflowKey,
        title: "Stuck orchestrator proposal",
        message: p.message,
        clientId: p.clientId,
        appointmentId: p.appointmentId,
        agentActionId: p.agentActionId,
      });
    }

    const proposalThreshold = new Date();
    proposalThreshold.setHours(proposalThreshold.getHours() - STUCK_PROPOSAL_HOURS);

    const pendingOld = await prisma.agentAction.findMany({
      where: {
        proposalStatus: "PENDING_APPROVAL",
        createdAt: { lt: proposalThreshold },
      },
      take: 20,
      select: {
        id: true,
        clientId: true,
        appointmentId: true,
        actionType: true,
        createdAt: true,
      },
    });

    for (const p of pendingOld) {
      const key = `stuck-proposal:${p.id}`;
      if (findings.some((f) => f.workflowKey === key)) continue;
      findings.push({
        workflowKey: key,
        title: "Pending AI action stuck",
        message: `Proposal ${p.actionType} pending since ${p.createdAt.toISOString()}`,
        clientId: p.clientId,
        appointmentId: p.appointmentId ?? undefined,
        agentActionId: p.id,
      });
    }

    const reminderGrace = new Date();
    reminderGrace.setHours(reminderGrace.getHours() - STUCK_REMINDER_GRACE_HOURS);

    const stuckReminders = await prisma.reminderLog.findMany({
      where: {
        outcome: { in: ["NO_RESPONSE", "FAILED"] },
        createdAt: { lt: reminderGrace },
      },
      take: 15,
      include: { appointment: { select: { clientId: true } } },
    });

    for (const r of stuckReminders) {
      findings.push({
        workflowKey: `stuck-reminder:${r.id}`,
        title: "Reminder stuck without resolution",
        message: `Reminder ${r.reminderOffset} outcome ${r.outcome} — follow up required`,
        clientId: r.clientId,
        appointmentId: r.appointmentId,
      });
    }

    const commThreshold = new Date();
    commThreshold.setHours(commThreshold.getHours() - STUCK_COMMUNICATION_HOURS);

    const pendingCalls = await prisma.callLog.findMany({
      where: { status: "PENDING", createdAt: { lt: commThreshold } },
      take: 10,
    });
    for (const c of pendingCalls) {
      findings.push({
        workflowKey: `stuck-call:${c.id}`,
        title: "Outbound/inbound call log stuck",
        message: `Call ${c.purpose} pending without webhook completion`,
        clientId: c.clientId,
        appointmentId: c.appointmentId ?? undefined,
      });
    }

    const pendingSms = await prisma.smsLog.findMany({
      where: { status: "PENDING", createdAt: { lt: commThreshold } },
      take: 10,
    });
    for (const s of pendingSms) {
      findings.push({
        workflowKey: `stuck-sms:${s.id}`,
        title: "SMS log stuck pending",
        message: `SMS ${s.purpose} has no delivery outcome`,
        clientId: s.clientId,
        appointmentId: s.appointmentId ?? undefined,
      });
    }

    return findings;
  },

  async escalateFindings(
    findings: StuckFinding[],
    actorUserId?: string
  ): Promise<number> {
    let escalated = 0;
    for (const f of findings) {
      const alert = await adminAlertService.create({
        severity: "WARNING",
        code: "STUCK_WORKFLOW",
        title: f.title,
        message: f.message,
        clientId: f.clientId,
        appointmentId: f.appointmentId,
        agentActionId: f.agentActionId,
        actorUserId,
        metadata: { workflowKey: f.workflowKey, reliabilityGuard: true },
      });

      await notifyStaff({
        channel: "supervisor",
        source: "WORKFLOW_STUCK",
        sourceKey: f.workflowKey,
        title: f.title,
        message: f.message,
        clientId: f.clientId,
        appointmentId: f.appointmentId,
        agentActionId: f.agentActionId,
        adminAlertId: alert.id,
        workflowKey: f.workflowKey,
        createdByUserId: actorUserId,
      }).catch(() => undefined);

      await createAuditLog({
        action: "CREATE",
        entityType: "ReliabilityGuard",
        entityId: f.workflowKey,
        userId: actorUserId,
        clientId: f.clientId,
        metadata: sanitizeMetadataForAudit({
          guard: "stuck_workflow",
          title: f.title,
        }),
      });

      escalated += 1;
    }
    return escalated;
  },
};
