import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { smsConversationService } from "@/services/sms-conversation.service";

/**
 * Demo/testing helper: feeds a message through the same inbound pipeline the
 * Twilio webhook uses. Staff-permission gated; useful in MOCK_MODE where no
 * real phone number is wired up.
 */
const simulateSchema = z
  .object({
    clientId: z.string().optional(),
    fromNumber: z.string().optional(),
    body: z.string().min(1).max(1600),
  })
  .refine((data) => data.clientId || data.fromNumber, {
    message: "Provide clientId or fromNumber",
  });

export async function POST(request: NextRequest) {
  const { error } = await requirePermission("communications:write");
  if (error) return error;

  try {
    const json = await request.json();
    const parsed = simulateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let fromNumber = parsed.data.fromNumber;
    if (!fromNumber && parsed.data.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: parsed.data.clientId },
        select: { phone: true },
      });
      fromNumber = client?.phone ?? "+15550000000";
    }

    const result = await smsConversationService.processInboundSms({
      fromNumber: fromNumber!,
      body: parsed.data.body,
      clientId: parsed.data.clientId,
      provider: "simulator",
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
