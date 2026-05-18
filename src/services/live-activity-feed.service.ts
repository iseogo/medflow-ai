import { RoleType } from "@prisma/client";
import type { LiveActivityItem } from "@/lib/command-center/live-types";
import type { CommandCenterTone } from "@/lib/command-center/types";
import { getOperationalDayBounds } from "@/lib/command-center/day-bounds";
import {
  safeLivePatientTag,
  safeStatusLabel,
  safeTimeLabel,
} from "@/lib/command-center/safe-summary";
import { prisma } from "@/lib/prisma";

function mapTimelineMessage(
  eventType: string,
  patient: string,
  title?: string
): { message: string; category: string; tone: CommandCenterTone } {
  switch (eventType) {
    case "PHYSICAL_CHECK_IN":
      return { message: `${patient} checked in`, category: "Check-in", tone: "green" };
    case "WAITING_ROOM_STATUS_CHANGED":
      return { message: `${patient} — queue update`, category: "Waiting room", tone: "blue" };
    case "WALK_IN_REGISTERED":
      return { message: `Walk-in registered — ${patient}`, category: "Walk-in", tone: "blue" };
    case "WALK_IN_COMPLETED":
      return { message: `Walk-in completed — ${patient}`, category: "Walk-in", tone: "green" };
    case "REMINDER_CYCLE_COMPLETED":
      return { message: `Reminder confirmed — ${patient}`, category: "Reminders", tone: "green" };
    case "COMMUNICATION_CALL":
      if (title?.toLowerCase().includes("missed")) {
        return {
          message: `Missed inbound call — ${patient}`,
          category: "Communications",
          tone: "orange",
        };
      }
      return {
        message: `Call activity — ${patient}`,
        category: "Communications",
        tone: "gray",
      };
    case "AGENT_PROPOSAL_CREATED":
      return { message: "AI action awaiting review", category: "AI", tone: "purple" };
    case "STAFF_OVERRIDE":
      return { message: `Staff override — ${patient}`, category: "Staff", tone: "orange" };
    case "SUPERVISOR_ALERT":
    case "WORKFLOW_HEALTH":
      return {
        message: "Supervisor flagged workflow issue",
        category: "Supervisor",
        tone: "orange",
      };
    case "STAFF_NOTIFICATION":
      return { message: `Staff alert — ${patient}`, category: "Alert", tone: "yellow" };
    default:
      return { message: `Operations update — ${patient}`, category: "System", tone: "gray" };
  }
}

export const liveActivityFeedService = {
  async getFeed(_role: RoleType, limit = 24): Promise<LiveActivityItem[]> {
    const { todayStart } = getOperationalDayBounds();

    const [timeline, overrides, alerts] = await Promise.all([
      prisma.clientTimelineEvent.findMany({
        where: { createdAt: { gte: todayStart } },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          eventType: true,
          title: true,
          createdAt: true,
          clientId: true,
          client: { select: { id: true, mrn: true } },
        },
      }),
      prisma.staffOverride.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, targetType: true, createdAt: true },
      }),
      prisma.adminAlert.findMany({
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, title: true, severity: true, createdAt: true },
      }),
    ]);

    const items: LiveActivityItem[] = [];

    for (const t of timeline) {
      const patient = safeLivePatientTag({
        mrn: t.client.mrn,
        clientId: t.clientId,
      });
      const mapped = mapTimelineMessage(t.eventType, patient, t.title);
      items.push({
        id: `tl-${t.id}`,
        message: mapped.message,
        category: mapped.category,
        tone: mapped.tone,
        time: safeTimeLabel(t.createdAt),
      });
    }

    for (const o of overrides) {
      items.push({
        id: `ov-${o.id}`,
        message: `Staff override — ${safeStatusLabel(o.targetType)}`,
        category: "Staff",
        tone: "orange",
        time: safeTimeLabel(o.createdAt),
      });
    }

    for (const a of alerts) {
      items.push({
        id: `al-${a.id}`,
        message: a.title,
        category: "Supervisor",
        tone: a.severity === "CRITICAL" ? "red" : "yellow",
        time: safeTimeLabel(a.createdAt),
      });
    }

    return items.slice(0, limit);
  },
};
