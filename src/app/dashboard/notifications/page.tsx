import { getServerSession } from "next-auth";
import { Header } from "@/components/dashboard/Header";
import { NotificationsCenter } from "@/components/dashboard/NotificationsCenter";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { notificationService } from "@/services/notification.service";
import { RoleType } from "@prisma/client";
import { redirect } from "next/navigation";

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const role = session.user.role as RoleType;
  if (!hasPermission(role, "notifications:read")) {
    redirect("/dashboard/access-denied");
  }

  const rows = await notificationService.listForUser(role, session.user.id, 100);

  const initial = rows.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    category: n.category,
    priority: n.priority,
    status: n.status,
    recommendedNextAction: n.recommendedNextAction,
    createdAt: n.createdAt.toISOString(),
    client: n.client,
  }));

  return (
    <>
      <Header title="Notifications" />
      <div className="space-y-6 p-6">
        <PageHeader
          title="Staff notifications"
          description="In-app alerts only. No SMS, email, or push is sent while MOCK_MODE is enabled."
        />
        <NotificationsCenter
          initial={initial}
          canWrite={hasPermission(role, "notifications:write")}
        />
      </div>
    </>
  );
}
