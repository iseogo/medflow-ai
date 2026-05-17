import { getServerSession } from "next-auth";
import { RoleType } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Monitor } from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CommandCenterView } from "@/components/dashboard/command-center/CommandCenterView";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { commandCenterService } from "@/services/command-center.service";

export default async function CommandCenterPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const role = session.user.role as RoleType;
  if (!hasPermission(role, "command-center:read")) {
    redirect("/dashboard/access-denied");
  }

  const snapshot = await commandCenterService.getSnapshot(role, session.user.id);

  return (
    <>
      <Header title="Command Center" />
      <div className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Healthcare Operations Command Center"
          description="Executive visibility for patient flow, staff productivity, AI coordination, and workflow health — PHI-safe summaries only."
        />
        <Link
          href="/dashboard/command-center/live"
          className="mb-6 inline-flex items-center gap-2 rounded-lg border border-medflow-200 bg-medflow-50 px-4 py-2 text-sm font-medium text-medflow-800 hover:bg-medflow-100"
        >
          <Monitor className="h-4 w-4" />
          Open live wall display for shared screens
        </Link>
        <CommandCenterView snapshot={snapshot} />
      </div>
    </>
  );
}
