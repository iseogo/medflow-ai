"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SupervisorRunButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function runScan() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/supervisor/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Scan failed");
        return;
      }
      setMessage(
        `Scan complete: ${data.findingsCount} findings, ${data.alertsCreated} alerts, ${data.orchestratorReviewRequestsSubmitted ?? 0} orchestrator review requests (pending approval)`
      );
      router.refresh();
    } catch {
      setMessage("Scan failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={runScan}
        disabled={loading}
        className="rounded-lg bg-medflow-600 px-4 py-2 text-sm font-medium text-white hover:bg-medflow-700 disabled:opacity-50"
      >
        {loading ? "Running scan…" : "Run supervisor scan"}
      </button>
      {message && <p className="text-xs text-slate-600">{message}</p>}
    </div>
  );
}
