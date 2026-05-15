import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { WalkInForm } from "@/components/dashboard/WalkInForm";
import { DataTable, EmptyState, Table, Td, Th } from "@/components/dashboard/DataTable";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { physicalClientService } from "@/services/physical-client.service";
import { formatDate, formatName } from "@/lib/utils";

export default async function WalkInsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role || !hasPermission(session.user.role, "walkins:read")) {
    redirect("/dashboard/access-denied");
  }

  const visits = await physicalClientService.listWalkIns(30);
  const canWrite = hasPermission(session.user.role, "walkins:write");

  return (
    <>
      <Header title="Walk-ins" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Walk-ins"
          description="First-time physical arrivals — full registration and onboarding"
        />
        {canWrite && <WalkInForm />}
        <h3 className="mb-3 mt-10 text-lg font-semibold text-slate-900">Recent walk-ins</h3>
        <DataTable>
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Type</Th>
                <Th>Onboarding</Th>
                <Th>Provider</Th>
                <Th>Arrived</Th>
              </tr>
            </thead>
            <tbody>
              {visits.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState message="No walk-in visits yet." />
                  </td>
                </tr>
              ) : (
                visits.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <Td>{formatName(v.client.firstName, v.client.lastName)}</Td>
                    <Td>{v.visitType}</Td>
                    <Td>{v.onboardingStatus}</Td>
                    <Td>{v.appointment?.providerName ?? "—"}</Td>
                    <Td>{formatDate(v.arrivedAt)}</Td>
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
