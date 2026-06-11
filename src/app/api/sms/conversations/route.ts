import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-errors";
import { smsConversationService } from "@/services/sms-conversation.service";

export async function GET() {
  const { error } = await requirePermission("communications:read");
  if (error) return error;

  try {
    const conversations = await smsConversationService.listConversations();
    return NextResponse.json(conversations);
  } catch (e) {
    return handleApiError(e);
  }
}
