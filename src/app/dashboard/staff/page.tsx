import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StaffManagement } from "@/components/dashboard/StaffManagement";
import { StaffPageActions } from "@/components/dashboard/StaffPageActions";
import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/rbac";
import { ensureRolesExist } from "@/lib/roles/ensure-roles";
import { prisma } from "@/lib/prisma";
import { userPublicSelect } from "@/lib/user-public";

type PageProps = {
  searchParams?: { action?: string };
};

export default async function StaffPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (!role || !canManageUsers(role)) {
    redirect("/dashboard/access-denied");
  }

  await ensureRolesExist();

  const staff = await prisma.user.findMany({
    select: userPublicSelect,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const openCreate = searchParams?.action === "create";

  return (
    <>
      <Header title="Staff" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Staff & roles"
          description="Create and manage staff logins, assign roles, and control account status."
          action={<StaffPageActions />}
        />
        <StaffManagement
          initialStaff={staff}
          openCreateOnMount={openCreate}
        />
      </section>
    </>
  );
}
