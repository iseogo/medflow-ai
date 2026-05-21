"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { dashboardFetch } from "@/lib/api-fetch";

export function ChangePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, update } = useSession();
  const required = searchParams.get("changePassword") === "1";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await dashboardFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword: confirm,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to change password");
      }

      setSuccess(data.message ?? "Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      await update();

      if (required) {
        router.replace("/dashboard");
        router.refresh();
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="medflow-card p-6">
      <h3 className="font-semibold text-slate-900">Change password</h3>
      <p className="mt-1 text-sm text-slate-600">
        Enter your current password, then choose a new password (8+ characters with
        upper, lower, and a number).
      </p>
      {required && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You must set a new password before continuing to the rest of the dashboard.
        </p>
      )}
      {session?.user?.forcePasswordReset && !required && (
        <p className="mt-3 text-sm text-amber-700">
          Password reset is required on your account.
        </p>
      )}
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p
            className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700"
            role="status"
          >
            {success}
          </p>
        )}
        <label className="block text-sm">
          <span className="text-slate-600">Current password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            className="medflow-input mt-1 w-full"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">New password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="medflow-input mt-1 w-full"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Confirm new password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="medflow-input mt-1 w-full"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <button type="submit" disabled={loading} className="medflow-btn-primary">
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </section>
  );
}
