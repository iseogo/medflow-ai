"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function WalkInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
    preferredLanguage: "en",
    consentVoice: true,
    consentSms: true,
    consentEmail: false,
    insuranceCarrier: "",
    insuranceMemberId: "",
    staffNotes: "",
    appointmentReason: "First-time walk-in",
    providerName: "",
    location: "Waiting room",
    scheduledAt: new Date().toISOString().slice(0, 16),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/walk-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email || null,
          phone: form.phone || null,
          dateOfBirth: form.dateOfBirth
            ? new Date(form.dateOfBirth).toISOString()
            : null,
          addressLine1: form.addressLine1 || null,
          city: form.city || null,
          state: form.state || null,
          postalCode: form.postalCode || null,
          preferredLanguage: form.preferredLanguage,
          communicationPreferences: {
            voice: form.consentVoice,
            sms: form.consentSms,
            email: form.consentEmail,
          },
          consent: {
            voice: form.consentVoice,
            sms: form.consentSms,
            email: form.consentEmail,
          },
          insurancePlaceholder: {
            carrier: form.insuranceCarrier || undefined,
            memberId: form.insuranceMemberId || undefined,
            status: "placeholder",
          },
          documentsPlaceholder: [
            { name: "Photo ID", status: "placeholder_pending_upload" },
            { name: "Insurance card", status: "placeholder_pending_upload" },
          ],
          staffNotes: form.staffNotes || null,
          appointment: {
            scheduledAt: new Date(form.scheduledAt).toISOString(),
            reason: form.appointmentReason,
            providerName: form.providerName || null,
            location: form.location,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      router.push(`/dashboard/clients/${data.client.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="medflow-card space-y-6 p-6">
      <h3 className="text-lg font-semibold text-slate-900">First-time walk-in registration</h3>
      <p className="text-sm text-slate-600">
        Creates client profile, consents, first appointment, waiting room entry, and
        onboarding workflow. All actions are staff-override and logged to the timeline.
      </p>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Demographics</legend>
        <label className="text-sm">
          <span className="text-slate-600">First name *</span>
          <input
            required
            className="medflow-input mt-1 w-full"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Last name *</span>
          <input
            required
            className="medflow-input mt-1 w-full"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Date of birth</span>
          <input
            type="date"
            className="medflow-input mt-1 w-full"
            value={form.dateOfBirth}
            onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Preferred language</span>
          <input
            className="medflow-input mt-1 w-full"
            value={form.preferredLanguage}
            onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })}
          />
        </label>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium text-slate-800">Contact</legend>
        <label className="text-sm">
          <span className="text-slate-600">Phone</span>
          <input
            className="medflow-input mt-1 w-full"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Email</span>
          <input
            type="email"
            className="medflow-input mt-1 w-full"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-slate-600">Address</span>
          <input
            className="medflow-input mt-1 w-full"
            value={form.addressLine1}
            onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">City</span>
          <input
            className="medflow-input mt-1 w-full"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">State / ZIP</span>
          <div className="mt-1 flex gap-2">
            <input
              className="medflow-input w-20"
              placeholder="ST"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
            <input
              className="medflow-input flex-1"
              placeholder="ZIP"
              value={form.postalCode}
              onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
            />
          </div>
        </label>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-800">Communication consent</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.consentVoice}
              onChange={(e) => setForm({ ...form, consentVoice: e.target.checked })}
            />
            Voice
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.consentSms}
              onChange={(e) => setForm({ ...form, consentSms: e.target.checked })}
            />
            SMS
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.consentEmail}
              onChange={(e) => setForm({ ...form, consentEmail: e.target.checked })}
            />
            Email
          </label>
        </div>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium text-slate-800 sm:col-span-2">
          Insurance (placeholder)
        </legend>
        <label className="text-sm">
          <span className="text-slate-600">Carrier</span>
          <input
            className="medflow-input mt-1 w-full"
            value={form.insuranceCarrier}
            onChange={(e) => setForm({ ...form, insuranceCarrier: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Member ID</span>
          <input
            className="medflow-input mt-1 w-full"
            value={form.insuranceMemberId}
            onChange={(e) => setForm({ ...form, insuranceMemberId: e.target.value })}
          />
        </label>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium text-slate-800 sm:col-span-2">
          First appointment
        </legend>
        <label className="text-sm">
          <span className="text-slate-600">Visit time</span>
          <input
            type="datetime-local"
            required
            className="medflow-input mt-1 w-full"
            value={form.scheduledAt}
            onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Provider</span>
          <input
            className="medflow-input mt-1 w-full"
            value={form.providerName}
            onChange={(e) => setForm({ ...form, providerName: e.target.value })}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-slate-600">Staff notes</span>
          <textarea
            className="medflow-input mt-1 w-full"
            rows={3}
            value={form.staffNotes}
            onChange={(e) => setForm({ ...form, staffNotes: e.target.value })}
          />
        </label>
      </fieldset>
      <button type="submit" disabled={loading} className="medflow-btn-primary">
        {loading ? "Registering…" : "Complete walk-in setup"}
      </button>
    </form>
  );
}
