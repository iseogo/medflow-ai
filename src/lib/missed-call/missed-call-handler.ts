/**
 * Inbound missed-call webhook parsing and routing helpers.
 */
import type { CommunicationStatus } from "@prisma/client";
import {
  isMissedInboundCallStatus,
  mapInboundStatusToMissed,
  type MissedCallTriggerReason,
} from "@/lib/missed-call/missed-call-statuses";

export type InboundMissedWebhookPayload = {
  phoneNumber: string;
  status: CommunicationStatus;
  rawStatus: string;
  callLogId?: string;
  externalRef?: string;
  clientId?: string;
  appointmentId?: string;
  triggerReason: MissedCallTriggerReason;
  provider?: string;
};

export function resolveMissedCallStatusFromWebhook(
  raw: string
): CommunicationStatus | null {
  return mapInboundStatusToMissed(raw);
}

export function shouldTreatAsMissedInbound(raw: string): boolean {
  const mapped = mapInboundStatusToMissed(raw);
  return mapped !== null && isMissedInboundCallStatus(mapped);
}

function firstNonEmpty(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = payload[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

/** Unified parser for MedFlow, Twilio, and Retell-style inbound payloads. */
export function parseInboundMissedWebhookPayload(
  payload: Record<string, unknown>,
  options?: { defaultTrigger?: MissedCallTriggerReason; provider?: string }
): InboundMissedWebhookPayload | null {
  const rawStatus = firstNonEmpty(payload, [
    "CallStatus",
    "status",
    "call_status",
    "disconnection_reason",
    "end_reason",
  ]);

  const eventName = String(payload.event ?? payload.type ?? "").toLowerCase();
  const inferredStatus =
    rawStatus ||
    (eventName.includes("ended") ||
    eventName.includes("hangup") ||
    eventName.includes("no_answer") ||
    eventName.includes("no-answer")
      ? "no-answer"
      : eventName.includes("fail") || eventName.includes("error")
        ? "failed"
        : eventName.includes("missed") || eventName.includes("abandon")
          ? "missed"
          : "");

  if (!shouldTreatAsMissedInbound(inferredStatus)) {
    return null;
  }

  const status = mapInboundStatusToMissed(inferredStatus);
  if (!status) return null;

  const phoneNumber = firstNonEmpty(payload, [
    "From",
    "from",
    "from_number",
    "caller_number",
    "phoneNumber",
    "phone_number",
    "caller_id",
  ]);

  if (!phoneNumber) {
    return null;
  }

  const callLogId = firstNonEmpty(payload, ["callLogId", "call_log_id"]) || undefined;
  const externalRef =
    firstNonEmpty(payload, ["CallSid", "callSid", "call_id", "callId"]) || undefined;

  let triggerReason: MissedCallTriggerReason =
    options?.defaultTrigger ?? "status_update";
  if (payload.workflowFailed === true) {
    triggerReason = "n8n_inbound_workflow_failure";
  } else if (
    inferredStatus.toLowerCase().includes("fail") ||
    eventName.includes("fail")
  ) {
    triggerReason = "voice_ai_connection_failed";
  } else if (
    eventName.includes("hangup") ||
    inferredStatus.toLowerCase().includes("abandon")
  ) {
    triggerReason = "caller_hangup";
  }

  return {
    phoneNumber,
    status,
    rawStatus: inferredStatus,
    callLogId,
    externalRef,
    clientId: firstNonEmpty(payload, ["clientId", "client_id"]) || undefined,
    appointmentId:
      firstNonEmpty(payload, ["appointmentId", "appointment_id"]) || undefined,
    triggerReason,
    provider: options?.provider,
  };
}
