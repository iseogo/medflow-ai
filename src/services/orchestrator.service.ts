import {
  CallDirection,
  CommunicationChannel,
  CommunicationStatus,
} from "@prisma/client";
import { DuplicateCommunicationError } from "@/lib/communication-dedup";
import { assertOutboundCommunicationAllowed } from "@/lib/reliability/communication-idempotency";
import { recordCommunicationTimelineAndAudit } from "@/lib/communication-log";
import { isMissedInboundCallStatus } from "@/lib/missed-call/missed-call-statuses";
import { notifyStaff } from "@/lib/notifications/notification-bridge";
import { missedCallService } from "@/services/missed-call.service";
import { prisma } from "@/lib/prisma";
import { emailService } from "./email.service";
import { n8nService } from "./n8n.service";
import { twilioService } from "./twilio.service";

export type OrchestratorContext = {
  userId?: string;
  /** Required for AI-originated sends — set by Master Orchestrator after approval */
  approvedProposalId?: string;
  source?: "staff" | "master_orchestrator" | "automation";
};

function assertCommunicationAuthorized(ctx: OrchestratorContext) {
  if (
    ctx.source === "staff" ||
    ctx.source === "master_orchestrator" ||
    ctx.source === "automation"
  ) {
    return;
  }
  throw new Error(
    "Direct communication sends are blocked. Use Master Orchestrator proposal flow, staff source, or automation (reminder engine) with a system userId."
  );
}

export type SendCallInput = {
  clientId: string;
  appointmentId?: string | null;
  purpose: string;
  direction: CallDirection;
  phoneNumber?: string;
};

export type SendSmsInput = {
  clientId: string;
  appointmentId?: string | null;
  purpose: string;
  toNumber?: string;
  messageBody: string;
};

export type SendEmailInput = {
  clientId: string;
  appointmentId?: string | null;
  purpose: string;
  toEmail?: string;
  subject: string;
  body: string;
};

export type RecordAgentActionInput = {
  clientId: string;
  appointmentId?: string | null;
  purpose: string;
  channel: CommunicationChannel;
  actionType: string;
  description?: string;
  agentName?: string;
};

async function resolveClientPhone(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { phone: true },
  });
  return client?.phone ?? "+10000000000";
}

async function resolveClientEmail(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { email: true, firstName: true, lastName: true },
  });
  return (
    client?.email ??
    `${client?.firstName ?? "client"}.${client?.lastName ?? "unknown"}@example.com`
  );
}

async function validateAppointment(
  clientId: string,
  appointmentId?: string | null
) {
  if (!appointmentId) return;
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clientId },
  });
  if (!appt) {
    throw new Error("Appointment not found for client");
  }
}

export const orchestratorService = {
  async sendCall(input: SendCallInput, ctx: OrchestratorContext = {}) {
    assertCommunicationAuthorized(ctx);
    await validateAppointment(input.clientId, input.appointmentId);
    await assertOutboundCommunicationAllowed(
      {
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        channel: "CALL",
        purpose: input.purpose,
      },
      { userId: ctx.userId }
    );

    const phone = input.phoneNumber ?? (await resolveClientPhone(input.clientId));

    const log = await prisma.callLog.create({
      data: {
        clientId: input.clientId,
        appointmentId: input.appointmentId ?? undefined,
        purpose: input.purpose,
        direction: input.direction,
        phoneNumber: phone,
        status: "PENDING",
        initiatedById: ctx.userId,
      },
    });

    await n8nService.triggerWorkflow({
      workflowName: "communication_call",
      payload: { callLogId: log.id, clientId: input.clientId, purpose: input.purpose },
      idempotencyKey: `communication_call:${log.id}`,
    });

    const stub = await twilioService.placeCall({
      to: phone,
      direction: input.direction,
    });

    const statusMap: Record<string, CommunicationStatus> = {
      SENT: "SENT",
      ANSWERED: "ANSWERED",
      NO_ANSWER: "NO_ANSWER",
      MISSED: "MISSED",
      ABANDONED: "ABANDONED",
      FAILED: "FAILED",
    };

    const updated = await prisma.callLog.update({
      where: { id: log.id },
      data: {
        status: statusMap[stub.status] ?? "SENT",
        externalRef: stub.externalRef,
        durationSeconds: stub.durationSeconds,
        provider: stub.provider,
      },
      include: {
        client: { select: { firstName: true, lastName: true } },
        appointment: true,
      },
    });

    await recordCommunicationTimelineAndAudit({
      clientId: input.clientId,
      channel: "CALL",
      entityType: "CallLog",
      entityId: updated.id,
      title: `${input.direction === "OUTBOUND" ? "Outbound" : "Inbound"} call — ${input.purpose}`,
      description: `Status: ${updated.status}`,
      purpose: input.purpose,
      status: updated.status,
      userId: ctx.userId,
      appointmentId: input.appointmentId,
      metadata: { direction: input.direction, externalRef: stub.externalRef },
    });

    if (updated.status === "FAILED" && input.direction === "OUTBOUND") {
      await notifyStaff({
        channel: "orchestrator",
        source: "OUTBOUND_CALL_FAILED",
        sourceKey: `outbound-call-failed:${updated.id}`,
        title: "Outbound call failed",
        message: `Call could not be completed (${input.purpose}).`,
        clientId: input.clientId,
        appointmentId: input.appointmentId ?? undefined,
        metadata: { callLogId: updated.id },
        createdByUserId: ctx.userId,
      });
    }

    if (
      input.direction === "INBOUND" &&
      isMissedInboundCallStatus(updated.status)
    ) {
      await missedCallService.captureMissedInboundCall({
        phoneNumber: phone,
        status: updated.status,
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        callLogId: updated.id,
        externalRef: stub.externalRef,
        triggerReason: "voice_ai_connection_failed",
        systemUserId: ctx.userId,
      });
    }

    return updated;
  },

  async sendSms(input: SendSmsInput, ctx: OrchestratorContext = {}) {
    assertCommunicationAuthorized(ctx);
    await validateAppointment(input.clientId, input.appointmentId);
    await assertOutboundCommunicationAllowed(
      {
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        channel: "SMS",
        purpose: input.purpose,
      },
      { userId: ctx.userId }
    );

    const to = input.toNumber ?? (await resolveClientPhone(input.clientId));

    const log = await prisma.smsLog.create({
      data: {
        clientId: input.clientId,
        appointmentId: input.appointmentId ?? undefined,
        purpose: input.purpose,
        toNumber: to,
        messageBody: input.messageBody,
        status: "PENDING",
        initiatedById: ctx.userId,
      },
    });

    await n8nService.triggerWorkflow({
      workflowName: "communication_sms",
      payload: { smsLogId: log.id, clientId: input.clientId },
      idempotencyKey: `communication_sms:${log.id}`,
    });

    const stub = await twilioService.sendSms({ to, body: input.messageBody });

    const updated = await prisma.smsLog.update({
      where: { id: log.id },
      data: {
        status: stub.status === "DELIVERED" ? "DELIVERED" : "SENT",
        externalRef: stub.externalRef,
      },
      include: {
        client: { select: { firstName: true, lastName: true } },
        appointment: true,
      },
    });

    await recordCommunicationTimelineAndAudit({
      clientId: input.clientId,
      channel: "SMS",
      entityType: "SmsLog",
      entityId: updated.id,
      title: `SMS — ${input.purpose}`,
      description: input.messageBody.slice(0, 120),
      purpose: input.purpose,
      status: updated.status,
      userId: ctx.userId,
      appointmentId: input.appointmentId,
    });

    return updated;
  },

  async sendEmail(input: SendEmailInput, ctx: OrchestratorContext = {}) {
    assertCommunicationAuthorized(ctx);
    await validateAppointment(input.clientId, input.appointmentId);
    await assertOutboundCommunicationAllowed(
      {
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        channel: "EMAIL",
        purpose: input.purpose,
      },
      { userId: ctx.userId }
    );

    const to = input.toEmail ?? (await resolveClientEmail(input.clientId));

    const log = await prisma.emailLog.create({
      data: {
        clientId: input.clientId,
        appointmentId: input.appointmentId ?? undefined,
        purpose: input.purpose,
        toEmail: to,
        subject: input.subject,
        body: input.body,
        status: "PENDING",
        initiatedById: ctx.userId,
      },
    });

    await n8nService.triggerWorkflow({
      workflowName: "communication_email",
      payload: { emailLogId: log.id, clientId: input.clientId },
      idempotencyKey: `communication_email:${log.id}`,
    });

    const stub = await emailService.sendEmail({
      to,
      subject: input.subject,
      body: input.body,
    });

    const updated = await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: stub.status === "BOUNCED" ? "BOUNCED" : "DELIVERED",
        externalRef: stub.externalRef,
        provider: stub.provider,
      },
      include: {
        client: { select: { firstName: true, lastName: true } },
        appointment: true,
      },
    });

    await recordCommunicationTimelineAndAudit({
      clientId: input.clientId,
      channel: "EMAIL",
      entityType: "EmailLog",
      entityId: updated.id,
      title: `Email — ${input.subject}`,
      description: input.purpose,
      purpose: input.purpose,
      status: updated.status,
      userId: ctx.userId,
      appointmentId: input.appointmentId,
    });

    return updated;
  },

  /** @deprecated Use masterOrchestratorService.submitProposal — AI cannot call this directly */
  async recordAgentAction(
    _input: RecordAgentActionInput,
    _ctx: OrchestratorContext = {}
  ) {
    throw new Error(
      "recordAgentAction is disabled. All AI actions must use masterOrchestratorService.submitProposal."
    );
  },
};

export { DuplicateCommunicationError };

export default orchestratorService;
