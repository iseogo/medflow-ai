import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, EmptyState, Table, Td, Th } from "@/components/dashboard/DataTable";
import { AppointmentStatusBadge } from "@/components/ui/StatusBadge";
import { prisma } from "@/lib/prisma";
import { formatDate, formatName } from "@/lib/utils";

export default async function AppointmentsPage() {
  const appointments = await prisma.appointment.findMany({
    orderBy: { scheduledAt: "asc" },
    include: {
      client: { select: { firstName: true, lastName: true, mrn: true } },
    },
    take: 200,
  });

  return (
    <>
      <Header title="Appointments" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Appointments"
          description="Scheduling and visit status tracking"
        />
        <DataTable>
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Scheduled</Th>
                <Th>Provider</Th>
                <Th>Status</Th>
                <Th>Staff override</Th>
              </tr>
            </thead>
            <tbody>
              {appointments.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState message="No appointments scheduled." />
                  </td>
                </tr>
              ) : (
                appointments.map((appt) => (
                  <tr key={appt.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-medium">
                        {formatName(appt.client.firstName, appt.client.lastName)}
                      </span>
                      {appt.client.mrn && (
                        <span className="ml-2 text-xs text-slate-500">
                          {appt.client.mrn}
                        </span>
                      )}
                    </Td>
                    <Td>{formatDate(appt.scheduledAt)}</Td>
                    <Td>{appt.providerName ?? "—"}</Td>
                    <Td>
                      <AppointmentStatusBadge status={appt.status} />
                    </Td>
                    <Td>
                      {appt.staffOverride ? (
                        <span className="text-xs font-medium text-medflow-600">
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </DataTable>
      </section>
    </>
  );
}
