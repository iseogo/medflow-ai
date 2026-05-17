import Link from "next/link";
import type { ExecutiveKpiItem, CommandCenterTone } from "@/lib/command-center/types";
import { cn } from "@/lib/utils";

const TONE_RING: Record<CommandCenterTone, string> = {
  red: "border-red-300 bg-red-50/90",
  orange: "border-orange-300 bg-orange-50/90",
  yellow: "border-amber-300 bg-amber-50/90",
  blue: "border-sky-300 bg-sky-50/90",
  green: "border-emerald-300 bg-emerald-50/90",
  purple: "border-violet-300 bg-violet-50/90",
  gray: "border-slate-300 bg-slate-50/90",
};

const TONE_VALUE: Record<CommandCenterTone, string> = {
  red: "text-red-800",
  orange: "text-orange-800",
  yellow: "text-amber-800",
  blue: "text-sky-800",
  green: "text-emerald-800",
  purple: "text-violet-800",
  gray: "text-slate-800",
};

export function ExecutiveKpiBar({ kpis }: { kpis: ExecutiveKpiItem[] }) {
  return (
    <div className="sticky top-0 z-20 -mx-8 border-b border-slate-200 bg-white/95 px-8 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Executive KPIs · Today
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {kpis.map((kpi) => (
          <Link
            key={kpi.key}
            href={kpi.href}
            className={cn(
              "min-w-[7.5rem] shrink-0 rounded-lg border px-3 py-2 transition hover:shadow-md",
              TONE_RING[kpi.tone]
            )}
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600">
              {kpi.label}
            </p>
            <p className={cn("mt-0.5 text-lg font-bold tabular-nums", TONE_VALUE[kpi.tone])}>
              {kpi.value}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
