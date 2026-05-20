"use client";

import {
  CreditCard,
  NotebookPen,
  Bot,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  LayoutDashboard,
  LogIn,
  Mail,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Settings,
  UserCog,
  UserPlus,
  Users,
  FileStack,
  BellRing,
  ShieldCheck,
  Bell,
  Radar,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { RoleType } from "@prisma/client";
import { useNotificationUnreadCount } from "@/hooks/use-notification-unread-count";
import { canAccessDashboardRoute } from "@/lib/route-permissions";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  /** Show unread count badge from /api/notifications/unread-count */
  showUnreadBadge?: boolean;
};

const mainNav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/command-center", label: "Command Center", icon: Radar },
  { href: "/dashboard/clients", label: "Clients", icon: Users },
  { href: "/dashboard/appointments", label: "Appointments", icon: Calendar },
  {
    href: "/dashboard/staff-intervention",
    label: "Staff Intervention",
    icon: ClipboardList,
  },
  { href: "/dashboard/medical-records", label: "Medical Records", icon: FileStack },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/clinical-notes", label: "Clinical Notes", icon: NotebookPen },
];

const physicalNav: NavItem[] = [
  { href: "/dashboard/walk-ins", label: "Walk-ins", icon: UserPlus },
  { href: "/dashboard/check-ins", label: "Check-ins", icon: LogIn },
  { href: "/dashboard/waiting-room", label: "Waiting room", icon: Clock },
];

const adminNav: NavItem[] = [
  { href: "/dashboard/staff", label: "Staff", icon: UserCog },
];

const commsNav: NavItem[] = [
  {
    href: "/dashboard/notifications",
    label: "Notifications",
    icon: Bell,
    showUnreadBadge: true,
  },
  { href: "/dashboard/reminders", label: "Reminders", icon: BellRing },
  {
    href: "/dashboard/inbound-calls",
    label: "Inbound Calls",
    icon: PhoneIncoming,
  },
  { href: "/dashboard/calls", label: "Calls", icon: Phone },
  { href: "/dashboard/outbound-calls", label: "Outbound Calls", icon: PhoneOutgoing },
  { href: "/dashboard/sms", label: "SMS", icon: MessageSquare },
  { href: "/dashboard/emails", label: "Emails", icon: Mail },
  {
    href: "/dashboard/agent-coordination",
    label: "Agent Coordination",
    icon: Bot,
  },
  {
    href: "/dashboard/supervisor",
    label: "Supervisor AI",
    icon: ShieldCheck,
  },
];

const systemNav: NavItem[] = [
  { href: "/dashboard/audit-logs", label: "Audit Logs", icon: FileText },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function NavLink({
  item,
  pathname,
  role,
  unreadCount,
}: {
  item: NavItem;
  pathname: string;
  role: RoleType;
  unreadCount?: number;
}) {
  if (!canAccessDashboardRoute(role, item.href)) return null;

  const active = item.exact
    ? pathname === item.href
    : pathname.startsWith(item.href);
  const Icon = item.icon;
  const badge =
    item.showUnreadBadge && unreadCount != null && unreadCount > 0
      ? unreadCount > 99
        ? "99+"
        : String(unreadCount)
      : null;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-medflow-50 text-medflow-700"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {badge && (
        <span
          className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white"
          aria-label={`${unreadCount} unread`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function NavSection({
  title,
  items,
  pathname,
  role,
  unreadCount,
}: {
  title?: string;
  items: NavItem[];
  pathname: string;
  role: RoleType;
  unreadCount?: number;
}) {
  const visible = items.filter((item) => canAccessDashboardRoute(role, item.href));
  if (visible.length === 0) return null;

  return (
    <div>
      {title && (
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </p>
      )}
      <div className="space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            role={role}
            unreadCount={item.showUnreadBadge ? unreadCount : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canViewNotifications =
    !!role && canAccessDashboardRoute(role, "/dashboard/notifications");
  const unreadCount = useNotificationUnreadCount(canViewNotifications);

  if (!role) {
    return (
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="h-16 border-b border-slate-200" />
      </aside>
    );
  }

  return (
    <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-medflow-600 text-sm font-bold text-white">
          MF
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">MedFlow AI</p>
          <p className="text-xs text-slate-500">Phases 1–6</p>
        </div>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto p-4">
        <NavSection items={mainNav} pathname={pathname} role={role} />
        <NavSection title="Physical" items={physicalNav} pathname={pathname} role={role} />
        <NavSection title="Administration" items={adminNav} pathname={pathname} role={role} />
        <NavSection
          title="Communications"
          items={commsNav}
          pathname={pathname}
          role={role}
          unreadCount={unreadCount}
        />
        <NavSection items={systemNav} pathname={pathname} role={role} />
      </nav>
      <div className="border-t border-slate-200 p-4">
        <p className="text-xs text-slate-500">Timezone: America/Chicago</p>
      </div>
    </aside>
  );
}
