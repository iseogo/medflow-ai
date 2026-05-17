import { WorkflowHealthStatus } from "@prisma/client";
import { sanitizeMetadataForAudit } from "@/lib/security/phi-safe-log";
import { ALERTING_RULES } from "@/lib/supervisor/rules";
import { prisma } from "@/lib/prisma";

export type WorkflowHealthFinding = {
  workflowKey: string;
  status: WorkflowHealthStatus;
  message: string;
  clientId?: string;
  appointmentId?: string;
  agentActionId?: string;
};

export const workflowHealthService = {
  async recordEvent(input: WorkflowHealthFinding) {
    return prisma.workflowHealthEvent.create({
      data: {
        workflowKey: input.workflowKey,
        status: input.status,
        message: input.message,
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        agentActionId: input.agentActionId,
        metadata: sanitizeMetadataForAudit({
          recordedBy: "supervisor",
        }),
      },
    });
  },

  async scanStuckProposals(): Promise<WorkflowHealthFinding[]> {
    const threshold = new Date();
    threshold.setHours(threshold.getHours() - ALERTING_RULES.stuckProposalHours);

    const stuck = await prisma.agentAction.findMany({
      where: {
        proposalStatus: "PENDING_APPROVAL",
        createdAt: { lt: threshold },
      },
      take: 50,
      select: {
        id: true,
        clientId: true,
        appointmentId: true,
        actionType: true,
        agentType: true,
        createdAt: true,
      },
    });

    const findings: WorkflowHealthFinding[] = [];
    for (const p of stuck) {
      findings.push({
        workflowKey: `agent-proposal:${p.id}`,
        status: "STUCK",
        message: `Proposal ${p.actionType} pending since ${p.createdAt.toISOString()}`,
        clientId: p.clientId,
        appointmentId: p.appointmentId ?? undefined,
        agentActionId: p.id,
      });
      await this.recordEvent(findings[findings.length - 1]!);
    }
    return findings;
  },

  async scanReminderHealth(): Promise<WorkflowHealthFinding[]> {
    const since = new Date();
    since.setDate(since.getDate() - ALERTING_RULES.scanLookbackDays);

    const failed = await prisma.reminderLog.findMany({
      where: {
        outcome: { in: ["FAILED", "ESCALATED"] },
        createdAt: { gte: since },
      },
      take: 30,
      include: { appointment: { select: { id: true, clientId: true } } },
    });

    const findings: WorkflowHealthFinding[] = [];
    for (const r of failed) {
      findings.push({
        workflowKey: `reminder:${r.appointmentId}:${r.reminderOffset}`,
        status: r.outcome === "FAILED" ? "FAILED" : "DEGRADED",
        message: `Reminder ${r.reminderOffset} outcome ${r.outcome}`,
        clientId: r.clientId,
        appointmentId: r.appointmentId,
      });
    }
    return findings;
  },

  async latestByWorkflow(workflowKey: string) {
    return prisma.workflowHealthEvent.findFirst({
      where: { workflowKey },
      orderBy: { recordedAt: "desc" },
    });
  },
};
