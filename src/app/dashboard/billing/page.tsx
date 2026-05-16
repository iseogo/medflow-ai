import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function BillingPage() {
  return (
    <>
      <Header title="Billing" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Billing"
          description="Placeholder for billing operations staff (claims, statements, eligibility). RBAC route reserved through Phase 5."
        />
        <article className="medflow-card p-6 text-sm text-slate-600">
          Billing workflows and external payer APIs are not wired yet. This route
          validates BILLING_STAFF permissions today and will host ledgers and
          remittance tools in a future phase.
        </article>
      </section>
    </>
  );
}
