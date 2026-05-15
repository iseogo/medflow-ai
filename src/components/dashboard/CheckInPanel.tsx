"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/constants";

type SearchResult = {
  matchType: "client" | "appointment";
  client: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    email?: string | null;
    mrn?: string | null;
  };
  appointment?: {
    id: string;
    scheduledAt: string;
    status: string;
    providerName?: string | null;
    reason?: string | null;
  };
  appointments?: {
    id: string;
    scheduledAt: string;
    status: string;
    providerName?: string | null;
    reason?: string | null;
  }[];
};

export function CheckInPanel() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/check-ins?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Search failed");
      return;
    }
    setResults(data);
  }

  async function checkIn(clientId: string, appointmentId?: string) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/check-ins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        appointmentId,
        notes: notes || null,
        notifyProvider: true,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Check-in failed");
      return;
    }
    router.push("/dashboard/waiting-room");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="medflow-card p-6">
        <h3 className="font-semibold text-slate-900">Find returning client</h3>
        <p className="mt-1 text-sm text-slate-600">
          Search by name, phone, email, MRN, or appointment ID.
        </p>
        <div className="mt-4 flex gap-2">
          <input
            className="medflow-input flex-1"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
          />
          <button type="button" onClick={search} className="medflow-btn-primary" disabled={loading}>
            Search
          </button>
        </div>
        <label className="mt-4 block text-sm">
          <span className="text-slate-600">Check-in notes</span>
          <input
            className="medflow-input mt-1 w-full"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
      </div>
      {results.length > 0 && (
        <ul className="space-y-3">
          {results.map((r, i) => (
            <li key={`${r.client.id}-${i}`} className="medflow-card p-4">
              <p className="font-medium text-slate-900">
                {r.client.firstName} {r.client.lastName}
                {r.client.mrn && (
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    {r.client.mrn}
                  </span>
                )}
              </p>
              <p className="text-sm text-slate-600">
                {r.client.phone} {r.client.email && `· ${r.client.email}`}
              </p>
              {r.matchType === "appointment" && r.appointment && (
                <p className="mt-2 text-sm">
                  Appointment {r.appointment.id.slice(0, 8)}… —{" "}
                  {APPOINTMENT_STATUS_LABELS[r.appointment.status] ?? r.appointment.status} —{" "}
                  {new Date(r.appointment.scheduledAt).toLocaleString()}
                </p>
              )}
              {r.appointments && r.appointments.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {r.appointments.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span>
                        {new Date(a.scheduledAt).toLocaleString()} —{" "}
                        {APPOINTMENT_STATUS_LABELS[a.status] ?? a.status}
                        {a.providerName && ` (${a.providerName})`}
                      </span>
                      <button
                        type="button"
                        className="medflow-btn-secondary text-xs"
                        disabled={loading}
                        onClick={() => checkIn(r.client.id, a.id)}
                      >
                        Check in
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {(!r.appointments || r.appointments.length === 0) && (
                <button
                  type="button"
                  className="medflow-btn-primary mt-3"
                  disabled={loading}
                  onClick={() =>
                    checkIn(r.client.id, r.appointment?.id)
                  }
                >
                  Check in
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
