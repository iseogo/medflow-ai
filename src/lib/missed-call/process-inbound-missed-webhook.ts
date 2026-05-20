import { inboundCallDebug } from "@/lib/inbound-call/inbound-call-debug";
import { logger } from "@/lib/logger";
import {
  parseInboundMissedWebhookPayload,
  type InboundMissedWebhookPayload,
} from "@/lib/missed-call/missed-call-handler";
import { missedCallService } from "@/services/missed-call.service";

export async function processInboundMissedWebhook(
  payload: Record<string, unknown>,
  options?: { provider?: string }
) {
  const parsed = parseInboundMissedWebhookPayload(payload, {
    provider: options?.provider,
    defaultTrigger: options?.provider === "retell" ? "voice_ai_connection_failed" : "status_update",
  });

  if (!parsed) {
    inboundCallDebug("webhook_skip_not_missed", {
      provider: options?.provider,
      keyCount: Object.keys(payload).length,
    });
    return { recorded: false as const, reason: "not_missed_status" as const };
  }

  inboundCallDebug("webhook_parsed_missed", {
    provider: options?.provider,
    status: parsed.status,
    phoneSuffix: parsed.phoneNumber.slice(-4),
  });

  return recordParsedMissedInbound(parsed, options?.provider);
}

export async function recordParsedMissedInbound(
  parsed: InboundMissedWebhookPayload,
  provider?: string
) {
  logger.info("missed_call_capture_start", {
    phone: parsed.phoneNumber.slice(-4),
    status: parsed.status,
    triggerReason: parsed.triggerReason,
    provider,
    callLogId: parsed.callLogId,
    externalRef: parsed.externalRef,
  });

  try {
    const result = await missedCallService.captureMissedInboundCall({
      phoneNumber: parsed.phoneNumber,
      status: parsed.status,
      clientId: parsed.clientId,
      appointmentId: parsed.appointmentId,
      callLogId: parsed.callLogId,
      externalRef: parsed.externalRef,
      triggerReason: parsed.triggerReason,
    });

    logger.info("missed_call_capture_ok", {
      callLogId: result.callLog.id,
      notificationId: result.notification.id,
      clientIdentified: result.clientIdentified,
    });

    return { recorded: true as const, result };
  } catch (err) {
    logger.error("missed_call_capture_failed", {
      error: err instanceof Error ? err.message : String(err),
      status: parsed.status,
      provider,
    });
    throw err;
  }
}
