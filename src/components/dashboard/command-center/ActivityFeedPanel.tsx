import type { ActivityFeedEntry, CommandCenterTone } from "@/lib/command-center/types";
import { cn } from "@/lib/utils";

const DOT: Record<CommandCenterTone, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-amber-500",
  blue: "bg-sky-500",
  green: "bg-emerald-500",
  purple: "bg-violet-500",
  gray: "bg-slate-400",
};

export function ActivityFeedPanel({ entries }: { entries: ActivityFeedEntry[] }) {
  return (
    <section className="medflow-card flex flex-col p-5 lg:max-h-[520px]">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Live Activity Feed
      </h2>
      <p className="mt-1 text-xs text-slate-500">PHI-safe operational stream</p>
      <ul className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <li className="text-sm text-slate-500">No activity recorded today.</li>
        ) : (
          entries.map((entry) => (
            <li key={entry.id} className="flex gap-3 text-sm">
              <span
                className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[entry.tone])}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{entry.message}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {entry.category} · {entry.time}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
