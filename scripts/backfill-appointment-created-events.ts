/**
 * Backfill missing APPOINTMENT_CREATED timeline events and audit logs.
 * Idempotent — safe to run multiple times.
 *
 * Usage: npm run backfill:appointment-events
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const BACKFILL_SOURCE = "backfill-appointment-created-events";

function timelineBackfillId(appointmentId: string) {
  return `backfill-timeline-appt-${appointmentId}`;
}

async function resolveActor(appointment: {
  staffOverrideByUserId: string | null;
  staffOverrideByName: string | null;
}) {
  if (appointment.staffOverrideByUserId) {
    const user = await prisma.user.findUnique({
      where: { id: appointment.staffOverrideByUserId },
      include: { role: true },
    });
    if (user) {
      return {
        actorUserId: user.id,
        actorName: `${user.firstName} ${user.lastName}`,
        actorRole: user.role.type,
      };
    }
  }

  const admin = await prisma.user.findFirst({
    where: { email: "admin@medflow.ai" },
    include: { role: true },
  });
  if (admin) {
    return {
      actorUserId: admin.id,
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: admin.role.type,
    };
  }

  return {
    actorUserId: undefined as string | undefined,
    actorName: appointment.staffOverrideByName ?? "System",
    actorRole: undefined as undefined,
    actorType: "SYSTEM" as const,
  };
}

async function hasAppointmentCreatedTimeline(
  appointmentId: string,
  clientId: string
): Promise<boolean> {
  const byMetadata = await prisma.clientTimelineEvent.findFirst({
    where: {
      clientId,
      eventType: "APPOINTMENT_CREATED",
      metadata: {
        path: ["appointmentId"],
        equals: appointmentId,
      },
    },
    select: { id: true },
  });
  if (byMetadata) return true;

  const byBackfillId = await prisma.clientTimelineEvent.findUnique({
    where: { id: timelineBackfillId(appointmentId) },
    select: { id: true },
  });
  return Boolean(byBackfillId);
}

async function hasAppointmentCreatedAudit(appointmentId: string): Promise<boolean> {
  const row = await prisma.auditLog.findFirst({
    where: {
      action: "CREATE",
      entityType: "Appointment",
      entityId: appointmentId,
    },
    select: { id: true },
  });
  return Boolean(row);
}

async function main() {
  console.log("\n=== Backfill APPOINTMENT_CREATED events ===\n");

  const appointments = await prisma.appointment.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      clientId: true,
      createdAt: true,
      status: true,
      reason: true,
      providerName: true,
      staffOverrideByUserId: true,
      staffOverrideByName: true,
    },
  });

  let timelineCreated = 0;
  let timelineSkipped = 0;
  let auditCreated = 0;
  let auditSkipped = 0;

  for (const appointment of appointments) {
    const actor = await resolveActor(appointment);
    const eventAt = appointment.createdAt;

    const hasTimeline = await hasAppointmentCreatedTimeline(
      appointment.id,
      appointment.clientId
    );

    if (!hasTimeline) {
      const metadata: Prisma.InputJsonValue = {
        appointmentId: appointment.id,
        status: appointment.status,
        backfill: true,
        source: BACKFILL_SOURCE,
        ...(actor.actorType === "SYSTEM" ? { actorType: "SYSTEM" } : {}),
      };

      await prisma.clientTimelineEvent.create({
        data: {
          id: timelineBackfillId(appointment.id),
          clientId: appointment.clientId,
          eventType: "APPOINTMENT_CREATED",
          title: "Appointment scheduled",
          description: appointment.reason ?? undefined,
          metadata,
          actorUserId: actor.actorUserId,
          createdAt: eventAt,
        },
      });
      timelineCreated++;
      console.log(`  + timeline  appointment ${appointment.id}`);
    } else {
      timelineSkipped++;
    }

    const hasAudit = await hasAppointmentCreatedAudit(appointment.id);

    if (!hasAudit) {
      const metadata: Prisma.InputJsonValue = {
        appointmentId: appointment.id,
        status: appointment.status,
        backfill: true,
        source: BACKFILL_SOURCE,
        ...(actor.actorType === "SYSTEM"
          ? { actorType: "SYSTEM" }
          : { actorType: "STAFF" }),
      };

      await prisma.auditLog.create({
        data: {
          action: "CREATE",
          entityType: "Appointment",
          entityId: appointment.id,
          targetType: "Appointment",
          targetId: appointment.id,
          clientId: appointment.clientId,
          userId: actor.actorUserId,
          actorUserId: actor.actorUserId,
          actorName: actor.actorName,
          actorRole: actor.actorRole,
          metadata,
          createdAt: eventAt,
        },
      });
      auditCreated++;
      console.log(`  + audit     appointment ${appointment.id}`);
    } else {
      auditSkipped++;
    }
  }

  const apptTotal = appointments.length;
  const apptTimeline = await prisma.clientTimelineEvent.count({
    where: { eventType: "APPOINTMENT_CREATED" },
  });
  const apptAudits = await prisma.auditLog.count({
    where: { action: "CREATE", entityType: "Appointment" },
  });

  console.log("\n--- Summary ---");
  console.log(`Appointments scanned:     ${apptTotal}`);
  console.log(`Timeline events created:  ${timelineCreated}`);
  console.log(`Timeline events skipped:  ${timelineSkipped} (already present)`);
  console.log(`Audit logs created:       ${auditCreated}`);
  console.log(`Audit logs skipped:       ${auditSkipped} (already present)`);
  console.log(`\nAPPOINTMENT_CREATED timeline rows: ${apptTimeline} (appointments: ${apptTotal})`);
  console.log(`Appointment CREATE audit rows:     ${apptAudits}`);

  if (apptTimeline < apptTotal) {
    console.error(
      "\nWARN: Timeline count still below appointment count — review metadata linkage."
    );
    process.exit(1);
  }

  console.log("\nBackfill complete.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
