import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CommunicationStatusBadge } from "@/components/ui/CommunicationStatusBadge";
import { Badge } from "@/components/ui/Badge";
import {
  DataTable,
  EmptyState,
  Table,
  Td,
  Th,
} from "@/components/dashboard/DataTable";
import { formatDate } from "@/lib/utils";
import { inboundCallsService } from "@/services/inbound-calls.service";

function escalationVariant(
  level: string
): "default" | "success" | "warning" | "danger" | "info" | "purple" {
  if (level === "Manager / Admin") return "danger";
  if (level === "Elevated") return "warning";
  return "info";
}

export default async function InboundCallsPage() {
  const rows = await inboundCallsService.listMissedInboundCalls();

  return (
    <>
      <Header title="Inbound Calls" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Missed inbound calls"
          description="Unanswered, abandoned, or failed inbound calls with staff follow-up and escalation status"
        />
        <DataTable>
          <Table>
            <thead>
              <tr>
                <Th>Caller</Th>
                <Th>Patient</Th>
                <Th>Status</Th>
                <Th>Received</Th>
                <Th>Follow-up task</Th>
                <Th>AI follow-up</Th>
                <Th>Escalation</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState message="No missed inbound calls recorded yet." />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-medium text-slate-900">
                        {row.callerPhone}
                      </span>
                    </Td>
                    <Td className="text-slate-700">{row.clientLabel}</Td>
                    <Td>
                      <CommunicationStatusBadge status={row.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600">
                      {formatDate(row.receivedAt, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </Td>
                    <Td>
                      <span className="text-sm text-slate-700">
                        {row.followUpTaskStatus.replace(/_/g, " ")}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-sm text-slate-600">
                        {row.followUpAiStatus}
                      </span>
                    </Td>
                    <Td>
                      <Badge variant={escalationVariant(row.escalationLevel)}>
                        {row.escalationLevel}
                      </Badge>
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
