"use client";

import type { RoleType } from "@prisma/client";
import { useCallback, useEffect, useState } from "react";
import { hasPermission } from "@/lib/rbac";

export type ConversationSummary = {
  clientId: string;
  clientName: string;
  phone: string | null;
  lastMessage: string;
  lastDirection: "INBOUND" | "OUTBOUND";
  lastAt: string;
  inboundCount: number;
  messageCount: number;
  pendingDraftCount: number;
  escalated: boolean;
  aiPaused: boolean;
};

type ThreadMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  status: string;
  purpose: string;
  createdAt: string;
  sentBy: string | null;
};

type PendingDraft = {
  id: string;
  purpose: string;
  description: string | null;
  messageBody: string;
  createdAt: string;
  agentName: string;
};

type Conversation = {
  client: { id: string; name: string; phone: string | null; smsOptOut: boolean };
  aiPaused: boolean;
  messages: ThreadMessage[];
  pendingDrafts: PendingDraft[];
};

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "red" | "amber" | "blue" | "slate";
}) {
  const tones = {
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function SmsInbox({
  initialConversations,
  role,
  twilioMode,
}: {
  initialConversations: ConversationSummary[];
  role: RoleType;
  twilioMode: "live" | "mock";
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.clientId ?? null
  );
  const [thread, setThread] = useState<Conversation | null>(null);
  const [reply, setReply] = useState("");
  const [simulateBody, setSimulateBody] = useState("");
  const [showSimulate, setShowSimulate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const canWrite = hasPermission(role, "communications:write");
  const canReview = hasPermission(role, "orchestrator:review");

  const refreshConversations = useCallback(async () => {
    const res = await fetch("/api/sms/conversations");
    if (res.ok) setConversations(await res.json());
  }, []);

  const loadThread = useCallback(async (clientId: string) => {
    const res = await fetch(`/api/sms/conversations/${clientId}`);
    if (res.ok) setThread(await res.json());
  }, []);

  useEffect(() => {
    if (selectedId) {
      setThread(null);
      loadThread(selectedId);
    }
  }, [selectedId, loadThread]);

  async function refreshAll() {
    await Promise.all([
      refreshConversations(),
      selectedId ? loadThread(selectedId) : Promise.resolve(),
    ]);
  }

  async function act(fn: () => Promise<Response>, successMsg?: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotice(data.error ?? `Request failed (${res.status})`);
        return false;
      }
      if (successMsg) setNotice(successMsg);
      await refreshAll();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    const ok = await act(
      () =>
        fetch("/api/sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: selectedId,
            purpose: "staff_sms_reply",
            messageBody: reply.trim(),
          }),
        }),
      "Reply sent."
    );
    if (ok) setReply("");
  }

  async function escalate() {
    if (!selectedId) return;
    await act(
      () =>
        fetch(`/api/sms/conversations/${selectedId}/escalate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Escalated from SMS inbox" }),
        }),
      "Escalated to staff — AI replies paused for this client."
    );
  }

  async function simulateInbound() {
    if (!selectedId || !simulateBody.trim()) return;
    const ok = await act(
      () =>
        fetch("/api/sms/simulate-inbound", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: selectedId, body: simulateBody.trim() }),
        }),
      "Inbound message simulated — AI agent processed it."
    );
    if (ok) setSimulateBody("");
  }

  async function reviewDraft(proposalId: string, decision: "APPROVE" | "REJECT") {
    await act(
      () =>
        fetch(`/api/orchestrator/proposals/${proposalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        }),
      decision === "APPROVE" ? "Draft approved and sent." : "Draft rejected."
    );
  }

  const selected = conversations.find((c) => c.clientId === selectedId);

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[480px] overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* Conversation list */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Conversations ({conversations.length})
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">
              No SMS conversations yet. Select a client and simulate an inbound
              text to see the AI agent in action.
            </p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.clientId}
                onClick={() => setSelectedId(c.clientId)}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                  c.clientId === selectedId ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-900">
                    {c.clientName}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {timeLabel(c.lastAt)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {c.lastDirection === "INBOUND" ? "← " : "→ "}
                  {c.lastMessage || "—"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.escalated && <Badge tone="red">Escalated</Badge>}
                  {c.aiPaused && <Badge tone="amber">AI paused</Badge>}
                  {c.pendingDraftCount > 0 && (
                    <Badge tone="blue">
                      {c.pendingDraftCount} draft{c.pendingDraftCount > 1 ? "s" : ""} to review
                    </Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Thread */}
      <div className="flex flex-1 flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {selected.clientName}
                </p>
                <p className="text-xs text-slate-500">
                  {selected.phone ?? "No phone on file"}
                  {thread?.client.smsOptOut && " · opted out of SMS"}
                  {thread?.aiPaused && " · AI replies paused"}
                </p>
              </div>
              <div className="flex gap-2">
                {canWrite && (
                  <button
                    onClick={() => setShowSimulate((v) => !v)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {twilioMode === "mock" ? "Simulate inbound" : "Test inbound"}
                  </button>
                )}
                {canWrite && (
                  <button
                    onClick={escalate}
                    disabled={busy || thread?.aiPaused}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Escalate to staff
                  </button>
                )}
              </div>
            </div>

            {notice && (
              <div className="border-b border-blue-100 bg-blue-50 px-5 py-2 text-xs text-blue-800">
                {notice}
              </div>
            )}

            {showSimulate && canWrite && (
              <div className="flex gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
                <input
                  value={simulateBody}
                  onChange={(e) => setSimulateBody(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && simulateInbound()}
                  placeholder='Type as the patient, e.g. "Can I move my appointment to Friday?"'
                  className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button
                  onClick={simulateInbound}
                  disabled={busy || !simulateBody.trim()}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                >
                  Receive
                </button>
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {!thread ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : thread.messages.length === 0 ? (
                <p className="text-sm text-slate-500">No messages yet.</p>
              ) : (
                thread.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                        m.direction === "OUTBOUND"
                          ? "rounded-br-sm bg-blue-600 text-white"
                          : "rounded-bl-sm bg-slate-100 text-slate-900"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body || "—"}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          m.direction === "OUTBOUND" ? "text-blue-200" : "text-slate-400"
                        }`}
                      >
                        {m.direction === "OUTBOUND" ? `${m.sentBy ?? "System"} · ` : ""}
                        {timeLabel(m.createdAt)} · {m.status.toLowerCase()}
                      </p>
                    </div>
                  </div>
                ))
              )}

              {thread && thread.pendingDrafts.length > 0 && (
                <div className="space-y-2">
                  {thread.pendingDrafts.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-lg border border-dashed border-blue-300 bg-blue-50 p-3"
                    >
                      <p className="text-xs font-semibold text-blue-800">
                        {d.agentName} drafted a reply — awaiting approval
                      </p>
                      <p className="mt-1 text-sm text-slate-800">{d.messageBody}</p>
                      {canReview && (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => reviewDraft(d.id, "APPROVE")}
                            disabled={busy}
                            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            Approve &amp; send
                          </button>
                          <button
                            onClick={() => reviewDraft(d.id, "REJECT")}
                            disabled={busy}
                            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canWrite && (
              <div className="flex gap-2 border-t border-slate-200 px-5 py-3">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendReply()}
                  placeholder={
                    thread?.client.smsOptOut
                      ? "Patient opted out of SMS"
                      : "Reply as staff…"
                  }
                  disabled={busy || thread?.client.smsOptOut}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                />
                <button
                  onClick={sendReply}
                  disabled={busy || !reply.trim() || thread?.client.smsOptOut}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
