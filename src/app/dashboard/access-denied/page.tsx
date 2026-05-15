import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { ROLE_LABELS } from "@/lib/constants";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";

export default async function AccessDeniedPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  return (
    <>
      <Header title="Access denied" />
      <section className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="medflow-card max-w-md p-8 text-center">
          <h2 className="text-xl font-semibold text-slate-900">Access denied</h2>
          <p className="mt-3 text-sm text-slate-600">
            Your role
            {role ? ` (${ROLE_LABELS[role] ?? role})` : ""} does not have permission
            to view this page. Contact an administrator if you need access.
          </p>
          <Link href="/dashboard" className="medflow-btn-primary mt-6 inline-block">
            Back to overview
          </Link>
        </div>
      </section>
    </>
  );
}
