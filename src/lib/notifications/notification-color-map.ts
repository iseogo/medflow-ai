import { NotificationCategory } from "@prisma/client";

export type NotificationVisualTone =
  | "green"
  | "blue"
  | "yellow"
  | "orange"
  | "red"
  | "purple"
  | "gray"
  | "dark";

export const CATEGORY_VISUAL: Record<
  NotificationCategory,
  { tone: NotificationVisualTone; label: string; className: string }
> = {
  SUCCESS: {
    tone: "green",
    label: "Success",
    className: "border-l-emerald-500 bg-emerald-50 text-emerald-900",
  },
  INFO: {
    tone: "blue",
    label: "Information",
    className: "border-l-sky-500 bg-sky-50 text-sky-900",
  },
  WARNING: {
    tone: "yellow",
    label: "Warning",
    className: "border-l-amber-500 bg-amber-50 text-amber-900",
  },
  ACTION_REQUIRED: {
    tone: "orange",
    label: "Action required",
    className: "border-l-orange-500 bg-orange-50 text-orange-900",
  },
  URGENT: {
    tone: "red",
    label: "Urgent",
    className: "border-l-red-500 bg-red-50 text-red-900",
  },
  EMERGENCY: {
    tone: "red",
    label: "Emergency",
    className: "border-l-red-600 bg-red-100 text-red-950",
  },
  AI_REVIEW: {
    tone: "purple",
    label: "AI review",
    className: "border-l-violet-500 bg-violet-50 text-violet-900",
  },
  SYSTEM: {
    tone: "gray",
    label: "System",
    className: "border-l-slate-400 bg-slate-50 text-slate-800",
  },
  SECURITY: {
    tone: "dark",
    label: "Security",
    className: "border-l-slate-800 bg-slate-100 text-slate-950",
  },
  STAFF_OVERRIDE: {
    tone: "dark",
    label: "Staff override",
    className: "border-l-slate-700 bg-slate-100 text-slate-900",
  },
};

export function visualForCategory(category: NotificationCategory) {
  return CATEGORY_VISUAL[category];
}
