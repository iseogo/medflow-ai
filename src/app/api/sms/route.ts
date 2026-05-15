import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { orchestratorService } from "@/services/orchestrator.service";

const createSchema = z.object({
  clientId: z.string(),
  appointmentId: z.string().optional().nullable(),
  purpose: z.string().min(1),
  toNumber: z.string().optional(),
  messageBody: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("communications:read");
  if (error) return error;

  const clientId = request.nextUrl.searchParams.get("clientId");
  const logs = await prisma.smsLog.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      appointment: { select: { id: true, scheduledAt: true } },
    },
    take: 200,
  });

  return NextResponse.json(logs);
}

export async function POST(request: NextRequest) {
  const { error, user } = await requirePermission("communications:write");
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const sms = await orchestratorService.sendSms(
      {
        clientId: parsed.data.clientId,
        appointmentId: parsed.data.appointmentId,
        purpose: parsed.data.purpose,
        toNumber: parsed.data.toNumber,
        messageBody: parsed.data.messageBody,
      },
      { userId: user!.id, source: "staff" }
    );

    return NextResponse.json(sms, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
