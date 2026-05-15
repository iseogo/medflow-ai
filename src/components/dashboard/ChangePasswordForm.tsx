"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function ChangePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, update } = useSession();
  const required = searchParams.get("changePassword") === "1";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change password");
      setSuccess(true);
      await update();
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="medflow-card mt-6 space-y-4 p-6">
      <h3 className="font-semibold text-slate-900">Change password</h3>
      {required && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You must set a new password before continuing.
        </p>
      )}
      {session?.user?.forcePasswordReset && !required && (
        <p className="text-sm text-amber-700">Password reset required on your account.</p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Password updated successfully.
        </p>
      )}
      <label className="block text-sm">
        <span className="text-slate-600">Current password</span>
        <input
          type="password"
          required
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
          className="medflow-input mt-1 w-full"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      <button type="submit" disabled={loading} className="medflow-btn-primary">
        {loading ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
