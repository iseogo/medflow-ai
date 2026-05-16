import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function MedicalRecordsPage() {
  return (
    <>
      <Header title="Medical records" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Medical records"
          description="Placeholder for medical records staff workflows (Phase 6+)."
        />
        <article className="medflow-card p-6 text-sm text-slate-600">
          Medical records release and fulfillment APIs are not built yet. This
          route is reserved for MEDICAL_RECORDS_STAFF RBAC verification.
        </article>
      </section>
    </>
  );
}
