"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RoleType } from "@prisma/client";
import { Maximize2, Minimize2, Monitor } from "lucide-react";
import type { LiveBoardSnapshot, LiveDisplayMode } from "@/lib/command-center/live-types";
import { displayModeLabel } from "@/lib/command-center/display-mode-labels";
import {
  canSelectDisplayMode,
  listSelectableModes,
} from "@/services/display-mode.service";
import { cn } from "@/lib/utils";
import { RefreshTimer } from "./RefreshTimer";
import { AutoScrollPanel } from "./AutoScrollPanel";
import { LiveSectionPanel } from "./LiveSectionPanel";
import { LIVE_TONE_BORDER, LIVE_TONE_TEXT } from "./live-tone-styles";

type Props = {
  initial: LiveBoardSnapshot;
  role: RoleType;
};

export function LiveCommandCenterBoard({ initial, role }: Props) {
  const canSelectMode = canSelectDisplayMode(role);
  const [board, setBoard] = useState(initial);
  const [mode, setMode] = useState<LiveDisplayMode>(initial.displayMode);
  const [loading, setLoading] = useState(false);
  const [rotateIndex, setRotateIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    try {
      const params = canSelectMode ? `?mode=${mode}` : "";
      const res = await fetch(`/api/command-center/live${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as LiveBoardSnapshot;
      setBoard(data);
      if (canSelectMode) setMode(data.displayMode);
    } finally {
      setLoading(false);
    }
  }, [canSelectMode, mode]);

  useEffect(() => {
    if (canSelectMode) fetchBoard();
  }, [mode, canSelectMode, fetchBoard]);

  useEffect(() => {
    if (board.sections.length <= 1) return;
    const id = setInterval(() => {
      setRotateIndex((i) => (i + 1) % board.sections.length);
    }, 8000);
    return () => clearInterval(id);
  }, [board.sections.length]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.();
      setFullscreen(true);
    } else {
      void document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  const modes = listSelectableModes(role);
  const rotating = board.sections[rotateIndex];
  const secondary = board.sections.filter((_, i) => i !== rotateIndex).slice(0, 2);
  const gridRest = board.sections.filter(
    (s) => s.key !== rotating?.key && !secondary.some((x) => x.key === s.key)
  );

  return (
    <div
      className={cn(
        "min-h-screen bg-slate-950 text-slate-100",
        fullscreen && "fixed inset-0 z-[100] overflow-auto"
      )}
    >
      <header className="border-b border-slate-800 bg-slate-900/90 px-4 py-4 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              <Monitor className="h-4 w-4" />
              Live Shared Operations
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white lg:text-4xl">
              MedFlow Command Board
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {displayModeLabel(board.displayMode)} · Role {role.replace(/_/g, " ")}
              {board.mockMode && (
                <span className="ml-2 rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                  MOCK_MODE ON
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canSelectMode && (
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as LiveDisplayMode)}
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                {modes.map((m) => (
                  <option key={m} value={m}>
                    {displayModeLabel(m)}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-md border border-slate-600 bg-slate-800 p-2 hover:bg-slate-700"
              aria-label="Toggle fullscreen"
            >
              {fullscreen ? (
                <Minimize2 className="h-5 w-5" />
              ) : (
                <Maximize2 className="h-5 w-5" />
              )}
            </button>
            <Link
              href="/dashboard/command-center"
              className="rounded-md border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800"
            >
              Exit live view
            </Link>
          </div>
        </div>
        <div className="mt-4">
          <RefreshTimer
            intervalMs={board.refreshIntervalMs}
            lastRefreshAt={board.generatedAt}
            onRefresh={fetchBoard}
            loading={loading}
          />
        </div>
        {board.kpis && board.kpis.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {board.kpis.map((k) => (
              <div
                key={k.label}
                className={cn("rounded-lg border px-4 py-2", LIVE_TONE_BORDER[k.tone])}
              >
                <p className="text-xs uppercase text-slate-400">{k.label}</p>
                <p className={cn("text-2xl font-bold tabular-nums", LIVE_TONE_TEXT[k.tone])}>
                  {k.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </header>

      {board.pinnedAlerts.length > 0 && (
        <section className="border-b border-red-900/50 bg-red-950/30 px-4 py-4 lg:px-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-red-400">
            Pinned critical alerts
          </h2>
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {board.pinnedAlerts.map((a) => (
              <li
                key={a.id}
                className={cn("rounded-lg border-l-4 px-4 py-3", LIVE_TONE_BORDER[a.tone])}
              >
                <p className="text-lg font-semibold text-white">{a.headline}</p>
                {a.subline && <p className="text-sm text-slate-400">{a.subline}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 p-4 lg:grid-cols-3 lg:gap-6 lg:p-8">
        <div className="lg:col-span-2 space-y-4">
          {rotating && <LiveSectionPanel section={rotating} large />}
          <div className="grid gap-4 md:grid-cols-2">
            {secondary.map((s) => (
              <LiveSectionPanel key={s.key} section={s} />
            ))}
          </div>
          {gridRest.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {gridRest.map((s) => (
                <LiveSectionPanel key={s.key} section={s} />
              ))}
            </div>
          )}
        </div>
        <AutoScrollPanel className="min-h-[420px] rounded-xl border border-slate-700 bg-slate-900/80 p-4 lg:min-h-[520px]">
          <h3 className="mb-3 text-lg font-bold uppercase tracking-wide text-slate-300">
            Live Activity Feed
          </h3>
          <ul className="space-y-3 pr-8">
            {[...board.activityFeed, ...board.activityFeed].map((entry, idx) => (
              <li
                key={`${entry.id}-${idx}`}
                className="flex gap-3 border-b border-slate-800 pb-3"
              >
                <span
                  className={cn(
                    "mt-2 h-2 w-2 shrink-0 rounded-full",
                    entry.tone === "red"
                      ? "bg-red-500"
                      : entry.tone === "orange"
                        ? "bg-orange-500"
                        : entry.tone === "green"
                          ? "bg-emerald-500"
                          : entry.tone === "purple"
                            ? "bg-violet-500"
                            : "bg-sky-500"
                  )}
                />
                <div>
                  <p className="text-base font-medium text-white lg:text-lg">{entry.message}</p>
                  <p className="text-sm text-slate-500">
                    {entry.category} · {entry.time}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </AutoScrollPanel>
      </div>
    </div>
  );
}
