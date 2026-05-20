import type { MissedCallMetadata } from "@/lib/missed-call/missed-call-metadata";
import { MISSED_TASK_TITLE } from "@/lib/missed-call/missed-call-dedup";
import { prisma } from "@/lib/prisma";
import {
  MISSED_CALL_PURPOSE,
  MISSED_INBOUND_STATUSES,
} from "@/services/missed-call.service";

export type InboundMissedCallRow = {
  id: string;
  callerPhone: string;
  status: string;
  receivedAt: Date;
  followUpTaskStatus: string;
  followUpAiStatus: string;
  escalationLevel: string;
  clientLabel: string;
};

function parseMetadata(raw: unknown): MissedCallMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as MissedCallMetadata;
  return m.missedCall ? m : null;
}

function escalationLevel(input: {
  taskPriority?: string | null;
  notificationPriority?: string | null;
  notificationMeta?: Record<string, unknown> | null;
}): string {
  const recent = Number(input.notificationMeta?.recentMissedCount1h ?? 0);
  const escalate = Boolean(input.notificationMeta?.escalateToManager);
  if (escalate || recent >= 3) return "Manager / Admin";
  if (
    input.taskPriority === "URGENT" ||
    input.notificationPriority === "CRITICAL"
  ) {
    return "Elevated";
  }
  return "Standard";
}

function formatAiStatus(status?: string) {
  if (!status) return "Pending";
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const inboundCallsService = {
  async listMissedInboundCalls(limit = 100): Promise<InboundMissedCallRow[]> {
    const calls = await prisma.callLog.findMany({
      where: {
        direction: "INBOUND",
        OR: [
          { purpose: MISSED_CALL_PURPOSE },
          { status: { in: MISSED_INBOUND_STATUSES } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        client: {
          select: { firstName: true, lastName: true, mrn: true },
        },
      },
    });

    if (calls.length === 0) return [];

    const callIds = calls.map((c) => c.id);
    const clientIds = Array.from(new Set(calls.map((c) => c.clientId)));

    const [notifications, tasks] = await Promise.all([
      prisma.staffNotification.findMany({
        where: { source: "MISSED_INBOUND_CALL" },
        orderBy: { createdAt: "desc" },
        take: 300,
        select: {
          id: true,
          priority: true,
          metadata: true,
          staffTaskId: true,
        },
      }),
      prisma.staffTask.findMany({
        where: {
          clientId: { in: clientIds },
          title: MISSED_TASK_TITLE,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          clientId: true,
          status: true,
          priority: true,
          createdAt: true,
          description: true,
        },
      }),
    ]);

    const notificationByCallId = new Map<
      string,
      (typeof notifications)[number]
    >();
    for (const n of notifications) {
      const meta = n.metadata as { callLogId?: string } | null;
      if (meta?.callLogId && callIds.includes(meta.callLogId)) {
        if (!notificationByCallId.has(meta.callLogId)) {
          notificationByCallId.set(meta.callLogId, n);
        }
      }
    }

    return calls.map((call) => {
      const meta = parseMetadata(call.metadata);
      const notification = notificationByCallId.get(call.id);
      const notifMeta = notification?.metadata as Record<string, unknown> | null;

      const task =
        (notification?.staffTaskId
          ? tasks.find((t) => t.id === notification.staffTaskId)
          : null) ??
        tasks.find(
          (t) =>
            t.clientId === call.clientId &&
            Math.abs(t.createdAt.getTime() - call.createdAt.getTime()) <
              5 * 60_000
        );

      return {
        id: call.id,
        callerPhone:
          meta?.callerNumber ?? call.phoneNumber ?? "Unknown",
        status: call.status,
        receivedAt: call.createdAt,
        followUpTaskStatus: task?.status ?? "—",
        followUpAiStatus: formatAiStatus(meta?.aiFollowUpStatus),
        escalationLevel: escalationLevel({
          taskPriority: task?.priority,
          notificationPriority: notification?.priority,
          notificationMeta: notifMeta,
        }),
        clientLabel:
          call.client.mrn === "INBOUND-UNKNOWN"
            ? "Unknown caller"
            : `${call.client.firstName} ${call.client.lastName}`,
      };
    });
  },
};
