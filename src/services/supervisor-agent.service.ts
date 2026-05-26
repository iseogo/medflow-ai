/**
 * Supervisor AI Agent — observe / monitor / audit only (Phase 10).
 * NO authority over Master Orchestrator. NO control of other AI agents.
 * Master Orchestrator remains the central decision authority.
 */
import { CommunicationChannel } from "@prisma/client";
import { createAuditLog } from "@/lib/audit";
import { validateAgentProposalContent } from "@/lib/security/ai-safety";
import { sanitizeMetadataForAudit } from "@/lib/security/phi-safe-log";
import { isMockModeForced } from "@/lib/integrations/env";
import {
  ORCHESTRATOR_CORRECTION_REQUEST,
  SUPERVISOR_RESPONSE_WORKFLOW,
} from "@/lib/supervisor/governance";
import { ESCALATION_RULES } from "@/lib/supervisor/rules";
import { addTimelineEvent } from "@/lib/timeline";
import { prisma } from "@/lib/prisma";
import { adminAlertService } from "./admin-alert.service";
import { notifyStaff } from "@/lib/notifications/notification-bridge";
import { notificationService } from "./notification.service";
import { coordinationMonitorService } from "./coordination-monitor.service";
import { masterOrchestratorService } from "./master-orchestrator.service";
import { reliabilityService } from "./reliability.service";
import { workflowHealthService } from "./workflow-health.service";

export type SupervisorScanResult = {
  scanId: string;
  findingsCount: number;
  alertsCreated: number;
  incidentsCreated: number;
  recommendationsCreated: number;
  staffInterventionsCreated: number;
  orchestratorReviewRequestsSubmitted: number;
  mockMode: boolean;
};

async function createRecommendation(input: {
  code: string;
  title: string;
  description: string;
  correctiveAction?: string;
  clientId?: string;
  agentActionId?: string;
  incidentId?: string;
}) {
  return prisma.supervisorRecommendation.create({
    data: {
      code: input.code,
      title: input.title,
      description: input.description,
      correctiveAction: input.correctiveAction,
      clientId: input.clientId,
      agentActionId: input.agentActionId,
      metadata: sanitizeMetadataForAudit({ incidentId: input.incidentId }),
    },
  });
}

/**
 * Submits a correction *request* to Master Orchestrator — pending approval only.
 * Supervisor cannot approve, reject, or execute proposals.
 */
async function requestOrchestratorCorrection(input: {
  clientId: string;
  appointmentId?: string;
  title: string;
  description: string;
  recommendationId: string;
  incidentType: string;
  actorUserId?: string;
}) {
  return masterOrchestratorService.submitProposal(
    {
      agentType: "SUPERVISOR_AI",
      clientId: input.clientId,
      appointmentId: input.appointmentId,
      channel: CommunicationChannel.CALL,
      purpose: ORCHESTRATOR_CORRECTION_REQUEST.purpose,
      actionType: ORCHESTRATOR_CORRECTION_REQUEST.actionType,
      description: `Supervisor requests orchestrator/staff review: ${input.title}`,
      proposedPayload: {
        kind: ORCHESTRATOR_CORRECTION_REQUEST.payloadKind,
        recommendationId: input.recommendationId,
        incidentType: input.incidentType,
        note: input.description,
        requiresApproval: true,
        suggestedStaffActions: ["review_agent_proposal", "staff_review_queue"],
      },
    },
    { userId: input.actorUserId }
  );
}

export const supervisorAgentService = {
  /**
   * Coordination scan — observe only. Response workflow per SUPERVISOR_RESPONSE_WORKFLOW.
   */
  async runScan(actorUserId?: string): Promise<SupervisorScanResult> {
    const scanStarted = new Date();
    let alertsCreated = 0;
    let incidentsCreated = 0;
    let recommendationsCreated = 0;
    let staffInterventionsCreated = 0;
    let orchestratorReviewRequestsSubmitted = 0;

    const coordinationFindings = [
      ...(await coordinationMonitorService.checkAgentActionCompliance()),
      ...(await coordinationMonitorService.checkTimelineCoverage()),
      ...(await coordinationMonitorService.checkEscalationLoops()),
    ];

    const stuckWorkflows = await workflowHealthService.scanStuckProposals();
    const reminderIssues = await workflowHealthService.scanReminderHealth();

    for (const f of coordinationFindings) {
      const incident = await coordinationMonitorService.recordIncident(f);
      incidentsCreated += 1;

      // 3. AdminAlert (+ AuditLog via adminAlertService)
      const alert = await adminAlertService.create({
        severity: f.severity,
        code: f.incidentType,
        title: f.title,
        message: f.description,
        clientId: f.clientId,
        agentActionId: f.agentActionId,
        appointmentId: f.appointmentId,
        metadata: f.metadata,
        actorUserId,
      });
      alertsCreated += 1;

      await notificationService.emit({
        source:
          f.incidentType === "DUPLICATE_ACTION"
            ? "DUPLICATE_ACTION_PREVENTED"
            : f.incidentType === "STAFF_OVERRIDE_VIOLATION"
              ? "AUDIT_SECURITY_WARNING"
              : "SUPERVISOR_WARNING",
        sourceKey: `supervisor-warning:${incident.id}`,
        title: f.title,
        message: f.description,
        clientId: f.clientId,
        appointmentId: f.appointmentId,
        agentActionId: f.agentActionId,
        adminAlertId: alert.id,
        workflowKey: f.incidentType,
        createdByUserId: actorUserId,
        actorChannel: "supervisor",
        priority: f.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
      });

      // 1. SupervisorRecommendation
      const rec = await createRecommendation({
        code: `REC_${f.incidentType}`,
        title: `Review: ${f.title}`,
        description: f.description,
        correctiveAction:
          "Pending Master Orchestrator or authorized staff approval — Supervisor cannot execute",
        clientId: f.clientId,
        agentActionId: f.agentActionId,
        incidentId: incident.id,
      });
      recommendationsCreated += 1;

      // 4. StaffIntervention (serious risk only — does not override orchestrator)
      if (
        ESCALATION_RULES.criticalCreatesIntervention &&
        ESCALATION_RULES.severeIncidentTypes.has(f.incidentType) &&
        f.clientId
      ) {
        const open = await prisma.staffIntervention.findFirst({
          where: {
            clientId: f.clientId,
            status: { in: ["URGENT", "STAFF_REVIEW_REQUIRED", "AI_ESCALATED"] },
            resolvedAt: null,
          },
        });
        if (!open) {
          const intervention = await prisma.staffIntervention.create({
            data: {
              clientId: f.clientId,
              status: f.severity === "CRITICAL" ? "URGENT" : "STAFF_REVIEW_REQUIRED",
              title: `Supervisor alert: ${f.title}`,
              description: f.description,
              staffOverride: true,
              aiContext: sanitizeMetadataForAudit({
                incidentType: f.incidentType,
                supervisorScan: true,
                orchestratorAuthority: "Master Orchestrator retains decision authority",
              }),
            },
          });
          staffInterventionsCreated += 1;

          // Audit the supervisor-created intervention so it is traceable
          await createAuditLog({
            action: "CREATE",
            entityType: "StaffIntervention",
            entityId: intervention.id,
            clientId: f.clientId,
            userId: actorUserId,
            metadata: sanitizeMetadataForAudit({
              source: "supervisor_scan",
              incidentType: f.incidentType,
              severity: f.severity,
              agentActionId: f.agentActionId,
            }),
          });

          await addTimelineEvent({
            clientId: f.clientId,
            eventType: "SUPERVISOR_ALERT",
            title: f.title,
            description: f.description,
            metadata: { incidentType: f.incidentType, advisoryOnly: true },
            actorUserId,
          });
        }
      }

      // 5. Correction request to Master Orchestrator (pending approval — not execution)
      if (ESCALATION_RULES.requestOrchestratorReviewOnFinding && f.clientId) {
        try {
          await requestOrchestratorCorrection({
            clientId: f.clientId,
            appointmentId: f.appointmentId,
            title: f.title,
            description: f.description,
            recommendationId: rec.id,
            incidentType: f.incidentType,
            actorUserId,
          });
          orchestratorReviewRequestsSubmitted += 1;
        } catch (correctionErr) {
          // DuplicateProposalError and AiAutomationBlockedError are expected when the
          // same finding already has a pending correction request — not an error.
          // Any other error is logged so it doesn't silently swallow real failures.
          const msg = correctionErr instanceof Error ? correctionErr.message : String(correctionErr);
          if (
            !msg.includes("Duplicate agent proposal") &&
            !msg.includes("Automation is halted") &&
            !msg.includes("Staff override active")
          ) {
            console.error("[supervisor] Unexpected correction request error:", msg);
          }
        }
      }
    }

    for (const w of stuckWorkflows) {
      const alert = await adminAlertService.create({
        severity: "WARNING",
        code: "STUCK_WORKFLOW",
        title: "Stuck workflow",
        message: w.message,
        clientId: w.clientId,
        agentActionId: w.agentActionId,
        appointmentId: w.appointmentId,
        actorUserId,
      });
      alertsCreated += 1;
      await notifyStaff({
        channel: "supervisor",
        source: "WORKFLOW_STUCK",
        sourceKey: w.workflowKey,
        title: "Workflow stuck",
        message: w.message,
        clientId: w.clientId,
        appointmentId: w.appointmentId,
        agentActionId: w.agentActionId,
        adminAlertId: alert.id,
        workflowKey: w.workflowKey,
        createdByUserId: actorUserId,
      });
    }

    for (const r of reminderIssues) {
      await adminAlertService.create({
        severity: r.status === "FAILED" ? "WARNING" : "INFO",
        code: "REMINDER_FAILURE",
        title: "Reminder health issue",
        message: r.message,
        clientId: r.clientId,
        appointmentId: r.appointmentId,
        actorUserId,
      });
      alertsCreated += 1;
    }

    const recentProposals = await prisma.agentAction.findMany({
      where: {
        description: { not: null },
        createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
      },
      take: 50,
      select: { id: true, clientId: true, description: true },
    });
    for (const p of recentProposals) {
      if (!p.description) continue;
      const safety = validateAgentProposalContent({ description: p.description });
      if (!safety.ok) {
        await adminAlertService.create({
          severity: "CRITICAL",
          code: "AI_SAFETY_CONTENT",
          title: "AI safety violation in proposal",
          message: safety.message,
          clientId: p.clientId,
          agentActionId: p.id,
          actorUserId,
        });
        alertsCreated += 1;
      }
    }

    await coordinationMonitorService.aggregateAgentMetrics(24);

    const reliabilityScan = await reliabilityService.runStuckWorkflowScan(actorUserId);

    const audit = await createAuditLog({
      action: "SUPERVISOR_SCAN",
      entityType: "SupervisorScan",
      entityId: scanStarted.toISOString(),
      userId: actorUserId,
      metadata: sanitizeMetadataForAudit({
        workflow: SUPERVISOR_RESPONSE_WORKFLOW,
        findingsCount:
          coordinationFindings.length + stuckWorkflows.length + reminderIssues.length,
        alertsCreated,
        incidentsCreated,
        recommendationsCreated,
        staffInterventionsCreated,
        orchestratorReviewRequestsSubmitted,
        reliabilityStuckEscalated: reliabilityScan.escalated,
        reliabilityFindings: reliabilityScan.findingsCount,
        mockMode: isMockModeForced(),
        orchestratorAuthority: "Master Orchestrator — Supervisor has no authority over orchestrator",
      }),
    });

    return {
      scanId: audit.id,
      findingsCount:
        coordinationFindings.length + stuckWorkflows.length + reminderIssues.length,
      alertsCreated,
      incidentsCreated,
      recommendationsCreated,
      staffInterventionsCreated,
      orchestratorReviewRequestsSubmitted,
      mockMode: isMockModeForced(),
    };
  },

  async getDashboardSummary() {
    const [alertSummary, openIncidents, pendingRecs, metrics] = await Promise.all([
      adminAlertService.summary(),
      prisma.coordinationIncident.count({ where: { resolved: false } }),
      prisma.supervisorRecommendation.count({ where: { status: "PENDING" } }),
      prisma.agentPerformanceMetric.findMany({
        orderBy: { periodStart: "desc" },
        take: 10,
      }),
    ]);

    const stuckCount = await prisma.agentAction.count({
      where: { proposalStatus: "PENDING_APPROVAL" },
    });

    const coordinationScore = Math.max(
      0,
      100 - alertSummary.open * 5 - openIncidents * 3 - pendingRecs * 2
    );

    return {
      alertSummary,
      openIncidents,
      pendingRecommendations: pendingRecs,
      pendingProposals: stuckCount,
      agentMetrics: metrics,
      coordinationScore: Math.min(100, coordinationScore),
      mockMode: isMockModeForced(),
      governance: {
        supervisorHasOrchestratorAuthority: false,
        masterOrchestratorCentralAuthority: true,
        staffOverridePriority: true,
        webhookSecurityExpected: true,
      },
    };
  },

  /** Observe-only — recommendation + audit; no direct staff notification. */
  async observeMissedInboundCall(input: {
    clientId: string;
    callLogId: string;
    phoneKey: string;
    status: string;
    recentCount1h: number;
    escalateToManager: boolean;
  }) {
    const rec = await createRecommendation({
      code: "MISSED_INBOUND_CALL",
      title: "Missed inbound call — callback recommended",
      description: `Call log ${input.callLogId} ended as ${input.status}. ${input.recentCount1h} missed attempt(s) from this number in the last hour.`,
      correctiveAction:
        "Front desk should call the patient back and document the outcome in the chart.",
      clientId: input.clientId,
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "SupervisorObservation",
      entityId: rec.id,
      clientId: input.clientId,
      metadata: sanitizeMetadataForAudit({
        kind: "missed_inbound_call",
        callLogId: input.callLogId,
        phoneKey: input.phoneKey,
        recentCount1h: input.recentCount1h,
        escalateToManager: input.escalateToManager,
      }),
    });

    if (input.escalateToManager) {
      await adminAlertService.create({
        code: "MISSED_INBOUND_CALL_REPEAT",
        title: "Repeated missed inbound calls",
        message: `${input.recentCount1h} missed call(s) from the same number within 1 hour — manager review suggested.`,
        severity: "WARNING",
        clientId: input.clientId,
      });
    }

    return rec;
  },
};
