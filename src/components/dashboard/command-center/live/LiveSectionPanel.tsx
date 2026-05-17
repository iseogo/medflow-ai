import type { LiveBoardSection } from "@/lib/command-center/live-types";
import { cn } from "@/lib/utils";
import { LIVE_TONE_BORDER, LIVE_TONE_TEXT } from "./live-tone-styles";

export function LiveSectionPanel({
  section,
  large = false,
}: {
  section: LiveBoardSection;
  large?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border-2 p-4 lg:p-6",
        LIVE_TONE_BORDER[section.tone]
      )}
    >
      <header className="mb-4 flex items-baseline justify-between gap-2">
        <h3
          className={cn(
            "font-bold uppercase tracking-wide text-white",
            large ? "text-2xl lg:text-3xl" : "text-lg lg:text-xl"
          )}
        >
          {section.title}
        </h3>
        <span
          className={cn(
            "tabular-nums font-bold",
            large ? "text-4xl lg:text-5xl" : "text-2xl lg:text-3xl",
            LIVE_TONE_TEXT[section.tone]
          )}
        >
          {section.count}
        </span>
      </header>
      <ul className="space-y-2">
        {section.items.length === 0 ? (
          <li className="text-slate-400">No items</li>
        ) : (
          section.items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "rounded-lg border border-slate-700/80 bg-slate-900/50 px-3 py-2",
                item.pinned && "ring-1 ring-red-500/60"
              )}
            >
              <p
                className={cn(
                  "font-semibold text-white",
                  large ? "text-lg lg:text-xl" : "text-base"
                )}
              >
                {item.headline}
              </p>
              {item.subline && (
                <p className={cn("mt-0.5 text-slate-400", large ? "text-base" : "text-sm")}>
                  {item.subline}
                </p>
              )}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
