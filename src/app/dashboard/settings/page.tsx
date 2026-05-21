import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SettingsPasswordSection } from "@/components/dashboard/SettingsPasswordSection";
import { IntegrationsPanel } from "@/components/dashboard/IntegrationsPanel";
import { APP_TIMEZONE, APP_URL, N8N_URL, ROLE_LABELS } from "@/lib/constants";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  return (
    <>
      <Header title="Settings" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Settings"
          description="Account security and platform configuration"
        />
        <article className="max-w-2xl space-y-6">
          <Suspense
            fallback={
              <div className="medflow-card p-6 text-sm text-slate-500">
                Loading password form…
              </div>
            }
          >
            <SettingsPasswordSection />
          </Suspense>

          <section className="medflow-card p-6">
            <h3 className="font-semibold text-slate-900">Your account</h3>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Name</dt>
                <dd className="font-medium text-slate-900">{session?.user?.name}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="font-medium text-slate-900">{session?.user?.email}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Role</dt>
                <dd className="font-medium text-slate-900">
                  {role ? ROLE_LABELS[role] ?? role : "—"}
                </dd>
              </div>
            </dl>
          </section>

          <IntegrationsPanel />

          <section className="medflow-card p-6">
            <h3 className="font-semibold text-slate-900">Platform</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">App URL</dt>
                <dd className="font-mono text-slate-900">{APP_URL}</dd>
              </div>
              <div>
                <dt className="text-slate-500">n8n URL</dt>
                <dd className="font-mono text-slate-900">{N8N_URL}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Timezone</dt>
                <dd className="font-mono text-slate-900">{APP_TIMEZONE}</dd>
              </div>
            </dl>
          </section>
        </article>
      </section>
    </>
  );
}
