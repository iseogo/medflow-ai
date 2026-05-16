import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RemindersPanel } from "@/components/dashboard/RemindersPanel";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import type { ReminderListDbRow } from "@/services/reminder-engine.service";
import { reminderEngineService } from "@/services/reminder-engine.service";

export default async function RemindersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role) {
    redirect("/login");
  }
  if (!hasPermission(session.user.role, "reminders:read")) {
    redirect("/dashboard/access-denied");
  }

  const logs = await reminderEngineService.listReminderLogs(100);

  const serialized = logs.map((row: ReminderListDbRow) => ({
    id: row.id,
    reminderOffset: row.reminderOffset,
    outcome: row.outcome,
    dueAt: row.dueAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    client: row.client,
    appointment: {
      ...row.appointment,
      scheduledAt: row.appointment.scheduledAt.toISOString(),
    },
  }));

  return (
    <>
      <Header title="Reminders" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Reminder engine"
          description="AI voice-first appointment reminders (Phase 5) — 48h, 24h, 2h, 30m with SMS and email fallbacks. Stubs only."
        />
        <RemindersPanel initialLogs={serialized} role={session.user.role} />
      </section>
    </>
  );
}
