import {
  AlertTriangle,
  BellRing,
  Bot,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Mail,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  RefreshCw,
  UserX,
  XCircle,
} from "lucide-react";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { authOptions } from "@/lib/auth";
import { formatDate, formatName } from "@/lib/utils";
import { workflowDashboardService } from "@/services/workflow-dashboard.service";

function UrgentCount({
  label,
  value,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "red" | "amber" | "blue" | "slate";
}) {
  const tones = {
    red: "border-red-200 bg-red-50 text-red-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-medflow-200 bg-medflow-50 text-medflow-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  };
  const iconTones = {
    red: "text-red-500",
    amber: "text-amber-500",
    blue: "text-medflow-600",
    slate: "text-slate-500",
  };
  return (
    <Link
      href={href}
      className={`flex flex-col rounded-xl border p-4 transition hover:shadow-sm ${tones[tone]}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide opacity-75">{label}</p>
        <Icon className={`h-4 w-4 ${iconTones[tone]}`} />
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </Link>
  );
}

function SectionHeader({ title, href, linkLabel = "View all" }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {href && (
        <Link href={href} className="text-xs font-medium text-medflow-600 hover:text-medflow-700">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "URGENT") return <Badge variant="danger">Urgent</Badge>;
  if (priority === "HIGH") return <Badge variant="warning">High</Badge>;
  if (priority === "NORMAL") return <Badge variant="default">Normal</Badge>;
  return <Badge variant="default">{priority}</Badge>;
}

function ReminderOutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-xs text-slate-400">No reminder</span>;
  if (outcome === "CONFIRMED") return <Badge variant="success">Confirmed</Badge>;
  if (outcome === "CANCELLED") return <Badge variant="danger">Cancelled</Badge>;
  if (outcome === "RESCHEDULE_REQUESTED") return <Badge variant="warning">Reschedule req.</Badge>;
  if (outcome === "NO_RESPONSE") return <Badge variant="default">No response</Badge>;
  if (outcome === "FAILED") return <Badge variant="danger">Failed</Badge>;
  return <Badge variant="default">{outcome}</Badge>;
}

function ApptStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "success" | "warning" | "danger" | "info" | "default" | "purple" }> = {
    CONFIRMED: { label: "Confirmed", variant: "success" },
    CHECKED_IN: { label: "Checked in", variant: "info" },
    WAITING: { label: "Waiting", variant: "warning" },
    WITH_PROVIDER: { label: "With provider", variant: "purple" },
    COMPLETED: { label: "Completed", variant: "success" },
    SCHEDULED: { label: "Scheduled", variant: "default" },
    NO_SHOW: { label: "No-show", variant: "danger" },
    CANCELLED: { label: "Cancelled", variant: "danger" },
    RESCHEDULE_REQUESTED: { label: "Reschedule req.", variant: "warning" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={variant}>{label}</Badge>;
}

function CommStat({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; sub?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
      <Icon className="h-4 w-4 shrink-0 text-medflow-600" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-semibold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const data = await workflowDashboardService.getData();

  const { urgentCounts, pendingTasks, noShowAppointments, cancellationsAndReschedules, todayCommunications, todayAppointments, walkInPending } = data;
  const { reminders, reminderChannels, inboundCalls, outboundCalls } = todayCommunications;

  return (
    <>
      <Header title="AI Workflow Dashboard" />
      <div className="flex-1 overflow-auto p-8">
        <PageHeader
          title={`Welcome back, ${session?.user?.name?.split(" ")[0] ?? "there"}`}
          description="AI-managed patient communication workflow — all activities, pending actions, and escalations"
        />

        {/* ── Urgent action counts ── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <UrgentCount
            label="Pending AI approvals"
            value={urgentCounts.pendingApprovals}
            href="/dashboard/agent-coordination"
            icon={Bot}
            tone="amber"
          />
          <UrgentCount
            label="Missed callback tasks"
            value={urgentCounts.missedCallbacks}
            href="/dashboard/staff-tasks"
            icon={PhoneMissed}
            tone="red"
          />
          <UrgentCount
            label="No-show follow-up"
            value={urgentCounts.noShowFollowUp}
            href="/dashboard/staff-tasks"
            icon={UserX}
            tone="red"
          />
          <UrgentCount
            label="Reschedule requests"
            value={urgentCounts.rescheduleRequests}
            href="/dashboard/appointments"
            icon={RefreshCw}
            tone="amber"
          />
          <UrgentCount
            label="Open escalations"
            value={urgentCounts.openEscalations}
            href="/dashboard/staff-intervention"
            icon={AlertTriangle}
            tone="amber"
          />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-3">
          {/* ── Left column: Workflow queues ── */}
          <div className="xl:col-span-2 space-y-6">

            {/* Pending human tasks */}
            <div className="medflow-card p-5">
              <SectionHeader title="Pending staff actions" href="/dashboard/staff-tasks" />
              {pendingTasks.length === 0 ? (
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  All caught up — no pending tasks
                </p>
              ) : (
                <ul className="space-y-2">
                  {pendingTasks.slice(0, 8).map((task) => (
                    <li key={task.id} className="flex items-start justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="text-sm font-medium text-slate-900 leading-tight">{task.title}</p>
                        {task.clientName && (
                          <p className="text-xs text-slate-500 mt-0.5">{task.clientName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityBadge priority={task.priority} />
                        <Badge variant={task.status === "IN_PROGRESS" ? "info" : "default"}>
                          {task.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </li>
                  ))}
                  {pendingTasks.length > 8 && (
                    <li className="text-xs text-medflow-600 text-center pt-1">
                      <Link href="/dashboard/staff-tasks">+{pendingTasks.length - 8} more tasks →</Link>
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* No-show follow-up */}
            {noShowAppointments.length > 0 && (
              <div className="medflow-card p-5">
                <SectionHeader title="No-show follow-up needed" href="/dashboard/appointments" />
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 mb-3">
                  AI has flagged these patients. Front desk should call to reschedule and document outcome.
                </div>
                <ul className="space-y-2">
                  {noShowAppointments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{a.clientName}</p>
                        <p className="text-xs text-slate-500">
                          {a.reason} · {a.providerName} ·{" "}
                          {formatDate(a.scheduledAt, { dateStyle: "short", timeStyle: undefined })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="danger">No-show</Badge>
                        {a.hasTask ? (
                          <Badge variant="warning">Task open</Badge>
                        ) : (
                          <Badge variant="default">No task yet</Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cancellations & reschedule requests */}
            {cancellationsAndReschedules.length > 0 && (
              <div className="medflow-card p-5">
                <SectionHeader title="Cancellations & reschedule requests" href="/dashboard/appointments" />
                <ul className="space-y-2">
                  {cancellationsAndReschedules.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{a.clientName}</p>
                        <p className="text-xs text-slate-500">
                          {a.reason} ·{" "}
                          {formatDate(a.scheduledAt, { dateStyle: "short", timeStyle: undefined })}
                        </p>
                      </div>
                      <ApptStatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Today's schedule */}
            <div className="medflow-card p-5">
              <SectionHeader title="Today's appointments" href="/dashboard/appointments" />
              {todayAppointments.length === 0 ? (
                <p className="text-sm text-slate-500">No appointments scheduled for today.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="pb-2 pr-4">Patient</th>
                        <th className="pb-2 pr-4">Time</th>
                        <th className="pb-2 pr-4">Provider</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2 pr-4">AI reminder</th>
                        <th className="pb-2">Channel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {todayAppointments.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50">
                          <td className="py-2 pr-4 font-medium text-slate-900">{a.clientName}</td>
                          <td className="py-2 pr-4 text-slate-600">
                            {formatDate(a.scheduledAt, { timeStyle: "short", dateStyle: undefined })}
                          </td>
                          <td className="py-2 pr-4 text-slate-600">{a.providerName ?? "—"}</td>
                          <td className="py-2 pr-4"><ApptStatusBadge status={a.status} /></td>
                          <td className="py-2 pr-4"><ReminderOutcomeBadge outcome={a.reminderOutcome} /></td>
                          <td className="py-2 text-xs text-slate-500">{a.reminderChannel ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Walk-in follow-up */}
            {walkInPending.length > 0 && (
              <div className="medflow-card p-5">
                <SectionHeader title="Walk-in onboarding pending" href="/dashboard/walk-ins" />
                <ul className="space-y-2">
                  {walkInPending.map((w) => (
                    <li key={w.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{w.clientName}</p>
                        <p className="text-xs text-slate-500">
                          {w.visitType} · arrived {formatDate(w.arrivedAt, { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                      <Badge variant={w.onboardingStatus === "IN_PROGRESS" ? "warning" : "default"}>
                        {w.onboardingStatus.replace("_", " ")}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── Right column: AI communication activity ── */}
          <div className="space-y-5">
            <div className="medflow-card p-5">
              <SectionHeader title="AI communication activity" />
              <p className="mb-4 text-xs text-slate-500">Reminders sent in the last 7 days · calls today</p>

              <div className="space-y-3">
                {/* Reminders */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Appointment reminders</p>
                  <div className="grid grid-cols-2 gap-2">
                    <CommStat icon={BellRing} label="Total sent" value={reminders.total} />
                    <CommStat
                      icon={CheckCircle2}
                      label="Confirmed"
                      value={reminders.confirmed}
                      sub={reminders.total > 0 ? `${Math.round((reminders.confirmed / reminders.total) * 100)}%` : undefined}
                    />
                    <CommStat icon={XCircle} label="No response" value={reminders.noResponse} />
                    <CommStat icon={AlertTriangle} label="Failed" value={reminders.failed} />
                  </div>
                  {reminders.total > 0 && (
                    <div className="mt-2 flex gap-2 text-xs text-slate-500">
                      {reminderChannels.voice > 0 && <span>📞 Voice: {reminderChannels.voice}</span>}
                      {reminderChannels.sms > 0 && <span>💬 SMS: {reminderChannels.sms}</span>}
                      {reminderChannels.email > 0 && <span>✉️ Email: {reminderChannels.email}</span>}
                    </div>
                  )}
                </div>

                <hr className="border-slate-100" />

                {/* Calls today */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Calls today</p>
                  <div className="grid grid-cols-2 gap-2">
                    <CommStat
                      icon={PhoneIncoming}
                      label="Inbound"
                      value={inboundCalls.total}
                      sub={inboundCalls.missed > 0 ? `${inboundCalls.missed} missed` : "all answered"}
                    />
                    <CommStat
                      icon={Phone}
                      label="Outbound"
                      value={outboundCalls.total}
                      sub={`${outboundCalls.answered} answered`}
                    />
                  </div>
                </div>

                <hr className="border-slate-100" />

                {/* SMS & Email today */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Messages today</p>
                  <div className="grid grid-cols-2 gap-2">
                    <CommStat icon={MessageSquare} label="SMS sent" value={todayCommunications.smsTotal} />
                    <CommStat icon={Mail} label="Emails sent" value={todayCommunications.emailTotal} />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick nav to workflow areas */}
            <div className="medflow-card p-5">
              <SectionHeader title="AI workflow areas" />
              <nav className="space-y-1">
                {[
                  { href: "/dashboard/inbound-calls", label: "Missed inbound calls", icon: PhoneMissed, badge: urgentCounts.missedCallbacks },
                  { href: "/dashboard/outbound-calls", label: "Outbound calls", icon: Phone, badge: null },
                  { href: "/dashboard/reminders", label: "Reminder engine", icon: BellRing, badge: null },
                  { href: "/dashboard/appointments", label: "Appointments", icon: Calendar, badge: urgentCounts.rescheduleRequests },
                  { href: "/dashboard/staff-tasks", label: "Staff task queue", icon: ClipboardList, badge: null },
                  { href: "/dashboard/staff-intervention", label: "Escalations", icon: AlertTriangle, badge: urgentCounts.openEscalations },
                  { href: "/dashboard/agent-coordination", label: "AI proposals", icon: Bot, badge: urgentCounts.pendingApprovals },
                  { href: "/dashboard/sms", label: "SMS logs", icon: MessageSquare, badge: null },
                  { href: "/dashboard/emails", label: "Email logs", icon: Mail, badge: null },
                ].map(({ href, label, icon: Icon, badge }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-medflow-500" />
                    <span className="flex-1">{label}</span>
                    {badge !== null && badge !== undefined && badge > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-100 px-1.5 text-[10px] font-semibold text-red-700">
                        {badge}
                      </span>
                    )}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
