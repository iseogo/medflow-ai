import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  ClientManagement,
  type ClientListRow,
} from "@/components/dashboard/ClientManagement";
import { ClientPageActions } from "@/components/dashboard/ClientPageActions";
import { authOptions } from "@/lib/auth";
import { canReadClients, canWriteClients, hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams?: { action?: string };
};

export default async function ClientsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (!role || !canReadClients(role)) {
    redirect("/dashboard/access-denied");
  }

  const canWrite = canWriteClients(role);
  const limited =
    !hasPermission(role, "clients:read") &&
    hasPermission(role, "clients:read-limited");

  const [clients, activeCount, totalCount] = await Promise.all([
    limited
      ? prisma.client.findMany({
          orderBy: { lastName: "asc" },
          take: 200,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            mrn: true,
            isActive: true,
            preferredContactMethod: true,
            dateOfBirth: true,
            notes: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            postalCode: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : prisma.client.findMany({
          orderBy: { lastName: "asc" },
          take: 200,
          include: {
            _count: { select: { appointments: true, timelineEvents: true } },
          },
        }),
    prisma.client.count({ where: { isActive: true } }),
    prisma.client.count(),
  ]);

  const openCreate = searchParams?.action === "create" && canWrite;

  return (
    <>
      <Header title="Clients" />
      <div className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Clients"
          description="Patient profiles with unified activity timelines"
          action={<ClientPageActions canWrite={canWrite} />}
        />
        <ClientManagement
          initialClients={clients as ClientListRow[]}
          activeCount={activeCount}
          totalCount={totalCount}
          canWrite={canWrite}
          openCreateOnMount={openCreate}
        />
      </div>
    </>
  );
}
