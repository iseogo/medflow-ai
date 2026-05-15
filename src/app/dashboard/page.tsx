import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Users,
} from "lucide-react";
import { getServerSession } from "next-auth";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  const [clientCount, appointmentCount, openInterventions, todayAppointments] =
    await Promise.all([
      prisma.client.count({ where: { isActive: true } }),
      prisma.appointment.count(),
      prisma.staffIntervention.count({
        where: { status: { notIn: ["RESOLVED"] } },
      }),
      prisma.appointment.findMany({
        where: {
          scheduledAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
        include: {
          client: { select: { firstName: true, lastName: true } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 5,
      }),
    ]);

  return (
    <>
      <Header title="Overview" />
      <div className="flex-1 overflow-auto p-8">
        <PageHeader
          title={`Welcome back, ${session?.user?.name?.split(" ")[0] ?? "there"}`}
          description="Clinic operations at a glance — America/Chicago"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active clients" value={clientCount} icon={Users} />
          <StatCard
            label="Appointments"
            value={appointmentCount}
            icon={Calendar}
          />
          <StatCard
            label="Open interventions"
            value={openInterventions}
            icon={ClipboardList}
            trend={openInterventions > 0 ? "Requires staff attention" : undefined}
          />
          <StatCard
            label="Today's visits"
            value={todayAppointments.length}
            icon={AlertTriangle}
          />
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="medflow-card p-6">
            <h3 className="font-semibold text-slate-900">Today&apos;s schedule</h3>
            {todayAppointments.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No appointments today.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {todayAppointments.map((appt) => (
                  <li
                    key={appt.id}
                    className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {appt.client.lastName}, {appt.client.firstName}
                      </p>
                      <p className="text-xs text-slate-500">{appt.reason}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-700">
                        {formatDate(appt.scheduledAt, {
                          timeStyle: "short",
                          dateStyle: undefined,
                        })}
                      </p>
                      <p className="text-xs text-medflow-600">{appt.status}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/dashboard/appointments"
              className="mt-4 inline-block text-sm font-medium text-medflow-600 hover:text-medflow-700"
            >
              View all appointments →
            </Link>
          </div>
          <div className="medflow-card p-6">
            <h3 className="font-semibold text-slate-900">Quick links</h3>
            <ul className="mt-4 space-y-2">
              {[
                { href: "/dashboard/clients", label: "Manage clients" },
                { href: "/dashboard/staff-intervention", label: "Staff interventions" },
                { href: "/dashboard/audit-logs", label: "Audit logs" },
                { href: "/dashboard/settings", label: "Settings" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-medflow-600 hover:text-medflow-700"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Staff actions always override AI automation. All changes are
              recorded in audit logs and client timelines.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
