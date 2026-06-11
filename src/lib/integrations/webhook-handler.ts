import { CommunicationStatus } from "@prisma/client";
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
    const inboundBody = String(payload.Body ?? payload.body ?? payload.messageBody ?? "");
    const inboundFrom = String(payload.From ?? payload.from ?? payload.fromNumber ?? "");

    if (eventType === "sms" && inboundBody && inboundFrom && !smsStatus) {
      const { smsConversationService } = await import(
        "@/services/sms-conversation.service"
      );
      await smsConversationService
        .processInboundSms({
          fromNumber: inboundFrom,
          toNumber: String(payload.To ?? payload.toNumber ?? "") || undefined,
          body: inboundBody,
          externalRef: messageSid || undefined,
          provider: "medflow_webhook",
        })
        .catch((err) => {
          logger.error("inbound_sms_processing_failed", {
            error: err instanceof Error ? err.message : String(err),
            messageSid,
          });
        });
    } else if ((messageSid || smsLogId) && smsStatus) {
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
    const status = String(payload.status ?? "");
    if (appointmentId && status) {
      await prisma.appointment.updateMany({
        where: { id: appointmentId },
        data: { status: status as never },
      });
    }
  }

  if (eventType === "staff-intervention") {
    const interventionId = String(payload.interventionId ?? "");
    const status = String(payload.status ?? "");
    if (interventionId && status) {
      await prisma.staffIntervention.updateMany({
        where: { id: interventionId },
        data: { status: status as never },
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

  if (isInboundTwilioSmsPayload(params)) {
    const { smsConversationService } = await import(
      "@/services/sms-conversation.service"
    );
    await smsConversationService
      .processInboundSms({
        fromNumber: params.get("From") ?? "",
        toNumber: params.get("To") ?? undefined,
        body: params.get("Body") ?? "",
        externalRef: messageSid || undefined,
        provider: "twilio",
      })
      .catch((err) => {
        logger.error("inbound_sms_processing_failed", {
          error: err instanceof Error ? err.message : String(err),
          messageSid,
        });
      });
    return new NextResponse("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

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

/**
 * Twilio inbound messages carry Body/From with SmsStatus=received; outbound
 * delivery callbacks carry MessageStatus and no patient Body.
 */
export function isInboundTwilioSmsPayload(params: URLSearchParams): boolean {
  const from = params.get("From");
  const body = params.get("Body");
  if (!from || body === null) return false;
  const smsStatus = (params.get("SmsStatus") ?? "").toLowerCase();
  if (smsStatus === "received") return true;
  return !params.get("MessageStatus") && !smsStatus;
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
