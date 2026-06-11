import {
  NotificationCategory,
  NotificationPriority,
  NotificationSource,
  NotificationStatus,
  Prisma,
  PrismaClient,
  RoleType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { NOTIFICATION_SOURCE_DEFAULTS } from "../src/lib/notifications/notification-sources";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@medflow.ai";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";

const STAFF_USERS: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: RoleType;
  forcePasswordReset: boolean;
}[] = [
  {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    firstName: "MedFlow",
    lastName: "Admin",
    role: "ADMIN",
    forcePasswordReset: false,
  },
  {
    email: "manager@medflow.ai",
    password: "Manager123!",
    firstName: "Morgan",
    lastName: "Manager",
    role: "MANAGER",
    forcePasswordReset: true,
  },
  {
    email: "frontdesk@medflow.ai",
    password: "FrontDesk123!",
    firstName: "Fran",
    lastName: "Desk",
    role: "FRONT_DESK_STAFF",
    forcePasswordReset: true,
  },
  {
    email: "billing@medflow.ai",
    password: "Billing123!",
    firstName: "Blake",
    lastName: "Billing",
    role: "BILLING_STAFF",
    forcePasswordReset: true,
  },
  {
    email: "records@medflow.ai",
    password: "Records123!",
    firstName: "Riley",
    lastName: "Records",
    role: "MEDICAL_RECORDS_STAFF",
    forcePasswordReset: true,
  },
  {
    email: "clinical@medflow.ai",
    password: "Clinical123!",
    firstName: "Casey",
    lastName: "Clinical",
    role: "CLINICAL_STAFF",
    forcePasswordReset: true,
  },
  {
    email: "readonly@medflow.ai",
    password: "ReadOnly123!",
    firstName: "Robin",
    lastName: "Viewer",
    role: "READ_ONLY",
    forcePasswordReset: true,
  },
];

const ROLES: { type: RoleType; name: string; description: string }[] = [
  { type: "ADMIN", name: "Administrator", description: "Full system access" },
  { type: "MANAGER", name: "Manager", description: "Operations and reporting" },
  {
    type: "FRONT_DESK_STAFF",
    name: "Front Desk",
    description: "Scheduling and check-in",
  },
  {
    type: "BILLING_STAFF",
    name: "Billing",
    description: "Billing and payments",
  },
  {
    type: "MEDICAL_RECORDS_STAFF",
    name: "Medical Records",
    description: "Records and compliance",
  },
  {
    type: "CLINICAL_STAFF",
    name: "Clinical",
    description: "Clinical workflows",
  },
  { type: "READ_ONLY", name: "Read Only", description: "View-only access" },
];

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      "Refusing to seed production with the default admin password. " +
        "Set SEED_ADMIN_PASSWORD (and SEED_ADMIN_EMAIL) before running the seed."
    );
  }

  console.log("Seeding MedFlow (Phases 1–4)...");

  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { type: role.type },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }

  for (const staff of STAFF_USERS) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { type: staff.role },
    });
    const passwordHash = await bcrypt.hash(staff.password, 12);
    await prisma.user.upsert({
      where: { email: staff.email.toLowerCase() },
      update: {
        passwordHash,
        firstName: staff.firstName,
        lastName: staff.lastName,
        roleId: role.id,
        status: "ACTIVE",
        forcePasswordReset: staff.forcePasswordReset,
      },
      create: {
        email: staff.email.toLowerCase(),
        passwordHash,
        firstName: staff.firstName,
        lastName: staff.lastName,
        roleId: role.id,
        status: "ACTIVE",
        forcePasswordReset: staff.forcePasswordReset,
      },
    });
  }

  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: ADMIN_EMAIL.toLowerCase() },
  });

  const client1 = await prisma.client.upsert({
    where: { mrn: "MRN-10001" },
    update: {},
    create: {
      firstName: "Maria",
      lastName: "Garcia",
      email: "maria.garcia@example.com",
      phone: "+13125550101",
      mrn: "MRN-10001",
      dateOfBirth: new Date("1985-03-15"),
    },
  });

  const client2 = await prisma.client.upsert({
    where: { mrn: "MRN-10002" },
    update: {},
    create: {
      firstName: "James",
      lastName: "Wilson",
      email: "james.wilson@example.com",
      phone: "+13125550102",
      mrn: "MRN-10002",
      dateOfBirth: new Date("1972-11-08"),
    },
  });

  await prisma.client.upsert({
    where: { mrn: "INBOUND-UNKNOWN" },
    update: {},
    create: {
      firstName: "Inbound",
      lastName: "Unknown",
      mrn: "INBOUND-UNKNOWN",
      phone: "+10000000000",
    },
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const appt1 = await prisma.appointment.upsert({
    where: { id: "seed-appt-10001" },
    update: {},
    create: {
      id: "seed-appt-10001",
      clientId: client1.id,
      scheduledAt: tomorrow,
      status: "CONFIRMED",
      reason: "Annual wellness visit",
      providerName: "Dr. Patel",
      location: "Room 3",
      staffOverride: true,
    },
  });

  await prisma.appointment.upsert({
    where: { id: "seed-appt-10002" },
    update: {},
    create: {
      id: "seed-appt-10002",
      clientId: client2.id,
      scheduledAt: new Date(tomorrow.getTime() + 60 * 60 * 1000),
      status: "SCHEDULED",
      reason: "Follow-up consultation",
      providerName: "Dr. Nguyen",
      staffOverride: true,
    },
  });

  const consentTypes = [
    { clientId: client1.id, type: "SMS" as const, granted: true },
    { clientId: client1.id, type: "EMAIL" as const, granted: true },
    { clientId: client2.id, type: "PHONE" as const, granted: true },
  ];

  for (const consent of consentTypes) {
    const existing = await prisma.consentRecord.findFirst({
      where: { clientId: consent.clientId, type: consent.type },
    });
    if (!existing) {
      await prisma.consentRecord.create({ data: consent });
    }
  }

  const timelineSeeds = [
    {
      id: "seed-timeline-client1-created",
      clientId: client1.id,
      eventType: "CLIENT_CREATED" as const,
      title: "Client profile created",
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-appt1-created",
      clientId: client1.id,
      eventType: "APPOINTMENT_CREATED" as const,
      title: "Appointment scheduled",
      description: "Annual wellness visit",
      metadata: { appointmentId: appt1.id },
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-appt2-created",
      clientId: client2.id,
      eventType: "APPOINTMENT_CREATED" as const,
      title: "Appointment scheduled",
      description: "Follow-up consultation",
      metadata: { appointmentId: "seed-appt-10002" },
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-client2-created",
      clientId: client2.id,
      eventType: "CLIENT_CREATED" as const,
      title: "Client profile created",
      actorUserId: admin.id,
    },
  ];

  for (const event of timelineSeeds) {
    await prisma.clientTimelineEvent.upsert({
      where: { id: event.id },
      update: {},
      create: event,
    });
  }

  await prisma.walkInVisit.upsert({
    where: { id: "seed-walkin-james" },
    update: {},
    create: {
      id: "seed-walkin-james",
      clientId: client2.id,
      visitType: "RETURNING",
      onboardingStatus: "COMPLETED",
      onboardingStep: "completed",
      staffNotes: "Demo walk-in — James Wilson",
      createdById: admin.id,
      staffOverride: true,
    },
  });

  await prisma.staffIntervention.upsert({
    where: { id: "seed-intervention-walkin" },
    update: {},
    create: {
      id: "seed-intervention-walkin",
      clientId: client2.id,
      status: "WALK_IN",
      title: "Walk-in patient check-in",
      description: "Patient arrived without appointment",
      assignedToId: admin.id,
      staffOverride: true,
    },
  });

  await prisma.staffTask.upsert({
    where: { id: "seed-task-insurance" },
    update: {},
    create: {
      id: "seed-task-insurance",
      title: "Verify insurance for Maria Garcia",
      description: "Confirm coverage before tomorrow's visit",
      clientId: client1.id,
      assignedToId: admin.id,
      createdById: admin.id,
      priority: "HIGH",
      staffOverride: true,
    },
  });

  await prisma.clientTimelineEvent.upsert({
    where: { id: "seed-timeline-task-insurance" },
    update: {},
    create: {
      id: "seed-timeline-task-insurance",
      clientId: client1.id,
      eventType: "STAFF_TASK_CREATED",
      title: "Verify insurance for Maria Garcia",
      description: "Confirm coverage before tomorrow's visit",
      metadata: { taskId: "seed-task-insurance" },
      actorUserId: admin.id,
    },
  });

  await prisma.auditLog.upsert({
    where: { id: "seed-audit-task-insurance" },
    update: {},
    create: {
      id: "seed-audit-task-insurance",
      action: "CREATE",
      entityType: "StaffTask",
      entityId: "seed-task-insurance",
      userId: admin.id,
      clientId: client1.id,
      metadata: { source: "seed" },
    },
  });

  const auditSeeds = [
    {
      id: "seed-audit-client1",
      action: "CREATE" as const,
      entityType: "Client",
      entityId: client1.id,
      userId: admin.id,
      clientId: client1.id,
      metadata: { source: "seed" },
    },
    {
      id: "seed-audit-appt1",
      action: "CREATE" as const,
      entityType: "Appointment",
      entityId: appt1.id,
      userId: admin.id,
      clientId: client1.id,
      metadata: { source: "seed" },
    },
    {
      id: "seed-audit-appt2",
      action: "CREATE" as const,
      entityType: "Appointment",
      entityId: "seed-appt-10002",
      userId: admin.id,
      clientId: client2.id,
      metadata: { source: "seed" },
    },
  ];

  for (const log of auditSeeds) {
    await prisma.auditLog.upsert({
      where: { id: log.id },
      update: {},
      create: log,
    });
  }

  await prisma.smsLog.upsert({
    where: { id: "seed-sms-reminder-1" },
    update: {},
    create: {
      id: "seed-sms-reminder-1",
      clientId: client1.id,
      appointmentId: appt1.id,
      purpose: "appointment_reminder",
      status: "DELIVERED",
      toNumber: client1.phone,
      messageBody: "Reminder: your wellness visit is tomorrow.",
      externalRef: "sms_stub_seed",
      initiatedById: admin.id,
    },
  });

  await prisma.emailLog.upsert({
    where: { id: "seed-email-confirm-1" },
    update: {},
    create: {
      id: "seed-email-confirm-1",
      clientId: client1.id,
      appointmentId: appt1.id,
      purpose: "appointment_confirmation",
      status: "DELIVERED",
      toEmail: client1.email,
      subject: "Appointment confirmed",
      body: "Your appointment is confirmed.",
      externalRef: "email_stub_seed",
      initiatedById: admin.id,
    },
  });

  await prisma.callLog.upsert({
    where: { id: "seed-call-outbound-1" },
    update: {},
    create: {
      id: "seed-call-outbound-1",
      clientId: client2.id,
      purpose: "follow_up_outreach",
      status: "ANSWERED",
      direction: "OUTBOUND",
      phoneNumber: client2.phone,
      durationSeconds: 90,
      externalRef: "call_stub_seed",
      initiatedById: admin.id,
    },
  });

  await prisma.agentAction.upsert({
    where: { id: "seed-agent-escalation-1" },
    update: {},
    create: {
      id: "seed-agent-escalation-1",
      clientId: client2.id,
      purpose: "billing_escalation",
      channel: "CALL",
      agentType: "ESCALATION_AI",
      agentName: "Escalation AI Agent",
      actionType: "ESCALATE_TO_STAFF",
      proposalStatus: "ESCALATED",
      description: "Stub agent escalated billing question to front desk",
      orchestratorNotes: "Seed: auto-escalated to staff",
      initiatedById: admin.id,
    },
  });

  await prisma.agentAction.upsert({
    where: { id: "seed-agent-pending-1" },
    update: {},
    create: {
      id: "seed-agent-pending-1",
      clientId: client1.id,
      appointmentId: appt1.id,
      purpose: "appointment_reminder_sms",
      channel: "SMS",
      agentType: "SMS_REMINDER_AI",
      agentName: "SMS Reminder AI Agent",
      actionType: "SEND_SMS",
      proposalStatus: "PENDING_APPROVAL",
      description: "Proposed reminder SMS awaiting orchestrator",
      proposedPayload: { messageBody: "Your visit is tomorrow at 10 AM." },
      initiatedById: admin.id,
    },
  });

  const commsTimeline = [
    {
      id: "seed-timeline-sms-1",
      clientId: client1.id,
      eventType: "COMMUNICATION_SMS" as const,
      title: "SMS — appointment_reminder",
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-email-1",
      clientId: client1.id,
      eventType: "COMMUNICATION_EMAIL" as const,
      title: "Email — appointment_confirmation",
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-call-1",
      clientId: client2.id,
      eventType: "COMMUNICATION_CALL" as const,
      title: "Outbound call — follow_up_outreach",
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-agent-1",
      clientId: client2.id,
      eventType: "AGENT_ACTION" as const,
      title: "Agent: ESCALATE_TO_STAFF",
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-proposal-pending",
      clientId: client1.id,
      eventType: "AGENT_PROPOSAL_CREATED" as const,
      title: "AI proposal: SEND_SMS",
      description: "Pending Master Orchestrator review",
      metadata: { proposalId: "seed-agent-pending-1" },
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-proposal-escalated",
      clientId: client2.id,
      eventType: "AGENT_PROPOSAL_ESCALATED" as const,
      title: "AI proposal escalated",
      metadata: { proposalId: "seed-agent-escalation-1" },
      actorUserId: admin.id,
    },
  ];

  for (const event of commsTimeline) {
    await prisma.clientTimelineEvent.upsert({
      where: { id: event.id },
      update: {},
      create: event,
    });
  }

  const commsAudits = [
    {
      id: "seed-audit-sms-1",
      action: "CREATE" as const,
      entityType: "SmsLog",
      entityId: "seed-sms-reminder-1",
      userId: admin.id,
      clientId: client1.id,
      metadata: { source: "seed", purpose: "appointment_reminder" },
    },
    {
      id: "seed-audit-email-1",
      action: "CREATE" as const,
      entityType: "EmailLog",
      entityId: "seed-email-confirm-1",
      userId: admin.id,
      clientId: client1.id,
      metadata: { source: "seed", purpose: "appointment_confirmation" },
    },
    {
      id: "seed-audit-call-1",
      action: "CREATE" as const,
      entityType: "CallLog",
      entityId: "seed-call-outbound-1",
      userId: admin.id,
      clientId: client2.id,
      metadata: { source: "seed", purpose: "follow_up_outreach" },
    },
    {
      id: "seed-audit-agent-1",
      action: "CREATE" as const,
      entityType: "AgentAction",
      entityId: "seed-agent-escalation-1",
      userId: admin.id,
      clientId: client2.id,
      metadata: { source: "seed", purpose: "billing_escalation" },
    },
  ];

  for (const log of commsAudits) {
    await prisma.auditLog.upsert({
      where: { id: log.id },
      update: {},
      create: log,
    });
  }

  const frontdesk = await prisma.user.findUnique({
    where: { email: "frontdesk@medflow.ai" },
  });
  const checkedInById = frontdesk?.id ?? admin.id;

  const client3 = await prisma.client.upsert({
    where: { mrn: "MRN-10003" },
    update: {},
    create: {
      firstName: "Sofia",
      lastName: "Chen",
      email: "sofia.chen@example.com",
      phone: "+13125550103",
      mrn: "MRN-10003",
      dateOfBirth: new Date("1990-06-22"),
    },
  });

  const todayVisit = new Date();
  todayVisit.setHours(9, 0, 0, 0);

  const arrivedMaria = new Date();
  arrivedMaria.setMinutes(arrivedMaria.getMinutes() - 28);
  const arrivedJames = new Date();
  arrivedJames.setMinutes(arrivedJames.getMinutes() - 52);
  const arrivedSofia = new Date();
  arrivedSofia.setMinutes(arrivedSofia.getMinutes() - 14);

  const apptTodayMaria = await prisma.appointment.upsert({
    where: { id: "seed-appt-today-maria" },
    update: { status: "CHECKED_IN" },
    create: {
      id: "seed-appt-today-maria",
      clientId: client1.id,
      scheduledAt: todayVisit,
      status: "CHECKED_IN",
      reason: "Same-day visit (demo)",
      providerName: "Dr. Patel",
      location: "Room 3",
      staffOverride: true,
    },
  });

  const apptTodayJames = await prisma.appointment.upsert({
    where: { id: "seed-appt-today-james" },
    update: { status: "WITH_PROVIDER" },
    create: {
      id: "seed-appt-today-james",
      clientId: client2.id,
      scheduledAt: new Date(todayVisit.getTime() + 30 * 60 * 1000),
      status: "WITH_PROVIDER",
      reason: "Follow-up (demo — with provider)",
      providerName: "Dr. Nguyen",
      location: "Room 5",
      staffOverride: true,
    },
  });

  const apptTodaySofia = await prisma.appointment.upsert({
    where: { id: "seed-appt-today-sofia" },
    update: { status: "WAITING" },
    create: {
      id: "seed-appt-today-sofia",
      clientId: client3.id,
      scheduledAt: new Date(todayVisit.getTime() + 60 * 60 * 1000),
      status: "WAITING",
      reason: "Urgent care (demo)",
      providerName: "Dr. Lee",
      location: "Waiting room",
      staffOverride: true,
    },
  });

  const checkInMaria = await prisma.physicalCheckIn.upsert({
    where: { id: "seed-physical-checkin-maria" },
    update: { arrivedAt: arrivedMaria },
    create: {
      id: "seed-physical-checkin-maria",
      clientId: client1.id,
      appointmentId: apptTodayMaria.id,
      checkInType: "APPOINTMENT",
      checkedInById: checkedInById,
      arrivedAt: arrivedMaria,
      notes: "Demo — checked in, awaiting room",
      staffOverride: true,
    },
  });

  const checkInJames = await prisma.physicalCheckIn.upsert({
    where: { id: "seed-physical-checkin-james" },
    update: { arrivedAt: arrivedJames },
    create: {
      id: "seed-physical-checkin-james",
      clientId: client2.id,
      appointmentId: apptTodayJames.id,
      checkInType: "APPOINTMENT",
      checkedInById: checkedInById,
      arrivedAt: arrivedJames,
      notes: "Demo — with provider",
      staffOverride: true,
    },
  });

  const checkInSofia = await prisma.physicalCheckIn.upsert({
    where: { id: "seed-physical-checkin-sofia" },
    update: { arrivedAt: arrivedSofia },
    create: {
      id: "seed-physical-checkin-sofia",
      clientId: client3.id,
      appointmentId: apptTodaySofia.id,
      checkInType: "APPOINTMENT",
      checkedInById: checkedInById,
      arrivedAt: arrivedSofia,
      notes: "Demo — waiting",
      staffOverride: true,
    },
  });

  await prisma.waitingRoomStatus.upsert({
    where: { id: "seed-waiting-room-maria" },
    update: {
      state: "CHECKED_IN",
      queuePosition: 1,
      arrivedAt: arrivedMaria,
    },
    create: {
      id: "seed-waiting-room-maria",
      physicalCheckInId: checkInMaria.id,
      clientId: client1.id,
      appointmentId: apptTodayMaria.id,
      state: "CHECKED_IN",
      queuePosition: 1,
      location: "Room 3",
      arrivedAt: arrivedMaria,
      staffNotifiedAt: arrivedMaria,
      staffOverride: true,
    },
  });

  await prisma.waitingRoomStatus.upsert({
    where: { id: "seed-waiting-room-james" },
    update: {
      state: "WITH_PROVIDER",
      queuePosition: 2,
      arrivedAt: arrivedJames,
      withProviderAt: arrivedJames,
    },
    create: {
      id: "seed-waiting-room-james",
      physicalCheckInId: checkInJames.id,
      clientId: client2.id,
      appointmentId: apptTodayJames.id,
      state: "WITH_PROVIDER",
      queuePosition: 2,
      location: "Room 5",
      arrivedAt: arrivedJames,
      staffNotifiedAt: arrivedJames,
      withProviderAt: new Date(arrivedJames.getTime() + 35 * 60 * 1000),
      waitDurationMinutes: 35,
      staffOverride: true,
    },
  });

  await prisma.waitingRoomStatus.upsert({
    where: { id: "seed-waiting-room-sofia" },
    update: {
      state: "WAITING",
      queuePosition: 3,
      arrivedAt: arrivedSofia,
    },
    create: {
      id: "seed-waiting-room-sofia",
      physicalCheckInId: checkInSofia.id,
      clientId: client3.id,
      appointmentId: apptTodaySofia.id,
      state: "WAITING",
      queuePosition: 3,
      location: "Waiting room",
      arrivedAt: arrivedSofia,
      staffNotifiedAt: arrivedSofia,
      staffOverride: true,
    },
  });

  const phase4Timeline = [
    {
      id: "seed-timeline-client3-created",
      clientId: client3.id,
      eventType: "CLIENT_CREATED" as const,
      title: "Client profile created",
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-appt-today-maria",
      clientId: client1.id,
      eventType: "APPOINTMENT_CREATED" as const,
      title: "Appointment scheduled — same-day visit (demo)",
      metadata: { appointmentId: apptTodayMaria.id },
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-appt-today-james",
      clientId: client2.id,
      eventType: "APPOINTMENT_CREATED" as const,
      title: "Appointment scheduled — follow-up (demo)",
      metadata: { appointmentId: apptTodayJames.id },
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-appt-today-sofia",
      clientId: client3.id,
      eventType: "APPOINTMENT_CREATED" as const,
      title: "Appointment scheduled — urgent care (demo)",
      metadata: { appointmentId: apptTodaySofia.id },
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-intervention-walkin",
      clientId: client2.id,
      eventType: "STAFF_INTERVENTION_CREATED" as const,
      title: "Walk-in patient check-in",
      description: "Patient arrived without appointment",
      metadata: { interventionId: "seed-intervention-walkin" },
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-walkin-james",
      clientId: client2.id,
      eventType: "WALK_IN_REGISTERED" as const,
      title: "Walk-in registered — James Wilson",
      actorUserId: admin.id,
    },
    {
      id: "seed-timeline-checkin-maria",
      clientId: client1.id,
      eventType: "PHYSICAL_CHECK_IN" as const,
      title: "Physical check-in — Maria Garcia",
      metadata: { checkInId: checkInMaria.id },
      actorUserId: checkedInById,
    },
    {
      id: "seed-timeline-checkin-james",
      clientId: client2.id,
      eventType: "PHYSICAL_CHECK_IN" as const,
      title: "Physical check-in — James Wilson",
      metadata: { checkInId: checkInJames.id },
      actorUserId: checkedInById,
    },
    {
      id: "seed-timeline-wr-maria",
      clientId: client1.id,
      eventType: "WAITING_ROOM_ARRIVED" as const,
      title: "Waiting room — Maria Garcia",
      metadata: { waitingRoomId: "seed-waiting-room-maria" },
      actorUserId: checkedInById,
    },
    {
      id: "seed-timeline-wr-james",
      clientId: client2.id,
      eventType: "WAITING_ROOM_ARRIVED" as const,
      title: "Waiting room — James Wilson",
      metadata: { waitingRoomId: "seed-waiting-room-james" },
      actorUserId: checkedInById,
    },
    {
      id: "seed-timeline-checkin-sofia",
      clientId: client3.id,
      eventType: "PHYSICAL_CHECK_IN" as const,
      title: "Physical check-in — Sofia Chen",
      metadata: { checkInId: checkInSofia.id },
      actorUserId: checkedInById,
    },
    {
      id: "seed-timeline-wr-sofia",
      clientId: client3.id,
      eventType: "WAITING_ROOM_ARRIVED" as const,
      title: "Waiting room — Sofia Chen",
      metadata: { waitingRoomId: "seed-waiting-room-sofia" },
      actorUserId: checkedInById,
    },
  ];

  for (const event of phase4Timeline) {
    await prisma.clientTimelineEvent.upsert({
      where: { id: event.id },
      update: {},
      create: event,
    });
  }

  const phase4Audits = [
    {
      id: "seed-audit-appt-today-maria",
      entityType: "Appointment" as const,
      entityId: apptTodayMaria.id,
      clientId: client1.id,
    },
    {
      id: "seed-audit-appt-today-james",
      entityType: "Appointment" as const,
      entityId: apptTodayJames.id,
      clientId: client2.id,
    },
    {
      id: "seed-audit-appt-today-sofia",
      entityType: "Appointment" as const,
      entityId: apptTodaySofia.id,
      clientId: client3.id,
    },
    {
      id: "seed-audit-intervention-walkin",
      entityType: "StaffIntervention" as const,
      entityId: "seed-intervention-walkin",
      clientId: client2.id,
    },
  ];

  for (const log of phase4Audits) {
    await prisma.auditLog.upsert({
      where: { id: log.id },
      update: {},
      create: {
        id: log.id,
        action: "CREATE",
        entityType: log.entityType,
        entityId: log.entityId,
        userId: admin.id,
        clientId: log.clientId,
        metadata: { source: "seed", phase: "phase4" },
      },
    });
  }

  await prisma.callLog.upsert({
    where: { id: "seed-call-inbound-review" },
    update: { status: "NO_ANSWER" },
    create: {
      id: "seed-call-inbound-review",
      clientId: client2.id,
      appointmentId: "seed-appt-10002",
      purpose: "inbound_scheduling_inquiry",
      status: "NO_ANSWER",
      direction: "INBOUND",
      phoneNumber: client2.phone,
      externalRef: "call_inbound_stub_seed",
      initiatedById: admin.id,
    },
  });

  type DemoNotificationSeed = {
    id: string;
    source: NotificationSource;
    title: string;
    message: string;
    status?: NotificationStatus;
    clientId?: string;
    appointmentId?: string;
    staffTaskId?: string;
    agentActionId?: string;
    staffInterventionId?: string;
    workflowKey?: string;
    assignedRole?: RoleType;
    assignedUserId?: string;
    category?: NotificationCategory;
    priority?: NotificationPriority;
    recommendedNextAction?: string;
    createAudit?: boolean;
    acknowledgedAt?: Date;
  };

  const demoMeta = (extra?: Record<string, unknown>): Prisma.InputJsonValue => ({
    mockDelivery: true,
    seed: true,
    phase: "phase11-demo",
    ...extra,
  });

  const demoNotifications: DemoNotificationSeed[] = [
    {
      id: "seed-notif-staff-intervention",
      source: "STAFF_INTERVENTION_REQUIRED",
      title: "Urgent: walk-in needs staff review",
      message:
        "James Wilson arrived without an appointment. Front desk intervention is open.",
      clientId: client2.id,
      staffInterventionId: "seed-intervention-walkin",
      assignedRole: "ADMIN",
      assignedUserId: admin.id,
      status: "UNREAD",
      createAudit: true,
    },
    {
      id: "seed-notif-reminder-failed",
      source: "REMINDER_FAILED",
      title: "Reminder failed or escalated",
      message:
        "Voice reminder for Maria Garcia (48h offset) did not complete. Review reminder log and contact patient.",
      clientId: client1.id,
      appointmentId: appt1.id,
      assignedRole: "ADMIN",
      status: "UNREAD",
      createAudit: true,
    },
    {
      id: "seed-notif-inbound-call",
      source: "INBOUND_CALL_HUMAN_REVIEW",
      title: "Inbound call needs review",
      message:
        "Inbound scheduling inquiry from James Wilson — status NO_ANSWER. Staff review required.",
      clientId: client2.id,
      appointmentId: "seed-appt-10002",
      workflowKey: "seed-call-inbound-review",
      assignedRole: "ADMIN",
      status: "UNREAD",
      createAudit: true,
    },
    {
      id: "seed-notif-waiting-room-delay",
      source: "WAITING_ROOM_DELAY",
      title: "Waiting room delay",
      message:
        "Sofia Chen has been waiting 52+ minutes (demo threshold exceeded). Check wait times and notify provider.",
      clientId: client3.id,
      appointmentId: apptTodaySofia.id,
      workflowKey: "seed-waiting-room-sofia",
      assignedRole: "ADMIN",
      status: "UNREAD",
      createAudit: true,
    },
    {
      id: "seed-notif-ai-low-confidence",
      source: "AI_LOW_CONFIDENCE",
      title: "AI proposal needs review",
      message:
        "SMS reminder proposal for Maria Garcia has low confidence — review in Agent Coordination before approval.",
      clientId: client1.id,
      appointmentId: appt1.id,
      agentActionId: "seed-agent-pending-1",
      assignedRole: "ADMIN",
      status: "UNREAD",
      createAudit: true,
    },
    {
      id: "seed-notif-supervisor-warning",
      source: "SUPERVISOR_WARNING",
      title: "Supervisor: billing escalation observed",
      message:
        "Escalation AI flagged a billing question for James Wilson. Review supervisor dashboard (observe-only).",
      clientId: client2.id,
      agentActionId: "seed-agent-escalation-1",
      workflowKey: "DUPLICATE_ACTION",
      assignedRole: "ADMIN",
      status: "READ",
      createAudit: true,
    },
    {
      id: "seed-notif-webhook-failure",
      source: "WEBHOOK_FAILURE",
      title: "Webhook authentication failed",
      message:
        "Demo: rejected inbound-call webhook — verify WEBHOOK_SECRET (in-app only; MOCK_MODE safe).",
      assignedRole: "ADMIN",
      workflowKey: "inbound-call",
      status: "UNREAD",
      createAudit: true,
    },
    {
      id: "seed-notif-appointment-confirmed",
      source: "PATIENT_CONFIRMED_APPOINTMENT",
      title: "Patient confirmed appointment",
      message:
        "Maria Garcia confirmed her wellness visit via AI voice reminder (demo). Schedule is up to date.",
      clientId: client1.id,
      appointmentId: appt1.id,
      assignedRole: "ADMIN",
      status: "ACKNOWLEDGED",
      acknowledgedAt: new Date(),
    },
  ];

  for (const n of demoNotifications) {
    const defaults = NOTIFICATION_SOURCE_DEFAULTS[n.source];
    const category = n.category ?? defaults.category;
    const priority = n.priority ?? defaults.priority;
    const acknowledgedAt = n.acknowledgedAt;

    await prisma.staffNotification.upsert({
      where: { id: n.id },
      update: {
        title: n.title,
        message: n.message,
        category,
        priority,
        status: n.status ?? "UNREAD",
        source: n.source,
        sourceKey: `seed:${n.id}`,
        recommendedNextAction:
          n.recommendedNextAction ?? defaults.recommendedNextAction,
        clientId: n.clientId,
        appointmentId: n.appointmentId,
        staffTaskId: n.staffTaskId,
        agentActionId: n.agentActionId,
        staffInterventionId: n.staffInterventionId,
        workflowKey: n.workflowKey,
        assignedRole: n.assignedRole ?? defaults.roles[0],
        assignedUserId: n.assignedUserId,
        metadata: demoMeta({ targetRoles: defaults.roles }),
        createdByUserId: admin.id,
        acknowledgedAt,
      },
      create: {
        id: n.id,
        title: n.title,
        message: n.message,
        category,
        priority,
        status: n.status ?? "UNREAD",
        source: n.source,
        sourceKey: `seed:${n.id}`,
        recommendedNextAction:
          n.recommendedNextAction ?? defaults.recommendedNextAction,
        clientId: n.clientId,
        appointmentId: n.appointmentId,
        staffTaskId: n.staffTaskId,
        agentActionId: n.agentActionId,
        staffInterventionId: n.staffInterventionId,
        workflowKey: n.workflowKey,
        assignedRole: n.assignedRole ?? defaults.roles[0],
        assignedUserId: n.assignedUserId,
        metadata: demoMeta({ targetRoles: defaults.roles }),
        createdByUserId: admin.id,
        acknowledgedAt,
      },
    });

    if (n.createAudit) {
      await prisma.auditLog.upsert({
        where: { id: `seed-audit-${n.id}` },
        update: {},
        create: {
          id: `seed-audit-${n.id}`,
          action: "CREATE",
          entityType: "StaffNotification",
          entityId: n.id,
          userId: admin.id,
          clientId: n.clientId,
          metadata: demoMeta({
            source: n.source,
            category,
            priority,
            seedNotification: true,
          }),
        },
      });
    }
  }

  await prisma.clientTimelineEvent.upsert({
    where: { id: "seed-timeline-notif-confirmed" },
    update: {},
    create: {
      id: "seed-timeline-notif-confirmed",
      clientId: client1.id,
      eventType: "STAFF_NOTIFICATION",
      title: "Patient confirmed appointment",
      description:
        "Demo in-app notification — Maria Garcia confirmed wellness visit.",
      metadata: demoMeta({ notificationId: "seed-notif-appointment-confirmed" }),
      actorUserId: admin.id,
    },
  });

  const roleCount = await prisma.role.count();
  if (roleCount !== ROLES.length) {
    throw new Error(`Expected ${ROLES.length} roles, found ${roleCount}`);
  }

  const notifCount = await prisma.staffNotification.count({
    where: { sourceKey: { startsWith: "seed:" } },
  });

  console.log("Seed complete.");
  console.log(`  Staff users: ${STAFF_USERS.length} (each with individual bcrypt hash)`);
  console.log(`  Admin: ${ADMIN_EMAIL}`);
  console.log("  Waiting room demo: Maria (CHECKED_IN), James (WITH_PROVIDER), Sofia (WAITING)");
  console.log(`  Phase 11 demo notifications: ${notifCount} (admin-visible in-app samples)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
