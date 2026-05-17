import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CommandCenterSection, CommandCenterTone } from "@/lib/command-center/types";
import { cn } from "@/lib/utils";

const TONE_STYLES: Record<
  CommandCenterTone,
  { border: string; badge: string; count: string }
> = {
  red: {
    border: "border-l-red-600",
    badge: "bg-red-100 text-red-900",
    count: "text-red-700",
  },
  orange: {
    border: "border-l-orange-500",
    badge: "bg-orange-100 text-orange-900",
    count: "text-orange-700",
  },
  yellow: {
    border: "border-l-amber-500",
    badge: "bg-amber-100 text-amber-900",
    count: "text-amber-700",
  },
  blue: {
    border: "border-l-sky-500",
    badge: "bg-sky-100 text-sky-900",
    count: "text-sky-700",
  },
  green: {
    border: "border-l-emerald-500",
    badge: "bg-emerald-100 text-emerald-900",
    count: "text-emerald-700",
  },
  purple: {
    border: "border-l-violet-500",
    badge: "bg-violet-100 text-violet-900",
    count: "text-violet-700",
  },
  gray: {
    border: "border-l-slate-400",
    badge: "bg-slate-100 text-slate-800",
    count: "text-slate-700",
  },
};

export function CommandCenterSectionCard({ section }: { section: CommandCenterSection }) {
  const styles = TONE_STYLES[section.tone];

  return (
    <article
      className={cn(
        "medflow-card flex flex-col border-l-4 p-5",
        styles.border
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {section.title}
          </h3>
          <p className={cn("mt-1 text-3xl font-bold tabular-nums", styles.count)}>
            {section.count}
          </p>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", styles.badge)}>
          {section.tone}
        </span>
      </div>

      <p className="mt-3 text-sm text-slate-600">{section.recommendedNextAction}</p>

      <ul className="mt-4 flex-1 space-y-2">
        {section.items.length === 0 ? (
          <li className="text-sm text-slate-500">Nothing queued.</li>
        ) : (
          section.items.map((item) => (
            <li
              key={item.id}
              className="rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm"
            >
              <p className="font-medium text-slate-900">{item.label}</p>
              {item.detail && (
                <p className="mt-0.5 text-xs text-slate-600">{item.detail}</p>
              )}
              {item.time && (
                <p className="mt-0.5 text-xs text-slate-400">{item.time}</p>
              )}
            </li>
          ))
        )}
      </ul>

      <Link
        href={section.href}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-medflow-700 hover:text-medflow-800"
      >
        View details
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}
