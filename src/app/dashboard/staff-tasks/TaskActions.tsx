"use client";

import { useTransition } from "react";
import { updateTaskStatus } from "./actions";

export function TaskActions({ taskId, status }: { taskId: string; status: string }) {
  const [isPending, startTransition] = useTransition();

  if (status === "COMPLETED" || status === "CANCELLED") {
    return <span className="text-xs text-slate-400 italic">{status.toLowerCase()}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {status === "PENDING" && (
        <button
          disabled={isPending}
          onClick={() => startTransition(async () => { await updateTaskStatus(taskId, "IN_PROGRESS"); })}
          className="rounded px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition"
        >
          {isPending ? "…" : "Start"}
        </button>
      )}
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await updateTaskStatus(taskId, "COMPLETED"); })}
        className="rounded px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition"
      >
        {isPending ? "…" : "Complete"}
      </button>
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await updateTaskStatus(taskId, "CANCELLED"); })}
        className="rounded px-2 py-1 text-xs font-medium bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition"
      >
        {isPending ? "…" : "Cancel"}
      </button>
    </div>
  );
}
