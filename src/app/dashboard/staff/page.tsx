import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StaffManagement } from "@/components/dashboard/StaffManagement";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { userPublicSelect } from "@/lib/user-public";

export default async function StaffPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role || !hasPermission(session.user.role, "users:manage")) {
    redirect("/dashboard/access-denied");
  }

  const staff = await prisma.user.findMany({
    select: userPublicSelect,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <>
      <Header title="Staff" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Staff accounts"
          description="Create and manage individual staff logins, roles, and access (Phase 3.5)."
        />
        <StaffManagement initialStaff={staff} />
      </section>
    </>
  );
}
