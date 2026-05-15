"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      setError("Invalid email or password");
      return;
    }
    const sessionRes = await fetch("/api/auth/session");
    const sessionData = await sessionRes.json();
    if (sessionData?.user?.forcePasswordReset) {
      router.push("/dashboard/settings?changePassword=1");
    } else {
      router.push(callbackUrl);
    }
    router.refresh();
  }

  return (
  <>
    <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
    <p className="mt-2 text-sm text-slate-600">
      Use your clinic staff credentials
    </p>
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div>
        <label
          htmlFor="email"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          className="medflow-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          className="medflow-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="medflow-btn-primary w-full"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm">
        <a href="/forgot-password" className="text-medflow-600 hover:underline">
          Forgot password?
        </a>
      </p>
    </form>
    {process.env.NODE_ENV === "development" && (
      <p className="mt-6 text-xs text-slate-500">
        Dev: admin@medflow.ai / Admin123! — see README-PHASE3-5.md for all seed users.
      </p>
    )}
  </>
  );
}
