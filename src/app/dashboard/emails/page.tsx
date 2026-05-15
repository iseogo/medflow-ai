import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CommunicationLogTable } from "@/components/dashboard/CommunicationLogTable";
import { prisma } from "@/lib/prisma";

export default async function EmailsPage() {
  const logs = await prisma.emailLog.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { firstName: true, lastName: true } },
      appointment: { select: { scheduledAt: true } },
    },
    take: 200,
  });

  return (
    <>
      <Header title="Emails" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Email logs"
          description="Email delivery history (email stub — no live SMTP)"
        />
        <CommunicationLogTable
          channelLabel="Email"
          detailColumn="Subject"
          rows={logs}
          renderDetail={(row) => {
            const email = logs.find((e) => e.id === row.id)!;
            return (
              <span className="text-sm font-medium text-slate-800">
                {email.subject ?? "—"}
              </span>
            );
          }}
        />
      </section>
    </>
  );
}
