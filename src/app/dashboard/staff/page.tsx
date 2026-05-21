import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StaffCrud } from "@/components/dashboard/StaffCrud";
import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/rbac";
import { ensureRolesExist } from "@/lib/roles/ensure-roles";
import { prisma } from "@/lib/prisma";
import { userPublicSelect } from "@/lib/user-public";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
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

  return (
    <>
      <Header title="Staff" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Staff & roles"
          description="Create staff logins, assign roles, and manage access"
        />
        <StaffCrud initialStaff={staff} />
      </section>
    </>
  );
}
