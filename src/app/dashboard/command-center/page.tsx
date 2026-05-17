import { getServerSession } from "next-auth";
import { RoleType } from "@prisma/client";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CommandCenterSectionCard } from "@/components/dashboard/command-center/CommandCenterSectionCard";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { commandCenterService } from "@/services/command-center.service";
import { cn } from "@/lib/utils";

const HEALTH_STYLES = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-900",
  degraded: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-red-200 bg-red-50 text-red-900",
} as const;

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
          title="Command Center"
          description="Unified operational view — PHI-safe summaries only. Sections respect your role."
        />

        <div
          className={cn(
            "mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border px-4 py-3",
            HEALTH_STYLES[snapshot.systemHealth]
          )}
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide">
              System health · {snapshot.systemHealth}
            </p>
            <p className="mt-1 text-sm opacity-90">
              {snapshot.mockMode
                ? "MOCK_MODE is ON — live APIs disabled (safe demo)"
                : "Live integration mode — verify settings before production"}
            </p>
          </div>
          <p className="text-xs text-slate-600">
            Updated {new Date(snapshot.generatedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}
          </p>
        </div>

        {snapshot.sections.length === 0 ? (
          <p className="text-sm text-slate-600">
            No command center sections are available for your role. Contact an administrator if you
            need access.
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.sections.map((section) => (
              <CommandCenterSectionCard key={section.id} section={section} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
