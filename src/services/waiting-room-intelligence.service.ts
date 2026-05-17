import { prisma } from "@/lib/prisma";
import type { CommandCenterTone } from "@/lib/command-center/types";
import { safeClientRef, safeStatusLabel } from "@/lib/command-center/safe-summary";
import { ACTIVE_WAITING_ROOM_STATES } from "@/lib/waiting-room";
import { getOperationalDayBounds } from "@/lib/command-center/day-bounds";

export type WaitingRoomRecommendation = {
  id: string;
  label: string;
  detail: string;
  tone: CommandCenterTone;
};

export type WaitingRoomIntelligence = {
  longestWaitMinutes: number;
  averageWaitMinutes: number;
  queueCount: number;
  overloadedQueues: number;
  providerDelays: number;
  availableProviders: string[];
  recommendations: WaitingRoomRecommendation[];
  queueItems: Array<{
    id: string;
    label: string;
    detail?: string;
    time?: string;
  }>;
};

const OVERLOAD_THRESHOLD = 6;
const DELAY_THRESHOLD = 30;

export const waitingRoomIntelligenceService = {
  async analyze(): Promise<WaitingRoomIntelligence> {
    const { todayStart, todayEnd } = getOperationalDayBounds();

    const [queue, avgAgg, providerRows] = await Promise.all([
      prisma.waitingRoomStatus.findMany({
        where: { state: { in: ACTIVE_WAITING_ROOM_STATES } },
        orderBy: [{ waitDurationMinutes: "desc" }, { queuePosition: "asc" }],
        take: 12,
        select: {
          id: true,
          state: true,
          queuePosition: true,
          waitDurationMinutes: true,
          location: true,
          client: { select: { id: true, mrn: true } },
        },
      }),
      prisma.waitingRoomStatus.aggregate({
        where: {
          state: { in: ACTIVE_WAITING_ROOM_STATES },
          waitDurationMinutes: { not: null },
        },
        _avg: { waitDurationMinutes: true },
        _max: { waitDurationMinutes: true },
      }),
      prisma.appointment.findMany({
        where: {
          scheduledAt: { gte: todayStart, lte: todayEnd },
          providerName: { not: null },
        },
        select: { providerName: true, status: true },
      }),
    ]);

    const longestWaitMinutes = avgAgg._max.waitDurationMinutes ?? 0;
    const averageWaitMinutes = Math.round(avgAgg._avg.waitDurationMinutes ?? 0);
    const queueCount = queue.length;
    const overloadedQueues = queueCount >= OVERLOAD_THRESHOLD ? 1 : 0;
    const providerDelays = queue.filter(
      (q) => (q.waitDurationMinutes ?? 0) >= DELAY_THRESHOLD
    ).length;

    const busyProviders = new Set(
      providerRows
        .filter((p) =>
          ["CHECKED_IN", "WAITING", "WITH_PROVIDER"].includes(p.status)
        )
        .map((p) => p.providerName!)
    );
    const allProviders = new Set(
      providerRows.map((p) => p.providerName!).filter(Boolean)
    );
    const availableProviders = Array.from(allProviders).filter((p) => !busyProviders.has(p));

    const recommendations: WaitingRoomRecommendation[] = [];
    if (providerDelays >= 2) {
      recommendations.push({
        id: "reassign",
        label: "Reassign provider",
        detail: "Multiple patients exceed wait-time target — balance load",
        tone: "orange",
      });
    }
    if (queueCount >= OVERLOAD_THRESHOLD) {
      recommendations.push({
        id: "overflow",
        label: "Open overflow room",
        detail: "Queue volume exceeds capacity threshold",
        tone: "red",
      });
    }
    if (overloadedQueues > 0 && availableProviders.length > 0) {
      recommendations.push({
        id: "move",
        label: "Move patient to available provider",
        detail: `${availableProviders.length} provider(s) have open capacity`,
        tone: "blue",
      });
    }
    if (providerDelays >= 3) {
      recommendations.push({
        id: "staffing",
        label: "Escalate staffing issue",
        detail: "Patient wait time exceeds target across the queue",
        tone: "red",
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        id: "ok",
        label: "Flow within target",
        detail: "No immediate queue actions required",
        tone: "green",
      });
    }

    return {
      longestWaitMinutes,
      averageWaitMinutes,
      queueCount,
      overloadedQueues,
      providerDelays,
      availableProviders: availableProviders.slice(0, 5),
      recommendations,
      queueItems: queue.slice(0, 5).map((q) => ({
        id: q.id,
        label: `Queue #${q.queuePosition ?? "—"} · ${safeStatusLabel(q.state)}`,
        detail: `${safeClientRef({ mrn: q.client.mrn, clientId: q.client.id })} · ${q.waitDurationMinutes ?? 0} min${q.location ? ` · ${q.location}` : ""}`,
      })),
    };
  },
};
