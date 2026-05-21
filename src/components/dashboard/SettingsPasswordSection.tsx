"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { dashboardFetch } from "@/lib/api-fetch";

export function SettingsPasswordSection() {
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
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await dashboardFetch("/api/settings/change-password", {
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
        setTimeout(() => {
          router.replace("/dashboard");
          router.refresh();
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border-2 border-medflow-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Change password</h3>
      <p className="mt-1 text-sm text-slate-600">
        Update your login password. Use at least 8 characters with uppercase, lowercase, and a
        number.
      </p>

      {required && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          You must change your password before using the rest of the dashboard.
        </p>
      )}
      {session?.user?.forcePasswordReset && !required && (
        <p className="mt-3 text-sm font-medium text-amber-700">
          Your account requires a password change.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && (
          <div
            className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </div>
        )}
        {success && (
          <div
            className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
            role="status"
          >
            {success}
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Current password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            className="medflow-input mt-1.5 w-full"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">New password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="medflow-input mt-1.5 w-full"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Confirm new password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="medflow-input mt-1.5 w-full"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="medflow-btn-primary w-full sm:w-auto"
        >
          {loading ? "Updating password…" : "Update password"}
        </button>
      </form>
    </section>
  );
}
