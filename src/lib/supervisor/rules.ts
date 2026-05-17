/**
 * Supervisor AI — monitoring, alerting, and escalation rules (Phase 10).
 */

import {
  AdminAlertSeverity,
  CoordinationIncidentType,
} from "@prisma/client";

export type MonitoringRule = {
  code: string;
  title: string;
  description: string;
  severity: AdminAlertSeverity;
  incidentType: CoordinationIncidentType;
};

export const MONITORING_RULES: MonitoringRule[] = [
  {
    code: "AGENT_FORBIDDEN_ACTION",
    title: "Agent used forbidden action",
    description: "AgentAction actionType not in agent allowedActions",
    severity: "CRITICAL",
    incidentType: "AGENT_VIOLATION",
  },
  {
    code: "DUPLICATE_PROPOSAL",
    title: "Duplicate agent proposal",
    description: "Matching proposal dedup window",
    severity: "WARNING",
    incidentType: "DUPLICATE_ACTION",
  },
  {
    code: "EXECUTED_WITHOUT_LOG",
    title: "Executed comm without log FK",
    description: "EXECUTED SEND_* / PLACE_CALL missing sms/email/call log",
    severity: "CRITICAL",
    incidentType: "ORCHESTRATOR_ANOMALY",
  },
  {
    code: "MISSING_APPOINTMENT_TIMELINE",
    title: "Appointment missing timeline event",
    description: "APPOINTMENT_CREATED count below appointment count",
    severity: "WARNING",
    incidentType: "MISSING_TIMELINE",
  },
  {
    code: "REMINDER_FAILED",
    title: "Reminder cycle failed",
    description: "ReminderLog outcome FAILED or ESCALATED",
    severity: "WARNING",
    incidentType: "REMINDER_FAILURE",
  },
  {
    code: "STUCK_PROPOSAL",
    title: "Stuck agent proposal",
    description: "PENDING_APPROVAL older than threshold",
    severity: "WARNING",
    incidentType: "STUCK_WORKFLOW",
  },
  {
    code: "ESCALATION_LOOP",
    title: "Repeated escalation loop",
    description: "Multiple escalations for same client in short window",
    severity: "CRITICAL",
    incidentType: "ESCALATION_LOOP",
  },
  {
    code: "EMERGENCY_NOT_HALTED",
    title: "Emergency without automation halt",
    description: "isEmergency true but automationHalted false on active proposal",
    severity: "CRITICAL",
    incidentType: "EMERGENCY_RULE_VIOLATION",
  },
  {
    code: "AI_SAFETY_CONTENT",
    title: "AI safety content violation",
    description: "Proposal description fails validateAgentProposalContent",
    severity: "CRITICAL",
    incidentType: "AI_SAFETY_VIOLATION",
  },
  {
    code: "STAFF_OVERRIDE_IGNORED",
    title: "Staff override not respected",
    description: "AI executed after staff override on client",
    severity: "CRITICAL",
    incidentType: "STAFF_OVERRIDE_VIOLATION",
  },
];

export const ALERTING_RULES = {
  openAlertDedupHours: 24,
  stuckProposalHours: 4,
  escalationLoopWindowHours: 24,
  escalationLoopThreshold: 3,
  scanLookbackDays: 7,
} as const;

export const ESCALATION_RULES = {
  /** StaffIntervention for severe operational risk — does not override orchestrator authority */
  criticalCreatesIntervention: true,
  /** Supervisor never mutates appointments; may suggest pause in orchestrator correction request */
  criticalPausesReminderAutomation: false,
  /** Submit pending correction request to Master Orchestrator (not execution) */
  requestOrchestratorReviewOnFinding: true,
  severeIncidentTypes: new Set<CoordinationIncidentType>([
    "AGENT_VIOLATION",
    "ORCHESTRATOR_ANOMALY",
    "EMERGENCY_RULE_VIOLATION",
    "STAFF_OVERRIDE_VIOLATION",
    "AI_SAFETY_VIOLATION",
    "ESCALATION_LOOP",
    "UNAUTHORIZED_SEND",
  ]),
} as const;

export { SUPERVISOR_RESTRICTIONS } from "./governance";
