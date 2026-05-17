import { prisma } from "@/lib/prisma";
import type { CommandCenterTone } from "@/lib/command-center/types";
import { getOperationalDayBounds } from "@/lib/command-center/day-bounds";

export type ProviderUtilizationRow = {
  providerName: string;
  patientsSeen: number;
  activeNow: number;
  utilizationPct: number;
  avgVisitMinutes: number;
  tone: CommandCenterTone;
};

export type ProviderUtilizationSummary = {
  rows: ProviderUtilizationRow[];
  capacityWarnings: number;
  openCapacitySlots: number;
};

const TARGET_DAILY_CAPACITY = 16;

function utilizationTone(pct: number): CommandCenterTone {
  if (pct >= 95) return "red";
  if (pct >= 80) return "orange";
  if (pct >= 60) return "yellow";
  return "green";
}

export const providerUtilizationService = {
  async getUtilization(): Promise<ProviderUtilizationSummary> {
    const { todayStart, todayEnd } = getOperationalDayBounds();

    const appointments = await prisma.appointment.findMany({
      where: {
        scheduledAt: { gte: todayStart, lte: todayEnd },
        providerName: { not: null },
      },
      select: {
        providerName: true,
        status: true,
        durationMinutes: true,
      },
    });

    const byProvider = new Map<
      string,
      { seen: number; active: number; totalMinutes: number; count: number }
    >();

    for (const a of appointments) {
      const name = a.providerName!;
      const cur = byProvider.get(name) ?? {
        seen: 0,
        active: 0,
        totalMinutes: 0,
        count: 0,
      };
      if (a.status === "COMPLETED") cur.seen += 1;
      if (["CHECKED_IN", "WAITING", "WITH_PROVIDER"].includes(a.status)) {
        cur.active += 1;
      }
      cur.totalMinutes += a.durationMinutes;
      cur.count += 1;
      byProvider.set(name, cur);
    }

    const rows: ProviderUtilizationRow[] = Array.from(byProvider.entries()).map(
      ([providerName, stats]) => {
        const utilizationPct = Math.min(
          100,
          Math.round((stats.count / TARGET_DAILY_CAPACITY) * 100)
        );
        return {
          providerName,
          patientsSeen: stats.seen,
          activeNow: stats.active,
          utilizationPct,
          avgVisitMinutes:
            stats.count > 0 ? Math.round(stats.totalMinutes / stats.count) : 0,
          tone: utilizationTone(utilizationPct),
        };
      }
    );

    rows.sort((a, b) => b.utilizationPct - a.utilizationPct);

    const capacityWarnings = rows.filter((r) => r.utilizationPct >= 80).length;
    const scheduledTotal = appointments.length;
    const openCapacitySlots = Math.max(0, TARGET_DAILY_CAPACITY * rows.length - scheduledTotal);

    return {
      rows: rows.slice(0, 6),
      capacityWarnings,
      openCapacitySlots,
    };
  },
};
