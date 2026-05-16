import { NextRequest } from "next/server";
import { handleTwilioVoiceWebhook } from "@/lib/integrations/webhook-handler";

export async function POST(request: NextRequest) {
  const url = request.nextUrl.origin + request.nextUrl.pathname;
  return handleTwilioVoiceWebhook(request, url);
}
