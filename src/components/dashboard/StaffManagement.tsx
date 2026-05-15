"use client";

import { RoleType, UserStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/constants";
import type { PublicStaffUser } from "@/lib/user-public";

const ROLE_OPTIONS: RoleType[] = [
  "ADMIN",
  "MANAGER",
  "FRONT_DESK_STAFF",
  "BILLING_STAFF",
  "MEDICAL_RECORDS_STAFF",
  "CLINICAL_STAFF",
  "READ_ONLY",
];

type Props = {
  initialStaff: PublicStaffUser[];
};

export function StaffManagement({ initialStaff }: Props) {
  const router = useRouter();
  const [staff, setStaff] = useState(initialStaff);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    roleType: "FRONT_DESK_STAFF" as RoleType,
    password: "",
    status: "ACTIVE" as UserStatus,
    forcePasswordReset: true,
    resetPassword: "",
  });

  function openCreate() {
    setForm({
      email: "",
      firstName: "",
      lastName: "",
      roleType: "FRONT_DESK_STAFF",
      password: "",
      status: "ACTIVE",
      forcePasswordReset: true,
      resetPassword: "",
    });
    setEditId(null);
    setShowCreate(true);
    setError(null);
  }

  function openEdit(u: PublicStaffUser) {
    setForm({
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      roleType: u.role.type,
      password: "",
      status: u.status,
      forcePasswordReset: u.forcePasswordReset,
      resetPassword: "",
    });
    setEditId(u.id);
    setShowCreate(true);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editId) {
        const res = await fetch(`/api/staff/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.email,
            firstName: form.firstName,
            lastName: form.lastName,
            roleType: form.roleType,
            status: form.status,
            forcePasswordReset: form.forcePasswordReset,
            ...(form.resetPassword ? { resetPassword: form.resetPassword } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Update failed");
        setStaff((prev) => prev.map((u) => (u.id === editId ? data : u)));
      } else {
        const res = await fetch("/api/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.email,
            firstName: form.firstName,
            lastName: form.lastName,
            roleType: form.roleType,
            password: form.password,
            status: form.status,
            forcePasswordReset: form.forcePasswordReset,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Create failed");
        setStaff((prev) => [...prev, data].sort((a, b) =>
          a.lastName.localeCompare(b.lastName)
        ));
      }
      setShowCreate(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this staff member?")) return;
    const res = await fetch(`/api/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INACTIVE" }),
    });
    if (res.ok) {
      const data = await res.json();
      setStaff((prev) => prev.map((u) => (u.id === id ? data : u)));
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Each staff member has an individual login — no shared passwords.
        </p>
        <button type="button" onClick={openCreate} className="medflow-btn-primary">
          Add staff member
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleSubmit} className="medflow-card space-y-4 p-6">
          <h3 className="font-semibold text-slate-900">
            {editId ? "Edit staff member" : "New staff member"}
          </h3>
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600">First name</span>
              <input
                required
                className="medflow-input mt-1 w-full"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Last name</span>
              <input
                required
                className="medflow-input mt-1 w-full"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Email</span>
              <input
                required
                type="email"
                className="medflow-input mt-1 w-full"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Role</span>
              <select
                className="medflow-input mt-1 w-full"
                value={form.roleType}
                onChange={(e) =>
                  setForm({ ...form, roleType: e.target.value as RoleType })
                }
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] ?? r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Status</span>
              <select
                className="medflow-input mt-1 w-full"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as UserStatus })
                }
              >
                {Object.entries(USER_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {!editId ? (
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600">Initial password</span>
                <input
                  required
                  type="password"
                  className="medflow-input mt-1 w-full"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </label>
            ) : (
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600">Reset password (optional)</span>
                <input
                  type="password"
                  className="medflow-input mt-1 w-full"
                  value={form.resetPassword}
                  onChange={(e) => setForm({ ...form, resetPassword: e.target.value })}
                />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.forcePasswordReset}
                onChange={(e) =>
                  setForm({ ...form, forcePasswordReset: e.target.checked })
                }
              />
              Force password change on next login
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="medflow-btn-primary">
              {saving ? "Saving…" : editId ? "Save changes" : "Create user"}
            </button>
            <button
              type="button"
              className="medflow-btn-secondary"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="medflow-card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last login</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {u.firstName} {u.lastName}
                  {u.forcePasswordReset && (
                    <span className="ml-2 text-xs text-amber-700">Must reset PW</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">{ROLE_LABELS[u.role.type] ?? u.role.type}</td>
                <td className="px-4 py-3">{USER_STATUS_LABELS[u.status] ?? u.status}</td>
                <td className="px-4 py-3 text-slate-600">
                  {u.lastLoginAt
                    ? new Date(u.lastLoginAt).toLocaleString()
                    : "Never"}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-medflow-600 hover:underline"
                    onClick={() => openEdit(u)}
                  >
                    Edit
                  </button>
                  {u.status === "ACTIVE" && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() => deactivate(u.id)}
                      >
                        Deactivate
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
