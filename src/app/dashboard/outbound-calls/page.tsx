import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CommunicationLogTable } from "@/components/dashboard/CommunicationLogTable";
import { prisma } from "@/lib/prisma";

export default async function OutboundCallsPage() {
  const calls = await prisma.callLog.findMany({
    where: { direction: "OUTBOUND" },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { firstName: true, lastName: true } },
      appointment: { select: { scheduledAt: true } },
    },
    take: 200,
  });

  return (
    <>
      <Header title="Outbound Calls" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Outbound calls"
          description="Staff- and agent-initiated outbound call log"
        />
        <CommunicationLogTable
          channelLabel="Outbound"
          detailColumn="Phone"
          rows={calls}
          renderDetail={(row) => {
            const call = calls.find((c) => c.id === row.id)!;
            return (
              <span className="text-sm text-slate-700">
                {call.phoneNumber ?? "—"}
                {call.durationSeconds != null && (
                  <span className="text-slate-500">
                    {" "}
                    · {call.durationSeconds}s
                  </span>
                )}
              </span>
            );
          }}
        />
      </section>
    </>
  );
}
