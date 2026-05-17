import type { CommandCenterTone } from "@/lib/command-center/types";

export const LIVE_TONE_BORDER: Record<CommandCenterTone, string> = {
  red: "border-red-500 bg-red-950/40",
  orange: "border-orange-500 bg-orange-950/40",
  yellow: "border-amber-500 bg-amber-950/40",
  blue: "border-sky-500 bg-sky-950/40",
  green: "border-emerald-500 bg-emerald-950/40",
  purple: "border-violet-500 bg-violet-950/40",
  gray: "border-slate-500 bg-slate-900/60",
};

export const LIVE_TONE_TEXT: Record<CommandCenterTone, string> = {
  red: "text-red-300",
  orange: "text-orange-300",
  yellow: "text-amber-300",
  blue: "text-sky-300",
  green: "text-emerald-300",
  purple: "text-violet-300",
  gray: "text-slate-400",
};
