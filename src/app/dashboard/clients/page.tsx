import { RoleType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ClientsCrud, type ClientRow } from "@/components/dashboard/ClientsCrud";
import { authOptions } from "@/lib/auth";
import { canReadClients, canWriteClients } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role as RoleType | undefined;
  if (!role || !canReadClients(role)) {
    redirect("/dashboard/access-denied");
  }

  const canManage =
    role === "ADMIN" ||
    role === "MANAGER" ||
    role === "FRONT_DESK_STAFF" ||
    canWriteClients(role);

  const [clients, activeCount, totalCount] = await Promise.all([
    prisma.client.findMany({
      orderBy: { lastName: "asc" },
      take: 500,
      include: {
        _count: { select: { appointments: true, timelineEvents: true } },
      },
    }),
    prisma.client.count({ where: { isActive: true } }),
    prisma.client.count(),
  ]);

  return (
    <>
      <Header title="Clients" />
      <div className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Clients"
          description="Manage patient profiles and contact information"
        />
        <ClientsCrud
          initialClients={clients as ClientRow[]}
          initialActiveCount={activeCount}
          initialTotalCount={totalCount}
          canManage={canManage}
        />
      </div>
    </>
  );
}
