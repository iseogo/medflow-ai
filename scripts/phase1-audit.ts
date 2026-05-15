import { PrismaClient, RoleType } from "@prisma/client";
import bcrypt from "bcryptjs";

const REQUIRED_ROLES: RoleType[] = [
  "ADMIN",
  "MANAGER",
  "FRONT_DESK_STAFF",
  "BILLING_STAFF",
  "MEDICAL_RECORDS_STAFF",
  "CLINICAL_STAFF",
  "READ_ONLY",
];

const REQUIRED_APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "RESCHEDULE_REQUESTED",
  "RESCHEDULED",
  "CANCELLED",
  "CHECKED_IN",
  "WAITING",
  "WITH_PROVIDER",
  "COMPLETED",
  "NO_SHOW",
  "WALK_OUT",
  "FOLLOW_UP_NEEDED",
];

const prisma = new PrismaClient();

async function main() {
  const roles = await prisma.role.findMany();
  const missingRoles = REQUIRED_ROLES.filter(
    (t) => !roles.some((r) => r.type === t)
  );
  if (missingRoles.length) {
    console.error("Missing roles:", missingRoles.join(", "));
    process.exit(1);
  }

  const admin = await prisma.user.findUnique({
    where: { email: "admin@medflow.ai" },
    include: { role: true },
  });
  if (!admin || admin.role.type !== "ADMIN") {
    console.error("Admin user missing or wrong role");
    process.exit(1);
  }

  const passwordOk = await bcrypt.compare("Admin123!", admin.passwordHash);
  if (!passwordOk) {
    console.error("Admin password does not match seed");
    process.exit(1);
  }

  const models = await Promise.all([
    prisma.clientTimelineEvent.count(),
    prisma.auditLog.count(),
    prisma.consentRecord.count(),
    prisma.staffIntervention.count(),
    prisma.staffTask.count(),
    prisma.appointment.count(),
    prisma.client.count(),
  ]);

  for (const [label, count] of [
    ["clients", models[6]],
    ["staffTasks", models[4]],
    ["auditLogs", models[1]],
  ] as const) {
    if (count === 0) {
      console.error(`No ${label} in database — run seed`);
      process.exit(1);
    }
  }

  console.log(
    JSON.stringify(
      {
        roles: roles.length,
        admin: admin.email,
        passwordOk,
        timelineEvents: models[0],
        auditLogs: models[1],
        consentRecords: models[2],
        interventions: models[3],
        staffTasks: models[4],
        appointments: models[5],
        clients: models[6],
        appointmentStatuses: REQUIRED_APPOINTMENT_STATUSES.length,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
