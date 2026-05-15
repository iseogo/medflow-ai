"use client";

import { WaitingRoomState } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WAITING_ROOM_STATE_LABELS } from "@/lib/constants";
import { TERMINAL_WAITING_ROOM_STATES } from "@/lib/waiting-room";

type QueueEntry = {
  id: string;
  state: WaitingRoomState;
  queuePosition: number | null;
  arrivedAt: string;
  waitDurationMinutes: number | null;
  client: { firstName: string; lastName: string; mrn: string | null };
  appointment: {
    id: string;
    providerName: string | null;
    reason: string | null;
    status: string;
  } | null;
};

function actionsForState(state: WaitingRoomState): WaitingRoomState[] {
  switch (state) {
    case "CHECKED_IN":
      return ["WAITING", "WALK_OUT", "NO_SHOW"];
    case "WAITING":
    case "CALLED":
      return ["WITH_PROVIDER", "WALK_OUT", "NO_SHOW"];
    case "WITH_PROVIDER":
      return ["COMPLETED", "WALK_OUT"];
    default:
      return [];
  }
}

function isTerminalState(state: WaitingRoomState) {
  return TERMINAL_WAITING_ROOM_STATES.includes(state);
}

export function WaitingRoomBoard({ initialQueue }: { initialQueue: QueueEntry[] }) {
  const router = useRouter();
  const [queue, setQueue] = useState(initialQueue);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    setQueue(initialQueue);
  }, [initialQueue]);

  async function updateState(waitingRoomId: string, state: WaitingRoomState) {
    setLoading(waitingRoomId);
    try {
      const res = await fetch("/api/waiting-room", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waitingRoomId, state }),
      });
      if (!res.ok) return;

      router.refresh();
      const data = (await res.json()) as { state: WaitingRoomState };

      setQueue((current) => {
        if (isTerminalState(state)) {
          return current.filter((entry) => entry.id !== waitingRoomId);
        }
        return current.map((entry) =>
          entry.id === waitingRoomId ? { ...entry, state: data.state } : entry
        );
      });
    } finally {
      setLoading(null);
    }
  }

  function liveWaitMinutes(arrivedAt: string) {
    return Math.max(
      0,
      Math.round((Date.now() - new Date(arrivedAt).getTime()) / 60000)
    );
  }

  return (
    <div className="space-y-4">
      {queue.length === 0 ? (
        <p className="medflow-card p-8 text-center text-slate-600">
          No clients currently in the waiting room.
        </p>
      ) : (
        queue.map((entry) => {
          const actions = actionsForState(entry.state);
          return (
            <article
              key={entry.id}
              className="medflow-card flex flex-wrap items-start justify-between gap-4 p-4"
            >
              <div>
                <p className="font-semibold text-slate-900">
                  #{entry.queuePosition ?? "—"} {entry.client.firstName}{" "}
                  {entry.client.lastName}
                </p>
                <p className="text-sm text-slate-600">
                  {WAITING_ROOM_STATE_LABELS[entry.state] ?? entry.state}
                  {entry.client.mrn ? ` · ${entry.client.mrn}` : null}
                </p>
                {entry.appointment ? (
                  <p className="mt-1 text-sm text-slate-500">
                    {entry.appointment.providerName ?? "Provider TBD"} —{" "}
                    {entry.appointment.reason}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  Arrived {new Date(entry.arrivedAt).toLocaleTimeString()} · Wait{" "}
                  {entry.waitDurationMinutes ?? liveWaitMinutes(entry.arrivedAt)} min
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={loading === entry.id || entry.state === action}
                    className="medflow-btn-secondary text-xs"
                    onClick={() => updateState(entry.id, action)}
                  >
                    {WAITING_ROOM_STATE_LABELS[action]}
                  </button>
                ))}
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
