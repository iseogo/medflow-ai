import { NextRequest, NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { inboundCallDebug } from "@/lib/inbound-call/inbound-call-debug";
import { logger } from "@/lib/logger";
import {
  readWebhookBody,
  validateMedflowWebhookSecret,
} from "@/lib/integrations/webhook-auth";
import { processInboundMissedWebhook } from "@/lib/missed-call/process-inbound-missed-webhook";

/**
 * Retell voice webhook — records missed inbound calls into CallLog + staff workflow.
 */
export async function POST(request: NextRequest) {
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

  inboundCallDebug("retell_webhook_received", {
    keyCount: Object.keys(payload).length,
    event: String(payload.event ?? payload.type ?? ""),
  });

  let missedCallRecorded = false;
  let errorMessage: string | undefined;

  try {
    const result = await processInboundMissedWebhook(payload, { provider: "retell" });
    missedCallRecorded = result.recorded;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("retell_missed_capture_failed", { error: errorMessage });
  }

  await createAuditLog({
    action: "CREATE",
    entityType: "WebhookEvent",
    entityId: "retell",
    metadata: {
      eventType: "retell",
      payloadKeyCount: Object.keys(payload).length,
      missedCallRecorded,
      errorMessage,
    },
  });

  return NextResponse.json({
    received: true,
    channel: "retell",
    missedCallRecorded,
    error: errorMessage,
  });
}
