import { NextRequest, NextResponse } from "next/server";
import {
  readWebhookBody,
  validateMedflowWebhookSecret,
} from "@/lib/integrations/webhook-auth";

/**
 * Retell (or partner) voice webhook ingress — same secret contract as other MedFlow webhooks.
 * Extend to parse Retell-specific payloads and call domain services when live.
 */
export async function POST(request: NextRequest) {
  const rawBody = await readWebhookBody(request);
  const auth = validateMedflowWebhookSecret(request, rawBody);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    received: true,
    channel: "retell",
    note: "MOCK_MODE-safe stub — wire Retell event types when enabling live voice.",
  });
}
