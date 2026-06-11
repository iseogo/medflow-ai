import { AgentType } from "@prisma/client";

/** Integration wiring expected for each agent role. */
export type AgentWiring = {
  definition: boolean;
  masterOrchestrator: boolean;
  agentCoordinationDashboard: boolean;
  supervisorObserve: boolean;
  auditLogs: boolean;
  notifications: boolean;
  staffTasks: boolean;
  clientTimeline: boolean;
};

export type AgentRegistryEntry = {
  type: AgentType;
  displayName: string;
  responsibility: string;
  primaryActions: string[];
  wiring: AgentWiring;
  /** Workflows this agent participates in */
  workflows: string[];
};

const BASE_WIRING: Omit<AgentWiring, "definition"> = {
  masterOrchestrator: true,
  agentCoordinationDashboard: true,
  supervisorObserve: true,
  auditLogs: true,
  notifications: false,
  staffTasks: false,
  clientTimeline: false,
};

function entry(
  type: AgentType,
  displayName: string,
  responsibility: string,
  primaryActions: string[],
  workflows: string[],
  wiring: Partial<AgentWiring> = {}
): AgentRegistryEntry {
  return {
    type,
    displayName,
    responsibility,
    primaryActions,
    workflows,
    wiring: {
      definition: true,
      ...BASE_WIRING,
      ...wiring,
    },
  };
}

/**
 * Authoritative registry — all Prisma AgentType values must appear here.
 */
export const AGENT_REGISTRY: Record<AgentType, AgentRegistryEntry> = {
  MASTER_ORCHESTRATOR: entry(
    "MASTER_ORCHESTRATOR",
    "Master Orchestrator",
    "Central decision authority: approve, reject, escalate, and execute approved AI proposals. Never contacts patients directly.",
    ["REVIEW_PROPOSAL", "ROUTE_PROPOSAL", "HALT_AUTOMATION", "ESCALATE_TO_STAFF"],
    ["all_proposals", "missed_call_task_auto_approve"],
    {
      supervisorObserve: false,
      notifications: true,
      staffTasks: true,
      clientTimeline: true,
    }
  ),
  FRONT_DESK_AI: entry(
    "FRONT_DESK_AI",
    "Front Desk AI",
    "Check-in context, waiting-room questions, and front-desk workflow notes.",
    ["LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["physical_check_in", "walk_in", "waiting_room"]
  ),
  INTAKE_AI: entry(
    "INTAKE_AI",
    "Intake AI",
    "Structured intake notes and escalation when intake is incomplete.",
    ["LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["client_onboarding", "intake"]
  ),
  APPOINTMENT_AI: entry(
    "APPOINTMENT_AI",
    "Appointment AI",
    "Scheduling proposals and escalation for conflicts or urgent requests.",
    ["LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["appointments", "reschedule"]
  ),
  VOICE_CALL_AI: entry(
    "VOICE_CALL_AI",
    "Voice Call AI",
    "Inbound/outbound call proposals; observes missed inbound calls via LOG_NOTE.",
    ["PLACE_CALL", "LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["inbound_call", "outbound_call", "missed_inbound_observe", "reminders_voice"]
  ),
  SMS_REMINDER_AI: entry(
    "SMS_REMINDER_AI",
    "SMS Reminder AI",
    "Appointment reminder SMS proposals after orchestrator approval.",
    ["SEND_SMS", "LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["reminders_sms"]
  ),
  SMS_ASSISTANT_AI: entry(
    "SMS_ASSISTANT_AI",
    "SMS Assistant AI",
    "Two-way SMS: reads inbound patient texts, replies with approved templates, drafts answers for staff review, and escalates to staff when needed.",
    ["SEND_SMS", "CREATE_STAFF_TASK", "LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["inbound_sms", "sms_two_way", "sms_escalation"],
    { notifications: true, staffTasks: true, clientTimeline: true }
  ),
  EMAIL_AI: entry(
    "EMAIL_AI",
    "Email AI",
    "Patient email proposals after orchestrator approval.",
    ["SEND_EMAIL", "LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["reminders_email", "patient_email"]
  ),
  STAFF_ASSISTANT_AI: entry(
    "STAFF_ASSISTANT_AI",
    "Staff Assistant AI",
    "Internal staff task proposals (e.g. missed-call callback) for orchestrator approval.",
    ["CREATE_STAFF_TASK", "LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["missed_inbound_call_follow_up", "staff_tasks"],
    { staffTasks: true, notifications: true }
  ),
  ESCALATION_AI: entry(
    "ESCALATION_AI",
    "Escalation AI",
    "Staff intervention proposals and automation halt for complex cases.",
    ["ESCALATE_TO_STAFF", "CREATE_STAFF_INTERVENTION", "LOG_NOTE", "HALT_AUTOMATION"],
    ["emergency", "escalation"],
    { staffTasks: true, notifications: true, clientTimeline: true }
  ),
  SUPERVISOR_AI: entry(
    "SUPERVISOR_AI",
    "Supervisor AI",
    "Observe-only: recommendations, AdminAlerts, audit entries, orchestrator correction requests (LOG_NOTE).",
    ["LOG_NOTE"],
    ["coordination_scan", "missed_inbound_observe", "quality_control"],
    {
      masterOrchestrator: true,
      notifications: false,
      staffTasks: false,
    }
  ),
};

export const AGENT_HANDOFF_CHAIN = [
  {
    id: "inbound_sms",
    steps: [
      "Webhook (twilio sms / medflow sms / simulator) → smsConversationService.processInboundSms",
      "SmsLog (direction INBOUND) + AuditLog + ClientTimelineEvent",
      "Intent classification (emergency scan first, then rule-based intents)",
      "SMS_ASSISTANT_AI → Master Orchestrator proposal (template reply auto-approved; drafted reply pending staff review)",
      "Escalation path: ESCALATE_TO_STAFF → StaffIntervention + StaffNotification; emergency → automation halt + urgent task",
    ],
  },
  {
    id: "inbound_missed",
    steps: [
      "Webhook (inbound-call / retell / twilio) → missedCallService.capture",
      "CallLog + AuditLog (MissedInboundCall)",
      "STAFF_ASSISTANT_AI → Master Orchestrator → StaffTask",
      "notifyStaff (orchestrator) → StaffNotification",
      "supervisorAgentService.observeMissedInboundCall → Recommendation + AuditLog",
      "VOICE_CALL_AI LOG_NOTE proposal (coordination visibility)",
      "ClientTimelineEvent when client identified",
    ],
  },
] as const;

export function allAgentTypes(): AgentType[] {
  return Object.keys(AGENT_REGISTRY) as AgentType[];
}

export function assertRegistryComplete(types: AgentType[]): AgentType[] {
  return types.filter((t) => !AGENT_REGISTRY[t]);
}
