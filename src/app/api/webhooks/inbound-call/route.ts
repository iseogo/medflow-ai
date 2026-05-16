import { NextRequest } from "next/server";
import { handleMedflowWebhook } from "@/lib/integrations/webhook-handler";

export async function POST(request: NextRequest) {
  return handleMedflowWebhook(request, "inbound-call");
}
