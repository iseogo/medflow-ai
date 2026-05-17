import { prisma } from "@/lib/prisma";
import type { CommandCenterTone } from "@/lib/command-center/types";
import { safeTimeLabel } from "@/lib/command-center/safe-summary";
import type { OperationalSummary } from "./operational-summary.service";
import type { WaitingRoomIntelligence } from "./waiting-room-intelligence.service";
import type { ProviderUtilizationSummary } from "./provider-utilization.service";

export type OperationalBottleneck = {
  id: string;
  label: string;
  detail: string;
  tone: CommandCenterTone;
  href: string;
  waitingMinutes?: number;
};

export const workflowBottleneckService = {
  buildBottlenecks(input: {
    summary: OperationalSummary;
    waiting: WaitingRoomIntelligence;
    providers: ProviderUtilizationSummary;
    reminderFailures: number;
    webhookFailures: number;
    pendingComms: number;
  }): OperationalBottleneck[] {
    const items: OperationalBottleneck[] = [];

    if (input.waiting.averageWaitMinutes >= 30) {
      items.push({
        id: "wait-target",
        label: "Patient wait time exceeds target",
        detail: `Average wait ${input.waiting.averageWaitMinutes} minutes`,
        tone: "red",
        href: "/dashboard/waiting-room",
        waitingMinutes: input.waiting.averageWaitMinutes,
      });
    }

    if (input.summary.openInterventions > 0) {
      items.push({
        id: "interventions",
        label: "Staff intervention backlog needs attention",
        detail: `${input.summary.openInterventions} unresolved case(s)`,
        tone: input.summary.openInterventions >= 3 ? "red" : "orange",
        href: "/dashboard/staff-intervention",
      });
    }

    if (input.summary.stuckWorkflows > 0 || input.summary.failedWorkflows > 0) {
      items.push({
        id: "workflows",
        label: "Clinical workflow delays detected",
        detail: `${input.summary.stuckWorkflows} delayed · ${input.summary.failedWorkflows} blocked`,
        tone: "orange",
        href: "/dashboard/supervisor",
      });
    }

    if (input.providers.capacityWarnings > 0) {
      items.push({
        id: "providers",
        label: "Provider schedule at capacity",
        detail: `${input.providers.capacityWarnings} provider(s) near overload`,
        tone: "orange",
        href: "/dashboard/appointments",
      });
    }

    if (input.waiting.queueCount >= 6) {
      items.push({
        id: "congestion",
        label: "Waiting room congestion",
        detail: `${input.waiting.queueCount} patients in active queue`,
        tone: "red",
        href: "/dashboard/waiting-room",
      });
    }

    if (input.summary.billingTasksOpen > 0) {
      items.push({
        id: "billing",
        label: "Billing follow-up blocking discharge flow",
        detail: `${input.summary.billingTasksOpen} open billing task(s)`,
        tone: "yellow",
        href: "/dashboard/billing",
      });
    }

    if (input.reminderFailures > 0) {
      items.push({
        id: "reminders",
        label: "Appointment confirmations falling behind",
        detail: `${input.reminderFailures} reminder issue(s) this week`,
        tone: "yellow",
        href: "/dashboard/reminders",
      });
    }

    if (input.webhookFailures > 0) {
      items.push({
        id: "integration",
        label: "External system sync needs review",
        detail: `${input.webhookFailures} integration alert(s)`,
        tone: "orange",
        href: "/dashboard/notifications",
      });
    }

    if (input.pendingComms > 5) {
      items.push({
        id: "comms-queue",
        label: "Patient communication queue backing up",
        detail: `${input.pendingComms} messages awaiting staff review`,
        tone: "yellow",
        href: "/dashboard/calls",
      });
    }

    return items;
  },

  async getRecentStuckEvents(limit = 4) {
    const events = await prisma.workflowHealthEvent.findMany({
      where: { status: { in: ["STUCK", "FAILED"] } },
      orderBy: { recordedAt: "desc" },
      take: limit,
      select: {
        id: true,
        workflowKey: true,
        status: true,
        message: true,
        recordedAt: true,
      },
    });

    return events.map((e) => ({
      id: e.id,
      label:
        e.status === "STUCK"
          ? "Clinical workflow delayed"
          : "Operational workflow blocked",
      detail: e.message ?? `Workflow ${e.workflowKey.replace(/_/g, " ")}`,
      time: safeTimeLabel(e.recordedAt),
    }));
  },
};
