import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-errors";
import { smsConversationService } from "@/services/sms-conversation.service";

const escalateSchema = z.object({
  reason: z.string().max(500).optional(),
});

type RouteContext = { params: { clientId: string } };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { error, user } = await requirePermission("communications:write");
  if (error) return error;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = escalateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const intervention = await smsConversationService.escalateConversation(
      params.clientId,
      { reason: parsed.data.reason, userId: user!.id }
    );
    return NextResponse.json(intervention, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
