import { CommunicationStatusBadge } from "@/components/ui/CommunicationStatusBadge";
import { DataTable, EmptyState, Table, Td, Th } from "./DataTable";
import { formatDate, formatName } from "@/lib/utils";

type ClientRef = { firstName: string; lastName: string; mrn?: string | null };
type ApptRef = { scheduledAt: Date; reason?: string | null } | null;

export function CommunicationLogTable({
  rows,
  channelLabel,
  detailColumn,
  renderDetail,
}: {
  rows: {
    id: string;
    status: string;
    purpose: string;
    createdAt: Date;
    client: ClientRef;
    appointment: ApptRef;
  }[];
  channelLabel: string;
  detailColumn: string;
  renderDetail: (row: (typeof rows)[0]) => React.ReactNode;
}) {
  return (
    <DataTable>
      <Table>
        <thead>
          <tr>
            <Th>Client</Th>
            <Th>{channelLabel}</Th>
            <Th>{detailColumn}</Th>
            <Th>Purpose</Th>
            <Th>Appointment</Th>
            <Th>Status</Th>
            <Th>Logged</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState message="No communication logs yet." />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <Td>
                  <span className="font-medium">
                    {formatName(row.client.firstName, row.client.lastName)}
                  </span>
                </Td>
                <Td className="text-xs text-slate-500">{channelLabel}</Td>
                <Td>{renderDetail(row)}</Td>
                <Td>{row.purpose}</Td>
                <Td>
                  {row.appointment
                    ? formatDate(row.appointment.scheduledAt, {
                        dateStyle: "short",
                        timeStyle: undefined,
                      })
                    : "—"}
                </Td>
                <Td>
                  <CommunicationStatusBadge status={row.status} />
                </Td>
                <Td className="whitespace-nowrap text-slate-600">
                  {formatDate(row.createdAt)}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </DataTable>
  );
}
