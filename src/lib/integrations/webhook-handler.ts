import {
  AppointmentStatus,
  CommunicationStatus,
  StaffInterventionStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { inboundCallDebug } from "@/lib/inbound-call/inbound-call-debug";
import { logger } from "@/lib/logger";
import {
  isMissedInboundCallStatus,
  mapInboundStatusToMissed,
} from "@/lib/missed-call/missed-call-statuses";
import { processInboundMissedWebhook } from "@/lib/missed-call/process-inbound-missed-webhook";
import { notifyStaff } from "@/lib/notifications/notification-bridge";
import { prisma } from "@/lib/prisma";
import {
  readWebhookBody,
  validateMedflowWebhookSecret,
} from "@/lib/integrations/webhook-auth";

const VALID_APPOINTMENT_STATUSES = new Set<string>(Object.values(AppointmentStatus));
const VALID_INTERVENTION_STATUSES = new Set<string>(Object.values(StaffInterventionStatus));

/** Reject webhook requests older than 5 minutes to prevent replay attacks. */
function assertWebhookTimestamp(headers: Headers): { ok: true } | { ok: false; response: NextResponse } {
  const ts = headers.get("x-medflow-timestamp");
  if (!ts) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Missing X-MedFlow-Timestamp header" },
          { status: 400 }
        ),
      };
    }
    return { ok: true };
  }
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age > 5 * 60_000 || age < -30_000) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Webhook timestamp expired or invalid" },
        { status: 400 }
      ),
    };
  }
  return { ok: true };
}

export type WebhookEventType =
  | "inbound-call"
  | "outbound-call"
  | "sms"
  | "email"
  | "appointment"
  | "reminders"
  | "staff-intervention";

function mapTwilioSmsStatus(status: string): CommunicationStatus {
  switch (status.toLowerCase()) {
    case "delivered":
      return "DELIVERED";
    case "failed":
    case "undelivered":
      return "FAILED";
    case "sent":
    default:
      return "SENT";
  }
}

function mapTwilioCallStatus(status: string): CommunicationStatus {
  const missed = mapInboundStatusToMissed(status);
  if (missed) return missed;
  switch (status.toLowerCase()) {
    case "completed":
    case "in-progress":
      return "ANSWERED";
    default:
      return "SENT";
  }
}

export async function handleMedflowWebhook(
  request: NextRequest,
  eventType: WebhookEventType
): Promise<NextResponse> {
  const rawBody = await readWebhookBody(request);
  const auth = validateMedflowWebhookSecret(request, rawBody);
  if (!auth.ok) {
    await notifyStaff({
      channel: "system",
      source: "WEBHOOK_FAILURE",
      sourceKey: `webhook-auth-fail:${eventType}:${Date.now()}`,
      title: "Webhook authentication failed",
      message: `Rejected ${eventType} webhook — verify WEBHOOK_SECRET (MOCK_MODE safe).`,
      workflowKey: eventType,
    }).catch(() => undefined);
    return auth.response;
  }

  const tsCheck = assertWebhookTimestamp(request.headers);
  if (!tsCheck.ok) return tsCheck.response;

  let payload: Record<string, unknown> = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      const params = new URLSearchParams(rawBody);
      payload = Object.fromEntries(params.entries());
    }
  }

  logger.info("webhook_received", { eventType, payloadKeys: Object.keys(payload) });

  const sideEffect = await applyWebhookSideEffects(eventType, payload);

  await createAuditLog({
    action: "CREATE",
    entityType: "WebhookEvent",
    entityId: eventType,
    metadata: {
      eventType,
      payloadKeyCount: Object.keys(payload).length,
      missedCallRecorded: sideEffect.missedCallRecorded,
    },
  });

  return NextResponse.json({
    received: true,
    eventType,
    missedCallRecorded: sideEffect.missedCallRecorded,
  });
}

async function applyWebhookSideEffects(
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): Promise<{ missedCallRecorded: boolean }> {
  const callSid = String(payload.CallSid ?? payload.callSid ?? "");
  const messageSid = String(payload.MessageSid ?? payload.messageSid ?? "");
  const smsLogId = String(payload.smsLogId ?? "");
  const callLogId = String(payload.callLogId ?? "");
  const emailLogId = String(payload.emailLogId ?? "");
  let missedCallRecorded = false;

  if (eventType === "sms" || eventType === "outbound-call") {
    const smsStatus = String(payload.MessageStatus ?? payload.status ?? "");
    if ((messageSid || smsLogId) && smsStatus) {
      await prisma.smsLog.updateMany({
        where: smsLogId
          ? { id: smsLogId }
          : { externalRef: messageSid },
        data: { status: mapTwilioSmsStatus(smsStatus) },
      });
    }
  }

  if (eventType === "inbound-call") {
    inboundCallDebug("medflow_inbound_webhook", {
      callSid: callSid || undefined,
      status: String(payload.CallStatus ?? payload.status ?? ""),
    });
    try {
      const result = await processInboundMissedWebhook(payload, {
        provider: "medflow_inbound",
      });
      missedCallRecorded = result.recorded;
      inboundCallDebug("medflow_inbound_result", { recorded: result.recorded });
    } catch (err) {
      logger.error("inbound_call_missed_webhook_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const callStatus = String(payload.CallStatus ?? payload.status ?? "");
    if ((callSid || callLogId) && callStatus) {
      const callData: {
        status: CommunicationStatus;
        durationSeconds?: number;
      } = { status: mapTwilioCallStatus(callStatus) };
      if (payload.CallDuration) {
        callData.durationSeconds = parseInt(String(payload.CallDuration), 10);
      }
      await prisma.callLog.updateMany({
        where: callLogId ? { id: callLogId } : { externalRef: callSid },
        data: callData,
      });
    }
  }

  if (eventType === "outbound-call" || eventType === "reminders") {
    const callStatus = String(payload.CallStatus ?? payload.status ?? "");
    if ((callSid || callLogId) && callStatus) {
      const callData: {
        status: CommunicationStatus;
        durationSeconds?: number;
      } = { status: mapTwilioCallStatus(callStatus) };
      if (payload.CallDuration) {
        callData.durationSeconds = parseInt(String(payload.CallDuration), 10);
      }
      const updated = await prisma.callLog.updateMany({
        where: callLogId ? { id: callLogId } : { externalRef: callSid },
        data: callData,
      });
      if (updated.count > 0 && callData.status === "FAILED") {
        const log = await prisma.callLog.findFirst({
          where: callLogId ? { id: callLogId } : { externalRef: callSid },
        });
        if (log) {
          await notifyStaff({
            channel: "orchestrator",
            source: "OUTBOUND_CALL_FAILED",
            sourceKey: `webhook-call-failed:${log.id}`,
            title: "Outbound call failed",
            message: `Call status update: ${callStatus}`,
            clientId: log.clientId,
            appointmentId: log.appointmentId ?? undefined,
            metadata: { callLogId: log.id, eventType },
          }).catch((e) => {
            logger.warn("outbound_call_notify_failed", {
              error: e instanceof Error ? e.message : String(e),
            });
          });
        }
      }
    }
  }

  if (eventType === "email" && emailLogId) {
    const status = String(payload.status ?? "DELIVERED").toUpperCase();
    await prisma.emailLog.updateMany({
      where: { id: emailLogId },
      data: {
        status:
          status === "FAILED" || status === "BOUNCED"
            ? "FAILED"
            : "DELIVERED",
      },
    });
  }

  if (eventType === "appointment") {
    const appointmentId = String(payload.appointmentId ?? "");
    const status = String(payload.status ?? "").toUpperCase();
    if (appointmentId && status) {
      if (!VALID_APPOINTMENT_STATUSES.has(status)) {
        logger.warn("webhook_invalid_appointment_status", { status, appointmentId });
        return { missedCallRecorded };
      }
      const existing = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: { id: true },
      });
      if (!existing) {
        logger.warn("webhook_appointment_not_found", { appointmentId });
        return { missedCallRecorded };
      }
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: status as AppointmentStatus },
      });
      await createAuditLog({
        action: "UPDATE",
        entityType: "Appointment",
        entityId: appointmentId,
        metadata: { status, source: "webhook", eventType },
      });
    }
  }

  if (eventType === "staff-intervention") {
    const interventionId = String(payload.interventionId ?? "");
    const status = String(payload.status ?? "").toUpperCase();
    if (interventionId && status) {
      if (!VALID_INTERVENTION_STATUSES.has(status)) {
        logger.warn("webhook_invalid_intervention_status", { status, interventionId });
        return { missedCallRecorded };
      }
      const existing = await prisma.staffIntervention.findUnique({
        where: { id: interventionId },
        select: { id: true },
      });
      if (!existing) {
        logger.warn("webhook_intervention_not_found", { interventionId });
        return { missedCallRecorded };
      }
      await prisma.staffIntervention.update({
        where: { id: interventionId },
        data: { status: status as StaffInterventionStatus },
      });
    }
  }

  return { missedCallRecorded };
}

export async function handleTwilioSmsWebhook(
  request: NextRequest,
  webhookUrl: string
): Promise<NextResponse> {
  const rawBody = await readWebhookBody(request);
  const { validateTwilioSignature } = await import(
    "@/lib/integrations/webhook-auth"
  );
  const auth = validateTwilioSignature(request, rawBody, webhookUrl);
  if (!auth.ok) return auth.response;

  const params = new URLSearchParams(rawBody);
  const messageSid = params.get("MessageSid") ?? "";
  const status = params.get("MessageStatus") ?? "";

  if (messageSid && status) {
    await prisma.smsLog.updateMany({
      where: { externalRef: messageSid },
      data: { status: mapTwilioSmsStatus(status) },
    });
  }

  return new NextResponse("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function handleTwilioVoiceWebhook(
  request: NextRequest,
  webhookUrl: string
): Promise<NextResponse> {
  const rawBody = await readWebhookBody(request);
  const { validateTwilioSignature } = await import(
    "@/lib/integrations/webhook-auth"
  );
  const auth = validateTwilioSignature(request, rawBody, webhookUrl);
  if (!auth.ok) return auth.response;

  const params = new URLSearchParams(rawBody);
  const payload = Object.fromEntries(params.entries());
  const callSid = params.get("CallSid") ?? "";
  const status = params.get("CallStatus") ?? "";
  const duration = params.get("CallDuration");
  const direction = (params.get("Direction") ?? "").toLowerCase();

  inboundCallDebug("twilio_voice_webhook", { callSid, status, direction });

  const isInbound =
    direction.includes("inbound") || direction === "" || !direction.includes("outbound");

  if (isInbound) {
    try {
      const result = await processInboundMissedWebhook(
        {
          ...payload,
          CallSid: callSid,
          CallStatus: status,
        },
        { provider: "twilio" }
      );
      inboundCallDebug("twilio_voice_missed_result", {
        callSid,
        recorded: result.recorded,
      });
    } catch (err) {
      logger.error("twilio_voice_missed_capture_failed", {
        error: err instanceof Error ? err.message : String(err),
        callSid,
      });
    }
  }

  if (callSid && status) {
    const mapped = mapTwilioCallStatus(status);
    await prisma.callLog.updateMany({
      where: { externalRef: callSid },
      data: {
        status: mapped,
        durationSeconds: duration ? parseInt(duration, 10) : undefined,
      },
    });
  }

  await createAuditLog({
    action: "CREATE",
    entityType: "WebhookEvent",
    entityId: "twilio-voice",
    metadata: {
      callSid,
      status,
      direction,
      isInbound,
    },
  });

  return new NextResponse("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
