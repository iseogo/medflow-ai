"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import {
  DataTable,
  Table,
  Td,
  Th,
} from "@/components/dashboard/DataTable";
import {
  CLIENT_STATUS_LABELS,
  PREFERRED_CONTACT_LABELS,
} from "@/lib/constants";
import { clientStatusFromActive } from "@/lib/client-form";
import { dashboardFetch } from "@/lib/api-fetch";
import { formatDate, formatName } from "@/lib/utils";

export type ClientRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mrn: string | null;
  isActive: boolean;
  preferredContactMethod: string | null;
  dateOfBirth: Date | string | null;
  notes: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: { appointments: number; timelineEvents: number };
};

type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  address: string;
  preferredContactMethod: "" | "PHONE" | "EMAIL" | "SMS";
  notes: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

const emptyForm: FormState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  dateOfBirth: "",
  address: "",
  preferredContactMethod: "",
  notes: "",
  status: "ACTIVE",
};

type Props = {
  initialClients: ClientRow[];
  initialActiveCount: number;
  initialTotalCount: number;
  canManage: boolean;
};

export function ClientsCrud({
  initialClients,
  initialActiveCount,
  initialTotalCount,
  canManage,
}: Props) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [activeCount, setActiveCount] = useState(initialActiveCount);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    const res = await dashboardFetch("/api/clients");
    const data = await res.json();
    if (res.ok && Array.isArray(data.clients)) {
      setClients(data.clients);
      setActiveCount(
        data.activeCount ??
          data.clients.filter((c: ClientRow) => c.isActive).length
      );
      setTotalCount(data.totalCount ?? data.clients.length);
    }
  }

  function openCreate() {
    setForm(emptyForm);
    setEditId(null);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(c: ClientRow) {
    setForm({
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone ?? "",
      email: c.email ?? "",
      dateOfBirth: c.dateOfBirth
        ? new Date(c.dateOfBirth).toISOString().slice(0, 10)
        : "",
      address: c.addressLine1 ?? "",
      preferredContactMethod:
        (c.preferredContactMethod as FormState["preferredContactMethod"]) || "",
      notes: c.notes ?? "",
      status: clientStatusFromActive(c.isActive),
    });
    setEditId(c.id);
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
    if (!canManage) return;
    setSaving(true);
    setError(null);

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      dateOfBirth: form.dateOfBirth || null,
      addressLine1: form.address.trim() || null,
      preferredContactMethod: form.preferredContactMethod || null,
      notes: form.notes.trim() || null,
      status: form.status,
    };

    try {
      const res = await dashboardFetch(
        editId ? `/api/clients/${editId}` : "/api/clients",
        {
          method: editId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");

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
    if (!canManage) return;
    if (!confirm("Archive this client? They will be marked inactive.")) return;
    setError(null);
    const res = await dashboardFetch(`/api/clients/${id}`, { method: "DELETE" });
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
      {/* Toolbar — Add Client always visible when user can manage */}
      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{activeCount}</span> active
          {" · "}
          <span className="font-semibold text-slate-900">{totalCount}</span> total
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={openCreate}
            className="medflow-btn-primary w-full sm:w-auto"
          >
            Add Client
          </button>
        ) : (
          <p className="text-sm text-amber-800">Read-only — contact admin to edit.</p>
        )}
      </div>

      {error && !modalOpen && (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <DataTable>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <p className="text-sm text-slate-600">No clients yet.</p>
                  {canManage && (
                    <button
                      type="button"
                      onClick={openCreate}
                      className="medflow-btn-primary mt-4"
                    >
                      Add Client
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/dashboard/clients/${c.id}`}
                      className="font-medium text-medflow-600 hover:text-medflow-700"
                    >
                      {formatName(c.firstName, c.lastName)}
                    </Link>
                  </Td>
                  <Td>{c.phone ?? "—"}</Td>
                  <Td>{c.email ?? "—"}</Td>
                  <Td>
                    <Badge variant={c.isActive ? "success" : "default"}>
                      {CLIENT_STATUS_LABELS[clientStatusFromActive(c.isActive)]}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">
                    {formatDate(c.updatedAt, { dateStyle: "short" })}
                  </Td>
                  <Td>
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="medflow-btn-secondary px-2 py-1 text-xs"
                          onClick={() => openEdit(c)}
                        >
                          Edit
                        </button>
                        {c.isActive && (
                          <button
                            type="button"
                            className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                            onClick={() => handleDeactivate(c.id)}
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    ) : (
                      <Link
                        href={`/dashboard/clients/${c.id}`}
                        className="text-sm text-medflow-600"
                      >
                        View
                      </Link>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </DataTable>

      <Modal
        open={modalOpen}
        title={editId ? "Edit client" : "Add client"}
        onClose={closeModal}
        wide
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
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
              <span className="font-medium text-slate-700">Email</span>
              <input
                type="email"
                className="medflow-input mt-1 w-full"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Date of birth</span>
              <input
                type="date"
                className="medflow-input mt-1 w-full"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Preferred contact</span>
              <select
                className="medflow-input mt-1 w-full"
                value={form.preferredContactMethod}
                onChange={(e) =>
                  setForm({
                    ...form,
                    preferredContactMethod: e.target
                      .value as FormState["preferredContactMethod"],
                  })
                }
              >
                <option value="">—</option>
                {(["PHONE", "EMAIL", "SMS"] as const).map((p) => (
                  <option key={p} value={p}>
                    {PREFERRED_CONTACT_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">Address</span>
              <input
                className="medflow-input mt-1 w-full"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">Notes</span>
              <textarea
                rows={3}
                className="medflow-input mt-1 w-full"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            {editId && (
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Status</span>
                <select
                  className="medflow-input mt-1 w-full"
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as FormState["status"],
                    })
                  }
                >
                  {Object.entries(CLIENT_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" className="medflow-btn-secondary" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="medflow-btn-primary">
              {saving ? "Saving…" : editId ? "Save changes" : "Create client"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
