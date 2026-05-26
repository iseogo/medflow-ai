import {
  AdminAlertSeverity,
  AgentType,
  CoordinationIncidentType,
  Prisma,
} from "@prisma/client";
import { getAgentDefinition, isActionAllowed } from "@/lib/agents/definitions";
import { sanitizeMetadataForAudit } from "@/lib/security/phi-safe-log";
import { ALERTING_RULES } from "@/lib/supervisor/rules";
import { prisma } from "@/lib/prisma";

export type CoordinationFinding = {
  incidentType: CoordinationIncidentType;
  severity: AdminAlertSeverity;
  title: string;
  description: string;
  clientId?: string;
  agentActionId?: string;
  appointmentId?: string;
  metadata?: Record<string, unknown>;
};

export const coordinationMonitorService = {
  async recordIncident(input: CoordinationFinding) {
    const since = new Date();
    since.setHours(since.getHours() - ALERTING_RULES.openAlertDedupHours);

    const existing = await prisma.coordinationIncident.findFirst({
      where: {
        incidentType: input.incidentType,
        resolved: false,
        clientId: input.clientId ?? null,
        agentActionId: input.agentActionId ?? null,
        createdAt: { gte: since },
      },
    });
    if (existing) return existing;

    return prisma.coordinationIncident.create({
      data: {
        incidentType: input.incidentType,
        severity: input.severity,
        title: input.title,
        description: input.description,
        clientId: input.clientId,
        agentActionId: input.agentActionId,
        appointmentId: input.appointmentId,
        metadata: sanitizeMetadataForAudit(input.metadata) as Prisma.InputJsonValue,
      },
    });
  },

  async checkAgentActionCompliance(): Promise<CoordinationFinding[]> {
    const since = new Date();
    since.setDate(since.getDate() - ALERTING_RULES.scanLookbackDays);

    const actions = await prisma.agentAction.findMany({
      where: {
        createdAt: { gte: since },
        agentType: { not: "MASTER_ORCHESTRATOR" },
      },
      take: 200,
      orderBy: { createdAt: "desc" },
    });

    const findings: CoordinationFinding[] = [];
    for (const a of actions) {
      if (a.agentType === "SUPERVISOR_AI") continue;
      if (!isActionAllowed(a.agentType, a.actionType)) {
        findings.push({
          incidentType: "AGENT_VIOLATION",
          severity: "CRITICAL",
          title: "Forbidden action for agent",
          description: `${a.agentType} proposed ${a.actionType}`,
          clientId: a.clientId,
          agentActionId: a.id,
          metadata: {
            allowed: getAgentDefinition(a.agentType).allowedActions,
          },
        });
      }

      if (a.isEmergency && !a.automationHalted && a.proposalStatus === "PENDING_APPROVAL") {
        findings.push({
          incidentType: "EMERGENCY_RULE_VIOLATION",
          severity: "CRITICAL",
          title: "Emergency proposal without automation halt",
          description: `Proposal ${a.id} flagged emergency but not halted`,
          clientId: a.clientId,
          agentActionId: a.id,
        });
      }

      if (
        a.proposalStatus === "EXECUTED" &&
        ["SEND_SMS", "SEND_EMAIL", "PLACE_CALL"].includes(a.actionType)
      ) {
        const missing =
          (a.actionType === "SEND_SMS" && !a.smsLogId) ||
          (a.actionType === "SEND_EMAIL" && !a.emailLogId) ||
          (a.actionType === "PLACE_CALL" && !a.callLogId);
        if (missing) {
          findings.push({
            incidentType: "ORCHESTRATOR_ANOMALY",
            severity: "CRITICAL",
            title: "Executed communication missing log FK",
            description: `${a.actionType} executed without communication log`,
            clientId: a.clientId,
            agentActionId: a.id,
          });
        }
      }

      if (a.proposalStatus === "EXECUTED" && a.actionType === "CREATE_STAFF_TASK") {
        const windowStart = new Date(a.createdAt.getTime() - 60_000);
        const taskExists = await prisma.staffTask.findFirst({
          where: {
            clientId: a.clientId,
            createdAt: { gte: windowStart },
          },
          select: { id: true },
        });
        if (!taskExists) {
          findings.push({
            incidentType: "ORCHESTRATOR_ANOMALY",
            severity: "WARNING",
            title: "CREATE_STAFF_TASK executed without resulting StaffTask",
            description: `AgentAction ${a.id} (CREATE_STAFF_TASK) is EXECUTED but no StaffTask found for client within 1 minute`,
            clientId: a.clientId,
            agentActionId: a.id,
          });
        }
      }
    }
    return findings;
  },

  async checkTimelineCoverage(): Promise<CoordinationFinding[]> {
    const apptTotal = await prisma.appointment.count();
    const timelineCount = await prisma.clientTimelineEvent.count({
      where: { eventType: "APPOINTMENT_CREATED" },
    });
    if (timelineCount < apptTotal) {
      return [
        {
          incidentType: "MISSING_TIMELINE",
          severity: "WARNING",
          title: "Appointment timeline gap",
          description: `${apptTotal - timelineCount} appointments missing APPOINTMENT_CREATED events`,
        },
      ];
    }
    return [];
  },

  async checkEscalationLoops(): Promise<CoordinationFinding[]> {
    const since = new Date();
    since.setHours(since.getHours() - ALERTING_RULES.escalationLoopWindowHours);

    const escalated = await prisma.agentAction.groupBy({
      by: ["clientId"],
      where: {
        proposalStatus: "ESCALATED",
        createdAt: { gte: since },
      },
      _count: true,
    });

    const findings: CoordinationFinding[] = [];
    for (const row of escalated) {
      if (row._count >= ALERTING_RULES.escalationLoopThreshold) {
        findings.push({
          incidentType: "ESCALATION_LOOP",
          severity: "CRITICAL",
          title: "Repeated escalation loop",
          description: `${row._count} escalations for client in ${ALERTING_RULES.escalationLoopWindowHours}h`,
          clientId: row.clientId,
          metadata: { count: row._count },
        });
      }
    }
    return findings;
  },

  async aggregateAgentMetrics(periodHours = 24) {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - periodHours * 3600_000);

    const grouped = await prisma.agentAction.groupBy({
      by: ["agentType", "proposalStatus"],
      where: {
        createdAt: { gte: periodStart, lte: periodEnd },
        agentType: { not: "SUPERVISOR_AI" },
      },
      _count: true,
    });

    const byAgent = new Map<
      string,
      {
        submitted: number;
        approved: number;
        rejected: number;
        escalated: number;
      }
    >();

    for (const row of grouped) {
      const cur = byAgent.get(row.agentType) ?? {
        submitted: 0,
        approved: 0,
        rejected: 0,
        escalated: 0,
      };
      cur.submitted += row._count;
      if (row.proposalStatus === "APPROVED" || row.proposalStatus === "EXECUTED") {
        cur.approved += row._count;
      }
      if (row.proposalStatus === "REJECTED") cur.rejected += row._count;
      if (row.proposalStatus === "ESCALATED") cur.escalated += row._count;
      byAgent.set(row.agentType, cur);
    }

    for (const [agentTypeKey, stats] of Array.from(byAgent.entries())) {
      const agentType = agentTypeKey as AgentType;
      await prisma.agentPerformanceMetric.upsert({
        where: {
          agentType_periodStart_periodEnd: {
            agentType,
            periodStart,
            periodEnd,
          },
        },
        create: {
          agentType,
          periodStart,
          periodEnd,
          proposalsSubmitted: stats.submitted,
          proposalsApproved: stats.approved,
          proposalsRejected: stats.rejected,
          proposalsEscalated: stats.escalated,
        },
        update: {
          proposalsSubmitted: stats.submitted,
          proposalsApproved: stats.approved,
          proposalsRejected: stats.rejected,
          proposalsEscalated: stats.escalated,
        },
      });
    }

    return byAgent.size;
  },
};
