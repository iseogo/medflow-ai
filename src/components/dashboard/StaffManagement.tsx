"use client";

import { RoleType, UserStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dashboardFetch } from "@/lib/api-fetch";
import { DataTable, Table, Td, Th } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/constants";
import { DEFAULT_STAFF_PASSWORD } from "@/lib/staff-defaults";
import type { PublicStaffUser } from "@/lib/user-public";
import { formatDate } from "@/lib/utils";

const ROLE_OPTIONS: RoleType[] = [
  "ADMIN",
  "MANAGER",
  "FRONT_DESK_STAFF",
  "BILLING_STAFF",
  "MEDICAL_RECORDS_STAFF",
  "CLINICAL_STAFF",
  "READ_ONLY",
];

function statusBadgeVariant(
  status: UserStatus
): "success" | "default" | "warning" | "danger" {
  if (status === "ACTIVE") return "success";
  if (status === "INACTIVE") return "default";
  return "warning";
}

type Props = {
  initialStaff: PublicStaffUser[];
  /** Open create form on mount (e.g. from ?action=create). */
  openCreateOnMount?: boolean;
};

export function StaffManagement({
  initialStaff,
  openCreateOnMount = false,
}: Props) {
  const router = useRouter();
  const [staff, setStaff] = useState(initialStaff);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    roleType: "FRONT_DESK_STAFF" as RoleType,
    password: "",
    status: "ACTIVE" as UserStatus,
    forcePasswordReset: true,
    resetPassword: "",
  });

  useEffect(() => {
    if (openCreateOnMount) {
      openCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreateOnMount]);

  async function reloadStaff() {
    const res = await dashboardFetch("/api/staff");
    const data = await res.json();
    if (res.ok && Array.isArray(data)) {
      setStaff(data);
    }
  }

  function openCreate() {
    setForm({
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      roleType: "FRONT_DESK_STAFF",
      password: "",
      status: "ACTIVE",
      forcePasswordReset: true,
      resetPassword: "",
    });
    setEditId(null);
    setShowForm(true);
    setError(null);
  }

  function openEdit(u: PublicStaffUser) {
    setForm({
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone ?? "",
      roleType: u.role.type,
      password: "",
      status: u.status,
      forcePasswordReset: u.forcePasswordReset,
      resetPassword: "",
    });
    setEditId(u.id);
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editId) {
        const res = await dashboardFetch(`/api/staff/${editId}`, {
          method: "PATCH",
          body: JSON.stringify({
            email: form.email,
            firstName: form.firstName,
            lastName: form.lastName,
            phone: form.phone || null,
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
        const res = await dashboardFetch("/api/staff", {
          method: "POST",
          body: JSON.stringify({
            email: form.email,
            firstName: form.firstName,
            lastName: form.lastName,
            phone: form.phone || null,
            roleType: form.roleType,
            ...(form.password ? { password: form.password } : {}),
            status: form.status,
            forcePasswordReset: form.forcePasswordReset,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Create failed");
        setStaff((prev) =>
          [...prev, data].sort((a, b) => a.lastName.localeCompare(b.lastName))
        );
      }
      setShowForm(false);
      await reloadStaff();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this staff member? They will not be able to sign in.")) {
      return;
    }
    const res = await dashboardFetch(`/api/staff/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Deactivate failed");
      return;
    }
    await reloadStaff();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {staff.length} staff account{staff.length === 1 ? "" : "s"} · individual logins
          with role-based access
        </p>
        <button type="button" onClick={openCreate} className="medflow-btn-primary">
          + Add staff
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="medflow-card space-y-4 p-6">
          <h3 className="font-semibold text-slate-900">
            {editId ? "Edit staff member" : "Add staff member"}
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
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Phone</span>
              <input
                type="tel"
                className="medflow-input mt-1 w-full"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
                <span className="text-slate-600">
                  Initial password (optional — default {DEFAULT_STAFF_PASSWORD})
                </span>
                <input
                  type="password"
                  placeholder={DEFAULT_STAFF_PASSWORD}
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
              {saving ? "Saving…" : editId ? "Save changes" : "Create staff"}
            </button>
            <button
              type="button"
              className="medflow-btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <DataTable>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <Td>
                  <span className="font-medium text-slate-900">
                    {u.firstName} {u.lastName}
                  </span>
                  {u.forcePasswordReset && (
                    <span className="ml-2 text-xs text-amber-700">Must reset PW</span>
                  )}
                </Td>
                <Td className="text-slate-600">{u.email}</Td>
                <Td className="text-slate-600">{u.phone ?? "—"}</Td>
                <Td>{ROLE_LABELS[u.role.type] ?? u.role.type}</Td>
                <Td>
                  <Badge variant={statusBadgeVariant(u.status)}>
                    {USER_STATUS_LABELS[u.status] ?? u.status}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-slate-600">
                  {formatDate(u.updatedAt, {
                    dateStyle: "short",
                    timeStyle: undefined,
                  })}
                </Td>
                <Td>
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
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </DataTable>
    </div>
  );
}
