import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-errors";
import { smsConversationService } from "@/services/sms-conversation.service";

type RouteContext = { params: { clientId: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { error } = await requirePermission("communications:read");
  if (error) return error;

  try {
    const conversation = await smsConversationService.getConversation(
      params.clientId
    );
    if (!conversation) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    return NextResponse.json(conversation);
  } catch (e) {
    return handleApiError(e);
  }
}
