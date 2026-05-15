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
  toEmail: z.string().email().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("communications:read");
  if (error) return error;

  const clientId = request.nextUrl.searchParams.get("clientId");
  const logs = await prisma.emailLog.findMany({
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

    const email = await orchestratorService.sendEmail(
      {
        clientId: parsed.data.clientId,
        appointmentId: parsed.data.appointmentId,
        purpose: parsed.data.purpose,
        toEmail: parsed.data.toEmail,
        subject: parsed.data.subject,
        body: parsed.data.body,
      },
      { userId: user!.id, source: "staff" }
    );

    return NextResponse.json(email, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
