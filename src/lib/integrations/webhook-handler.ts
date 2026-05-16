import { CommunicationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
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
  switch (status.toLowerCase()) {
    case "completed":
    case "in-progress":
      return "ANSWERED";
    case "busy":
    case "no-answer":
    case "canceled":
      return "NO_ANSWER";
    case "failed":
      return "FAILED";
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
  if (!auth.ok) return auth.response;

  let payload: Record<string, unknown> = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      const params = new URLSearchParams(rawBody);
      payload = Object.fromEntries(params.entries());
    }
  }

  await applyWebhookSideEffects(eventType, payload);

  await createAuditLog({
    action: "CREATE",
    entityType: "WebhookEvent",
    entityId: eventType,
    metadata: {
      eventType,
      payloadKeyCount: Object.keys(payload).length,
    },
  });

  return NextResponse.json({ received: true, eventType });
}

async function applyWebhookSideEffects(
  eventType: WebhookEventType,
  payload: Record<string, unknown>
) {
  const callSid = String(payload.CallSid ?? payload.callSid ?? "");
  const messageSid = String(payload.MessageSid ?? payload.messageSid ?? "");
  const smsLogId = String(payload.smsLogId ?? "");
  const callLogId = String(payload.callLogId ?? "");
  const emailLogId = String(payload.emailLogId ?? "");

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

  if (
    eventType === "inbound-call" ||
    eventType === "outbound-call" ||
    eventType === "reminders"
  ) {
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
  const callSid = params.get("CallSid") ?? "";
  const status = params.get("CallStatus") ?? "";
  const duration = params.get("CallDuration");

  if (callSid && status) {
    await prisma.callLog.updateMany({
      where: { externalRef: callSid },
      data: {
        status: mapTwilioCallStatus(status),
        durationSeconds: duration ? parseInt(duration, 10) : undefined,
      },
    });
  }

  return new NextResponse("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
