import {
  AgentProposalStatus,
  AgentType,
  CommunicationChannel,
  Prisma,
  StaffInterventionStatus,
  StaffTaskPriority,
} from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";
import { getAgentDefinition, isActionAllowed } from "@/lib/agents/definitions";
import { createAuditLog } from "@/lib/audit";
import { detectEmergencyLanguage } from "@/lib/emergency-detect";
import {
  emergencyEscalationGuardrails,
  validateAgentProposalContent,
} from "@/lib/security/ai-safety";
import {
  AiAutomationBlockedError,
  assertAiAutomationAllowed,
} from "@/lib/ai-automation-guard";
import { assertNoConflictingPendingActions } from "@/lib/reliability/ai-action-conflict";
import { logDuplicateProposalPrevented } from "@/lib/reliability/proposal-guard";
import { assertNoDuplicateProposal, DuplicateProposalError } from "@/lib/proposal-dedup";
import { prisma } from "@/lib/prisma";
import { notifyStaff } from "@/lib/notifications/notification-bridge";
import { addTimelineEvent } from "@/lib/timeline";
import { orchestratorService } from "./orchestrator.service";

export type MasterOrchestratorContext = {
  userId?: string;
  staffOverride?: boolean;
};

export type SubmitProposalInput = {
  agentType: AgentType;
  clientId: string;
  appointmentId?: string | null;
  channel: CommunicationChannel;
  purpose: string;
  actionType: string;
  description?: string;
  proposedPayload?: Record<string, unknown>;
  /** Raw text scanned for emergency language */
  contentForEmergencyScan?: string;
};

export type ReviewDecision = "APPROVE" | "REJECT" | "ESCALATE";

const EXECUTABLE_ACTIONS = new Set([
  "SEND_SMS",
  "SEND_EMAIL",
  "PLACE_CALL",
  "CREATE_STAFF_TASK",
  "CREATE_STAFF_INTERVENTION",
  "LOG_NOTE",
]);

/**
 * Fixed-template SMS replies from the SMS Assistant. Safe to auto-approve:
 * the message text comes from code-owned templates, never from an LLM.
 * LLM-drafted replies (sms_ai_drafted_reply) are NOT listed and stay
 * PENDING_APPROVAL until staff reviews them.
 */
const SMS_ASSISTANT_AUTO_REPLY_PURPOSES = new Set([
  "sms_auto_reply_confirm",
  "sms_auto_reply_reschedule",
  "sms_auto_reply_cancel",
  "sms_auto_reply_handoff",
  "sms_auto_reply_fallback",
]);

const SMS_ASSISTANT_AUTO_TASK_PURPOSES = new Set([
  "sms_reschedule_request",
  "sms_cancel_request",
  "sms_follow_up",
]);

export class MasterOrchestratorError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "MasterOrchestratorError";
  }
}

async function validateClientAndAppointment(
  clientId: string,
  appointmentId?: string | null
) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new MasterOrchestratorError("Client not found", "CLIENT_NOT_FOUND");
  if (appointmentId) {
    const appt = await prisma.appointment.findFirst({
      where: { id: appointmentId, clientId },
    });
    if (!appt) {
      throw new MasterOrchestratorError(
        "Appointment not found for client",
        "APPOINTMENT_NOT_FOUND"
      );
    }
  }
}

async function recordProposalTimeline(
  clientId: string,
  title: string,
  description: string | undefined,
  metadata: Prisma.InputJsonValue,
  userId?: string
) {
  await addTimelineEvent({
    clientId,
    eventType: "AGENT_PROPOSAL_CREATED",
    title,
    description,
    metadata,
    actorUserId: userId,
  });
}

export const masterOrchestratorService = {
  /**
   * Single entry point for all AI agents. No agent may bypass this method.
   */
  async submitProposal(input: SubmitProposalInput, ctx: MasterOrchestratorContext = {}) {
    if (input.agentType === "MASTER_ORCHESTRATOR") {
      throw new MasterOrchestratorError(
        "Master Orchestrator cannot submit proposals; use reviewProposal",
        "INVALID_AGENT"
      );
    }

    await validateClientAndAppointment(input.clientId, input.appointmentId);

    try {
      await assertAiAutomationAllowed(input.clientId);
    } catch (e) {
      if (e instanceof AiAutomationBlockedError) {
        throw new MasterOrchestratorError(e.message, e.code);
      }
      throw e;
    }

    const safety = validateAgentProposalContent({
      description: input.description,
      contentForEmergencyScan: input.contentForEmergencyScan,
      proposedPayload: input.proposedPayload,
    });
    if (!safety.ok) {
      if (safety.escalate) {
        await notifyStaff({
          channel: "orchestrator",
          source: "AI_LOW_CONFIDENCE",
          sourceKey: `ai-low-confidence:${input.clientId}:${input.purpose}:${Date.now()}`,
          title: "AI proposal needs review",
          message: safety.message,
          clientId: input.clientId,
          appointmentId: input.appointmentId ?? undefined,
          createdByUserId: ctx.userId,
        });
        return this.handleEmergency({
          clientId: input.clientId,
          appointmentId: input.appointmentId,
          agentType: input.agentType,
          actionType: input.actionType,
          purpose: input.purpose,
          channel: input.channel,
          description: safety.message,
          matchedTerms: ["ai_safety_guardrail"],
          proposedPayload: input.proposedPayload,
        });
      }
      throw new MasterOrchestratorError(safety.message, safety.code);
    }

    const emergency = input.contentForEmergencyScan
      ? detectEmergencyLanguage(input.contentForEmergencyScan)
      : { isEmergency: false, matchedTerms: [] as string[] };

    if (emergency.isEmergency) {
      return this.handleEmergency({
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        agentType: input.agentType,
        actionType: input.actionType,
        purpose: input.purpose,
        channel: input.channel,
        description: input.description,
        matchedTerms: emergency.matchedTerms,
        proposedPayload: input.proposedPayload,
      });
    }

    if (!isActionAllowed(input.agentType, input.actionType)) {
      throw new MasterOrchestratorError(
        `Action ${input.actionType} is forbidden for ${input.agentType}`,
        "FORBIDDEN_ACTION"
      );
    }

    await assertNoConflictingPendingActions({
      clientId: input.clientId,
      appointmentId: input.appointmentId,
      channel: input.channel,
      purpose: input.purpose,
      agentType: input.agentType,
      actionType: input.actionType,
    });

    try {
      await assertNoDuplicateProposal({
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        channel: input.channel,
        purpose: input.purpose,
        agentType: input.agentType,
        actionType: input.actionType,
      });
    } catch (e) {
      if (e instanceof DuplicateProposalError) {
        await logDuplicateProposalPrevented({
          key: {
            clientId: input.clientId,
            appointmentId: input.appointmentId,
            channel: input.channel,
            purpose: input.purpose,
            agentType: input.agentType,
            actionType: input.actionType,
          },
          existingId: e.existingId,
          userId: ctx.userId,
        });
        await notifyStaff({
          channel: "orchestrator",
          source: "DUPLICATE_ACTION_PREVENTED",
          sourceKey: `duplicate-proposal:${e.existingId}`,
          title: "Duplicate AI proposal prevented",
          message:
            "A pending proposal already exists for this client, channel, and action.",
          clientId: input.clientId,
          appointmentId: input.appointmentId ?? undefined,
          agentActionId: e.existingId,
          createdByUserId: ctx.userId,
        });
      }
      throw e;
    }

    const defn = getAgentDefinition(input.agentType);

    const proposal = await prisma.agentAction.create({
      data: {
        clientId: input.clientId,
        appointmentId: input.appointmentId ?? undefined,
        agentType: input.agentType,
        agentName: defn.displayName,
        proposalStatus: "PENDING_APPROVAL",
        purpose: input.purpose,
        channel: input.channel,
        actionType: input.actionType,
        description: input.description,
        proposedPayload: (input.proposedPayload ?? undefined) as
          | PrismaTypes.InputJsonValue
          | undefined,
        initiatedById: ctx.userId,
      },
      include: {
        client: { select: { firstName: true, lastName: true } },
        appointment: true,
      },
    });

    await recordProposalTimeline(
      input.clientId,
      `AI proposal: ${input.actionType}`,
      `Agent: ${defn.displayName} — pending Master Orchestrator review`,
      {
        proposalId: proposal.id,
        agentType: input.agentType,
        actionType: input.actionType,
      },
      ctx.userId
    );

    await createAuditLog({
      action: "CREATE",
      entityType: "AgentAction",
      entityId: proposal.id,
      userId: ctx.userId,
      clientId: input.clientId,
      metadata: {
        phase: "proposal",
        agentType: input.agentType,
        actionType: input.actionType,
        proposalStatus: "PENDING_APPROVAL",
      },
    });

    const autoDecision = await this.masterOrchestratorAutoReview(proposal.id);

    return autoDecision;
  },

  /** Rule-based Master Orchestrator review (stub — no live LLM). */
  async masterOrchestratorAutoReview(proposalId: string) {
    const proposal = await prisma.agentAction.findUnique({
      where: { id: proposalId },
    });
    if (!proposal || proposal.proposalStatus !== "PENDING_APPROVAL") {
      return proposal;
    }

    if (!isActionAllowed(proposal.agentType, proposal.actionType)) {
      return this.applyReview(proposalId, "REJECT", {
        orchestratorNotes: "Auto-rejected: action not in agent allowed list",
        reviewerLabel: "Master Orchestrator Agent",
      });
    }

    if (proposal.actionType === "LOG_NOTE") {
      return this.applyReview(proposalId, "APPROVE", {
        orchestratorNotes: "Auto-approved: low-risk log note",
        reviewerLabel: "Master Orchestrator Agent",
        autoExecute: true,
      });
    }

    if (
      proposal.actionType === "CREATE_STAFF_TASK" &&
      proposal.purpose === "missed_inbound_call_follow_up"
    ) {
      return this.applyReview(proposalId, "APPROVE", {
        orchestratorNotes: "Auto-approved: missed inbound call follow-up task",
        reviewerLabel: "Master Orchestrator Agent",
        autoExecute: true,
      });
    }

    if (proposal.actionType === "ESCALATE_TO_STAFF") {
      return this.applyReview(proposalId, "ESCALATE", {
        orchestratorNotes: "Auto-escalated: agent requested staff handoff",
        reviewerLabel: "Master Orchestrator Agent",
      });
    }

    if (
      proposal.agentType === "SMS_ASSISTANT_AI" &&
      proposal.actionType === "SEND_SMS" &&
      SMS_ASSISTANT_AUTO_REPLY_PURPOSES.has(proposal.purpose)
    ) {
      return this.applyReview(proposalId, "APPROVE", {
        orchestratorNotes: "Auto-approved: fixed-template SMS reply",
        reviewerLabel: "Master Orchestrator Agent",
        autoExecute: true,
      });
    }

    if (
      proposal.agentType === "SMS_ASSISTANT_AI" &&
      proposal.actionType === "CREATE_STAFF_TASK" &&
      SMS_ASSISTANT_AUTO_TASK_PURPOSES.has(proposal.purpose)
    ) {
      return this.applyReview(proposalId, "APPROVE", {
        orchestratorNotes: "Auto-approved: SMS conversation staff task",
        reviewerLabel: "Master Orchestrator Agent",
        autoExecute: true,
      });
    }

    return prisma.agentAction.findUnique({ where: { id: proposalId } });
  },

  /** Staff or system review — staffOverride always wins. */
  async reviewProposal(
    proposalId: string,
    decision: ReviewDecision,
    ctx: MasterOrchestratorContext & { orchestratorNotes?: string; autoExecute?: boolean }
  ) {
    return this.applyReview(proposalId, decision, {
      orchestratorNotes: ctx.orchestratorNotes,
      userId: ctx.userId,
      staffOverride: ctx.staffOverride ?? !!ctx.userId,
      autoExecute: ctx.autoExecute ?? decision === "APPROVE",
    });
  },

  async applyReview(
    proposalId: string,
    decision: ReviewDecision,
    options: {
      orchestratorNotes?: string;
      userId?: string;
      staffOverride?: boolean;
      autoExecute?: boolean;
      reviewerLabel?: string;
    } = {}
  ) {
    const proposal = await prisma.agentAction.findUnique({
      where: { id: proposalId },
    });
    if (!proposal) {
      throw new MasterOrchestratorError("Proposal not found", "NOT_FOUND");
    }
    if (
      proposal.proposalStatus !== "PENDING_APPROVAL" &&
      proposal.proposalStatus !== "ESCALATED"
    ) {
      throw new MasterOrchestratorError(
        `Cannot review proposal in status ${proposal.proposalStatus}`,
        "INVALID_STATUS"
      );
    }

    const statusMap: Record<ReviewDecision, AgentProposalStatus> = {
      APPROVE: "APPROVED",
      REJECT: "REJECTED",
      ESCALATE: "ESCALATED",
    };

    let overrideOwnership: Record<string, unknown> = {};
    if (options.staffOverride && options.userId) {
      const reviewer = await prisma.user.findUnique({
        where: { id: options.userId },
        select: { firstName: true, lastName: true },
      });
      if (reviewer) {
        overrideOwnership = {
          staffOverride: true,
          staffOverrideByUserId: options.userId,
          staffOverrideByName: `${reviewer.firstName} ${reviewer.lastName}`,
          staffOverrideReason: options.orchestratorNotes ?? `Staff ${decision}`,
          staffOverrideAt: new Date(),
        };
      }
    }

    const updated = await prisma.agentAction.update({
      where: { id: proposalId },
      data: {
        proposalStatus: statusMap[decision],
        orchestratorNotes:
          options.orchestratorNotes ??
          `${options.reviewerLabel ?? "Reviewer"}: ${decision}`,
        reviewedById: options.userId,
        reviewedAt: new Date(),
        staffOverride: options.staffOverride ?? false,
        ...overrideOwnership,
      },
      include: {
        client: { select: { firstName: true, lastName: true } },
        appointment: true,
      },
    });

    const timelineType =
      decision === "APPROVE"
        ? "AGENT_PROPOSAL_APPROVED"
        : decision === "REJECT"
          ? "AGENT_PROPOSAL_REJECTED"
          : "AGENT_PROPOSAL_ESCALATED";

    await addTimelineEvent({
      clientId: updated.clientId,
      eventType: timelineType,
      title: `Proposal ${decision.toLowerCase()}: ${updated.actionType}`,
      description: updated.orchestratorNotes ?? undefined,
      metadata: { proposalId, staffOverride: updated.staffOverride },
      actorUserId: options.userId,
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "AgentAction",
      entityId: proposalId,
      userId: options.userId,
      clientId: updated.clientId,
      metadata: {
        decision,
        proposalStatus: updated.proposalStatus,
        staffOverride: updated.staffOverride,
      },
    });

    if (decision === "APPROVE" && options.autoExecute) {
      return this.executeApprovedProposal(proposalId, {
        userId: options.userId,
        staffOverride: options.staffOverride,
      });
    }

    if (decision === "ESCALATE") {
      const intervention = await prisma.staffIntervention.create({
        data: {
          clientId: updated.clientId,
          status: "STAFF_REVIEW_REQUIRED",
          title: `AI escalation: ${updated.actionType}`,
          description: updated.description,
          assignedToId: options.userId,
          staffOverride: true,
        },
      });
      await notifyStaff({
        channel: "orchestrator",
        source: "ORCHESTRATOR_ESCALATION",
        sourceKey: `orchestrator-escalation:${proposalId}`,
        title: `AI escalation: ${updated.actionType}`,
        message: updated.description ?? "AI proposal escalated for staff review.",
        clientId: updated.clientId,
        appointmentId: updated.appointmentId ?? undefined,
        agentActionId: proposalId,
        workflowKey: intervention.id,
        createdByUserId: options.userId,
        assignedUserId: options.userId,
      });
    }

    return updated;
  },

  /** Execute approved proposal via communication orchestrator (stubs) or staff models. */
  async executeApprovedProposal(
    proposalId: string,
    ctx: MasterOrchestratorContext = {}
  ) {
    const proposal = await prisma.agentAction.findUnique({
      where: { id: proposalId },
    });
    if (!proposal) {
      throw new MasterOrchestratorError("Proposal not found", "NOT_FOUND");
    }
    if (proposal.proposalStatus !== "APPROVED") {
      throw new MasterOrchestratorError(
        "Only approved proposals can be executed",
        "NOT_APPROVED"
      );
    }
    if (proposal.automationHalted) {
      throw new MasterOrchestratorError(
        "Automation halted for this case",
        "AUTOMATION_HALTED"
      );
    }

    const payload = (proposal.proposedPayload ?? {}) as Record<string, unknown>;
    const execCtx = {
      userId: ctx.userId,
      approvedProposalId: proposalId,
      source: "master_orchestrator" as const,
    };

    if (!EXECUTABLE_ACTIONS.has(proposal.actionType)) {
      const executed = await prisma.agentAction.update({
        where: { id: proposalId },
        data: { proposalStatus: "EXECUTED", executedAt: new Date() },
      });
      return executed;
    }

    switch (proposal.actionType) {
      case "SEND_SMS": {
        const sms = await orchestratorService.sendSms(
          {
            clientId: proposal.clientId,
            appointmentId: proposal.appointmentId,
            purpose: proposal.purpose,
            messageBody: String(payload.messageBody ?? "Approved message"),
            toNumber: payload.toNumber as string | undefined,
          },
          execCtx
        );
        return prisma.agentAction.update({
          where: { id: proposalId },
          data: {
            proposalStatus: "EXECUTED",
            executedAt: new Date(),
            smsLogId: sms.id,
          },
        });
      }
      case "SEND_EMAIL": {
        const email = await orchestratorService.sendEmail(
          {
            clientId: proposal.clientId,
            appointmentId: proposal.appointmentId,
            purpose: proposal.purpose,
            subject: String(payload.subject ?? "MedFlow notification"),
            body: String(payload.body ?? ""),
            toEmail: payload.toEmail as string | undefined,
          },
          execCtx
        );
        return prisma.agentAction.update({
          where: { id: proposalId },
          data: {
            proposalStatus: "EXECUTED",
            executedAt: new Date(),
            emailLogId: email.id,
          },
        });
      }
      case "PLACE_CALL": {
        const call = await orchestratorService.sendCall(
          {
            clientId: proposal.clientId,
            appointmentId: proposal.appointmentId,
            purpose: proposal.purpose,
            direction: (payload.direction as "INBOUND" | "OUTBOUND") ?? "OUTBOUND",
            phoneNumber: payload.phoneNumber as string | undefined,
          },
          execCtx
        );
        return prisma.agentAction.update({
          where: { id: proposalId },
          data: {
            proposalStatus: "EXECUTED",
            executedAt: new Date(),
            callLogId: call.id,
          },
        });
      }
      case "CREATE_STAFF_TASK": {
        const creator =
          ctx.userId ??
          proposal.initiatedById ??
          (
            await prisma.user.findFirst({
              where: { role: { type: "ADMIN" }, status: "ACTIVE" },
            })
          )?.id;
        if (!creator) {
          throw new MasterOrchestratorError("No user to assign task creator", "NO_USER");
        }
        {
          const dueMinutes = Number(payload.dueAtMinutes ?? 0);
          const dueAt =
            dueMinutes > 0
              ? new Date(Date.now() + dueMinutes * 60_000)
              : undefined;
          const phoneKey = payload.phoneKey as string | undefined;
          await prisma.staffTask.create({
            data: {
              title: String(payload.title ?? `AI task: ${proposal.purpose}`),
              description:
                proposal.description ??
                (phoneKey ? `Callback phone key: ${phoneKey}` : undefined),
              clientId: proposal.clientId,
              createdById: creator,
              priority: (payload.priority as StaffTaskPriority) ?? "HIGH",
              dueAt,
              staffOverride: ctx.staffOverride ?? false,
            },
          });
        }
        break;
      }
      case "CREATE_STAFF_INTERVENTION": {
        await prisma.staffIntervention.create({
          data: {
            clientId: proposal.clientId,
            status: (payload.status as StaffInterventionStatus) ?? "STAFF_REVIEW_REQUIRED",
            title: String(payload.title ?? proposal.actionType),
            description: proposal.description,
            staffOverride: true,
          },
        });
        break;
      }
      default:
        break;
    }

    return prisma.agentAction.update({
      where: { id: proposalId },
      data: { proposalStatus: "EXECUTED", executedAt: new Date() },
    });
  },

  async handleEmergency(input: {
    clientId: string;
    appointmentId?: string | null;
    agentType: AgentType;
    actionType: string;
    purpose: string;
    channel: CommunicationChannel;
    description?: string;
    matchedTerms: string[];
    proposedPayload?: Record<string, unknown>;
  }) {
    await validateClientAndAppointment(input.clientId, input.appointmentId);

    const defn = getAgentDefinition(input.agentType);

    const proposal = await prisma.agentAction.create({
      data: {
        clientId: input.clientId,
        appointmentId: input.appointmentId ?? undefined,
        agentType: input.agentType,
        agentName: defn.displayName,
        proposalStatus: "ESCALATED",
        purpose: input.purpose,
        channel: input.channel,
        actionType: input.actionType,
        description: input.description,
        proposedPayload: (input.proposedPayload ?? undefined) as
          | PrismaTypes.InputJsonValue
          | undefined,
        orchestratorNotes: `Emergency detected: ${input.matchedTerms.join(", ")}`,
        isEmergency: true,
        automationHalted: true,
        reviewedAt: new Date(),
      },
    });

    const adminUser = await prisma.user.findFirst({
      where: { role: { type: "ADMIN" }, status: "ACTIVE" },
    });
    if (!adminUser) {
      throw new MasterOrchestratorError("No admin user for emergency task", "NO_ADMIN");
    }

    const urgentTask = await prisma.staffTask.create({
      data: {
        title: "URGENT: Emergency language detected",
        description: `Matched: ${input.matchedTerms.join(", ")}. Automation halted. Agent: ${defn.displayName}`,
        clientId: input.clientId,
        priority: "URGENT",
        createdById: adminUser.id,
        staffOverride: true,
      },
    });

    await prisma.staffIntervention.create({
      data: {
        clientId: input.clientId,
        status: "URGENT",
        title: "Emergency — automation halted",
        description: input.description,
        staffOverride: true,
      },
    });

    await addTimelineEvent({
      clientId: input.clientId,
      eventType: "EMERGENCY_DETECTED",
      title: "Emergency language detected",
      description: `Automation stopped. ${input.matchedTerms.join(", ")}`,
      metadata: {
        proposalId: proposal.id,
        staffTaskId: urgentTask.id,
        matchedTermCount: input.matchedTerms.length,
        ...emergencyEscalationGuardrails(input.matchedTerms),
      },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "EmergencyFlow",
      entityId: proposal.id,
      clientId: input.clientId,
      metadata: {
        matchedTermCount: input.matchedTerms.length,
        automationHalted: true,
        staffTaskId: urgentTask.id,
        ...emergencyEscalationGuardrails(input.matchedTerms),
      },
    });

    await notifyStaff({
      channel: "orchestrator",
      source: "EMERGENCY_RISK_DETECTED",
      sourceKey: `emergency:${proposal.id}`,
      title: "Emergency risk detected",
      message: input.description ?? "Emergency language detected — automation halted.",
      clientId: input.clientId,
      appointmentId: input.appointmentId ?? undefined,
      agentActionId: proposal.id,
      staffTaskId: urgentTask.id,
      createdByUserId: adminUser.id,
    });

    return proposal;
  },
};

export { DuplicateProposalError };
export default masterOrchestratorService;
