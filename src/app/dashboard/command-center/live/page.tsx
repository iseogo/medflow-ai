import { getServerSession } from "next-auth";
import { RoleType } from "@prisma/client";
import { redirect } from "next/navigation";
import { LiveCommandCenterBoard } from "@/components/dashboard/command-center/live/LiveCommandCenterBoard";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { liveCommandCenterService } from "@/services/live-command-center.service";

export default async function LiveCommandCenterPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const role = session.user.role as RoleType;
  if (!hasPermission(role, "command-center:read")) {
    redirect("/dashboard/access-denied");
  }

  const board = await liveCommandCenterService.getBoard(role, session.user.id);

  return (
    <div className="fixed inset-0 z-40 overflow-auto">
      <LiveCommandCenterBoard initial={board} role={role} />
    </div>
  );
}
