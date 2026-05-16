import { cn } from "@/lib/utils";

const VARIANTS = {
  neutral: "bg-slate-100 text-slate-800",
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-900",
  danger: "bg-rose-50 text-rose-900",
  info: "bg-sky-50 text-sky-900",
} as const;

export type StatusBadgeVariant = keyof typeof VARIANTS;

export function StatusBadge({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: StatusBadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        VARIANTS[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
