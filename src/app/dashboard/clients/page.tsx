import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, EmptyState, Table, Td, Th } from "@/components/dashboard/DataTable";
import { prisma } from "@/lib/prisma";
import { formatName } from "@/lib/utils";

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    orderBy: { lastName: "asc" },
    include: { _count: { select: { appointments: true, timelineEvents: true } } },
    take: 100,
  });

  return (
    <>
      <Header title="Clients" />
      <div className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Clients"
          description="Patient profiles with unified activity timelines"
        />
        <DataTable>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>MRN</Th>
                <Th>Phone</Th>
                <Th>Appointments</Th>
                <Th>Timeline</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState message="No clients yet. Run seed or add via API." />
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-medium text-slate-900">
                        {formatName(client.firstName, client.lastName)}
                      </span>
                    </Td>
                    <Td>{client.mrn ?? "—"}</Td>
                    <Td>{client.phone ?? "—"}</Td>
                    <Td>{client._count.appointments}</Td>
                    <Td>{client._count.timelineEvents} events</Td>
                    <Td>
                      <Link
                        href={`/dashboard/clients/${client.id}`}
                        className="text-sm font-medium text-medflow-600 hover:text-medflow-700"
                      >
                        View →
                      </Link>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </DataTable>
      </div>
    </>
  );
}
