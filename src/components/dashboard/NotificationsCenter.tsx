"use client";

import {
  NotificationCategory,
  NotificationPriority,
  NotificationStatus,
} from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { visualForCategory } from "@/lib/notifications/notification-color-map";
import { formatDate } from "@/lib/utils";

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  status: NotificationStatus;
  recommendedNextAction: string | null;
  createdAt: string;
  client: { id: string; firstName: string; lastName: string } | null;
};

async function patchAction(id: string, action: string) {
  const res = await fetch(`/api/notifications/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error("Action failed");
}

export function NotificationsCenter({
  initial,
  canWrite,
}: {
  initial: NotificationRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(id: string, action: string) {
    setBusy(id + action);
    try {
      await patchAction(id, action);
      router.refresh();
      setItems((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                status:
                  action === "resolve"
                    ? "RESOLVED"
                    : action === "acknowledge"
                      ? "ACKNOWLEDGED"
                      : action === "escalate"
                        ? "ESCALATED"
                        : action === "dismiss"
                          ? "DISMISSED"
                          : action === "in_progress"
                            ? "IN_PROGRESS"
                            : "READ",
              }
            : n
        )
      );
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-sm text-slate-600">
        No notifications for your role. In-app only — external SMS/email/push are
        disabled (MOCK_MODE).
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((n) => {
        const visual = visualForCategory(n.category);
        return (
          <li
            key={n.id}
            className={`rounded-lg border border-slate-200 border-l-4 bg-white p-4 shadow-sm ${visual.className.split(" ").filter((c) => c.startsWith("border-l-")).join(" ")}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{n.title}</p>
                <p className="mt-1 text-sm text-slate-700">{n.message}</p>
                {n.recommendedNextAction && (
                  <p className="mt-2 text-xs text-slate-600">
                    <span className="font-medium">Next:</span> {n.recommendedNextAction}
                  </p>
                )}
                {n.client && (
                  <p className="mt-1 text-xs text-slate-500">
                    Client: {n.client.firstName} {n.client.lastName}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  {visual.label} · {n.priority} · {n.status} · {formatDate(n.createdAt)}
                </p>
              </div>
              {canWrite && n.status !== "RESOLVED" && n.status !== "DISMISSED" && (
                <div className="flex flex-wrap gap-2">
                  {n.status === "UNREAD" && (
                    <ActionBtn
                      label="Mark read"
                      disabled={!!busy}
                      onClick={() => run(n.id, "read")}
                    />
                  )}
                  <ActionBtn
                    label="Acknowledge"
                    disabled={!!busy}
                    onClick={() => run(n.id, "acknowledge")}
                  />
                  <ActionBtn
                    label="In progress"
                    disabled={!!busy}
                    onClick={() => run(n.id, "in_progress")}
                  />
                  <ActionBtn
                    label="Resolve"
                    disabled={!!busy}
                    onClick={() => run(n.id, "resolve")}
                  />
                  <ActionBtn
                    label="Escalate"
                    disabled={!!busy}
                    onClick={() => run(n.id, "escalate")}
                  />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
