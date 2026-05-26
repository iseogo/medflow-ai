import { prisma } from "@/lib/prisma";

export type WorkflowDashboardData = {
  urgentCounts: {
    pendingApprovals: number;
    missedCallbacks: number;
    noShowFollowUp: number;
    openEscalations: number;
    rescheduleRequests: number;
  };
  pendingTasks: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    clientName: string | null;
    clientId: string | null;
  }>;
  noShowAppointments: Array<{
    id: string;
    clientName: string;
    scheduledAt: Date;
    reason: string | null;
    providerName: string | null;
    hasTask: boolean;
  }>;
  cancellationsAndReschedules: Array<{
    id: string;
    clientName: string;
    scheduledAt: Date;
    reason: string | null;
    status: string;
  }>;
  todayCommunications: {
    reminders: { total: number; confirmed: number; noResponse: number; failed: number; cancelled: number };
    reminderChannels: { voice: number; sms: number; email: number };
    inboundCalls: { total: number; answered: number; missed: number };
    outboundCalls: { total: number; answered: number; failed: number };
    smsTotal: number;
    emailTotal: number;
  };
  todayAppointments: Array<{
    id: string;
    clientName: string;
    scheduledAt: Date;
    status: string;
    providerName: string | null;
    reason: string | null;
    reminderOutcome: string | null;
    reminderChannel: string | null;
  }>;
  walkInPending: Array<{
    id: string;
    clientName: string;
    onboardingStatus: string;
    visitType: string;
    arrivedAt: Date;
  }>;
};

export const workflowDashboardService = {
  async getData(): Promise<WorkflowDashboardData> {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const weekAgo = new Date(now.getTime() - 7 * 86400_000);

    const [
      pendingApprovals,
      pendingTasksRaw,
      noShowAppts,
      cancelledReschedule,
      todayReminders,
      todayCalls,
      todaySms,
      todayEmails,
      todayAppts,
      recentWalkIns,
      openEscalations,
    ] = await Promise.all([
      prisma.agentAction.count({ where: { proposalStatus: "PENDING_APPROVAL" } }),

      prisma.staffTask.findMany({
        where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        take: 20,
        include: {
          client: { select: { firstName: true, lastName: true, id: true } },
        },
      }),

      prisma.appointment.findMany({
        where: { status: "NO_SHOW", scheduledAt: { gte: weekAgo } },
        orderBy: { scheduledAt: "desc" },
        take: 10,
        include: {
          client: { select: { firstName: true, lastName: true, id: true } },
        },
      }),

      prisma.appointment.findMany({
        where: {
          status: { in: ["CANCELLED", "RESCHEDULE_REQUESTED"] },
          scheduledAt: { gte: weekAgo },
        },
        orderBy: { scheduledAt: "desc" },
        take: 10,
        include: {
          client: { select: { firstName: true, lastName: true } },
        },
      }),

      prisma.reminderLog.findMany({
        where: { dueAt: { gte: weekAgo } },
        select: {
          outcome: true,
          voiceCallLogId: true,
          smsLogId: true,
          emailLogId: true,
        },
      }),

      prisma.callLog.findMany({
        where: { createdAt: { gte: todayStart, lte: todayEnd } },
        select: { direction: true, status: true },
      }),

      prisma.smsLog.count({ where: { createdAt: { gte: todayStart } } }),

      prisma.emailLog.count({ where: { createdAt: { gte: todayStart } } }),

      prisma.appointment.findMany({
        where: { scheduledAt: { gte: todayStart, lte: todayEnd } },
        orderBy: { scheduledAt: "asc" },
        include: {
          client: { select: { firstName: true, lastName: true } },
          reminderLogs: {
            orderBy: { dueAt: "desc" },
            take: 1,
            select: {
              outcome: true,
              voiceCallLogId: true,
              smsLogId: true,
              emailLogId: true,
            },
          },
        },
      }),

      prisma.walkInVisit.findMany({
        where: {
          onboardingStatus: { not: "COMPLETED" },
          arrivedAt: { gte: weekAgo },
        },
        orderBy: { arrivedAt: "desc" },
        take: 10,
        include: {
          client: { select: { firstName: true, lastName: true } },
        },
      }),

      prisma.staffIntervention.count({
        where: { status: { notIn: ["RESOLVED"] } },
      }),
    ]);

    // Pending task IDs for client lookup when checking no-show tasks
    const noShowClientIds = noShowAppts.map((a) => a.clientId);
    const noShowTasks = noShowClientIds.length
      ? await prisma.staffTask.findMany({
          where: {
            clientId: { in: noShowClientIds },
            title: { startsWith: "No-show follow-up" },
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
          select: { clientId: true },
        })
      : [];
    const noShowClientIdsWithTask = new Set(noShowTasks.map((t) => t.clientId));

    // Aggregate task counts
    const missedCallbacks = pendingTasksRaw.filter((t) =>
      t.title.toLowerCase().includes("missed") ||
      t.title.toLowerCase().includes("call patient back")
    ).length;

    const noShowFollowUp = pendingTasksRaw.filter((t) =>
      t.title.toLowerCase().includes("no-show")
    ).length;

    const rescheduleRequests =
      cancelledReschedule.filter((a) => a.status === "RESCHEDULE_REQUESTED").length;

    // Reminder aggregation
    const reminderCounts = { total: 0, confirmed: 0, noResponse: 0, failed: 0, cancelled: 0 };
    const reminderChannels = { voice: 0, sms: 0, email: 0 };
    for (const r of todayReminders) {
      reminderCounts.total++;
      if (r.outcome === "CONFIRMED") reminderCounts.confirmed++;
      else if (r.outcome === "NO_RESPONSE") reminderCounts.noResponse++;
      else if (r.outcome === "FAILED") reminderCounts.failed++;
      else if (r.outcome === "CANCELLED") reminderCounts.cancelled++;
      if (r.voiceCallLogId) reminderChannels.voice++;
      if (r.smsLogId) reminderChannels.sms++;
      if (r.emailLogId) reminderChannels.email++;
    }

    // Call aggregation (today)
    const inboundCalls = { total: 0, answered: 0, missed: 0 };
    const outboundCalls = { total: 0, answered: 0, failed: 0 };
    for (const c of todayCalls) {
      if (c.direction === "INBOUND") {
        inboundCalls.total++;
        if (c.status === "ANSWERED") inboundCalls.answered++;
        else if (["NO_ANSWER", "MISSED", "ABANDONED", "FAILED"].includes(c.status)) inboundCalls.missed++;
      } else {
        outboundCalls.total++;
        if (c.status === "ANSWERED") outboundCalls.answered++;
        else if (["FAILED", "NO_ANSWER"].includes(c.status)) outboundCalls.failed++;
      }
    }

    // Today's appointments with reminder info
    const todayAppointmentsFormatted = todayAppts.map((a) => {
      const lastReminder = a.reminderLogs[0] ?? null;
      let reminderChannel: string | null = null;
      if (lastReminder) {
        if (lastReminder.voiceCallLogId) reminderChannel = "Voice";
        else if (lastReminder.smsLogId) reminderChannel = "SMS";
        else if (lastReminder.emailLogId) reminderChannel = "Email";
      }
      return {
        id: a.id,
        clientName: `${a.client.lastName}, ${a.client.firstName}`,
        scheduledAt: a.scheduledAt,
        status: a.status,
        providerName: a.providerName,
        reason: a.reason,
        reminderOutcome: lastReminder?.outcome ?? null,
        reminderChannel,
      };
    });

    return {
      urgentCounts: {
        pendingApprovals,
        missedCallbacks,
        noShowFollowUp,
        openEscalations,
        rescheduleRequests,
      },
      pendingTasks: pendingTasksRaw.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        clientName: t.client
          ? `${t.client.lastName}, ${t.client.firstName}`
          : null,
        clientId: t.client?.id ?? null,
      })),
      noShowAppointments: noShowAppts.map((a) => ({
        id: a.id,
        clientName: `${a.client.lastName}, ${a.client.firstName}`,
        scheduledAt: a.scheduledAt,
        reason: a.reason,
        providerName: a.providerName,
        hasTask: noShowClientIdsWithTask.has(a.clientId),
      })),
      cancellationsAndReschedules: cancelledReschedule.map((a) => ({
        id: a.id,
        clientName: `${a.client.lastName}, ${a.client.firstName}`,
        scheduledAt: a.scheduledAt,
        reason: a.reason,
        status: a.status,
      })),
      todayCommunications: {
        reminders: reminderCounts,
        reminderChannels,
        inboundCalls,
        outboundCalls,
        smsTotal: todaySms,
        emailTotal: todayEmails,
      },
      todayAppointments: todayAppointmentsFormatted,
      walkInPending: recentWalkIns.map((w) => ({
        id: w.id,
        clientName: `${w.client.lastName}, ${w.client.firstName}`,
        onboardingStatus: w.onboardingStatus,
        visitType: w.visitType,
        arrivedAt: w.arrivedAt,
      })),
    };
  },
};
