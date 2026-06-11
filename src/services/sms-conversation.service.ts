/**
 * Two-way SMS managed by the SMS Assistant AI.
 *
 * Inbound pipeline: log the message → scan for emergencies → classify intent
 * → act through Master Orchestrator proposals only. Template replies are
 * auto-approved (fixed text, code-owned); LLM-drafted replies stay
 * PENDING_APPROVAL for staff; escalations create StaffInterventions and
 * pause AI automation for the client via the existing automation guard.
 */

import type { Prisma } from "@prisma/client";
import { getAgentDefinition } from "@/lib/agents/definitions";
import { assertAiAutomationAllowed } from "@/lib/ai-automation-guard";
import { createAuditLog } from "@/lib/audit";
import { DuplicateCommunicationError } from "@/lib/communication-dedup";
import { recordCommunicationTimelineAndAudit } from "@/lib/communication-log";
import { detectEmergencyLanguage } from "@/lib/emergency-detect";
import { logger } from "@/lib/logger";
import { notifyStaff } from "@/lib/notifications/notification-bridge";
import { prisma } from "@/lib/prisma";
import {
  buildAutoReply,
  classifySmsIntent,
  INBOUND_SMS_PURPOSE,
  SMS_DRAFTED_REPLY_PURPOSE,
  SMS_HUMAN_HANDOFF_PURPOSE,
  SMS_STAFF_TASK_PURPOSES,
  SMS_TEMPLATE_REPLY_PURPOSES,
  type SmsIntent,
} from "@/lib/sms/sms-intent";
import { addTimelineEvent } from "@/lib/timeline";
import {
  masterOrchestratorService,
  MasterOrchestratorError,
} from "./master-orchestrator.service";
import { openAiService } from "./openai.service";
import { orchestratorService } from "./orchestrator.service";

const INBOUND_UNKNOWN_MRN = "INBOUND-UNKNOWN";
const REPEAT_ESCALATION_WINDOW_MS = 60 * 60 * 1000;
const REPEAT_ESCALATION_THRESHOLD = 3;

export type ProcessInboundSmsInput = {
  fromNumber: string;
  body: string;
  toNumber?: string;
  externalRef?: string;
  provider?: string;
  /** Pre-resolved client (e.g. simulator) — skips phone lookup. */
  clientId?: string;
};

export type InboundSmsAction =
  | "duplicate_skipped"
  | "emergency_escalated"
  | "escalated_to_staff"
  | "auto_replied"
  | "draft_pending_review"
  | "opted_out"
  | "staff_notified_ai_paused"
  | "staff_notified_unknown_sender"
  | "logged_only";

export type ProcessInboundSmsResult = {
  smsLogId: string | null;
  clientId: string | null;
  clientIdentified: boolean;
  intent: SmsIntent | "EMERGENCY" | null;
  action: InboundSmsAction;
};

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-10) || phone.trim();
}

async function resolveSystemUserId() {
  const admin = await prisma.user.findFirst({
    where: { email: "admin@medflow.ai", status: "ACTIVE" },
    select: { id: true },
  });
  return admin?.id ?? undefined;
}

async function resolveClientForInbound(
  phoneNumber: string,
  clientId?: string
): Promise<{ clientId: string; identified: boolean } | null> {
  if (clientId) {
    const existing = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (existing) return { clientId: existing.id, identified: true };
  }

  const digits = normalizePhone(phoneNumber);
  if (digits.length >= 7) {
    const byPhone = await prisma.client.findFirst({
      where: { OR: [{ phone: { contains: digits } }, { phone: phoneNumber }] },
      select: { id: true },
    });
    if (byPhone) return { clientId: byPhone.id, identified: true };
  }

  const placeholder = await prisma.client.findFirst({
    where: { mrn: INBOUND_UNKNOWN_MRN },
    select: { id: true },
  });
  if (placeholder) return { clientId: placeholder.id, identified: false };

  const fallback = await prisma.client.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!fallback) return null;
  return { clientId: fallback.id, identified: false };
}

async function isAutomationPaused(clientId: string): Promise<boolean> {
  try {
    await assertAiAutomationAllowed(clientId);
    return false;
  } catch {
    return true;
  }
}

function smsOptedOut(preferences: unknown): boolean {
  return (
    typeof preferences === "object" &&
    preferences !== null &&
    (preferences as Record<string, unknown>).smsOptOut === true
  );
}

async function findUpcomingAppointment(clientId: string) {
  return prisma.appointment.findFirst({
    where: {
      clientId,
      scheduledAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      status: {
        in: ["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED", "RESCHEDULED"],
      },
    },
    orderBy: { scheduledAt: "asc" },
  });
}

function appointmentLabel(scheduledAt: Date): string {
  return scheduledAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Submit a proposal, swallowing governance rejections (dedup, halt, etc.). */
async function submitProposalSafe(
  input: Parameters<typeof masterOrchestratorService.submitProposal>[0],
  userId?: string
): Promise<boolean> {
  try {
    await masterOrchestratorService.submitProposal(input, { userId });
    return true;
  } catch (err) {
    if (
      err instanceof MasterOrchestratorError ||
      err instanceof DuplicateCommunicationError ||
      (err instanceof Error && err.name === "DuplicateProposalError")
    ) {
      logger.warn("sms_assistant_proposal_skipped", {
        purpose: input.purpose,
        actionType: input.actionType,
        reason: err.message,
      });
      return false;
    }
    throw err;
  }
}

async function draftReplyWithLlm(input: {
  body: string;
  firstName?: string | null;
  appointmentLabel?: string | null;
}): Promise<string | null> {
  const definition = getAgentDefinition("SMS_ASSISTANT_AI");
  try {
    const result = await openAiService.chat(
      [
        { role: "system", content: definition.systemPrompt },
        {
          role: "user",
          content: [
            "Draft a short SMS reply (max 300 characters) to this patient message.",
            "Scheduling and logistics only — no clinical advice, diagnoses, or medication guidance.",
            input.firstName ? `Patient first name: ${input.firstName}.` : "",
            input.appointmentLabel
              ? `Next appointment: ${input.appointmentLabel}.`
              : "No upcoming appointment on file.",
            `Patient message: """${input.body}"""`,
            "Reply with the SMS text only.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      { temperature: 0.2, maxTokens: 200 }
    );
    const text = result.content.trim();
    if (result.mode !== "live" || !text || text.startsWith("[mock]")) {
      return null;
    }
    return text.slice(0, 320);
  } catch (err) {
    logger.warn("sms_assistant_llm_draft_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export const smsConversationService = {
  async processInboundSms(
    input: ProcessInboundSmsInput
  ): Promise<ProcessInboundSmsResult> {
    const systemUserId = await resolveSystemUserId();

    if (input.externalRef) {
      const existing = await prisma.smsLog.findFirst({
        where: { externalRef: input.externalRef, direction: "INBOUND" },
        select: { id: true, clientId: true },
      });
      if (existing) {
        return {
          smsLogId: existing.id,
          clientId: existing.clientId,
          clientIdentified: true,
          intent: null,
          action: "duplicate_skipped",
        };
      }
    }

    const resolved = await resolveClientForInbound(
      input.fromNumber,
      input.clientId
    );
    if (!resolved) {
      logger.error("inbound_sms_no_client_available", {
        phoneSuffix: normalizePhone(input.fromNumber).slice(-4),
      });
      return {
        smsLogId: null,
        clientId: null,
        clientIdentified: false,
        intent: null,
        action: "logged_only",
      };
    }
    const { clientId, identified } = resolved;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        firstName: true,
        lastName: true,
        communicationPreferences: true,
      },
    });

    const smsLog = await prisma.smsLog.create({
      data: {
        clientId,
        purpose: INBOUND_SMS_PURPOSE,
        direction: "INBOUND",
        fromNumber: input.fromNumber,
        toNumber: input.toNumber,
        messageBody: input.body,
        status: "DELIVERED",
        externalRef: input.externalRef,
        provider: input.provider ?? "twilio",
        metadata: { clientIdentified: identified },
      },
    });

    await recordCommunicationTimelineAndAudit({
      clientId,
      channel: "SMS",
      entityType: "SmsLog",
      entityId: smsLog.id,
      title: "Inbound SMS received",
      description: input.body.slice(0, 120),
      purpose: INBOUND_SMS_PURPOSE,
      status: "DELIVERED",
      userId: systemUserId,
      metadata: { direction: "INBOUND", clientIdentified: identified },
    });

    const emergency = detectEmergencyLanguage(input.body);
    const { intent } = classifySmsIntent(input.body);
    const optedOut = smsOptedOut(client?.communicationPreferences);

    // Emergencies bypass every other branch, including the AI-paused check —
    // the safety reply is fixed text sent by code, not an agent decision.
    if (emergency.isEmergency) {
      if (!optedOut) {
        await orchestratorService
          .sendSms(
            {
              clientId,
              purpose: SMS_TEMPLATE_REPLY_PURPOSES.EMERGENCY,
              toNumber: input.fromNumber,
              messageBody: buildAutoReply("EMERGENCY"),
            },
            { userId: systemUserId, source: "automation" }
          )
          .catch((err) =>
            logger.error("sms_emergency_reply_failed", {
              error: err instanceof Error ? err.message : String(err),
            })
          );
      }

      try {
        // contentForEmergencyScan trips the orchestrator's emergency flow:
        // urgent staff task + intervention + automation halt + notification.
        await masterOrchestratorService.submitProposal(
          {
            agentType: "SMS_ASSISTANT_AI",
            clientId,
            channel: "SMS",
            purpose: INBOUND_SMS_PURPOSE,
            actionType: "LOG_NOTE",
            description: "Emergency language detected in inbound SMS.",
            contentForEmergencyScan: input.body,
            proposedPayload: { smsLogId: smsLog.id },
          },
          { userId: systemUserId }
        );
      } catch (err) {
        // Automation already halted for this client — still alert staff loudly.
        logger.error("sms_emergency_proposal_failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        await notifyStaff({
          channel: "system",
          source: "EMERGENCY_RISK_DETECTED",
          sourceKey: `sms-emergency:${smsLog.id}`,
          title: "Emergency language in inbound SMS",
          message: "Patient SMS matched emergency terms. Review immediately.",
          clientId: identified ? clientId : undefined,
          priority: "CRITICAL",
          metadata: { smsLogId: smsLog.id },
          createdByUserId: systemUserId,
        }).catch(() => undefined);
      }

      return {
        smsLogId: smsLog.id,
        clientId,
        clientIdentified: identified,
        intent: "EMERGENCY",
        action: "emergency_escalated",
      };
    }

    if (!identified) {
      await notifyStaff({
        channel: "orchestrator",
        source: "MANUAL_STAFF",
        sourceKey: `sms-unknown-sender:${smsLog.id}`,
        title: "SMS from unknown number",
        message: `Unrecognized number ••••${normalizePhone(input.fromNumber).slice(-4)} texted the clinic. Identify the sender and follow up.`,
        priority: "HIGH",
        metadata: { smsLogId: smsLog.id },
        createdByUserId: systemUserId,
      }).catch(() => undefined);
      return {
        smsLogId: smsLog.id,
        clientId,
        clientIdentified: false,
        intent,
        action: "staff_notified_unknown_sender",
      };
    }

    if (await isAutomationPaused(clientId)) {
      await notifyStaff({
        channel: "orchestrator",
        source: "STAFF_INTERVENTION_REQUIRED",
        sourceKey: `sms-while-paused:${smsLog.id}`,
        title: "New SMS while AI is paused",
        message: `${client?.firstName ?? "Patient"} ${client?.lastName ?? ""} replied by SMS while AI automation is paused for this client. Staff response required.`,
        clientId,
        priority: "HIGH",
        metadata: { smsLogId: smsLog.id, intent },
        createdByUserId: systemUserId,
      }).catch(() => undefined);
      return {
        smsLogId: smsLog.id,
        clientId,
        clientIdentified: true,
        intent,
        action: "staff_notified_ai_paused",
      };
    }

    if (intent === "STOP") {
      const prefs =
        typeof client?.communicationPreferences === "object" &&
        client?.communicationPreferences !== null
          ? (client.communicationPreferences as Record<string, unknown>)
          : {};
      await prisma.client.update({
        where: { id: clientId },
        data: {
          communicationPreferences: {
            ...prefs,
            smsOptOut: true,
            smsOptOutAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      await createAuditLog({
        action: "UPDATE",
        entityType: "Client",
        entityId: clientId,
        userId: systemUserId,
        clientId,
        metadata: { smsOptOut: true, smsLogId: smsLog.id },
      });
      await notifyStaff({
        channel: "orchestrator",
        source: "MANUAL_STAFF",
        sourceKey: `sms-opt-out:${clientId}`,
        title: "Patient opted out of SMS",
        message: `${client?.firstName ?? "Patient"} ${client?.lastName ?? ""} replied STOP. SMS disabled; use another channel.`,
        clientId,
        metadata: { smsLogId: smsLog.id },
        createdByUserId: systemUserId,
      }).catch(() => undefined);
      return {
        smsLogId: smsLog.id,
        clientId,
        clientIdentified: true,
        intent,
        action: "opted_out",
      };
    }

    if (optedOut) {
      await notifyStaff({
        channel: "orchestrator",
        source: "MANUAL_STAFF",
        sourceKey: `sms-opted-out-inbound:${smsLog.id}`,
        title: "SMS from opted-out patient",
        message: "Patient previously opted out of SMS but texted again. Staff follow-up required (no auto-reply sent).",
        clientId,
        metadata: { smsLogId: smsLog.id, intent },
        createdByUserId: systemUserId,
      }).catch(() => undefined);
      return {
        smsLogId: smsLog.id,
        clientId,
        clientIdentified: true,
        intent,
        action: "logged_only",
      };
    }

    const appointment = await findUpcomingAppointment(clientId);
    const apptLabel = appointment ? appointmentLabel(appointment.scheduledAt) : null;

    if (intent === "HUMAN_REQUEST") {
      // Reply first — once the escalation lands, the automation guard blocks
      // further AI sends for this client.
      await submitProposalSafe(
        {
          agentType: "SMS_ASSISTANT_AI",
          clientId,
          channel: "SMS",
          purpose: SMS_TEMPLATE_REPLY_PURPOSES.HUMAN_REQUEST,
          actionType: "SEND_SMS",
          description: "Template acknowledgement: staff handoff requested.",
          proposedPayload: {
            messageBody: buildAutoReply("HUMAN_REQUEST", {
              firstName: client?.firstName,
            }),
            toNumber: input.fromNumber,
            inReplyToSmsLogId: smsLog.id,
          },
        },
        systemUserId
      );
      await submitProposalSafe(
        {
          agentType: "SMS_ASSISTANT_AI",
          clientId,
          channel: "SMS",
          purpose: SMS_HUMAN_HANDOFF_PURPOSE,
          actionType: "ESCALATE_TO_STAFF",
          description: `Patient asked for a human in SMS: "${input.body.slice(0, 160)}"`,
          proposedPayload: { smsLogId: smsLog.id },
        },
        systemUserId
      );
      return {
        smsLogId: smsLog.id,
        clientId,
        clientIdentified: true,
        intent,
        action: "escalated_to_staff",
      };
    }

    if (intent === "CONFIRM" && appointment) {
      if (appointment.status !== "CONFIRMED") {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: "CONFIRMED" },
        });
        await createAuditLog({
          action: "UPDATE",
          entityType: "Appointment",
          entityId: appointment.id,
          userId: systemUserId,
          clientId,
          metadata: {
            status: "CONFIRMED",
            confirmedViaSms: true,
            smsLogId: smsLog.id,
          },
        });
        await addTimelineEvent({
          clientId,
          eventType: "APPOINTMENT_STATUS_CHANGED",
          title: "Appointment confirmed via SMS",
          description: `Patient confirmed by text for ${apptLabel}.`,
          metadata: { appointmentId: appointment.id, smsLogId: smsLog.id },
          actorUserId: systemUserId,
        });
      }
      await notifyStaff({
        channel: "orchestrator",
        source: "PATIENT_CONFIRMED_APPOINTMENT",
        sourceKey: `sms-confirm:${appointment.id}`,
        title: "Patient confirmed via SMS",
        message: `${client?.firstName ?? "Patient"} ${client?.lastName ?? ""} confirmed the ${apptLabel} appointment by text.`,
        clientId,
        appointmentId: appointment.id,
        metadata: { smsLogId: smsLog.id },
        createdByUserId: systemUserId,
      }).catch(() => undefined);
      const replied = await submitProposalSafe(
        {
          agentType: "SMS_ASSISTANT_AI",
          clientId,
          appointmentId: appointment.id,
          channel: "SMS",
          purpose: SMS_TEMPLATE_REPLY_PURPOSES.CONFIRM,
          actionType: "SEND_SMS",
          description: "Template confirmation reply.",
          proposedPayload: {
            messageBody: buildAutoReply("CONFIRM", {
              firstName: client?.firstName,
              appointmentLabel: apptLabel,
            }),
            toNumber: input.fromNumber,
            inReplyToSmsLogId: smsLog.id,
          },
        },
        systemUserId
      );
      return {
        smsLogId: smsLog.id,
        clientId,
        clientIdentified: true,
        intent,
        action: replied ? "auto_replied" : "logged_only",
      };
    }

    if (intent === "RESCHEDULE" || intent === "CANCEL") {
      if (intent === "RESCHEDULE" && appointment && appointment.status !== "RESCHEDULE_REQUESTED") {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: "RESCHEDULE_REQUESTED" },
        });
        await createAuditLog({
          action: "UPDATE",
          entityType: "Appointment",
          entityId: appointment.id,
          userId: systemUserId,
          clientId,
          metadata: {
            status: "RESCHEDULE_REQUESTED",
            requestedViaSms: true,
            smsLogId: smsLog.id,
          },
        });
      }
      await submitProposalSafe(
        {
          agentType: "SMS_ASSISTANT_AI",
          clientId,
          appointmentId: appointment?.id,
          channel: "SMS",
          purpose:
            intent === "RESCHEDULE"
              ? SMS_STAFF_TASK_PURPOSES.RESCHEDULE
              : SMS_STAFF_TASK_PURPOSES.CANCEL,
          actionType: "CREATE_STAFF_TASK",
          description: `Patient texted a ${intent.toLowerCase()} request: "${input.body.slice(0, 160)}"`,
          proposedPayload: {
            title:
              intent === "RESCHEDULE"
                ? "SMS: patient requested reschedule"
                : "SMS: patient requested cancellation",
            priority: "HIGH",
            dueAtMinutes: 60,
            smsLogId: smsLog.id,
          },
        },
        systemUserId
      );
      await notifyStaff({
        channel: "orchestrator",
        source:
          intent === "RESCHEDULE"
            ? "PATIENT_RESCHEDULE_REQUESTED"
            : "PATIENT_CANCELLED_APPOINTMENT",
        sourceKey: `sms-${intent.toLowerCase()}:${smsLog.id}`,
        title:
          intent === "RESCHEDULE"
            ? "Reschedule requested via SMS"
            : "Cancellation requested via SMS",
        message: `${client?.firstName ?? "Patient"} ${client?.lastName ?? ""}: "${input.body.slice(0, 120)}"`,
        clientId,
        appointmentId: appointment?.id,
        metadata: { smsLogId: smsLog.id },
        createdByUserId: systemUserId,
      }).catch(() => undefined);
      const replied = await submitProposalSafe(
        {
          agentType: "SMS_ASSISTANT_AI",
          clientId,
          appointmentId: appointment?.id,
          channel: "SMS",
          purpose:
            intent === "RESCHEDULE"
              ? SMS_TEMPLATE_REPLY_PURPOSES.RESCHEDULE
              : SMS_TEMPLATE_REPLY_PURPOSES.CANCEL,
          actionType: "SEND_SMS",
          description: `Template acknowledgement for ${intent.toLowerCase()} request.`,
          proposedPayload: {
            messageBody: buildAutoReply(intent, { firstName: client?.firstName }),
            toNumber: input.fromNumber,
            inReplyToSmsLogId: smsLog.id,
          },
        },
        systemUserId
      );
      return {
        smsLogId: smsLog.id,
        clientId,
        clientIdentified: true,
        intent,
        action: replied ? "auto_replied" : "logged_only",
      };
    }

    // QUESTION / UNKNOWN / CONFIRM-without-appointment.
    const recentInboundCount = await prisma.smsLog.count({
      where: {
        clientId,
        direction: "INBOUND",
        createdAt: { gte: new Date(Date.now() - REPEAT_ESCALATION_WINDOW_MS) },
      },
    });

    if (recentInboundCount >= REPEAT_ESCALATION_THRESHOLD) {
      await submitProposalSafe(
        {
          agentType: "SMS_ASSISTANT_AI",
          clientId,
          channel: "SMS",
          purpose: SMS_TEMPLATE_REPLY_PURPOSES.HUMAN_REQUEST,
          actionType: "SEND_SMS",
          description: "Template handoff after repeated unresolved messages.",
          proposedPayload: {
            messageBody: buildAutoReply("HUMAN_REQUEST", {
              firstName: client?.firstName,
            }),
            toNumber: input.fromNumber,
            inReplyToSmsLogId: smsLog.id,
          },
        },
        systemUserId
      );
      await submitProposalSafe(
        {
          agentType: "SMS_ASSISTANT_AI",
          clientId,
          channel: "SMS",
          purpose: SMS_HUMAN_HANDOFF_PURPOSE,
          actionType: "ESCALATE_TO_STAFF",
          description: `${recentInboundCount} inbound texts within an hour without resolution. Latest: "${input.body.slice(0, 160)}"`,
          proposedPayload: { smsLogId: smsLog.id },
        },
        systemUserId
      );
      return {
        smsLogId: smsLog.id,
        clientId,
        clientIdentified: true,
        intent,
        action: "escalated_to_staff",
      };
    }

    const draft = await draftReplyWithLlm({
      body: input.body,
      firstName: client?.firstName,
      appointmentLabel: apptLabel,
    });

    if (draft) {
      const submitted = await submitProposalSafe(
        {
          agentType: "SMS_ASSISTANT_AI",
          clientId,
          appointmentId: appointment?.id,
          channel: "SMS",
          purpose: SMS_DRAFTED_REPLY_PURPOSE,
          actionType: "SEND_SMS",
          description: `AI-drafted reply to: "${input.body.slice(0, 160)}" — requires staff approval before sending.`,
          proposedPayload: {
            messageBody: draft,
            toNumber: input.fromNumber,
            inReplyToSmsLogId: smsLog.id,
          },
        },
        systemUserId
      );
      if (submitted) {
        await notifyStaff({
          channel: "orchestrator",
          source: "AI_LOW_CONFIDENCE",
          sourceKey: `sms-draft-review:${smsLog.id}`,
          title: "AI drafted an SMS reply — review needed",
          message: `SMS Assistant drafted a reply to ${client?.firstName ?? "a patient"}. Approve or reject it in the SMS inbox.`,
          clientId,
          metadata: { smsLogId: smsLog.id },
          createdByUserId: systemUserId,
        }).catch(() => undefined);
        return {
          smsLogId: smsLog.id,
          clientId,
          clientIdentified: true,
          intent,
          action: "draft_pending_review",
        };
      }
    }

    // Mock mode / LLM unavailable: fixed fallback reply + follow-up task.
    const replied = await submitProposalSafe(
      {
        agentType: "SMS_ASSISTANT_AI",
        clientId,
        channel: "SMS",
        purpose: SMS_TEMPLATE_REPLY_PURPOSES.FALLBACK,
        actionType: "SEND_SMS",
        description: "Template fallback reply (intent unclear).",
        proposedPayload: {
          messageBody: buildAutoReply("FALLBACK", { firstName: client?.firstName }),
          toNumber: input.fromNumber,
          inReplyToSmsLogId: smsLog.id,
        },
      },
      systemUserId
    );
    await submitProposalSafe(
      {
        agentType: "SMS_ASSISTANT_AI",
        clientId,
        channel: "SMS",
        purpose: SMS_STAFF_TASK_PURPOSES.FOLLOW_UP,
        actionType: "CREATE_STAFF_TASK",
        description: `Patient SMS needs staff reply: "${input.body.slice(0, 160)}"`,
        proposedPayload: {
          title: "SMS: patient message needs staff reply",
          priority: "HIGH",
          dueAtMinutes: 120,
          smsLogId: smsLog.id,
        },
      },
      systemUserId
    );
    return {
      smsLogId: smsLog.id,
      clientId,
      clientIdentified: true,
      intent,
      action: replied ? "auto_replied" : "logged_only",
    };
  },

  /** Conversation summaries for the SMS inbox, newest activity first. */
  async listConversations() {
    const logs = await prisma.smsLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
    });

    const byClient = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        phone: string | null;
        lastMessage: string;
        lastDirection: "INBOUND" | "OUTBOUND";
        lastAt: Date;
        inboundCount: number;
        messageCount: number;
      }
    >();
    for (const log of logs) {
      let entry = byClient.get(log.clientId);
      if (!entry) {
        entry = {
          clientId: log.clientId,
          clientName: `${log.client.firstName} ${log.client.lastName}`,
          phone: log.client.phone,
          lastMessage: log.messageBody ?? "",
          lastDirection: log.direction,
          lastAt: log.createdAt,
          inboundCount: 0,
          messageCount: 0,
        };
        byClient.set(log.clientId, entry);
      }
      entry.messageCount += 1;
      if (log.direction === "INBOUND") entry.inboundCount += 1;
    }

    const clientIds = Array.from(byClient.keys());
    const [pendingDrafts, openEscalations] = await Promise.all([
      prisma.agentAction.groupBy({
        by: ["clientId"],
        where: {
          clientId: { in: clientIds },
          channel: "SMS",
          actionType: "SEND_SMS",
          proposalStatus: "PENDING_APPROVAL",
        },
        _count: { _all: true },
      }),
      prisma.staffIntervention.findMany({
        where: {
          clientId: { in: clientIds },
          status: { notIn: ["RESOLVED"] },
        },
        select: { clientId: true, status: true, staffOverride: true },
      }),
    ]);

    const draftCounts = new Map(
      pendingDrafts.map((d) => [d.clientId, d._count._all])
    );
    const escalatedClients = new Set(openEscalations.map((e) => e.clientId));
    const pausedClients = new Set(
      openEscalations
        .filter(
          (e) =>
            e.staffOverride &&
            ["WALK_IN", "HUMAN_TAKEOVER", "AI_ESCALATED", "STAFF_REVIEW_REQUIRED", "URGENT"].includes(e.status)
        )
        .map((e) => e.clientId)
    );

    return Array.from(byClient.values()).map((c) => ({
      ...c,
      lastAt: c.lastAt.toISOString(),
      pendingDraftCount: draftCounts.get(c.clientId) ?? 0,
      escalated: escalatedClients.has(c.clientId),
      aiPaused: pausedClients.has(c.clientId),
    }));
  },

  /** Full thread for one client plus pending drafts and automation state. */
  async getConversation(clientId: string) {
    const [client, messages, pendingProposals, aiPaused] = await Promise.all([
      prisma.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          communicationPreferences: true,
        },
      }),
      prisma.smsLog.findMany({
        where: { clientId },
        orderBy: { createdAt: "asc" },
        take: 200,
        include: {
          initiatedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.agentAction.findMany({
        where: {
          clientId,
          channel: "SMS",
          actionType: "SEND_SMS",
          proposalStatus: "PENDING_APPROVAL",
        },
        orderBy: { createdAt: "desc" },
      }),
      isAutomationPaused(clientId),
    ]);

    if (!client) return null;

    return {
      client: {
        id: client.id,
        name: `${client.firstName} ${client.lastName}`,
        phone: client.phone,
        smsOptOut: smsOptedOut(client.communicationPreferences),
      },
      aiPaused,
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.messageBody ?? "",
        status: m.status,
        purpose: m.purpose,
        createdAt: m.createdAt.toISOString(),
        sentBy: m.initiatedBy
          ? `${m.initiatedBy.firstName} ${m.initiatedBy.lastName}`
          : m.direction === "OUTBOUND"
            ? "SMS Assistant AI"
            : null,
      })),
      pendingDrafts: pendingProposals.map((p) => ({
        id: p.id,
        purpose: p.purpose,
        description: p.description,
        messageBody:
          typeof p.proposedPayload === "object" && p.proposedPayload !== null
            ? String(
                (p.proposedPayload as Record<string, unknown>).messageBody ?? ""
              )
            : "",
        createdAt: p.createdAt.toISOString(),
        agentName: p.agentName,
      })),
    };
  },

  /** Manual staff escalation: pauses AI for the client and alerts the team. */
  async escalateConversation(
    clientId: string,
    options: { reason?: string; userId: string }
  ) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!client) throw new Error("Client not found");

    const intervention = await prisma.staffIntervention.create({
      data: {
        clientId,
        status: "HUMAN_TAKEOVER",
        title: "SMS conversation escalated to staff",
        description:
          options.reason ?? "Staff manually escalated the SMS conversation.",
        assignedToId: options.userId,
        staffOverride: true,
      },
    });

    await addTimelineEvent({
      clientId,
      eventType: "STAFF_INTERVENTION_CREATED",
      title: "SMS conversation escalated",
      description: options.reason ?? "Manual staff escalation from SMS inbox.",
      metadata: { interventionId: intervention.id },
      actorUserId: options.userId,
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "StaffIntervention",
      entityId: intervention.id,
      userId: options.userId,
      clientId,
      metadata: { source: "sms_inbox_escalation" },
    });

    await notifyStaff({
      channel: "staff",
      source: "STAFF_INTERVENTION_REQUIRED",
      sourceKey: `sms-manual-escalation:${intervention.id}`,
      title: "SMS conversation escalated",
      message: `${client.firstName} ${client.lastName}'s SMS conversation was escalated to staff. AI replies are paused for this client.`,
      clientId,
      workflowKey: intervention.id,
      createdByUserId: options.userId,
      assignedUserId: options.userId,
    }).catch(() => undefined);

    return intervention;
  },
};

export default smsConversationService;
