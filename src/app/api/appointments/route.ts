import { AppointmentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  AppointmentOverlapError,
  guardAppointmentBooking,
} from "@/lib/reliability/appointment-booking";
import { applyStaffOverride } from "@/lib/staff-override";
import { addTimelineEvent } from "@/lib/timeline";

const createSchema = z.object({
  clientId: z.string(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().positive().optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  reason: z.string().optional().nullable(),
  providerName: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  staffOverride: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("appointments:read");
  if (error) return error;

  const status = request.nextUrl.searchParams.get("status");
  const clientId = request.nextUrl.searchParams.get("clientId");

  const appointments = await prisma.appointment.findMany({
    where: {
      ...(status && { status: status as AppointmentStatus }),
      ...(clientId && { clientId }),
    },
    orderBy: { scheduledAt: "asc" },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, mrn: true } },
    },
    take: 200,
  });

  return NextResponse.json(appointments);
}

export async function POST(request: NextRequest) {
  const { error, user } = await requirePermission("appointments:write");
  if (error) return error;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const scheduledAt = new Date(parsed.data.scheduledAt);
  const durationMinutes = parsed.data.durationMinutes ?? 30;

  try {
    await guardAppointmentBooking({
      clientId: parsed.data.clientId,
      scheduledAt,
      durationMinutes,
      providerName: parsed.data.providerName,
      staffOverride: parsed.data.staffOverride,
      actorUserId: user!.id,
    });
  } catch (e) {
    if (e instanceof AppointmentOverlapError) {
      return NextResponse.json(
        { error: e.message, code: e.code, conflictingAppointmentId: e.conflictingAppointmentId },
        { status: 409 }
      );
    }
    throw e;
  }

  const appointment = await prisma.appointment.create({
    data: {
      clientId: parsed.data.clientId,
      scheduledAt,
      durationMinutes,
      status: parsed.data.status ?? "SCHEDULED",
      reason: parsed.data.reason,
      providerName: parsed.data.providerName,
      location: parsed.data.location,
      notes: parsed.data.notes,
      staffOverride: applyStaffOverride(parsed.data.staffOverride),
    },
    include: { client: true },
  });

  await addTimelineEvent({
    clientId: appointment.clientId,
    eventType: "APPOINTMENT_CREATED",
    title: "Appointment scheduled",
    description: appointment.reason ?? undefined,
    metadata: { appointmentId: appointment.id, status: appointment.status },
    actorUserId: user!.id,
  });

  await createAuditLog({
    action: "CREATE",
    entityType: "Appointment",
    entityId: appointment.id,
    userId: user!.id,
    clientId: appointment.clientId,
  });

  return NextResponse.json(appointment, { status: 201 });
}
