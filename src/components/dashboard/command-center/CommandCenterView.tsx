import type { CommandCenterSnapshot } from "@/lib/command-center/types";
import { cn } from "@/lib/utils";
import { ExecutiveKpiBar } from "./ExecutiveKpiBar";
import { CriticalActionCenter } from "./CriticalActionCenter";
import { ActivityFeedPanel } from "./ActivityFeedPanel";
import { CommandCenterSectionCard } from "./CommandCenterSectionCard";

const HEALTH_STYLES = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-900",
  degraded: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-red-200 bg-red-50 text-red-900",
} as const;

export function CommandCenterView({ snapshot }: { snapshot: CommandCenterSnapshot }) {
  const otherSections = snapshot.sections.filter((s) => s.id !== "criticalActionCenter");

  return (
    <div className="space-y-6">
      <ExecutiveKpiBar kpis={snapshot.kpis} />

      <div
        className={cn(
          "rounded-lg border px-4 py-3",
          HEALTH_STYLES[snapshot.systemHealth]
        )}
      >
        <p className="text-sm font-semibold uppercase tracking-wide">
          System health · {snapshot.systemHealth}
        </p>
        <p className="mt-1 text-sm opacity-90">
          {snapshot.mockMode
            ? "MOCK_MODE is ON — live APIs disabled (safe demo)"
            : "Live integration mode — verify settings before production"}
        </p>
        <p className="mt-1 text-xs opacity-75">
          Updated{" "}
          {new Date(snapshot.generatedAt).toLocaleString("en-US", {
            timeZone: "America/Chicago",
          })}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <CriticalActionCenter alerts={snapshot.criticalActions} />
          {otherSections.length === 0 ? (
            <p className="text-sm text-slate-600">
              No additional sections for your role. Contact an administrator for expanded access.
            </p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {otherSections.map((section) => (
                <CommandCenterSectionCard key={section.id} section={section} />
              ))}
            </div>
          )}
        </div>
        <ActivityFeedPanel entries={snapshot.activityFeed} />
      </div>
    </div>
  );
}
