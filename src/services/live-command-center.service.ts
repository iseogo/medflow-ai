import { RoleType } from "@prisma/client";
import { canRoleViewNotification } from "@/lib/notifications/notification-routing.service";
import { getOperationalDayBounds } from "@/lib/command-center/day-bounds";
import { sectionsForDisplayMode } from "@/lib/command-center/live-section-access";
import {
  LIVE_REFRESH_MS,
  LiveBoardItem,
  LiveBoardSection,
  LiveBoardSnapshot,
  LiveSectionKey,
} from "@/lib/command-center/live-types";
import type { CommandCenterTone } from "@/lib/command-center/types";
import {
  safeLivePatientTag,
  safeQueueLabel,
  safeStatusLabel,
  safeTimeLabel,
} from "@/lib/command-center/safe-summary";
import { isMockModeForced } from "@/lib/integrations/env";
import { ACTIVE_WAITING_ROOM_STATES } from "@/lib/waiting-room";
import { prisma } from "@/lib/prisma";
import { resolveDisplayMode } from "./display-mode.service";
import { liveActivityFeedService } from "./live-activity-feed.service";
import { operationalSummaryService } from "./operational-summary.service";
import { providerUtilizationService } from "./provider-utilization.service";
import { workflowBottleneckService } from "./workflow-bottleneck.service";
import { waitingRoomIntelligenceService } from "./waiting-room-intelligence.service";

function toneFromCount(
  count: number,
  thresholds: { warn: number; critical: number }
): CommandCenterTone {
  if (count >= thresholds.critical) return "red";
  if (count >= thresholds.warn) return "orange";
  if (count > 0) return "yellow";
  return "green";
}

export const liveCommandCenterService = {
  async getBoard(
    role: RoleType,
    userId: string,
    requestedMode?: string | null
  ): Promise<LiveBoardSnapshot> {
    const displayMode = resolveDisplayMode(role, requestedMode);
    const allowedKeys = sectionsForDisplayMode(role, displayMode);
    const { todayStart, todayEnd } = getOperationalDayBounds();
    const mockMode = isMockModeForced();

    const [summary, waitingIntel, providers, activityFeed, notificationsRaw] =
      await Promise.all([
        operationalSummaryService.getSummary(),
        waitingRoomIntelligenceService.analyze(),
        providerUtilizationService.getUtilization(),
        liveActivityFeedService.getFeed(role),
        prisma.staffNotification.findMany({
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 40,
          select: {
            id: true,
            title: true,
            category: true,
            priority: true,
            status: true,
            source: true,
            createdAt: true,
            assignedRole: true,
            assignedUserId: true,
            client: { select: { id: true, mrn: true } },
          },
        }),
      ]);

    const notifications = notificationsRaw.filter((n) =>
      canRoleViewNotification(role, {
        source: n.source,
        category: n.category,
        assignedRole: n.assignedRole,
        assignedUserId: n.assignedUserId,
        userId,
      })
    );

    const urgent = notifications.filter(
      (n) =>
        n.priority === "CRITICAL" ||
        n.category === "URGENT" ||
        n.category === "EMERGENCY"
    );

    const pinnedAlerts: LiveBoardItem[] = urgent.slice(0, 8).map((n) => ({
      id: n.id,
      headline: n.title,
      subline: n.client
        ? safeLivePatientTag({ mrn: n.client.mrn, clientId: n.client.id })
        : "Clinic-wide",
      tone:
        n.category === "EMERGENCY" || n.priority === "CRITICAL" ? "red" : "orange",
      pinned: true,
    }));

    const sectionBuilders: Record<
      LiveSectionKey,
      () => Promise<LiveBoardSection> | LiveBoardSection
    > = {
      criticalAlerts: () => ({
        key: "criticalAlerts",
        title: "Critical Alerts",
        count: urgent.length,
        tone: toneFromCount(urgent.length, { warn: 1, critical: 3 }),
        items: urgent.slice(0, 6).map((n) => ({
          id: n.id,
          headline: n.title,
          subline: safeStatusLabel(n.status),
          tone: n.priority === "CRITICAL" ? "red" : "orange",
          pinned: true,
        })),
      }),
      waitingRoom: async () => {
        const queue = await prisma.waitingRoomStatus.findMany({
          where: { state: { in: ACTIVE_WAITING_ROOM_STATES } },
          orderBy: { queuePosition: "asc" },
          take: 8,
          select: {
            id: true,
            state: true,
            queuePosition: true,
            waitDurationMinutes: true,
            location: true,
            client: { select: { id: true, mrn: true } },
          },
        });
        return {
          key: "waitingRoom",
          title: "Waiting Room Status",
          count: queue.length,
          tone: toneFromCount(waitingIntel.providerDelays, { warn: 2, critical: 4 }),
          items: queue.map((q) => ({
            id: q.id,
            headline: safeQueueLabel({
              queuePosition: q.queuePosition,
              location: q.location,
            }),
            subline: `${safeLivePatientTag({ mrn: q.client.mrn, clientId: q.client.id })} · ${q.waitDurationMinutes ?? 0} min · ${safeStatusLabel(q.state)}`,
            tone:
              (q.waitDurationMinutes ?? 0) >= 30
                ? "red"
                : (q.waitDurationMinutes ?? 0) >= 15
                  ? "orange"
                  : "blue",
          })),
        };
      },
      todayAppointments: async () => {
        const appts = await prisma.appointment.findMany({
          where: { scheduledAt: { gte: todayStart, lte: todayEnd } },
          orderBy: { scheduledAt: "asc" },
          take: 10,
          select: {
            id: true,
            scheduledAt: true,
            status: true,
            providerName: true,
            client: { select: { id: true, mrn: true } },
          },
        });
        return {
          key: "todayAppointments",
          title: "Today's Appointments",
          count: appts.length,
          tone: "blue",
          items: appts.map((a) => ({
            id: a.id,
            headline: safeTimeLabel(a.scheduledAt),
            subline: `${safeLivePatientTag({ mrn: a.client.mrn, clientId: a.client.id })} · ${safeStatusLabel(a.status)}${a.providerName ? ` · ${a.providerName}` : ""}`,
            tone:
              a.status === "NO_SHOW"
                ? "red"
                : a.status === "COMPLETED"
                  ? "green"
                  : "blue",
          })),
        };
      },
      walkIns: async () => {
        const walks = await prisma.walkInVisit.findMany({
          where: { arrivedAt: { gte: todayStart } },
          orderBy: { arrivedAt: "desc" },
          take: 8,
          select: {
            id: true,
            visitType: true,
            onboardingStatus: true,
            client: { select: { id: true, mrn: true } },
          },
        });
        return {
          key: "walkIns",
          title: "Walk-ins",
          count: walks.length,
          tone: summary.walkInsActive > 0 ? "orange" : "green",
          items: walks.map((w) => ({
            id: w.id,
            headline: safeLivePatientTag({ mrn: w.client.mrn, clientId: w.client.id }),
            subline: `${safeStatusLabel(w.visitType)} · ${safeStatusLabel(w.onboardingStatus)}`,
            tone: w.onboardingStatus === "IN_PROGRESS" ? "orange" : "green",
          })),
        };
      },
      checkIns: async () => {
        const checkins = await prisma.physicalCheckIn.findMany({
          where: { arrivedAt: { gte: todayStart } },
          orderBy: { arrivedAt: "desc" },
          take: 8,
          select: {
            id: true,
            checkInType: true,
            arrivedAt: true,
            client: { select: { id: true, mrn: true } },
          },
        });
        return {
          key: "checkIns",
          title: "Check-ins",
          count: checkins.length,
          tone: "green",
          items: checkins.map((c) => ({
            id: c.id,
            headline: safeLivePatientTag({ mrn: c.client.mrn, clientId: c.client.id }),
            subline: `${safeStatusLabel(c.checkInType)} · ${safeTimeLabel(c.arrivedAt)}`,
            tone: "green",
          })),
        };
      },
      staffTasks: async () => {
        const tasks = await prisma.staffTask.findMany({
          where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
          orderBy: { priority: "desc" },
          take: 8,
          select: { id: true, title: true, status: true, priority: true },
        });
        return {
          key: "staffTasks",
          title: "Staff Tasks",
          count: tasks.length,
          tone: toneFromCount(tasks.length, { warn: 5, critical: 12 }),
          items: tasks.map((t) => ({
            id: t.id,
            headline: t.title,
            subline: `${safeStatusLabel(t.status)} · ${safeStatusLabel(t.priority)}`,
            tone: t.priority === "URGENT" ? "red" : "yellow",
          })),
        };
      },
      providerCapacity: () => ({
        key: "providerCapacity",
        title: "Provider / Nurse Capacity",
        count: providers.rows.length,
        tone: providers.capacityWarnings > 0 ? "orange" : "green",
        items: providers.rows.map((p) => ({
          id: p.providerName,
          headline: p.providerName,
          subline: `${p.utilizationPct}% · ${p.activeNow} active · ${p.patientsSeen} seen`,
          tone: p.tone,
        })),
      }),
      reminderFailures: () => ({
        key: "reminderFailures",
        title: "Reminder Failures",
        count: summary.reminderFailed7d,
        tone: toneFromCount(summary.reminderFailed7d, { warn: 1, critical: 3 }),
        items: [
          {
            id: "failed",
            headline: `${summary.reminderFailed7d} failure(s) this week`,
            subline: mockMode ? "MOCK_MODE — simulated delivery only" : "Review reminder queue",
            tone: summary.reminderFailed7d > 0 ? "orange" : "green",
          },
        ],
      }),
      aiSupervisor: () => ({
        key: "aiSupervisor",
        title: "AI / Supervisor Warnings",
        count: summary.pendingProposals + summary.openAdminAlerts,
        tone: summary.pendingProposals > 0 ? "purple" : "blue",
        items: [
          {
            id: "ai",
            headline: `${summary.pendingProposals} AI proposal(s) pending`,
            subline: "Supervisor observe-only — staff approval required",
            tone: "purple",
          },
          {
            id: "sup",
            headline: `${summary.openAdminAlerts} supervisor alert(s)`,
            subline: `${summary.openIncidents} coordination finding(s)`,
            tone: summary.openAdminAlerts > 0 ? "orange" : "green",
          },
        ],
      }),
      workflowBottlenecks: () => {
        const bottlenecks = workflowBottleneckService.buildBottlenecks({
          summary,
          waiting: waitingIntel,
          providers,
          reminderFailures: summary.reminderFailed7d,
          webhookFailures: 0,
          pendingComms: summary.pendingCalls + summary.pendingSms,
        });
        return {
          key: "workflowBottlenecks",
          title: "Workflow Bottlenecks",
          count: bottlenecks.length,
          tone: toneFromCount(bottlenecks.length, { warn: 2, critical: 4 }),
          items: bottlenecks.slice(0, 6).map((b) => ({
            id: b.id,
            headline: b.label,
            subline: b.detail,
            tone: b.tone,
          })),
        };
      },
      liveActivityFeed: () => ({
        key: "liveActivityFeed",
        title: "Live Activity",
        count: activityFeed.length,
        tone: "blue",
        items: activityFeed.slice(0, 8).map((a) => ({
          id: a.id,
          headline: a.message,
          subline: `${a.category} · ${a.time}`,
          tone: a.tone,
        })),
      }),
    };

    const sections: LiveBoardSection[] = [];
    for (const key of allowedKeys) {
      if (key === "liveActivityFeed") continue;
      const built = await sectionBuilders[key]();
      sections.push(built);
    }

    const kpis =
      displayMode === "executive"
        ? [
            {
              label: "Waiting",
              value: String(summary.waitingNow),
              tone: toneFromCount(summary.waitingNow, { warn: 4, critical: 8 }),
            },
            {
              label: "Delayed",
              value: String(summary.delayedPatients),
              tone: toneFromCount(summary.delayedPatients, { warn: 1, critical: 3 }),
            },
            {
              label: "Critical",
              value: String(urgent.length),
              tone: toneFromCount(urgent.length, { warn: 1, critical: 3 }),
            },
            {
              label: "Interventions",
              value: String(summary.openInterventions),
              tone: toneFromCount(summary.openInterventions, { warn: 2, critical: 5 }),
            },
          ]
        : undefined;

    return {
      role,
      displayMode,
      mockMode,
      refreshIntervalMs: LIVE_REFRESH_MS,
      generatedAt: new Date().toISOString(),
      pinnedAlerts,
      sections,
      activityFeed,
      kpis,
    };
  },
};
