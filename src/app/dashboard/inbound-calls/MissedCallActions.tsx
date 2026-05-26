"use client";

import { useTransition } from "react";
import { markMissedCallHandled, createCallbackTask } from "./actions";

export function MissedCallActions({
  callLogId,
  clientId,
  callerPhone,
  followUpTaskStatus,
  notifStatus,
}: {
  callLogId: string;
  clientId: string;
  callerPhone: string;
  followUpTaskStatus: string;
  notifStatus?: string;
}) {
  const [isPending, startTransition] = useTransition();

  const isHandled = notifStatus === "RESOLVED";
  const hasTask =
    followUpTaskStatus !== "—" && followUpTaskStatus !== "NO_TASK";

  return (
    <div className="flex items-center gap-2">
      {!hasTask && !isHandled && (
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await createCallbackTask({ callLogId, clientId, callerPhone });
            })
          }
          className="rounded px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition"
        >
          {isPending ? "…" : "Create task"}
        </button>
      )}
      {!isHandled && (
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(() => markMissedCallHandled(callLogId))
          }
          className="rounded px-2 py-1 text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition"
        >
          {isPending ? "…" : "Mark handled"}
        </button>
      )}
      {isHandled && (
        <span className="text-xs text-slate-400 italic">Resolved</span>
      )}
    </div>
  );
}
