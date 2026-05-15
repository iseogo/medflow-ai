import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { ClientTimeline } from "@/components/dashboard/ClientTimeline";
import { AppointmentStatusBadge } from "@/components/ui/StatusBadge";
import { prisma } from "@/lib/prisma";
import { formatDate, formatName } from "@/lib/utils";

type PageProps = { params: { id: string } };

export default async function ClientDetailPage({ params }: PageProps) {
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
          <div className="medflow-card p-6 lg:col-span-1">
            <h2 className="font-semibold text-slate-900">Profile</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="text-slate-900">{client.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd className="text-slate-900">{client.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">MRN</dt>
                <dd className="text-slate-900">{client.mrn ?? "—"}</dd>
              </div>
              {client.dateOfBirth && (
                <div>
                  <dt className="text-slate-500">Date of birth</dt>
                  <dd className="text-slate-900">
                    {formatDate(client.dateOfBirth, {
                      dateStyle: "long",
                      timeStyle: undefined,
                    })}
                  </dd>
                </div>
              )}
            </dl>
            {client.consentRecords.length > 0 && (
              <>
                <h3 className="mt-6 font-medium text-slate-900">Consent</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {client.consentRecords.map((c) => (
                    <li key={c.id} className="text-slate-600">
                      {c.type}: {c.granted ? "Granted" : "Denied"}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
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
