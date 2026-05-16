"use client";

import { useEffect, useState } from "react";
import { StatusBadge, type StatusBadgeVariant } from "@/components/dashboard/StatusBadge";

type ProviderStatus = "mock" | "not_configured" | "configured" | "healthy";

type StatusResponse = {
  mockMode: boolean;
  canUseLive: boolean;
  providers: Record<string, ProviderStatus>;
  runtime: Record<string, "live" | "mock">;
};

const LABELS: Record<string, string> = {
  twilio: "Twilio (SMS / Voice)",
  email: "Email (Gmail / SendGrid)",
  voiceAi: "Voice AI (Vapi / Retell)",
  n8n: "n8n workflows",
  openai: "OpenAI",
  googleCalendar: "Google Calendar",
  webhooks: "Inbound webhooks",
};

function statusVariant(status: ProviderStatus): StatusBadgeVariant {
  switch (status) {
    case "healthy":
      return "success";
    case "configured":
      return "info";
    case "not_configured":
      return "warning";
    case "mock":
    default:
      return "neutral";
  }
}

function statusLabel(status: ProviderStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "configured":
      return "Configured";
    case "not_configured":
      return "Not configured";
    case "mock":
      return "Mock";
    default:
      return status;
  }
}

export function IntegrationsPanel() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/status")
      .then(async (res) => {
        if (!res.ok) {
          setError("Unable to load integration status");
          return;
        }
        setData((await res.json()) as StatusResponse);
      })
      .catch(() => setError("Unable to load integration status"));
  }, []);

  return (
    <section className="medflow-card p-6">
      <h3 className="font-semibold text-slate-900">Integrations</h3>
      <p className="mt-1 text-sm text-slate-600">
        External providers stay in mock mode when{" "}
        <code className="rounded bg-slate-100 px-1">MOCK_MODE=true</code>. No
        secrets are shown here.
      </p>

      {error && (
        <p className="mt-4 text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}

      {data && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">Global mode:</span>
            <StatusBadge variant={data.mockMode ? "neutral" : "success"}>
              {data.mockMode ? "Mock (MOCK_MODE on)" : "Live allowed"}
            </StatusBadge>
          </div>

          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {Object.entries(data.providers).map(([key, status]) => (
              <li
                key={key}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <span className="font-medium text-slate-800">
                  {LABELS[key] ?? key}
                </span>
                <div className="flex items-center gap-2">
                  {data.runtime[key] && key !== "webhooks" && (
                    <span className="text-xs text-slate-500">
                      runtime: {data.runtime[key]}
                    </span>
                  )}
                  <StatusBadge variant={statusVariant(status)}>
                    {statusLabel(status)}
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!data && !error && (
        <p className="mt-4 text-sm text-slate-500">Loading integration status…</p>
      )}
    </section>
  );
}
