import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, EmptyState, Table, Td, Th } from "@/components/dashboard/DataTable";
import { AppointmentStatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { prisma } from "@/lib/prisma";
import { formatDate, formatName } from "@/lib/utils";

function ReminderOutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-xs text-slate-400">—</span>;
  const map: Record<string, { label: string; variant: "success" | "warning" | "danger" | "info" | "default" }> = {
    CONFIRMED: { label: "Confirmed", variant: "success" },
    CANCELLED: { label: "Cancelled", variant: "danger" },
    RESCHEDULE_REQUESTED: { label: "Reschedule req.", variant: "warning" },
    NO_RESPONSE: { label: "No response", variant: "default" },
    FAILED: { label: "Failed", variant: "danger" },
    ESCALATED: { label: "Escalated", variant: "warning" },
  };
  const { label, variant } = map[outcome] ?? { label: outcome, variant: "default" as const };
  return <Badge variant={variant}>{label}</Badge>;
}

function reminderChannel(r: { voiceCallLogId: string | null; smsLogId: string | null; emailLogId: string | null } | undefined) {
  if (!r) return "—";
  if (r.voiceCallLogId) return "Voice";
  if (r.smsLogId) return "SMS";
  if (r.emailLogId) return "Email";
  return "—";
}

export default async function AppointmentsPage() {
  const appointments = await prisma.appointment.findMany({
    orderBy: { scheduledAt: "desc" },
    include: {
      client: { select: { firstName: true, lastName: true, mrn: true } },
      reminderLogs: {
        orderBy: { dueAt: "desc" },
        take: 1,
        select: {
          outcome: true,
          reminderOffset: true,
          voiceCallLogId: true,
          smsLogId: true,
          emailLogId: true,
        },
      },
    },
    take: 300,
  });

  const upcoming = appointments.filter((a) =>
    ["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED"].includes(a.status)
  );
  const today = appointments.filter((a) =>
    ["CHECKED_IN", "WAITING", "WITH_PROVIDER", "COMPLETED", "WALK_OUT"].includes(a.status)
  );
  const actionNeeded = appointments.filter((a) =>
    ["NO_SHOW", "CANCELLED", "FOLLOW_UP_NEEDED"].includes(a.status)
  );

  function AppointmentTable({
    rows,
    emptyMsg,
  }: {
    rows: typeof appointments;
    emptyMsg: string;
  }) {
    return (
      <DataTable>
        <Table>
          <thead>
            <tr>
              <Th>Patient</Th>
              <Th>Scheduled</Th>
              <Th>Provider</Th>
              <Th>Status</Th>
              <Th>AI reminder</Th>
              <Th>Channel</Th>
              <Th>Staff override</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState message={emptyMsg} />
                </td>
              </tr>
            ) : (
              rows.map((appt) => {
                const lastReminder = appt.reminderLogs[0] ?? undefined;
                return (
                  <tr key={appt.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-medium">
                        {formatName(appt.client.firstName, appt.client.lastName)}
                      </span>
                      {appt.client.mrn && (
                        <span className="ml-2 text-xs text-slate-400">{appt.client.mrn}</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {formatDate(appt.scheduledAt, { dateStyle: "short", timeStyle: "short" })}
                    </Td>
                    <Td>{appt.providerName ?? "—"}</Td>
                    <Td>
                      <AppointmentStatusBadge status={appt.status} />
                    </Td>
                    <Td>
                      <ReminderOutcomeBadge outcome={lastReminder?.outcome ?? null} />
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {reminderChannel(lastReminder)}
                    </Td>
                    <Td>
                      {appt.staffOverride ? (
                        <span className="text-xs font-medium text-medflow-600">Yes</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </DataTable>
    );
  }

  return (
    <>
      <Header title="Appointments" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Appointments"
          description="Scheduling and AI-managed communication status — reminders sent, patient confirmations, no-show follow-up"
        />

        {actionNeeded.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900">Action required</h3>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                {actionNeeded.length}
              </span>
            </div>
            <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              These appointments need staff attention: no-shows require follow-up calls, cancellations need rescheduling communication.
            </div>
            <AppointmentTable rows={actionNeeded} emptyMsg="No action-needed appointments." />
          </section>
        )}

        <section className="mb-8">
          <h3 className="mb-3 text-base font-semibold text-slate-900">Today&apos;s activity</h3>
          <AppointmentTable rows={today} emptyMsg="No in-progress appointments today." />
        </section>

        <section>
          <h3 className="mb-3 text-base font-semibold text-slate-900">Upcoming</h3>
          <AppointmentTable rows={upcoming} emptyMsg="No upcoming appointments." />
        </section>
      </section>
    </>
  );
}
