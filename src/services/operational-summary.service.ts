import { prisma } from "@/lib/prisma";
import { getOperationalDayBounds } from "@/lib/command-center/day-bounds";
import { ACTIVE_WAITING_ROOM_STATES } from "@/lib/waiting-room";
import {
  MISSED_INBOUND_STATUSES,
  MISSED_CALL_PURPOSE,
  openMissedInboundCallLogWhere,
} from "@/services/missed-call.service";

const DELAYED_WAIT_MINUTES = 30;
const LOOKBACK_7D = new Date(Date.now() - 7 * 86400_000);

export type OperationalSummary = {
  todayStart: Date;
  todayEnd: Date;
  appointmentsToday: number;
  activeVisits: number;
  checkedInToday: number;
  waitingNow: number;
  withProviderNow: number;
  completedVisitsToday: number;
  cancellationsToday: number;
  reschedulesToday: number;
  noShowsToday: number;
  walkInsActive: number;
  walkInsToday: number;
  delayedPatients: number;
  openInterventions: number;
  stuckWorkflows: number;
  failedWorkflows: number;
  openStaffTasks: number;
  pendingProposals: number;
  openAdminAlerts: number;
  openIncidents: number;
  reminderFailed7d: number;
  reminderConfirmed7d: number;
  reminderTotal7d: number;
  pendingCalls: number;
  missedInboundCallsOpen: number;
  missedInboundCallsToday: number;
  pendingSms: number;
  pendingEmails: number;
  schedulingConflictsBlocked: number;
  duplicateActionsPrevented: number;
  billingTasksOpen: number;
  exportEvents7d: number;
  staffOverrides7d: number;
};

export const operationalSummaryService = {
  async getSummary(): Promise<OperationalSummary> {
    const { todayStart, todayEnd } = getOperationalDayBounds();

    const [
      appointmentsToday,
      activeVisits,
      checkedInToday,
      waitingNow,
      withProviderNow,
      completedVisitsToday,
      cancellationsToday,
      reschedulesToday,
      noShowsToday,
      walkInsActive,
      walkInsToday,
      delayedWaiting,
      delayedAppointments,
      openInterventions,
      stuckWorkflows,
      failedWorkflows,
      openStaffTasks,
      pendingProposals,
      openAdminAlerts,
      openIncidents,
      reminderFailed7d,
      reminderConfirmed7d,
      reminderTotal7d,
      pendingCalls,
      missedInboundCallsOpen,
      missedInboundCallsToday,
      pendingSms,
      pendingEmails,
      schedulingConflictsBlocked,
      duplicateActionsPrevented,
      billingTasksOpen,
      exportEvents7d,
      staffOverrides7d,
    ] = await Promise.all([
      prisma.appointment.count({
        where: { scheduledAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.appointment.count({
        where: {
          scheduledAt: { gte: todayStart, lte: todayEnd },
          status: { in: ["CHECKED_IN", "WAITING", "WITH_PROVIDER"] },
        },
      }),
      prisma.physicalCheckIn.count({
        where: { arrivedAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.waitingRoomStatus.count({
        where: { state: { in: ["WAITING", "CALLED", "CHECKED_IN"] } },
      }),
      prisma.waitingRoomStatus.count({
        where: { state: "WITH_PROVIDER" },
      }),
      prisma.waitingRoomStatus.count({
        where: {
          state: "COMPLETED",
          completedAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.appointment.count({
        where: {
          scheduledAt: { gte: todayStart, lte: todayEnd },
          status: "CANCELLED",
        },
      }),
      prisma.appointment.count({
        where: {
          scheduledAt: { gte: todayStart, lte: todayEnd },
          status: { in: ["RESCHEDULED", "RESCHEDULE_REQUESTED"] },
        },
      }),
      prisma.appointment.count({
        where: {
          scheduledAt: { gte: todayStart, lte: todayEnd },
          status: "NO_SHOW",
        },
      }),
      prisma.walkInVisit.count({ where: { onboardingStatus: "IN_PROGRESS" } }),
      prisma.walkInVisit.count({
        where: { arrivedAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.waitingRoomStatus.count({
        where: {
          state: { in: ACTIVE_WAITING_ROOM_STATES },
          waitDurationMinutes: { gte: DELAYED_WAIT_MINUTES },
        },
      }),
      prisma.appointment.count({
        where: {
          scheduledAt: { lt: new Date(), gte: todayStart },
          status: { in: ["SCHEDULED", "CONFIRMED"] },
        },
      }),
      prisma.staffIntervention.count({
        where: { status: { notIn: ["RESOLVED"] } },
      }),
      prisma.workflowHealthEvent.count({ where: { status: "STUCK" } }),
      prisma.workflowHealthEvent.count({ where: { status: "FAILED" } }),
      prisma.staffTask.count({
        where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
      }),
      prisma.agentAction.count({
        where: { proposalStatus: "PENDING_APPROVAL" },
      }),
      prisma.adminAlert.count({ where: { status: "OPEN" } }),
      prisma.coordinationIncident.count({ where: { resolved: false } }),
      prisma.reminderLog.count({
        where: { outcome: { in: ["FAILED", "ESCALATED"] }, createdAt: { gte: LOOKBACK_7D } },
      }),
      prisma.reminderLog.count({
        where: { outcome: "CONFIRMED", createdAt: { gte: LOOKBACK_7D } },
      }),
      prisma.reminderLog.count({ where: { createdAt: { gte: LOOKBACK_7D } } }),
      prisma.callLog.count({ where: { status: "PENDING" } }),
      prisma.callLog.count({
        where: openMissedInboundCallLogWhere(),
      }),
      prisma.callLog.count({
        where: {
          direction: "INBOUND",
          purpose: MISSED_CALL_PURPOSE,
          status: { in: MISSED_INBOUND_STATUSES },
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.smsLog.count({ where: { status: "PENDING" } }),
      prisma.emailLog.count({ where: { status: "PENDING" } }),
      prisma.coordinationIncident.count({
        where: { incidentType: "SCHEDULING_CONFLICT", createdAt: { gte: LOOKBACK_7D } },
      }),
      prisma.coordinationIncident.count({
        where: { incidentType: "DUPLICATE_ACTION", createdAt: { gte: LOOKBACK_7D } },
      }),
      prisma.staffTask.count({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS"] },
          title: { contains: "billing", mode: "insensitive" },
        },
      }),
      prisma.auditLog.count({
        where: { action: "EXPORT", createdAt: { gte: LOOKBACK_7D } },
      }),
      prisma.staffOverride.count({ where: { createdAt: { gte: LOOKBACK_7D } } }),
    ]);

    return {
      todayStart,
      todayEnd,
      appointmentsToday,
      activeVisits,
      checkedInToday,
      waitingNow,
      withProviderNow,
      completedVisitsToday,
      cancellationsToday,
      reschedulesToday,
      noShowsToday,
      walkInsActive,
      walkInsToday,
      delayedPatients: delayedWaiting + delayedAppointments,
      openInterventions,
      stuckWorkflows,
      failedWorkflows,
      openStaffTasks,
      pendingProposals,
      openAdminAlerts,
      openIncidents,
      reminderFailed7d,
      reminderConfirmed7d,
      reminderTotal7d,
      pendingCalls,
      missedInboundCallsOpen,
      missedInboundCallsToday,
      pendingSms,
      pendingEmails,
      schedulingConflictsBlocked,
      duplicateActionsPrevented,
      billingTasksOpen,
      exportEvents7d,
      staffOverrides7d,
    };
  },
};
