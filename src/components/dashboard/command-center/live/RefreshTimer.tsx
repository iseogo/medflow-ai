"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  intervalMs: number;
  lastRefreshAt: string | null;
  onRefresh: () => void;
  loading?: boolean;
};

export function RefreshTimer({ intervalMs, lastRefreshAt, onRefresh, loading }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(intervalMs / 1000));

  useEffect(() => {
    setSecondsLeft(Math.floor(intervalMs / 1000));
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          onRefresh();
          return Math.floor(intervalMs / 1000);
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [intervalMs, onRefresh, lastRefreshAt]);

  const lastLabel = lastRefreshAt
    ? new Date(lastRefreshAt).toLocaleString("en-US", {
        timeZone: "America/Chicago",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
      <button
        type="button"
        onClick={() => {
          onRefresh();
          setSecondsLeft(Math.floor(intervalMs / 1000));
        }}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 hover:bg-slate-700 disabled:opacity-50"
      >
        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        Refresh now
      </button>
      <span>Next auto-refresh in {secondsLeft}s</span>
      <span className="text-slate-500">Last updated: {lastLabel}</span>
    </div>
  );
}
