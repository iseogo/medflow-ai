"use client";

import { RoleType, UserStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { DataTable, Table, Td, Th } from "@/components/dashboard/DataTable";
import { ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/constants";
import { DEFAULT_STAFF_PASSWORD } from "@/lib/staff-defaults";
import type { PublicStaffUser } from "@/lib/user-public";
import { dashboardFetch } from "@/lib/api-fetch";
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

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleType: RoleType;
  status: UserStatus;
  forcePasswordReset: boolean;
  resetPassword: string;
};

const emptyForm: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  roleType: "FRONT_DESK_STAFF",
  status: "ACTIVE",
  forcePasswordReset: true,
  resetPassword: "",
};

type Props = {
  initialStaff: PublicStaffUser[];
};

export function StaffCrud({ initialStaff }: Props) {
  const router = useRouter();
  const [staff, setStaff] = useState(initialStaff);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    const res = await dashboardFetch("/api/staff");
    const data = await res.json();
    if (res.ok && Array.isArray(data)) setStaff(data);
  }

  function openCreate() {
    setForm(emptyForm);
    setEditId(null);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(u: PublicStaffUser) {
    setForm({
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone ?? "",
      roleType: u.role.type,
      status: u.status,
      forcePasswordReset: u.forcePasswordReset,
      resetPassword: "",
    });
    setEditId(u.id);
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
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
      } else {
        const res = await dashboardFetch("/api/staff", {
          method: "POST",
          body: JSON.stringify({
            email: form.email,
            firstName: form.firstName,
            lastName: form.lastName,
            phone: form.phone || null,
            roleType: form.roleType,
            status: form.status,
            forcePasswordReset: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Create failed");
      }
      closeModal();
      await reload();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm("Deactivate this staff member?")) return;
    const res = await dashboardFetch(`/api/staff/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Deactivate failed");
      return;
    }
    await reload();
    router.refresh();
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{staff.length}</span> staff
          accounts · new users get temporary password{" "}
          <code className="rounded bg-slate-100 px-1">{DEFAULT_STAFF_PASSWORD}</code>
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="medflow-btn-primary w-full sm:w-auto"
        >
          Add Staff
        </button>
      </div>

      {error && !modalOpen && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <DataTable>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <p className="text-sm text-slate-600">No staff accounts yet.</p>
                  <button type="button" onClick={openCreate} className="medflow-btn-primary mt-4">
                    Add Staff
                  </button>
                </td>
              </tr>
            ) : (
              staff.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">
                    {u.firstName} {u.lastName}
                  </Td>
                  <Td>{u.email}</Td>
                  <Td>{ROLE_LABELS[u.role.type] ?? u.role.type}</Td>
                  <Td>
                    <Badge variant={u.status === "ACTIVE" ? "success" : "default"}>
                      {USER_STATUS_LABELS[u.status]}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="medflow-btn-secondary px-2 py-1 text-xs"
                        onClick={() => openEdit(u)}
                      >
                        Edit
                      </button>
                      {u.status === "ACTIVE" && (
                        <button
                          type="button"
                          className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
                          onClick={() => handleDeactivate(u.id)}
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </DataTable>

      <Modal
        open={modalOpen}
        title={editId ? "Edit staff member" : "Add staff member"}
        onClose={closeModal}
        wide
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          {!editId && (
            <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
              A temporary password (<strong>{DEFAULT_STAFF_PASSWORD}</strong>) will be set.
              The user must change it on first login.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">First name *</span>
              <input
                required
                className="medflow-input mt-1 w-full"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Last name *</span>
              <input
                required
                className="medflow-input mt-1 w-full"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">Email *</span>
              <input
                required
                type="email"
                className="medflow-input mt-1 w-full"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Phone</span>
              <input
                type="tel"
                className="medflow-input mt-1 w-full"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Role *</span>
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
              <span className="font-medium text-slate-700">Status</span>
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
            {editId && (
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Reset password (optional)</span>
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
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" className="medflow-btn-secondary" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="medflow-btn-primary">
              {saving ? "Saving…" : editId ? "Save changes" : "Create staff"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
