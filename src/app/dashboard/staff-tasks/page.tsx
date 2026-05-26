import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { DataTable, EmptyState, Table, Td, Th } from "@/components/dashboard/DataTable";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { TaskActions } from "./TaskActions";

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "URGENT") return <Badge variant="danger">Urgent</Badge>;
  if (priority === "HIGH") return <Badge variant="warning">High</Badge>;
  if (priority === "NORMAL") return <Badge variant="default">Normal</Badge>;
  return <Badge variant="default">{priority}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PENDING") return <Badge variant="default">Pending</Badge>;
  if (status === "IN_PROGRESS") return <Badge variant="info">In progress</Badge>;
  if (status === "COMPLETED") return <Badge variant="success">Completed</Badge>;
  if (status === "CANCELLED") return <Badge variant="default">Cancelled</Badge>;
  return <Badge variant="default">{status}</Badge>;
}

export default async function StaffTasksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role) redirect("/login");
  if (!hasPermission(session.user.role, "staff-tasks:read")) {
    redirect("/dashboard/access-denied");
  }

  const tasks = await prisma.staffTask.findMany({
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    take: 200,
    include: {
      client: { select: { firstName: true, lastName: true, mrn: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });

  const pending = tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS");
  const completed = tasks.filter((t) => t.status === "COMPLETED" || t.status === "CANCELLED");

  const canWrite = hasPermission(session.user.role, "staff-tasks:write");

  function TaskTable({ rows, emptyMsg }: { rows: typeof tasks; emptyMsg: string }) {
    return (
      <DataTable>
        <Table>
          <thead>
            <tr>
              <Th>Task</Th>
              <Th>Patient</Th>
              <Th>Priority</Th>
              <Th>Status</Th>
              <Th>Assigned to</Th>
              <Th>Created</Th>
              {canWrite && <Th>Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 7 : 6}>
                  <EmptyState message={emptyMsg} />
                </td>
              </tr>
            ) : (
              rows.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50">
                  <Td>
                    <p className="font-medium text-slate-900 text-sm">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 max-w-xs">{task.description}</p>
                    )}
                  </Td>
                  <Td>
                    {task.client ? (
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {task.client.lastName}, {task.client.firstName}
                        </p>
                        {task.client.mrn && (
                          <p className="text-xs text-slate-400">{task.client.mrn}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td><PriorityBadge priority={task.priority} /></Td>
                  <Td><StatusBadge status={task.status} /></Td>
                  <Td className="text-sm text-slate-600">
                    {task.assignedTo
                      ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`
                      : "Unassigned"}
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600 text-sm">
                    {formatDate(task.createdAt, { dateStyle: "short", timeStyle: undefined })}
                  </Td>
                  {canWrite && (
                    <Td>
                      <TaskActions taskId={task.id} status={task.status} />
                    </Td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </DataTable>
    );
  }

  return (
    <>
      <Header title="Staff Tasks" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Staff task queue"
          description="Pending human actions — callback tasks, no-show follow-ups, reschedule requests, and AI escalations requiring staff resolution"
        />

        <div className="mb-2 flex items-center gap-3">
          <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            {pending.length} pending / in progress
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {completed.length} completed / cancelled
          </div>
        </div>

        <section className="mb-10">
          <h3 className="mb-3 text-base font-semibold text-slate-900">
            Active tasks
          </h3>
          <TaskTable rows={pending} emptyMsg="No active tasks — all caught up." />
        </section>

        {completed.length > 0 && (
          <section>
            <h3 className="mb-3 text-base font-semibold text-slate-900">
              Completed &amp; cancelled
            </h3>
            <TaskTable rows={completed} emptyMsg="No completed tasks." />
          </section>
        )}
      </section>
    </>
  );
}
