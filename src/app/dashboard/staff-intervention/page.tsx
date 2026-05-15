import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, EmptyState, Table, Td, Th } from "@/components/dashboard/DataTable";
import { InterventionStatusBadge } from "@/components/ui/StatusBadge";
import { prisma } from "@/lib/prisma";
import { formatDate, formatName } from "@/lib/utils";

export default async function StaffInterventionPage() {
  const interventions = await prisma.staffIntervention.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { firstName: true, lastName: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
    },
    take: 100,
  });

  return (
    <>
      <Header title="Staff Intervention" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Staff Intervention"
          description="Staff actions override AI — walk-ins, escalations, and human takeover"
        />
        <aside className="mb-4 rounded-lg border border-medflow-200 bg-medflow-50 px-4 py-3 text-sm text-medflow-800">
          All interventions are recorded with staffOverride=true. Resolving an
          intervention pauses AI automation for that case.
        </aside>
        <DataTable>
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th>Assigned</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {interventions.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState message="No staff interventions." />
                  </td>
                </tr>
              ) : (
                interventions.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-medium text-slate-900">
                        {item.title}
                      </span>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                          {item.description}
                        </p>
                      )}
                    </Td>
                    <Td>
                      {item.client
                        ? formatName(item.client.firstName, item.client.lastName)
                        : "—"}
                    </Td>
                    <Td>
                      <InterventionStatusBadge status={item.status} />
                    </Td>
                    <Td>
                      {item.assignedTo
                        ? `${item.assignedTo.firstName} ${item.assignedTo.lastName}`
                        : "Unassigned"}
                    </Td>
                    <Td>{formatDate(item.createdAt)}</Td>
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
