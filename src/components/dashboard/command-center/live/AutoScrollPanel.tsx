"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  speedPxPerSecond?: number;
};

export function AutoScrollPanel({
  children,
  className,
  speedPxPerSecond = 28,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const offsetRef = useRef(0);

  const isPaused = hoverPaused || manualPaused;

  const tick = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content || isPaused) return;

    const maxScroll = content.scrollHeight - container.clientHeight;
    if (maxScroll <= 0) return;

    offsetRef.current += speedPxPerSecond / 60;
    if (offsetRef.current >= maxScroll) {
      offsetRef.current = 0;
    }
    container.scrollTop = offsetRef.current;
  }, [isPaused, speedPxPerSecond]);

  useEffect(() => {
    const id = setInterval(tick, 1000 / 60);
    return () => clearInterval(id);
  }, [tick]);

  return (
    <div className={cn("relative flex flex-col", className)}>
      <button
        type="button"
        onClick={() => setManualPaused((p) => !p)}
        className="absolute right-2 top-2 z-10 rounded-md border border-slate-600 bg-slate-900/90 p-2 text-slate-200 hover:bg-slate-800"
        aria-label={manualPaused ? "Resume scrolling" : "Pause scrolling"}
      >
        {manualPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </button>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        onMouseEnter={() => setHoverPaused(true)}
        onMouseLeave={() => setHoverPaused(false)}
      >
        <div ref={contentRef}>{children}</div>
      </div>
    </div>
  );
}
