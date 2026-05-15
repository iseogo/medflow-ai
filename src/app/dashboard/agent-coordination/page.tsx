import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, EmptyState, Table, Td, Th } from "@/components/dashboard/DataTable";
import { ProposalStatusBadge } from "@/components/ui/ProposalStatusBadge";
import { AGENT_TYPE_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { formatDate, formatName } from "@/lib/utils";

type ProposalRow = Awaited<ReturnType<typeof loadProposals>>[number];

function ProposalTable({
  rows,
  emptyMessage,
}: {
  rows: ProposalRow[];
  emptyMessage: string;
}) {
  return (
    <DataTable>
      <Table>
        <thead>
          <tr>
            <Th>Client</Th>
            <Th>Agent</Th>
            <Th>Action</Th>
            <Th>Purpose</Th>
            <Th>Status</Th>
            <Th>Flags</Th>
            <Th>Time</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState message={emptyMessage} />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <Td>
                  {formatName(row.client.firstName, row.client.lastName)}
                </Td>
                <Td className="text-sm">
                  {AGENT_TYPE_LABELS[row.agentType] ?? row.agentName}
                </Td>
                <Td className="font-medium">{row.actionType}</Td>
                <Td>{row.purpose}</Td>
                <Td>
                  <ProposalStatusBadge status={row.proposalStatus} />
                </Td>
                <Td>
                  {row.isEmergency && (
                    <span className="text-xs font-semibold text-red-600">
                      URGENT
                    </span>
                  )}
                  {row.staffOverride && (
                    <span className="ml-1 text-xs text-medflow-600">Staff</span>
                  )}
                  {row.automationHalted && (
                    <span className="block text-xs text-amber-700">Halted</span>
                  )}
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

async function loadProposals() {
  return prisma.agentAction.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { firstName: true, lastName: true } },
    },
    take: 200,
  });
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "green" | "slate" | "red";
}) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    red: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default async function AgentCoordinationPage() {
  const all = await loadProposals();

  const pending = all.filter((a) => a.proposalStatus === "PENDING_APPROVAL");
  const approved = all.filter(
    (a) => a.proposalStatus === "APPROVED" || a.proposalStatus === "EXECUTED"
  );
  const rejected = all.filter((a) => a.proposalStatus === "REJECTED");
  const escalated = all.filter((a) => a.proposalStatus === "ESCALATED");
  const emergencies = all.filter((a) => a.isEmergency);

  return (
    <>
      <Header title="Agent Coordination" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Master Orchestrator"
          description="All AI actions require proposal, review, and execute. Staff overrides AI."
        />

        {emergencies.length > 0 && (
          <div className="mb-6 rounded-xl border-2 border-red-300 bg-red-50 p-4">
            <h3 className="font-semibold text-red-900">
              Emergency: automation halted ({emergencies.length})
            </h3>
            <p className="mt-1 text-sm text-red-800">
              Urgent staff tasks were created. Normal AI automation is stopped.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {emergencies.slice(0, 5).map((e) => (
                <li key={e.id} className="rounded-lg bg-white/80 px-3 py-2">
                  <span className="font-medium">
                    {formatName(e.client.firstName, e.client.lastName)}
                  </span>
                  {e.orchestratorNotes ? ` - ${e.orchestratorNotes}` : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-8 grid gap-4 sm:grid-cols-4">
          <StatPill label="Pending approval" value={pending.length} tone="amber" />
          <StatPill label="Approved / executed" value={approved.length} tone="green" />
          <StatPill label="Rejected" value={rejected.length} tone="slate" />
          <StatPill label="Escalated" value={escalated.length} tone="red" />
        </div>

        <div className="space-y-10">
          <section>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">
              Pending approvals
            </h3>
            <ProposalTable rows={pending} emptyMessage="No pending proposals." />
          </section>
          <section>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">
              Approved actions
            </h3>
            <ProposalTable rows={approved} emptyMessage="No approved proposals." />
          </section>
          <section>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">
              Rejected actions
            </h3>
            <ProposalTable rows={rejected} emptyMessage="No rejected proposals." />
          </section>
          <section>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">
              Escalated actions
            </h3>
            <ProposalTable rows={escalated} emptyMessage="No escalated proposals." />
          </section>
          <section>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">
              All agent actions
            </h3>
            <ProposalTable rows={all} emptyMessage="No agent actions." />
          </section>
        </div>
      </section>
    </>
  );
}
