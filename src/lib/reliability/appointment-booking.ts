import { createAuditLog } from "@/lib/audit";
import { sanitizeMetadataForAudit } from "@/lib/security/phi-safe-log";
import {
  assertNoAppointmentOverlap,
  AppointmentOverlapError,
  createOverlapStaffIntervention,
} from "./appointment-overlap";

export type BookAppointmentInput = {
  clientId: string;
  scheduledAt: Date;
  durationMinutes: number;
  providerName?: string | null;
  excludeAppointmentId?: string;
  staffOverride?: boolean;
  actorUserId?: string;
};

export async function guardAppointmentBooking(input: BookAppointmentInput) {
  try {
    await assertNoAppointmentOverlap({
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      providerName: input.providerName,
      excludeAppointmentId: input.excludeAppointmentId,
    });
  } catch (e) {
    if (e instanceof AppointmentOverlapError) {
      await createAuditLog({
        action: "CREATE",
        entityType: "ReliabilityGuard",
        entityId: `overlap:${input.clientId}:${input.scheduledAt.toISOString()}`,
        userId: input.actorUserId,
        clientId: input.clientId,
        metadata: sanitizeMetadataForAudit({
          guard: "appointment_overlap",
          code: e.code,
          conflictingAppointmentId: e.conflictingAppointmentId || undefined,
        }),
      });

      if (input.staffOverride && e.conflictingAppointmentId) {
        await createOverlapStaffIntervention({
          clientId: input.clientId,
          appointmentId: input.excludeAppointmentId,
          title: "Scheduling conflict — staff review",
          description: e.message,
          actorUserId: input.actorUserId,
        });
      }
    }
    throw e;
  }
}

export { AppointmentOverlapError };
