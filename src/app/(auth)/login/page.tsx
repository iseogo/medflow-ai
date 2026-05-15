import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-1/2 bg-gradient-to-br from-medflow-700 to-medflow-900 p-12 lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-lg font-bold text-white">
            MF
          </div>
          <h1 className="mt-8 text-3xl font-semibold text-white">MedFlow AI</h1>
          <p className="mt-3 max-w-md text-medflow-100">
            Healthcare communication platform — scheduling, client care, and
            staff coordination in one place.
          </p>
        </div>
        <p className="text-sm text-medflow-200">Phase 1 Foundation</p>
      </aside>
      <div className="flex w-full flex-col justify-center px-8 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
