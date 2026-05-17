import { AppointmentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  actorFromSession,
  applyStaffOverride,
  recordStaffOverride,
  staffOverrideOwnershipFields,
} from "@/lib/staff-override";
import { getRequestMeta } from "@/lib/request-meta";
import {
  AppointmentOverlapError,
  guardAppointmentBooking,
} from "@/lib/reliability/appointment-booking";
import { notifyStaff } from "@/lib/notifications/notification-bridge";
import { addTimelineEvent } from "@/lib/timeline";

const updateSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  reason: z.string().optional().nullable(),
  providerName: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  staffOverride: z.boolean().optional(),
  reminderAutomationPaused: z.boolean().optional(),
});

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { error } = await requirePermission("appointments:read");
  if (error) return error;

  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: { client: true },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(appointment);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { error, user } = await requirePermission("appointments:write");
  if (error) return error;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.appointment.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { scheduledAt, ...rest } = parsed.data;
  const actor = actorFromSession(user!);
  const meta = getRequestMeta(request);

  const nextScheduledAt = scheduledAt ? new Date(scheduledAt) : existing.scheduledAt;
  const nextDuration = parsed.data.durationMinutes ?? existing.durationMinutes;
  const nextProvider =
    parsed.data.providerName !== undefined
      ? parsed.data.providerName
      : existing.providerName;

  if (scheduledAt || parsed.data.durationMinutes || parsed.data.providerName !== undefined) {
    try {
      await guardAppointmentBooking({
        clientId: existing.clientId,
        scheduledAt: nextScheduledAt,
        durationMinutes: nextDuration,
        providerName: nextProvider,
        excludeAppointmentId: params.id,
        staffOverride: parsed.data.staffOverride ?? existing.staffOverride,
        actorUserId: user!.id,
      });
    } catch (e) {
      if (e instanceof AppointmentOverlapError) {
        return NextResponse.json(
          {
            error: e.message,
            code: e.code,
            conflictingAppointmentId: e.conflictingAppointmentId,
          },
          { status: 409 }
        );
      }
      throw e;
    }
  }

  const appointment = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
      ...staffOverrideOwnershipFields({
        ...actor,
        reason: "Staff appointment update",
      }),
      staffOverride: applyStaffOverride(parsed.data.staffOverride),
    },
    include: { client: true },
  });

  await recordStaffOverride({
    actor: { ...actor, reason: "Staff appointment update" },
    targetType: "Appointment",
    targetId: appointment.id,
    clientId: appointment.clientId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  const statusChanged =
    parsed.data.status && parsed.data.status !== existing.status;

  await addTimelineEvent({
    clientId: appointment.clientId,
    eventType: statusChanged
      ? "APPOINTMENT_STATUS_CHANGED"
      : "APPOINTMENT_UPDATED",
    title: statusChanged
      ? `Appointment status: ${appointment.status}`
      : "Appointment updated",
    metadata: {
      appointmentId: appointment.id,
      previousStatus: existing.status,
      newStatus: appointment.status,
    },
    actorUserId: user!.id,
  });

  if (statusChanged && parsed.data.status === "COMPLETED") {
    await notifyStaff({
      channel: "staff",
      source: "APPOINTMENT_COMPLETED",
      sourceKey: `appointment-completed:${appointment.id}`,
      title: "Appointment completed",
      message: `Appointment marked completed for ${appointment.client.firstName} ${appointment.client.lastName}.`,
      clientId: appointment.clientId,
      appointmentId: appointment.id,
      createdByUserId: user!.id,
    });
  }
  if (statusChanged && parsed.data.status === "NO_SHOW") {
    await notifyStaff({
      channel: "staff",
      source: "PATIENT_NO_SHOW",
      sourceKey: `appointment-no-show:${appointment.id}`,
      title: "Patient no-show",
      message: "Appointment marked no-show.",
      clientId: appointment.clientId,
      appointmentId: appointment.id,
      createdByUserId: user!.id,
    });
  }
  if (parsed.data.reminderAutomationPaused && !existing.reminderAutomationPaused) {
    await notifyStaff({
      channel: "staff",
      source: "STAFF_OVERRIDE_ACTIVATED",
      sourceKey: `appointment-automation-paused:${appointment.id}`,
      title: "Reminder automation paused",
      message: "Staff paused reminder automation for this appointment.",
      clientId: appointment.clientId,
      appointmentId: appointment.id,
      createdByUserId: user!.id,
    });
  }

  await createAuditLog({
    action: statusChanged ? "STATUS_CHANGE" : "UPDATE",
    entityType: "Appointment",
    entityId: appointment.id,
    userId: user!.id,
    clientId: appointment.clientId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: {
      previousStatus: existing.status,
      newStatus: appointment.status,
    },
  });

  return NextResponse.json(appointment);
}
