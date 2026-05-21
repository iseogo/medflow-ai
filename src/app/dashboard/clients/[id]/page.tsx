import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Header } from "@/components/dashboard/Header";
import { ClientDetailActions } from "@/components/dashboard/ClientDetailActions";
import { ClientTimeline } from "@/components/dashboard/ClientTimeline";
import { AppointmentStatusBadge } from "@/components/ui/StatusBadge";
import { authOptions } from "@/lib/auth";
import { hasAnyPermission, hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { formatDate, formatName } from "@/lib/utils";

type PageProps = { params: { id: string } };

export default async function ClientDetailPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (
    !role ||
    !hasAnyPermission(role, ["clients:read", "clients:read-limited"])
  ) {
    redirect("/dashboard/access-denied");
  }

  const canWrite = hasPermission(role, "clients:write");

  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      appointments: { orderBy: { scheduledAt: "desc" }, take: 10 },
      consentRecords: { orderBy: { recordedAt: "desc" } },
      timelineEvents: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          actor: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!client) notFound();

  return (
    <>
      <Header title={formatName(client.firstName, client.lastName)} />
      <div className="flex-1 overflow-auto p-8">
        <Link
          href="/dashboard/clients"
          className="text-sm text-medflow-600 hover:text-medflow-700"
        >
          ← Back to clients
        </Link>
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <ClientDetailActions client={client} canWrite={canWrite} />
          <div className="medflow-card p-6 lg:col-span-2">
            <h2 className="font-semibold text-slate-900">Unified timeline</h2>
            <p className="mt-1 text-sm text-slate-600">
              All appointments, staff actions, and updates in one place
            </p>
            <div className="mt-6">
              <ClientTimeline events={client.timelineEvents} />
            </div>
          </div>
        </div>
        <div className="medflow-card mt-6 p-6">
          <h2 className="font-semibold text-slate-900">Recent appointments</h2>
          {client.appointments.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No appointments.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {client.appointments.map((appt) => (
                <li
                  key={appt.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {formatDate(appt.scheduledAt)}
                    </p>
                    <p className="text-xs text-slate-500">{appt.reason}</p>
                  </div>
                  <AppointmentStatusBadge status={appt.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
