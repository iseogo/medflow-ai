import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CheckInPanel } from "@/components/dashboard/CheckInPanel";
import { DataTable, EmptyState, Table, Td, Th } from "@/components/dashboard/DataTable";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { physicalClientService } from "@/services/physical-client.service";
import { formatDate, formatName } from "@/lib/utils";
import { APPOINTMENT_STATUS_LABELS, WAITING_ROOM_STATE_LABELS } from "@/lib/constants";

export default async function CheckInsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role || !hasPermission(session.user.role, "checkins:read")) {
    redirect("/dashboard/access-denied");
  }

  const checkIns = await physicalClientService.listCheckIns(40);

  return (
    <>
      <Header title="Check-ins" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Physical check-in"
          description="Returning clients — search, check in, and route to waiting room"
        />
        {hasPermission(session.user.role, "checkins:write") && <CheckInPanel />}
        <h3 className="mb-3 mt-10 text-lg font-semibold text-slate-900">Recent check-ins</h3>
        <DataTable>
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Type</Th>
                <Th>Appointment</Th>
                <Th>Waiting room</Th>
                <Th>Arrived</Th>
                <Th>Staff</Th>
              </tr>
            </thead>
            <tbody>
              {checkIns.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState message="No check-ins yet." />
                  </td>
                </tr>
              ) : (
                checkIns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td>{formatName(c.client.firstName, c.client.lastName)}</Td>
                    <Td>{c.checkInType}</Td>
                    <Td>
                      {c.appointment
                        ? APPOINTMENT_STATUS_LABELS[c.appointment.status] ??
                          c.appointment.status
                        : "—"}
                    </Td>
                    <Td>
                      {c.waitingRoom
                        ? WAITING_ROOM_STATE_LABELS[c.waitingRoom.state] ??
                          c.waitingRoom.state
                        : "—"}
                    </Td>
                    <Td>{formatDate(c.arrivedAt)}</Td>
                    <Td>
                      {c.checkedInBy.firstName} {c.checkedInBy.lastName}
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
