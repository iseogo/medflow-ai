import { RoleType } from "@prisma/client";
import { canRoleViewNotification } from "@/lib/notifications/notification-routing.service";
import {
  canViewCommandCenterSection,
  SectionKey,
} from "@/lib/command-center/section-access";
import {
  ActivityFeedEntry,
  CommandCenterSection,
  CommandCenterSnapshot,
  CommandCenterTone,
  ExecutiveActionAlert,
} from "@/lib/command-center/types";
import { safeClientRef, safeStatusLabel, safeTimeLabel } from "@/lib/command-center/safe-summary";
import { getOperationalDayBounds } from "@/lib/command-center/day-bounds";
import { integrationDashboardSnapshot, isMockModeForced } from "@/lib/integrations/env";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { operationalSummaryService } from "./operational-summary.service";
import { dashboardKpiService } from "./dashboard-kpi.service";
import { waitingRoomIntelligenceService } from "./waiting-room-intelligence.service";
import { providerUtilizationService } from "./provider-utilization.service";
import { workflowBottleneckService } from "./workflow-bottleneck.service";

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

function ownerLabel(role?: RoleType | null, userId?: string | null) {
  if (role) return `${role.replace(/_/g, " ")} team`;
  if (userId) return "Assigned staff";
  return "Unassigned";
}

function waitLabel(date: Date) {
  const mins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

async function buildActivityFeed(role: RoleType): Promise<ActivityFeedEntry[]> {
  const { todayStart } = getOperationalDayBounds();
  const [timeline, overrides, alerts] = await Promise.all([
    prisma.clientTimelineEvent.findMany({
      where: { createdAt: { gte: todayStart } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        eventType: true,
        title: true,
        createdAt: true,
        clientId: true,
        client: { select: { id: true, mrn: true } },
      },
    }),
    prisma.staffOverride.findMany({
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, targetType: true, actorRole: true, createdAt: true },
    }),
    prisma.adminAlert.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, title: true, severity: true, createdAt: true },
    }),
  ]);

  const entries: ActivityFeedEntry[] = [];

  for (const t of timeline) {
    const patient = safeClientRef({ mrn: t.client.mrn, clientId: t.clientId });
    let message = t.title;
    let category = "Operations";
    let tone: CommandCenterTone = "blue";

    switch (t.eventType) {
      case "PHYSICAL_CHECK_IN":
        message = `${patient} checked in`;
        category = "Patient flow";
        tone = "green";
        break;
      case "WAITING_ROOM_STATUS_CHANGED":
        message = `${patient} — waiting room update`;
        category = "Patient flow";
        break;
      case "WALK_IN_REGISTERED":
      case "WALK_IN_COMPLETED":
        message = `Walk-in — ${patient}`;
        category = "Patient flow";
        break;
      case "REMINDER_CYCLE_COMPLETED":
        message = `Reminder cycle completed — ${patient}`;
        category = "Communications";
        tone = "green";
        break;
      case "COMMUNICATION_CALL":
        if (t.title.toLowerCase().includes("missed")) {
          message = `Missed inbound call — ${patient}`;
          category = "Communications";
          tone = "orange";
        }
        break;
      case "AGENT_PROPOSAL_CREATED":
        message = `AI action pending review`;
        category = "AI coordination";
        tone = "purple";
        break;
      case "STAFF_OVERRIDE":
        message = `Staff override on ${patient}`;
        category = "Staff action";
        tone = "orange";
        break;
      case "SUPERVISOR_ALERT":
      case "WORKFLOW_HEALTH":
        message = `Supervisor flagged operational issue`;
        category = "Supervisor";
        tone = "orange";
        break;
      case "STAFF_NOTIFICATION":
        message = `Staff alert — ${patient}`;
        category = "Notifications";
        break;
      default:
        message = `${category} event — ${patient}`;
    }

    entries.push({
      id: `tl-${t.id}`,
      message,
      category,
      tone,
      time: safeTimeLabel(t.createdAt),
    });
  }

  for (const o of overrides) {
    entries.push({
      id: `ov-${o.id}`,
      message: `Staff override activated (${safeStatusLabel(o.targetType)})`,
      category: "Staff action",
      tone: "orange",
      time: safeTimeLabel(o.createdAt),
    });
  }

  for (const a of alerts) {
    entries.push({
      id: `al-${a.id}`,
      message: `Supervisor: ${a.title}`,
      category: "Supervisor",
      tone: a.severity === "CRITICAL" ? "red" : "yellow",
      time: safeTimeLabel(a.createdAt),
    });
  }

  return entries
    .sort((a, b) => (a.time < b.time ? 1 : -1))
    .slice(0, 14);
}

export const commandCenterService = {
  async getSnapshot(role: RoleType, userId: string): Promise<CommandCenterSnapshot> {
    const mockMode = isMockModeForced();
    const integration = integrationDashboardSnapshot();

    const [summary, waitingIntel, providerUtil, notificationsRaw, interventions, lowConfidenceCount, humanHandoffs, stuckItems, auditLogs, securityAlerts] =
      await Promise.all([
        operationalSummaryService.getSummary(),
        waitingRoomIntelligenceService.analyze(),
        providerUtilizationService.getUtilization(),
        prisma.staffNotification.findMany({
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 80,
          select: {
            id: true,
            title: true,
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
        prisma.staffIntervention.findMany({
          where: { status: { notIn: ["RESOLVED"] } },
          orderBy: { createdAt: "asc" },
          take: 8,
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            assignedToId: true,
            client: { select: { id: true, mrn: true } },
          },
        }),
        prisma.coordinationIncident.count({
          where: { incidentType: "LOW_CONFIDENCE", resolved: false },
        }),
        prisma.staffIntervention.count({
          where: { status: { in: ["HUMAN_TAKEOVER", "STAFF_REVIEW_REQUIRED"] } },
        }),
        workflowBottleneckService.getRecentStuckEvents(4),
        hasPermission(role, "audit:read")
          ? prisma.auditLog.findMany({
              orderBy: { createdAt: "desc" },
              take: 8,
              select: {
                id: true,
                action: true,
                entityType: true,
                createdAt: true,
                actorRole: true,
              },
            })
          : Promise.resolve([]),
        prisma.adminAlert.count({
          where: { status: "OPEN", severity: { in: ["WARNING", "CRITICAL"] } },
        }),
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

    const urgent = notifications.filter(
      (n) =>
        n.priority === "CRITICAL" ||
        n.category === "URGENT" ||
        n.category === "EMERGENCY"
    );
    const webhookFailures = notifications.filter(
      (n) => n.source === "WEBHOOK_FAILURE" || n.source === "INTEGRATION_FAILURE"
    ).length;

    const bottlenecks = workflowBottleneckService.buildBottlenecks({
      summary,
      waiting: waitingIntel,
      providers: providerUtil,
      reminderFailures: summary.reminderFailed7d,
      webhookFailures,
      pendingComms: summary.pendingCalls + summary.pendingSms + summary.pendingEmails,
    });

    const kpis = await dashboardKpiService.getKpis(summary, urgent.length);
    const activityFeed = await buildActivityFeed(role);

    const criticalActions: ExecutiveActionAlert[] = [];

    const missedCallAlerts = notifications.filter(
      (n) => n.source === "MISSED_INBOUND_CALL"
    );

    for (const n of missedCallAlerts.slice(0, 4)) {
      if (criticalActions.some((c) => c.id === n.id)) continue;
      criticalActions.push({
        id: n.id,
        title: n.title,
        severity: n.priority === "CRITICAL" ? "red" : "orange",
        patientSummary: n.client
          ? safeClientRef({ mrn: n.client.mrn, clientId: n.client.id })
          : "Inbound caller",
        assignedOwner: ownerLabel(n.assignedRole, n.assignedUserId),
        timeWaiting: waitLabel(n.createdAt),
        recommendedNextAction:
          n.recommendedNextAction ?? "Call patient back and document outcome",
        escalationStatus: n.status === "UNREAD" ? "Awaiting callback" : safeStatusLabel(n.status),
        href: "/dashboard/notifications",
      });
    }

    for (const n of urgent.slice(0, 6)) {
      criticalActions.push({
        id: n.id,
        title: n.title,
        severity:
          n.category === "EMERGENCY" || n.priority === "CRITICAL" ? "red" : "orange",
        patientSummary: n.client
          ? safeClientRef({ mrn: n.client.mrn, clientId: n.client.id })
          : undefined,
        assignedOwner: ownerLabel(n.assignedRole, n.assignedUserId),
        timeWaiting: waitLabel(n.createdAt),
        recommendedNextAction:
          n.recommendedNextAction ?? "Review and acknowledge in Notifications",
        escalationStatus: n.status === "UNREAD" ? "Awaiting triage" : safeStatusLabel(n.status),
        href: "/dashboard/notifications",
      });
    }

    for (const i of interventions.slice(0, 4)) {
      criticalActions.push({
        id: i.id,
        title: i.title,
        severity: i.status === "URGENT" ? "red" : "orange",
        patientSummary: i.client
          ? safeClientRef({ mrn: i.client.mrn, clientId: i.client.id })
          : "Operational case",
        assignedOwner: i.assignedToId ? "Assigned staff" : "Front desk queue",
        timeWaiting: waitLabel(i.createdAt),
        recommendedNextAction: "Resolve or reassign in Staff Intervention",
        escalationStatus: safeStatusLabel(i.status),
        href: "/dashboard/staff-intervention",
      });
    }

    for (const b of bottlenecks.slice(0, 3)) {
      if (criticalActions.some((c) => c.id === b.id)) continue;
      criticalActions.push({
        id: b.id,
        title: b.label,
        severity: b.tone,
        patientSummary: "Clinic-wide",
        assignedOwner: "Operations lead",
        timeWaiting: b.waitingMinutes ? `${b.waitingMinutes}m` : "—",
        recommendedNextAction: b.detail,
        escalationStatus: "Open",
        href: b.href,
      });
    }

    const sections: CommandCenterSection[] = [];

    const critical = section("criticalActionCenter", role, {
      id: "criticalActionCenter",
      title: "Critical Action Center",
      count: criticalActions.length,
      tone: toneFromCount(criticalActions.length, { warn: 1, critical: 4 }),
      recommendedNextAction: "Triage highest-severity items first — assign owners within 15 minutes",
      href: "/dashboard/notifications",
      priority: 1,
      items: criticalActions.slice(0, 5).map((a) => ({
        id: a.id,
        label: a.title,
        detail: `${a.patientSummary ?? "—"} · ${a.assignedOwner} · ${a.escalationStatus}`,
        time: a.timeWaiting,
      })),
    });
    if (critical) sections.push(critical);

    const live = section("liveClinicOperations", role, {
      id: "liveClinicOperations",
      title: "Live Clinic Operations",
      count: summary.appointmentsToday,
      tone: "blue",
      recommendedNextAction: "Monitor active visits and same-day schedule changes",
      href: "/dashboard/appointments",
      priority: 2,
      items: [
        { id: "appts", label: `${summary.appointmentsToday} appointments today` },
        { id: "active", label: `${summary.activeVisits} active visit(s)` },
        { id: "waiting", label: `${summary.waitingNow} waiting · ${summary.withProviderNow} with provider` },
        { id: "done", label: `${summary.completedVisitsToday} completed today` },
        { id: "cancel", label: `${summary.cancellationsToday} cancellations · ${summary.reschedulesToday} reschedules` },
        { id: "noshow", label: `${summary.noShowsToday} no-shows · ${summary.walkInsToday} walk-ins` },
      ],
    });
    if (live) sections.push(live);

    const wr = section("waitingRoomIntelligence", role, {
      id: "waitingRoomIntelligence",
      title: "Waiting Room Intelligence",
      count: waitingIntel.queueCount,
      tone: toneFromCount(waitingIntel.providerDelays, { warn: 2, critical: 4 }),
      recommendedNextAction:
        waitingIntel.recommendations[0]?.label ?? "Monitor queue flow",
      href: "/dashboard/waiting-room",
      priority: 3,
      items: [
        {
          id: "longest",
          label: `Longest wait: ${waitingIntel.longestWaitMinutes} min`,
          detail: `Average ${waitingIntel.averageWaitMinutes} min`,
        },
        ...waitingIntel.queueItems,
        ...waitingIntel.recommendations.slice(0, 2).map((r) => ({
          id: r.id,
          label: r.label,
          detail: r.detail,
        })),
      ].slice(0, 6),
    });
    if (wr) sections.push(wr);

    const staff = section("staffProductivity", role, {
      id: "staffProductivity",
      title: "Staff Productivity Center",
      count: providerUtil.rows.length,
      tone: providerUtil.capacityWarnings > 0 ? "orange" : "green",
      recommendedNextAction: "Balance provider load and clear open staff tasks",
      href: "/dashboard/staff-intervention",
      priority: 4,
      items: [
        ...providerUtil.rows.slice(0, 3).map((p) => ({
          id: p.providerName,
          label: `${p.providerName}: ${p.utilizationPct}% utilized`,
          detail: `${p.patientsSeen} seen · ${p.activeNow} active · ~${p.avgVisitMinutes} min/visit`,
        })),
        {
          id: "tasks",
          label: `${summary.openStaffTasks} open staff task(s)`,
          detail:
            providerUtil.capacityWarnings > 0
              ? `${providerUtil.capacityWarnings} overload warning(s)`
              : "Capacity within target",
        },
        {
          id: "interventions",
          label: `${summary.openInterventions} intervention workload item(s)`,
        },
      ],
    });
    if (staff) sections.push(staff);

    const overlapPrevented = summary.schedulingConflictsBlocked;
    const sched = section("appointmentSchedulingHealth", role, {
      id: "appointmentSchedulingHealth",
      title: "Appointment & Scheduling Health",
      count: summary.appointmentsToday,
      tone: summary.reminderFailed7d > 0 ? "yellow" : "green",
      recommendedNextAction: "Confirm open capacity and reminder outreach",
      href: "/dashboard/appointments",
      priority: 5,
      items: [
        {
          id: "overlap",
          label: `${overlapPrevented} scheduling conflict(s) blocked`,
          detail: "Overlap prevention active",
        },
        {
          id: "util",
          label: `Provider utilization tracked (${providerUtil.rows.length} providers)`,
          detail: `${providerUtil.openCapacitySlots} open capacity slot(s) estimated`,
        },
        {
          id: "reminder-ok",
          label: `Reminder success: ${summary.reminderTotal7d > 0 ? Math.round((summary.reminderConfirmed7d / summary.reminderTotal7d) * 100) : 0}%`,
          detail: `${summary.reminderFailed7d} failure(s) this week`,
        },
        {
          id: "pending-conf",
          label: `${summary.pendingProposals} pending confirmation(s) via AI`,
        },
      ],
    });
    if (sched) sections.push(sched);

    const comms = section("communicationsCommand", role, {
      id: "communicationsCommand",
      title: "Communications Command",
      count:
        summary.pendingCalls +
        summary.missedInboundCallsOpen +
        summary.pendingSms +
        summary.reminderFailed7d +
        webhookFailures,
      tone: toneFromCount(
        summary.missedInboundCallsOpen + summary.reminderFailed7d,
        { warn: 1, critical: 3 }
      ),
      recommendedNextAction:
        "Return missed inbound calls within 15 minutes; clear failed reminders",
      href: "/dashboard/notifications",
      priority: 6,
      items: [
        {
          id: "missed",
          label: `${summary.missedInboundCallsOpen} missed inbound call(s) need callback`,
          detail: `${summary.missedInboundCallsToday} today`,
        },
        {
          id: "calls",
          label: `${summary.pendingCalls} call log(s) pending`,
        },
        {
          id: "sms",
          label: `${summary.pendingSms} SMS · ${summary.pendingEmails} email in queue`,
        },
        {
          id: "reminders",
          label: `${summary.reminderFailed7d} reminder failure(s) (7d)`,
        },
        {
          id: "dup",
          label: `${summary.duplicateActionsPrevented} duplicate communication(s) prevented`,
        },
        {
          id: "webhook",
          label: `${webhookFailures} integration alert(s)`,
          detail: mockMode ? "MOCK_MODE — no live send" : undefined,
        },
      ],
    });
    if (comms) sections.push(comms);

    const automationScore =
      summary.stuckWorkflows + summary.failedWorkflows === 0
        ? 100
        : Math.max(
            0,
            100 -
              (summary.stuckWorkflows + summary.failedWorkflows) * 10
          );

    const ai = section("aiSupervisorCenter", role, {
      id: "aiSupervisorCenter",
      title: "AI & Supervisor Center",
      count:
        summary.pendingProposals +
        summary.openAdminAlerts +
        summary.openIncidents +
        lowConfidenceCount,
      tone: summary.pendingProposals > 0 ? "purple" : "blue",
      recommendedNextAction:
        "Supervisor observe-only — approve AI proposals via Agent Coordination",
      href: "/dashboard/agent-coordination",
      priority: 7,
      items: [
        {
          id: "proposals",
          label: `${summary.pendingProposals} AI proposal(s) pending approval`,
          detail: "Master Orchestrator required",
        },
        {
          id: "low-conf",
          label: `${lowConfidenceCount} low-confidence AI case(s)`,
          detail: `${humanHandoffs} human handoff(s)`,
        },
        {
          id: "supervisor",
          label: `${summary.openAdminAlerts} supervisor alert(s)`,
          detail: `${summary.openIncidents} coordination finding(s)`,
        },
        {
          id: "overlap",
          label: `${overlapPrevented} scheduling overlap(s) prevented`,
        },
        {
          id: "dup",
          label: `${summary.duplicateActionsPrevented} duplicate action(s) prevented`,
        },
        {
          id: "auto",
          label: `Automation health score: ${automationScore}%`,
          detail: "Supervisor cannot execute — recommendations only",
        },
      ],
    });
    if (ai) sections.push(ai);

    const bottleneck = section("workflowBottleneck", role, {
      id: "workflowBottleneck",
      title: "Workflow Bottleneck Center",
      count: bottlenecks.length,
      tone: toneFromCount(bottlenecks.length, { warn: 2, critical: 5 }),
      recommendedNextAction: "Resolve operational slowdowns in plain-language priority order",
      href: "/dashboard/supervisor",
      priority: 8,
      items: [
        ...bottlenecks.slice(0, 4).map((b) => ({
          id: b.id,
          label: b.label,
          detail: b.detail,
        })),
        ...stuckItems.slice(0, 2),
      ].slice(0, 6),
    });
    if (bottleneck) sections.push(bottleneck);

    const security = section("securityCompliance", role, {
      id: "securityCompliance",
      title: "Security & Compliance Summary",
      count: securityAlerts + auditLogs.length,
      tone: securityAlerts > 0 ? "orange" : "blue",
      recommendedNextAction: "Review audit anomalies and access events",
      href: "/dashboard/audit-logs",
      priority: 9,
      items: [
        {
          id: "alerts",
          label: `${securityAlerts} unresolved security alert(s)`,
        },
        {
          id: "export",
          label: `${summary.exportEvents7d} export access event(s) (7d)`,
        },
        {
          id: "override",
          label: `${summary.staffOverrides7d} staff override(s) logged`,
          detail: "RBAC enforced on all dashboard routes",
        },
        ...auditLogs.slice(0, 3).map((log) => ({
          id: log.id,
          label: `${log.action} · ${log.entityType}`,
          detail: log.actorRole ? `Role ${log.actorRole}` : "System",
          time: safeTimeLabel(log.createdAt),
        })),
      ],
    });
    if (security) sections.push(security);

    const integrations = section("integrationHealth", role, {
      id: "integrationHealth",
      title: "Integration Health Center",
      count: Object.keys(integration.providers).length,
      tone: mockMode ? "gray" : "blue",
      recommendedNextAction: mockMode
        ? "MOCK_MODE on — external APIs disabled (safe)"
        : "Validate credentials before enabling live traffic",
      href: "/dashboard/settings",
      priority: 10,
      items: [
        {
          id: "mock",
          label: mockMode ? "MOCK_MODE: ON (safe)" : "MOCK_MODE: OFF",
          detail: integration.canUseLive ? "Live ready when configured" : "Live blocked",
        },
        { id: "twilio", label: `Twilio: ${integration.providers.twilio}` },
        { id: "openai", label: `OpenAI: ${integration.providers.openai}` },
        { id: "n8n", label: `n8n: ${integration.providers.n8n}` },
        {
          id: "gcal",
          label: `Google Calendar: ${integration.providers.googleCalendar}`,
        },
        { id: "webhook", label: `Webhooks: ${integration.providers.webhooks}` },
      ],
    });
    if (integrations) sections.push(integrations);

    sections.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

    let systemHealth: CommandCenterSnapshot["systemHealth"] = "healthy";
    if (urgent.length >= 3 || summary.stuckWorkflows >= 3 || waitingIntel.providerDelays >= 4) {
      systemHealth = "critical";
    } else if (
      urgent.length > 0 ||
      summary.openInterventions > 2 ||
      summary.reminderFailed7d > 0 ||
      bottlenecks.length > 2
    ) {
      systemHealth = "degraded";
    }

    return {
      role,
      mockMode,
      systemHealth,
      generatedAt: new Date().toISOString(),
      kpis,
      criticalActions,
      activityFeed,
      sections,
    };
  },
};
