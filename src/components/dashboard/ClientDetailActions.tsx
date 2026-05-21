"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dashboardFetch } from "@/lib/api-fetch";
import { Badge } from "@/components/ui/Badge";
import {
  CLIENT_STATUS_LABELS,
  PREFERRED_CONTACT_LABELS,
} from "@/lib/constants";
import { clientStatusFromActive } from "@/lib/client-form";
import { formatClientAddress } from "@/lib/client-form";

type ClientProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mrn: string | null;
  dateOfBirth: Date | string | null;
  notes: string | null;
  isActive: boolean;
  preferredContactMethod: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

type Props = {
  client: ClientProfile;
  canWrite: boolean;
};

export function ClientDetailActions({ client, canWrite }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function deactivate() {
    if (!confirm("Deactivate this client?")) return;
    setSaving(true);
    const res = await dashboardFetch(`/api/clients/${client.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    router.refresh();
  }

  const address = formatClientAddress(client);

  return (
    <div className="medflow-card p-6 lg:col-span-1">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Profile</h2>
        <Badge variant={client.isActive ? "success" : "default"}>
          {CLIENT_STATUS_LABELS[clientStatusFromActive(client.isActive)]}
        </Badge>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="text-slate-900">{client.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Phone</dt>
          <dd className="text-slate-900">{client.phone ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">MRN</dt>
          <dd className="text-slate-900">{client.mrn ?? "—"}</dd>
        </div>
        {client.preferredContactMethod && (
          <div>
            <dt className="text-slate-500">Preferred contact</dt>
            <dd className="text-slate-900">
              {PREFERRED_CONTACT_LABELS[client.preferredContactMethod] ??
                client.preferredContactMethod}
            </dd>
          </div>
        )}
        {address && (
          <div>
            <dt className="text-slate-500">Address</dt>
            <dd className="text-slate-900">{address}</dd>
          </div>
        )}
        {client.dateOfBirth && (
          <div>
            <dt className="text-slate-500">Date of birth</dt>
            <dd className="text-slate-900">
              {new Date(client.dateOfBirth).toLocaleDateString()}
            </dd>
          </div>
        )}
        {client.notes && (
          <div>
            <dt className="text-slate-500">Notes</dt>
            <dd className="text-slate-900 whitespace-pre-wrap">{client.notes}</dd>
          </div>
        )}
      </dl>
      {canWrite && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/dashboard/clients"
            className="medflow-btn-secondary text-sm"
          >
            Back to list
          </Link>
          {client.isActive && (
            <button
              type="button"
              disabled={saving}
              onClick={deactivate}
              className="text-sm text-red-600 hover:underline"
            >
              Deactivate
            </button>
          )}
        </div>
      )}
    </div>
  );
}
