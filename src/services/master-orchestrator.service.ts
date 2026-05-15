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
  AiAutomationBlockedError,
  assertAiAutomationAllowed,
} from "@/lib/ai-automation-guard";
import { assertNoDuplicateProposal, DuplicateProposalError } from "@/lib/proposal-dedup";
import { prisma } from "@/lib/prisma";
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

    await assertNoDuplicateProposal({
      clientId: input.clientId,
      appointmentId: input.appointmentId,
      channel: input.channel,
      purpose: input.purpose,
      agentType: input.agentType,
      actionType: input.actionType,
    });

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
      await prisma.staffIntervention.create({
        data: {
          clientId: updated.clientId,
          status: "STAFF_REVIEW_REQUIRED",
          title: `AI escalation: ${updated.actionType}`,
          description: updated.description,
          assignedToId: options.userId,
          staffOverride: true,
        },
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
        await prisma.staffTask.create({
          data: {
            title: String(payload.title ?? `AI task: ${proposal.purpose}`),
            description: proposal.description,
            clientId: proposal.clientId,
            createdById: creator,
            priority: (payload.priority as StaffTaskPriority) ?? "HIGH",
            staffOverride: ctx.staffOverride ?? false,
          },
        });
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
        matchedTerms: input.matchedTerms,
      },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "EmergencyFlow",
      entityId: proposal.id,
      clientId: input.clientId,
      metadata: {
        matchedTerms: input.matchedTerms,
        automationHalted: true,
        staffTaskId: urgentTask.id,
      },
    });

    return proposal;
  },
};

export { DuplicateProposalError };
export default masterOrchestratorService;
