"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setMessage(data.message ?? "Request submitted.");
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md medflow-card p-8">
        <h1 className="text-xl font-semibold text-slate-900">Forgot password</h1>
        <p className="mt-2 text-sm text-slate-600">
          Placeholder flow — tokens are stored in the database. Email delivery
          will be added in a later phase. In development, check the server log
          for the reset token.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="text-slate-600">Email</span>
            <input
              type="email"
              required
              className="medflow-input mt-1 w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {message && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {message}
            </p>
          )}
          <button type="submit" disabled={loading} className="medflow-btn-primary w-full">
            {loading ? "Submitting…" : "Request reset"}
          </button>
        </form>
        <Link href="/login" className="mt-4 block text-center text-sm text-medflow-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
