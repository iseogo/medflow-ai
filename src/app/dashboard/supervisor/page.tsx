import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, EmptyState, Table, Td, Th } from "@/components/dashboard/DataTable";
import { isMockModeForced } from "@/lib/integrations/env";
import { supervisorAgentService } from "@/services/supervisor-agent.service";
import { adminAlertService } from "@/services/admin-alert.service";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { SupervisorRunButton } from "./SupervisorRunButton";

export default async function SupervisorDashboardPage() {
  const [summary, alerts, incidents, recommendations] = await Promise.all([
    supervisorAgentService.getDashboardSummary(),
    adminAlertService.listOpen(25),
    prisma.coordinationIncident.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.supervisorRecommendation.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  const mockMode = isMockModeForced();

  return (
    <>
      <Header title="Supervisor AI" />
      <div className="space-y-8 p-6">
        <PageHeader
          title="AI Quality Control"
          description="Observe and audit only — no authority over Master Orchestrator or other agents. Staff and orchestrator approve all corrective actions."
          action={<SupervisorRunButton />}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Coordination score" value={String(summary.coordinationScore)} />
          <StatCard label="Open alerts" value={String(summary.alertSummary.open)} />
          <StatCard label="Open incidents" value={String(summary.openIncidents)} />
          <StatCard label="Pending proposals" value={String(summary.pendingProposals)} />
        </div>

        <p className="text-sm text-slate-600">
          MOCK_MODE: {mockMode ? "on (safe)" : "off"} — Supervisor does not enable live APIs.
        </p>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Admin alerts</h2>
          <DataTable>
            <Table>
              <thead>
                <tr>
                  <Th>Severity</Th>
                  <Th>Code</Th>
                  <Th>Title</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No open alerts" />
                    </td>
                  </tr>
                ) : (
                  alerts.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <Td>{a.severity}</Td>
                      <Td className="font-mono text-xs">{a.code}</Td>
                      <Td>{a.title}</Td>
                      <Td>{a.status}</Td>
                      <Td>{formatDate(a.createdAt)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </DataTable>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Unresolved incidents</h2>
          <DataTable>
            <Table>
              <thead>
                <tr>
                  <Th>Type</Th>
                  <Th>Title</Th>
                  <Th>Severity</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState message="No open coordination incidents" />
                    </td>
                  </tr>
                ) : (
                  incidents.map((i) => (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <Td className="text-xs">{i.incidentType}</Td>
                      <Td>{i.title}</Td>
                      <Td>{i.severity}</Td>
                      <Td>{formatDate(i.createdAt)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </DataTable>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Pending recommendations</h2>
          <DataTable>
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Title</Th>
                  <Th>Corrective action</Th>
                </tr>
              </thead>
              <tbody>
                {recommendations.length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      <EmptyState message="No pending supervisor recommendations" />
                    </td>
                  </tr>
                ) : (
                  recommendations.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <Td className="font-mono text-xs">{r.code}</Td>
                      <Td>{r.title}</Td>
                      <Td className="text-sm text-slate-600">
                        {r.correctiveAction ?? "—"}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </DataTable>
        </section>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
