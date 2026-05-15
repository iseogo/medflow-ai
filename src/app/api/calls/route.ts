import { CallDirection } from "@prisma/client";
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
  direction: z.nativeEnum(CallDirection).default("INBOUND"),
  phoneNumber: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("communications:read");
  if (error) return error;

  const clientId = request.nextUrl.searchParams.get("clientId");
  const calls = await prisma.callLog.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, mrn: true } },
      appointment: { select: { id: true, scheduledAt: true, reason: true } },
    },
    take: 200,
  });

  return NextResponse.json(calls);
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

    const call = await orchestratorService.sendCall(
      {
        clientId: parsed.data.clientId,
        appointmentId: parsed.data.appointmentId,
        purpose: parsed.data.purpose,
        direction: parsed.data.direction,
        phoneNumber: parsed.data.phoneNumber,
      },
      { userId: user!.id, source: "staff" }
    );

    return NextResponse.json(call, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
