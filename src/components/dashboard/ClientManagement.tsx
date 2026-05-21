"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DataTable,
  EmptyState,
  Table,
  Td,
  Th,
} from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import {
  CLIENT_STATUS_LABELS,
  PREFERRED_CONTACT_LABELS,
} from "@/lib/constants";
import { clientStatusFromActive } from "@/lib/client-form";
import { formatDate, formatName } from "@/lib/utils";

export type ClientListRow = {
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

type Props = {
  initialClients: ClientListRow[];
  activeCount: number;
  totalCount: number;
  canWrite: boolean;
};

const PREFERRED_OPTIONS = ["PHONE", "EMAIL", "SMS"] as const;

function statusVariant(isActive: boolean): "success" | "default" {
  return isActive ? "success" : "default";
}

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  mrn: "",
  notes: "",
  preferredContactMethod: "" as "" | "PHONE" | "EMAIL" | "SMS",
  status: "ACTIVE" as "ACTIVE" | "INACTIVE" | "ARCHIVED",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
};

export function ClientManagement({
  initialClients,
  activeCount,
  totalCount,
  canWrite,
}: Props) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function openCreate() {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(true);
    setError(null);
  }

  function openEdit(c: ClientListRow) {
    setForm({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email ?? "",
      phone: c.phone ?? "",
      dateOfBirth: c.dateOfBirth
        ? new Date(c.dateOfBirth).toISOString().slice(0, 10)
        : "",
      mrn: c.mrn ?? "",
      notes: c.notes ?? "",
      preferredContactMethod:
        (c.preferredContactMethod as typeof form.preferredContactMethod) || "",
      status: clientStatusFromActive(c.isActive),
      addressLine1: c.addressLine1 ?? "",
      addressLine2: c.addressLine2 ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      postalCode: c.postalCode ?? "",
    });
    setEditId(c.id);
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email || null,
      phone: form.phone || null,
      dateOfBirth: form.dateOfBirth || null,
      mrn: form.mrn || null,
      notes: form.notes || null,
      preferredContactMethod: form.preferredContactMethod || null,
      status: form.status,
      addressLine1: form.addressLine1 || null,
      addressLine2: form.addressLine2 || null,
      city: form.city || null,
      state: form.state || null,
      postalCode: form.postalCode || null,
    };

    try {
      if (editId) {
        const res = await fetch(`/api/clients/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Update failed");
        setClients((prev) =>
          prev.map((c) =>
            c.id === editId
              ? {
                  ...c,
                  ...data,
                  _count: c._count,
                }
              : c
          )
        );
      } else {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Create failed");
        setClients((prev) =>
          [...prev, { ...data, _count: { appointments: 0, timelineEvents: 0 } }].sort(
            (a, b) => a.lastName.localeCompare(b.lastName)
          )
        );
      }
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!canWrite) return;
    if (!confirm("Deactivate this client? They will be marked inactive.")) return;
    const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Deactivate failed");
      return;
    }
    setClients((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isActive: false } : c))
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
          <span>
            <strong className="text-slate-900">{activeCount}</strong> active clients
          </span>
          <span>
            <strong className="text-slate-900">{totalCount}</strong> total in directory
          </span>
        </div>
        {canWrite && (
          <button type="button" onClick={openCreate} className="medflow-btn-primary">
            Add client
          </button>
        )}
      </div>

      {showForm && canWrite && (
        <form onSubmit={handleSubmit} className="medflow-card space-y-4 p-6">
          <h3 className="font-semibold text-slate-900">
            {editId ? "Edit client" : "Add client"}
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
            <label className="block text-sm">
              <span className="text-slate-600">Date of birth</span>
              <input
                type="date"
                className="medflow-input mt-1 w-full"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">MRN</span>
              <input
                className="medflow-input mt-1 w-full"
                value={form.mrn}
                onChange={(e) => setForm({ ...form, mrn: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Phone</span>
              <input
                type="tel"
                className="medflow-input mt-1 w-full"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Email</span>
              <input
                type="email"
                className="medflow-input mt-1 w-full"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Preferred contact</span>
              <select
                className="medflow-input mt-1 w-full"
                value={form.preferredContactMethod}
                onChange={(e) =>
                  setForm({
                    ...form,
                    preferredContactMethod: e.target.value as typeof form.preferredContactMethod,
                  })
                }
              >
                <option value="">—</option>
                {PREFERRED_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {PREFERRED_CONTACT_LABELS[p]}
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
                  setForm({
                    ...form,
                    status: e.target.value as typeof form.status,
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
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Address line 1</span>
              <input
                className="medflow-input mt-1 w-full"
                value={form.addressLine1}
                onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Address line 2</span>
              <input
                className="medflow-input mt-1 w-full"
                value={form.addressLine2}
                onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">City</span>
              <input
                className="medflow-input mt-1 w-full"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">State</span>
              <input
                className="medflow-input mt-1 w-full"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Postal code</span>
              <input
                className="medflow-input mt-1 w-full"
                value={form.postalCode}
                onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Notes</span>
              <textarea
                rows={3}
                className="medflow-input mt-1 w-full"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="medflow-btn-primary">
              {saving ? "Saving…" : editId ? "Save changes" : "Create client"}
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
              <Th>MRN</Th>
              <Th>Phone</Th>
              <Th>Status</Th>
              <Th>Appointments</Th>
              <Th>Updated</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState message="No clients yet. Add a client to get started." />
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <tr key={client.id} className="hover:bg-slate-50">
                  <Td>
                    <span className="font-medium text-slate-900">
                      {formatName(client.firstName, client.lastName)}
                    </span>
                  </Td>
                  <Td>{client.mrn ?? "—"}</Td>
                  <Td>{client.phone ?? "—"}</Td>
                  <Td>
                    <Badge variant={statusVariant(client.isActive)}>
                      {CLIENT_STATUS_LABELS[clientStatusFromActive(client.isActive)]}
                    </Badge>
                  </Td>
                  <Td>{client._count?.appointments ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-slate-600">
                    {formatDate(client.updatedAt, {
                      dateStyle: "short",
                      timeStyle: undefined,
                    })}
                  </Td>
                  <Td>
                    <Link
                      href={`/dashboard/clients/${client.id}`}
                      className="text-sm font-medium text-medflow-600 hover:text-medflow-700"
                    >
                      View
                    </Link>
                    {canWrite && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className="text-sm text-medflow-600 hover:underline"
                          onClick={() => openEdit(client)}
                        >
                          Edit
                        </button>
                        {client.isActive && (
                          <>
                            {" · "}
                            <button
                              type="button"
                              className="text-sm text-red-600 hover:underline"
                              onClick={() => deactivate(client.id)}
                            >
                              Deactivate
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </DataTable>
    </div>
  );
}
