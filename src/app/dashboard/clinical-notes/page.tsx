import { Header } from "@/components/dashboard/Header";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function ClinicalNotesPage() {
  return (
    <>
      <Header title="Clinical notes" />
      <section className="flex-1 overflow-auto p-8">
        <PageHeader
          title="Clinical notes"
          description="Placeholder for structured clinical documentation (Phase 6+). RBAC verified in Phase 3.5."
        />
        <article className="medflow-card p-6 text-sm text-slate-600">
          Note templates, attestations, and EHR integrations are out of scope
          for Phases 1–5. This screen exists so CLINICAL staff roles can be
          exercised without exposing real PHI.
        </article>
      </section>
    </>
  );
}
