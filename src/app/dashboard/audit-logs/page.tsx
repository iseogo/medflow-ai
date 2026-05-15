import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, EmptyState, Table, Td, Th } from "@/components/dashboard/DataTable";
import { authOptions } from "@/lib/auth";
import { canViewAudit } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export default async function AuditLogsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canViewAudit(session.user.role)) {
    redirect("/dashboard/access-denied");
  }

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
    },
    take: 100,
  });

  return (
    <>
      <Header title="Audit Logs" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Audit Logs"
          description="Immutable record of important system actions"
        />
        <DataTable>
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Actor</Th>
                <Th>Role</Th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState message="No audit logs yet." />
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </Td>
                    <Td>
                      <span className="font-mono text-xs font-medium">
                        {log.action}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-slate-900">
                        {log.targetType ?? log.entityType}
                      </span>
                      {(log.targetId ?? log.entityId) && (
                        <span className="block max-w-[120px] truncate text-xs text-slate-500">
                          {log.targetId ?? log.entityId}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {log.actorName ??
                        (log.user
                          ? `${log.user.firstName} ${log.user.lastName}`
                          : "System")}
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {log.actorRole ?? "—"}
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
