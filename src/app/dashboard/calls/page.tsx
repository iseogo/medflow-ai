import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CommunicationLogTable } from "@/components/dashboard/CommunicationLogTable";
import { prisma } from "@/lib/prisma";

export default async function CallsPage() {
  const calls = await prisma.callLog.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { firstName: true, lastName: true, mrn: true } },
      appointment: { select: { scheduledAt: true, reason: true } },
    },
    take: 200,
  });

  return (
    <>
      <Header title="Calls" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Call logs"
          description="Inbound and outbound calls (Twilio stub — no live calls)"
        />
        <CommunicationLogTable
          channelLabel="Call"
          detailColumn="Direction / Phone"
          rows={calls}
          renderDetail={(row) => {
            const call = calls.find((c) => c.id === row.id)!;
            return (
              <span className="text-sm text-slate-700">
                {call.direction} · {call.phoneNumber ?? "—"}
              </span>
            );
          }}
        />
      </section>
    </>
  );
}
