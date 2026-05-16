"use client";

import type { RoleType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  REMINDER_OFFSET_LABELS,
  REMINDER_OUTCOME_LABELS,
} from "@/lib/constants";
import { StatusBadge, type StatusBadgeVariant } from "@/components/dashboard/StatusBadge";
import { hasPermission } from "@/lib/rbac";
import type { ReminderScheduleOffset } from "@/lib/reminder-types";
import { REMINDER_SCHEDULE_OFFSETS } from "@/lib/reminder-types";

type LogRow = {
  id: string;
  reminderOffset: ReminderScheduleOffset;
  outcome: string;
  dueAt: string;
  createdAt: string;
  client: {
    firstName: string;
    lastName: string;
    mrn: string | null;
  };
  appointment: {
    scheduledAt: string;
    status: string;
    providerName: string | null;
  };
};

const OFFSETS = REMINDER_SCHEDULE_OFFSETS;

function reminderOutcomeVariant(outcome: string): StatusBadgeVariant {
  switch (outcome) {
    case "CONFIRMED":
      return "success";
    case "FAILED":
    case "ESCALATED":
      return "danger";
    case "NO_RESPONSE":
      return "warning";
    case "CANCELLED":
      return "neutral";
    case "RESCHEDULE_REQUESTED":
      return "info";
    default:
      return "neutral";
  }
}

export function RemindersPanel({
  initialLogs,
  role,
}: {
  initialLogs: LogRow[];
  role: RoleType;
}) {
  const router = useRouter();
  const [logs, setLogs] = useState(initialLogs);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [appointmentId, setAppointmentId] = useState("");
  const [offset, setOffset] = useState<ReminderScheduleOffset>("HOURS_48");

  const canRun = hasPermission(role, "reminders:write");

  async function refresh() {
    const res = await fetch("/api/reminders?take=100");
    if (res.ok) {
      const data = (await res.json()) as LogRow[];
      setLogs(data);
    }
  }

  async function runBatch() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/reminders/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowMinutes: 15, limit: 50 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Run failed");
        return;
      }
      setMessage(
        `Batch complete: ${data.processed ?? 0} sent, ${data.skipped ?? 0} skipped, ${data.failed ?? 0} failed (attempted ${data.attempted ?? 0}).`
      );
      router.refresh();
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function runSingle() {
    if (!appointmentId.trim()) {
      setMessage("Enter an appointment ID");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/reminders/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: appointmentId.trim(),
          offset,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Run failed");
        return;
      }
      setMessage(`Reminder cycle recorded (${data.log?.id ?? "ok"}).`);
      router.refresh();
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="medflow-card p-6">
        <h2 className="text-lg font-semibold text-slate-900">Run engine</h2>
        <p className="mt-1 text-sm text-slate-600">
          Voice-first cycles (AI voice → SMS → email) run every 15 minutes of
          the scheduled window. All outbound traffic uses stubs (no Twilio /
          Gmail / n8n production).
        </p>
        {canRun ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={loading}
              className="medflow-btn-primary"
              onClick={runBatch}
            >
              Run due reminders
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Read-only: you can review logs but not run the engine.
          </p>
        )}

        {canRun && (
          <div className="mt-6 border-t border-slate-100 pt-6">
            <h3 className="text-sm font-medium text-slate-800">
              Manual single cycle (testing)
            </h3>
            <div className="mt-3 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 text-xs text-slate-600">
                Appointment ID
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={appointmentId}
                  onChange={(e) => setAppointmentId(e.target.value)}
                  placeholder="cuid…"
                />
              </label>
              <label className="text-xs text-slate-600">
                Offset
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:w-48"
                  value={offset}
                  onChange={(e) =>
                    setOffset(e.target.value as ReminderScheduleOffset)
                  }
                >
                  {OFFSETS.map((o) => (
                    <option key={o} value={o}>
                      {REMINDER_OFFSET_LABELS[o]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={loading}
                className="medflow-btn-secondary text-sm"
                onClick={runSingle}
              >
                Run once
              </button>
            </div>
          </div>
        )}

        {message && (
          <p className="mt-4 text-sm text-medflow-800" role="status">
            {message}
          </p>
        )}
      </div>

      <div className="medflow-card overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Recent ReminderLog
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  When
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Client
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Offset
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Outcome
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Appointment
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No reminder cycles yet. Run the engine or wait for the next
                    due window.
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <tr key={row.id}>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3">
                      {row.client.firstName} {row.client.lastName}
                      {row.client.mrn && (
                        <span className="text-slate-500">
                          {" "}
                          · {row.client.mrn}
                        </span>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                      {REMINDER_OFFSET_LABELS[row.reminderOffset] ??
                        row.reminderOffset}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3">
                      <StatusBadge variant={reminderOutcomeVariant(row.outcome)}>
                        {REMINDER_OUTCOME_LABELS[row.outcome] ?? row.outcome}
                      </StatusBadge>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-600">
                      {new Date(row.appointment.scheduledAt).toLocaleString()}{" "}
                      · {row.appointment.status}
                      {row.appointment.providerName &&
                        ` · ${row.appointment.providerName}`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
