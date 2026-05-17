import { RoleType } from "@prisma/client";
import { canRoleViewNotification } from "@/lib/notifications/notification-routing.service";
import {
  canViewCommandCenterSection,
  SectionKey,
} from "@/lib/command-center/section-access";
import {
  CommandCenterItem,
  CommandCenterSection,
  CommandCenterSnapshot,
  CommandCenterTone,
} from "@/lib/command-center/types";
import { safeClientRef, safeStatusLabel, safeTimeLabel } from "@/lib/command-center/safe-summary";
import { integrationDashboardSnapshot, isMockModeForced } from "@/lib/integrations/env";
import { hasPermission } from "@/lib/rbac";
import { ACTIVE_WAITING_ROOM_STATES } from "@/lib/waiting-room";
import { prisma } from "@/lib/prisma";

function toneFromCount(
  count: number,
  thresholds: { warn: number; critical: number }
): CommandCenterTone {
  if (count >= thresholds.critical) return "red";
  if (count >= thresholds.warn) return "orange";
  if (count > 0) return "yellow";
  return "green";
}

function section(
  key: SectionKey,
  role: RoleType,
  input: Omit<CommandCenterSection, "hidden"> & { hidden?: boolean }
): CommandCenterSection | null {
  if (!canViewCommandCenterSection(role, key)) return null;
  return { ...input, hidden: false };
}

export const commandCenterService = {
  async getSnapshot(role: RoleType, userId: string): Promise<CommandCenterSnapshot> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      notificationsRaw,
      openInterventions,
      waitingRoom,
      walkIns,
      checkIns,
      todayAppts,
      reminderFailures,
      pendingProposals,
      openAlerts,
      openIncidents,
      stuckWorkflows,
      staffTasks,
      auditLogs,
      pendingCalls,
      pendingSms,
    ] = await Promise.all([
      prisma.staffNotification.findMany({
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 80,
        select: {
          id: true,
          title: true,
          message: true,
          category: true,
          priority: true,
          status: true,
          source: true,
          recommendedNextAction: true,
          createdAt: true,
          assignedRole: true,
          assignedUserId: true,
          client: { select: { id: true, mrn: true } },
        },
      }),
      prisma.staffIntervention.count({
        where: { status: { notIn: ["RESOLVED"] } },
      }),
      prisma.waitingRoomStatus.findMany({
        where: { state: { in: ACTIVE_WAITING_ROOM_STATES } },
        orderBy: { queuePosition: "asc" },
        take: 8,
        select: {
          id: true,
          state: true,
          queuePosition: true,
          waitDurationMinutes: true,
          client: { select: { id: true, mrn: true } },
        },
      }),
      prisma.walkInVisit.findMany({
        where: { onboardingStatus: "IN_PROGRESS" },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          visitType: true,
          createdAt: true,
          client: { select: { id: true, mrn: true } },
        },
      }),
      prisma.physicalCheckIn.findMany({
        orderBy: { arrivedAt: "desc" },
        take: 6,
        select: {
          id: true,
          checkInType: true,
          arrivedAt: true,
          client: { select: { id: true, mrn: true } },
        },
      }),
      prisma.appointment.findMany({
        where: { scheduledAt: { gte: todayStart, lte: todayEnd } },
        orderBy: { scheduledAt: "asc" },
        take: 8,
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          providerName: true,
          client: { select: { id: true, mrn: true } },
        },
      }),
      prisma.reminderLog.count({
        where: {
          outcome: { in: ["FAILED", "ESCALATED"] },
          createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
        },
      }),
      prisma.agentAction.count({
        where: { proposalStatus: "PENDING_APPROVAL" },
      }),
      prisma.adminAlert.count({ where: { status: "OPEN" } }),
      prisma.coordinationIncident.count({ where: { resolved: false } }),
      prisma.workflowHealthEvent.count({
        where: { status: { in: ["STUCK", "FAILED"] } },
      }),
      prisma.staffTask.count({
        where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
      }),
      hasPermission(role, "audit:read")
        ? prisma.auditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 6,
            select: {
              id: true,
              action: true,
              entityType: true,
              createdAt: true,
              actorRole: true,
            },
          })
        : Promise.resolve([]),
      prisma.callLog.count({ where: { status: "PENDING" } }),
      prisma.smsLog.count({ where: { status: "PENDING" } }),
    ]);

    const notifications = notificationsRaw.filter((n) =>
      canRoleViewNotification(role, {
        source: n.source,
        category: n.category,
        assignedRole: n.assignedRole,
        assignedUserId: n.assignedUserId,
        userId,
      })
    );

    const unread = notifications.filter((n) => n.status === "UNREAD").length;
    const urgent = notifications.filter(
      (n) =>
        n.priority === "CRITICAL" ||
        n.category === "URGENT" ||
        n.category === "EMERGENCY"
    );

    const webhookFailures = notifications.filter(
      (n) => n.source === "WEBHOOK_FAILURE" || n.source === "INTEGRATION_FAILURE"
    );

    const integration = integrationDashboardSnapshot();
    const mockMode = isMockModeForced();

    const sections: CommandCenterSection[] = [];

    const critical = section("criticalAlerts", role, {
      id: "criticalAlerts",
      title: "Critical Alerts",
      count: urgent.length,
      tone: toneFromCount(urgent.length, { warn: 1, critical: 3 }),
      recommendedNextAction: "Review urgent and emergency notifications first",
      href: "/dashboard/notifications",
      items: urgent.slice(0, 5).map((n) => ({
        id: n.id,
        label: n.title,
        detail: n.recommendedNextAction ?? safeStatusLabel(n.status),
        time: safeTimeLabel(n.createdAt),
      })),
    });
    if (critical) sections.push(critical);

    const live = section("liveOperations", role, {
      id: "liveOperations",
      title: "Live Operations",
      count: openInterventions + waitingRoom.length + walkIns.length,
      tone: toneFromCount(openInterventions, { warn: 2, critical: 5 }),
      recommendedNextAction: "Address open interventions and waiting room queue",
      href: "/dashboard/waiting-room",
      items: [
        {
          id: "interventions",
          label: `${openInterventions} open staff intervention(s)`,
          detail: "Staff intervention queue",
        },
        ...waitingRoom.slice(0, 3).map((w) => ({
          id: w.id,
          label: `Queue #${w.queuePosition} — ${safeStatusLabel(w.state)}`,
          detail: safeClientRef({ mrn: w.client.mrn, clientId: w.client.id }),
        })),
        ...walkIns.slice(0, 2).map((w) => ({
          id: w.id,
          label: `Walk-in ${safeStatusLabel(w.visitType)}`,
          detail: safeClientRef({ mrn: w.client.mrn, clientId: w.client.id }),
          time: safeTimeLabel(w.createdAt),
        })),
      ].slice(0, 5),
    });
    if (live) sections.push(live);

    const ai = section("aiSupervisor", role, {
      id: "aiSupervisor",
      title: "AI & Supervisor Activity",
      count: pendingProposals + openAlerts + openIncidents,
      tone:
        pendingProposals > 0
          ? "purple"
          : toneFromCount(openAlerts + openIncidents, { warn: 2, critical: 5 }),
      recommendedNextAction: "Review pending AI proposals in Agent Coordination",
      href: "/dashboard/agent-coordination",
      items: [
        {
          id: "proposals",
          label: `${pendingProposals} pending AI action(s)`,
          detail: "Master Orchestrator approval required",
        },
        {
          id: "alerts",
          label: `${openAlerts} open supervisor alert(s)`,
          detail: `${openIncidents} coordination incident(s)`,
        },
      ],
    });
    if (ai) sections.push(ai);

    const comms = section("communications", role, {
      id: "communications",
      title: "Communications",
      count: reminderFailures + webhookFailures.length + unread,
      tone: toneFromCount(reminderFailures, { warn: 1, critical: 3 }),
      recommendedNextAction: "Check reminder failures and notification queue",
      href: "/dashboard/reminders",
      items: [
        {
          id: "unread",
          label: `${unread} unread notification(s)`,
          detail: "In-app notifications only",
        },
        {
          id: "reminders",
          label: `${reminderFailures} reminder failure(s) (7d)`,
        },
        ...webhookFailures.slice(0, 2).map((n) => ({
          id: n.id,
          label: n.title,
          time: safeTimeLabel(n.createdAt),
        })),
        {
          id: "pending-comms",
          label: `${pendingCalls + pendingSms} pending comm log(s)`,
          detail: mockMode ? "MOCK_MODE — no live send" : "Monitor delivery",
        },
      ].slice(0, 5),
    });
    if (comms) sections.push(comms);

    const appts = section("appointmentsWaitingRoom", role, {
      id: "appointmentsWaitingRoom",
      title: "Appointments & Waiting Room",
      count: todayAppts.length,
      tone: todayAppts.length > 0 ? "blue" : "gray",
      recommendedNextAction: "Confirm today's schedule and room assignments",
      href: "/dashboard/appointments",
      items: [
        ...todayAppts.slice(0, 4).map((a) => ({
          id: a.id,
          label: `${safeTimeLabel(a.scheduledAt)} — ${safeStatusLabel(a.status)}`,
          detail: `${safeClientRef({ mrn: a.client.mrn, clientId: a.client.id })}${a.providerName ? ` · ${a.providerName}` : ""}`,
        })),
        ...checkIns.slice(0, 2).map((c) => ({
          id: c.id,
          label: `Check-in ${safeStatusLabel(c.checkInType)}`,
          detail: safeClientRef({ mrn: c.client.mrn, clientId: c.client.id }),
          time: safeTimeLabel(c.arrivedAt),
        })),
      ].slice(0, 6),
    });
    if (appts) sections.push(appts);

    const workflow = section("workflowHealth", role, {
      id: "workflowHealth",
      title: "Workflow Health",
      count: stuckWorkflows,
      tone: toneFromCount(stuckWorkflows, { warn: 1, critical: 3 }),
      recommendedNextAction: "Run supervisor scan or review stuck workflows",
      href: "/dashboard/supervisor",
      items: [
        {
          id: "stuck",
          label: `${stuckWorkflows} stuck/failed workflow event(s)`,
        },
        {
          id: "tasks",
          label: `${staffTasks} open staff task(s)`,
          detail: "Review assigned staff tasks",
        },
      ],
    });
    if (workflow) sections.push(workflow);

    const security = section("securityAudit", role, {
      id: "securityAudit",
      title: "Security & Audit",
      count: auditLogs.length,
      tone: "blue",
      recommendedNextAction: "Review recent audit activity for anomalies",
      href: "/dashboard/audit-logs",
      items: auditLogs.map((log) => ({
        id: log.id,
        label: `${log.action} · ${log.entityType}`,
        detail: log.actorRole ? `Role ${log.actorRole}` : "System",
        time: safeTimeLabel(log.createdAt),
      })),
    });
    if (security) sections.push(security);

    const integrations = section("integrationStatus", role, {
      id: "integrationStatus",
      title: "Integration Status",
      count: Object.keys(integration.providers).length,
      tone: mockMode ? "gray" : "blue",
      recommendedNextAction: mockMode
        ? "MOCK_MODE on — live APIs disabled (safe)"
        : "Verify provider configuration in Settings",
      href: "/dashboard/settings",
      items: [
        {
          id: "mock",
          label: mockMode ? "MOCK_MODE: ON (safe)" : "MOCK_MODE: OFF",
          detail: integration.canUseLive ? "Live integrations allowed" : "Live blocked",
        },
        ...Object.entries(integration.providers).map(([name, status]) => ({
          id: name,
          label: `${name}: ${status}`,
        })),
      ],
    });
    if (integrations) sections.push(integrations);

    let systemHealth: CommandCenterSnapshot["systemHealth"] = "healthy";
    if (urgent.length >= 3 || stuckWorkflows >= 3) systemHealth = "critical";
    else if (urgent.length > 0 || openInterventions > 2 || reminderFailures > 0) {
      systemHealth = "degraded";
    }

    return {
      role,
      mockMode,
      systemHealth,
      generatedAt: new Date().toISOString(),
      sections,
    };
  },
};
