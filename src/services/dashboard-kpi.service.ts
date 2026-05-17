import { prisma } from "@/lib/prisma";
import type { CommandCenterTone } from "@/lib/command-center/types";
import { getOperationalDayBounds } from "@/lib/command-center/day-bounds";
import { operationalSummaryService, type OperationalSummary } from "./operational-summary.service";

export type ExecutiveKpiItem = {
  key: string;
  label: string;
  value: string;
  tone: CommandCenterTone;
  href: string;
};

function pct(n: number, d: number) {
  if (d <= 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

function toneFromCount(
  count: number,
  thresholds: { warn: number; critical: number }
): CommandCenterTone {
  if (count >= thresholds.critical) return "red";
  if (count >= thresholds.warn) return "orange";
  if (count > 0) return "yellow";
  return "green";
}

export const dashboardKpiService = {
  async getKpis(
    summary: OperationalSummary,
    criticalAlerts: number
  ): Promise<ExecutiveKpiItem[]> {
    const { todayStart, todayEnd } = getOperationalDayBounds();
    const lookback = new Date(Date.now() - 7 * 86400_000);

    const [avgWait, providersActive, agentExecuted, agentTotal, workflowRecovered] =
      await Promise.all([
        prisma.waitingRoomStatus.aggregate({
          where: {
            state: { in: ["WAITING", "CALLED", "CHECKED_IN"] },
            waitDurationMinutes: { not: null },
          },
          _avg: { waitDurationMinutes: true },
        }),
        prisma.appointment.findMany({
          where: {
            scheduledAt: { gte: todayStart, lte: todayEnd },
            status: { in: ["CHECKED_IN", "WAITING", "WITH_PROVIDER"] },
            providerName: { not: null },
          },
          select: { providerName: true },
          distinct: ["providerName"],
        }),
        prisma.agentAction.count({
          where: { proposalStatus: "EXECUTED", createdAt: { gte: lookback } },
        }),
        prisma.agentAction.count({ where: { createdAt: { gte: lookback } } }),
        prisma.workflowHealthEvent.count({
          where: { status: "HEALTHY", recordedAt: { gte: lookback } },
        }),
      ]);

    const aiSuccess = pct(agentExecuted, agentTotal);
    const workflowRecovery = pct(
      workflowRecovered,
      summary.stuckWorkflows + summary.failedWorkflows + workflowRecovered
    );
    const reminderConfirm = pct(summary.reminderConfirmed7d, summary.reminderTotal7d);

    const avgWaitVal = Math.round(avgWait._avg.waitDurationMinutes ?? 0);

    return [
      {
        key: "patientsToday",
        label: "Patients today",
        value: String(summary.appointmentsToday),
        tone: "blue",
        href: "/dashboard/appointments",
      },
      {
        key: "checkedIn",
        label: "Checked in",
        value: String(summary.checkedInToday),
        tone: "blue",
        href: "/dashboard/check-ins",
      },
      {
        key: "waitingNow",
        label: "Waiting now",
        value: String(summary.waitingNow),
        tone: toneFromCount(summary.waitingNow, { warn: 4, critical: 8 }),
        href: "/dashboard/waiting-room",
      },
      {
        key: "delayed",
        label: "Delayed",
        value: String(summary.delayedPatients),
        tone: toneFromCount(summary.delayedPatients, { warn: 1, critical: 3 }),
        href: "/dashboard/waiting-room",
      },
      {
        key: "criticalAlerts",
        label: "Critical alerts",
        value: String(criticalAlerts),
        tone: toneFromCount(criticalAlerts, { warn: 1, critical: 3 }),
        href: "/dashboard/notifications",
      },
      {
        key: "noShows",
        label: "No-shows",
        value: String(summary.noShowsToday),
        tone: toneFromCount(summary.noShowsToday, { warn: 2, critical: 5 }),
        href: "/dashboard/appointments",
      },
      {
        key: "walkIns",
        label: "Walk-ins",
        value: String(summary.walkInsToday),
        tone: summary.walkInsActive > 0 ? "orange" : "green",
        href: "/dashboard/walk-ins",
      },
      {
        key: "providersActive",
        label: "Providers active",
        value: String(providersActive.length),
        tone: "blue",
        href: "/dashboard/appointments",
      },
      {
        key: "avgWait",
        label: "Avg wait (min)",
        value: String(avgWaitVal),
        tone: toneFromCount(avgWaitVal, { warn: 25, critical: 45 }),
        href: "/dashboard/waiting-room",
      },
      {
        key: "interventions",
        label: "Open interventions",
        value: String(summary.openInterventions),
        tone: toneFromCount(summary.openInterventions, { warn: 2, critical: 5 }),
        href: "/dashboard/staff-intervention",
      },
      {
        key: "aiSuccess",
        label: "AI success rate",
        value: aiSuccess,
        tone: agentTotal === 0 ? "gray" : "purple",
        href: "/dashboard/agent-coordination",
      },
      {
        key: "workflowRecovery",
        label: "Workflow recovery",
        value: workflowRecovery,
        tone: summary.stuckWorkflows > 0 ? "orange" : "green",
        href: "/dashboard/supervisor",
      },
      {
        key: "reminderConfirm",
        label: "Reminder confirm",
        value: reminderConfirm,
        tone: summary.reminderFailed7d > 0 ? "yellow" : "green",
        href: "/dashboard/reminders",
      },
    ];
  },
};
