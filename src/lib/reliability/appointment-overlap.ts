import { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  APPOINTMENT_BUFFER_MINUTES,
  PROVIDER_AVAILABILITY,
  PROVIDER_SLOT_BUFFER_MINUTES,
} from "./constants";

export type AppointmentSlotInput = {
  scheduledAt: Date;
  durationMinutes: number;
  providerName?: string | null;
  excludeAppointmentId?: string;
};

export class AppointmentOverlapError extends Error {
  constructor(
    message: string,
    public readonly conflictingAppointmentId: string,
    public readonly code: "OVERLAP" | "UNAVAILABLE" = "OVERLAP"
  ) {
    super(message);
    this.name = "AppointmentOverlapError";
  }
}

export function normalizeProviderKey(providerName?: string | null): string | null {
  const key = providerName?.trim().toLowerCase();
  return key && key.length > 0 ? key : null;
}

export function slotEnd(scheduledAt: Date, durationMinutes: number): Date {
  return new Date(scheduledAt.getTime() + durationMinutes * 60_000);
}

function slotStartWithBuffer(scheduledAt: Date): Date {
  return new Date(scheduledAt.getTime() - PROVIDER_SLOT_BUFFER_MINUTES * 60_000);
}

function slotEndWithBuffer(scheduledAt: Date, durationMinutes: number): Date {
  return new Date(
    slotEnd(scheduledAt, durationMinutes).getTime() +
      PROVIDER_SLOT_BUFFER_MINUTES * 60_000
  );
}

export function assertProviderAvailability(scheduledAt: Date) {
  const day = scheduledAt.getDay();
  if (PROVIDER_AVAILABILITY.weekdaysOnly && (day === 0 || day === 6)) {
    throw new AppointmentOverlapError(
      "Provider is not available on weekends",
      "",
      "UNAVAILABLE"
    );
  }
  const hour = scheduledAt.getHours();
  const minutes = scheduledAt.getMinutes();
  const fractional = hour + minutes / 60;
  if (
    fractional < PROVIDER_AVAILABILITY.startHour ||
    fractional >= PROVIDER_AVAILABILITY.endHour
  ) {
    throw new AppointmentOverlapError(
      `Outside provider hours (${PROVIDER_AVAILABILITY.startHour}:00–${PROVIDER_AVAILABILITY.endHour}:00)`,
      "",
      "UNAVAILABLE"
    );
  }
}

export async function findOverlappingAppointments(
  input: AppointmentSlotInput
): Promise<{ id: string; scheduledAt: Date; durationMinutes: number } | null> {
  const providerKey = normalizeProviderKey(input.providerName);
  if (!providerKey) return null;

  const windowStart = slotStartWithBuffer(input.scheduledAt);
  const windowEnd = slotEndWithBuffer(input.scheduledAt, input.durationMinutes);

  const candidates = await prisma.appointment.findMany({
    where: {
      ...(input.excludeAppointmentId && { id: { not: input.excludeAppointmentId } }),
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      providerName: { not: null },
      // Narrow the time window to provider + buffer range to keep the query bounded
      scheduledAt: {
        gte: new Date(windowStart.getTime() - input.durationMinutes * 60_000),
        lt: windowEnd,
      },
    },
    select: {
      id: true,
      scheduledAt: true,
      durationMinutes: true,
      providerName: true,
    },
  });

  for (const appt of candidates) {
    if (normalizeProviderKey(appt.providerName) !== providerKey) continue;
    const otherStart = slotStartWithBuffer(appt.scheduledAt);
    const otherEnd = slotEndWithBuffer(appt.scheduledAt, appt.durationMinutes);
    if (windowStart < otherEnd && windowEnd > otherStart) {
      return appt;
    }
  }

  return null;
}

export async function assertNoAppointmentOverlap(input: AppointmentSlotInput) {
  assertProviderAvailability(input.scheduledAt);

  const conflict = await findOverlappingAppointments(input);
  if (conflict) {
    const bufferNote =
      PROVIDER_SLOT_BUFFER_MINUTES > 0
        ? ` Includes ${APPOINTMENT_BUFFER_MINUTES} min buffer.`
        : "";
    throw new AppointmentOverlapError(
      `Double-booking blocked for provider at ${input.scheduledAt.toISOString()}. Conflicts with appointment ${conflict.id}.${bufferNote}`,
      conflict.id,
      "OVERLAP"
    );
  }
}

export async function createOverlapStaffIntervention(input: {
  clientId: string;
  appointmentId?: string;
  title: string;
  description: string;
  actorUserId?: string;
}) {
  return prisma.staffIntervention.create({
    data: {
      clientId: input.clientId,
      status: "STAFF_REVIEW_REQUIRED",
      title: input.title,
      description: input.description,
      staffOverride: true,
      aiContext: {
        reliabilityGuard: "appointment_overlap",
        appointmentId: input.appointmentId,
      } as Prisma.InputJsonValue,
    },
  });
}
