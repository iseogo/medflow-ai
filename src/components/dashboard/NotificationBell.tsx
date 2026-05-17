"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useNotificationUnreadCount } from "@/hooks/use-notification-unread-count";

export function NotificationBell({ enabled = true }: { enabled?: boolean }) {
  const count = useNotificationUnreadCount(enabled);

  return (
    <Link
      href="/dashboard/notifications"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
      aria-label={`Notifications${count > 0 ? `, ${count} unread` : ""}`}
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
