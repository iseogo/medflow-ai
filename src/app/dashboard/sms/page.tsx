import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CommunicationLogTable } from "@/components/dashboard/CommunicationLogTable";
import { prisma } from "@/lib/prisma";

export default async function SmsPage() {
  const logs = await prisma.smsLog.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { firstName: true, lastName: true } },
      appointment: { select: { scheduledAt: true } },
    },
    take: 200,
  });

  return (
    <>
      <Header title="SMS" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="SMS logs"
          description="Text message history (Twilio stub)"
        />
        <CommunicationLogTable
          channelLabel="SMS"
          detailColumn="Message"
          rows={logs}
          renderDetail={(row) => {
            const sms = logs.find((s) => s.id === row.id)!;
            return (
              <span className="line-clamp-2 max-w-xs text-sm text-slate-700">
                {sms.messageBody ?? "—"}
              </span>
            );
          }}
        />
      </section>
    </>
  );
}
