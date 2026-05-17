import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { ExecutiveActionAlert, CommandCenterTone } from "@/lib/command-center/types";
import { cn } from "@/lib/utils";

const SEVERITY_BORDER: Record<CommandCenterTone, string> = {
  red: "border-l-red-600 bg-red-50/50",
  orange: "border-l-orange-500 bg-orange-50/50",
  yellow: "border-l-amber-500 bg-amber-50/50",
  blue: "border-l-sky-500 bg-sky-50/50",
  green: "border-l-emerald-500 bg-emerald-50/50",
  purple: "border-l-violet-500 bg-violet-50/50",
  gray: "border-l-slate-400 bg-slate-50/50",
};

export function CriticalActionCenter({ alerts }: { alerts: ExecutiveActionAlert[] }) {
  if (alerts.length === 0) {
    return (
      <section className="medflow-card border-l-4 border-l-emerald-500 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          <AlertTriangle className="h-4 w-4 text-emerald-600" />
          Critical Action Center
        </h2>
        <p className="mt-3 text-sm text-slate-600">No urgent operational actions — clinic flow is stable.</p>
      </section>
    );
  }

  return (
    <section className="medflow-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-red-800">
          <AlertTriangle className="h-4 w-4" />
          Critical Action Center · {alerts.length} item(s)
        </h2>
        <Link
          href="/dashboard/notifications"
          className="text-sm font-medium text-medflow-700 hover:text-medflow-800"
        >
          View all
        </Link>
      </div>
      <ul className="space-y-3">
        {alerts.slice(0, 8).map((alert) => (
          <li
            key={alert.id}
            className={cn(
              "rounded-lg border border-slate-100 border-l-4 p-4",
              SEVERITY_BORDER[alert.severity]
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{alert.title}</p>
                {alert.patientSummary && (
                  <p className="mt-1 text-xs text-slate-600">{alert.patientSummary}</p>
                )}
                <p className="mt-2 text-sm text-slate-700">{alert.recommendedNextAction}</p>
              </div>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium uppercase text-slate-600">
                {alert.severity}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
              <span>Owner: {alert.assignedOwner}</span>
              <span>Waiting: {alert.timeWaiting}</span>
              <span>Status: {alert.escalationStatus}</span>
            </div>
            <Link
              href={alert.href}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-medflow-700"
            >
              Take action
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
