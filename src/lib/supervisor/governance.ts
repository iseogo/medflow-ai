/**
 * Supervisor AI governance boundary — authoritative constraints for code and audits.
 * Supervisor has NO authority over Master Orchestrator or other AI agents.
 */

export const SUPERVISOR_ROLE = [
  "observe",
  "monitor",
  "audit",
  "detect inconsistencies",
  "detect unsafe behavior",
  "detect missing logs",
  "detect workflow failures",
  "create recommendations",
  "create AdminAlerts",
  "create StaffIntervention when risk is high",
  "request review from Master Orchestrator",
] as const;

export const SUPERVISOR_RESTRICTIONS = [
  "No authority over Master Orchestrator",
  "Cannot control, replace, override, or interfere with other AI agents' normal roles",
  "Cannot execute patient-facing actions (SMS, email, calls)",
  "Cannot book, cancel, or reschedule appointments directly",
  "Cannot override staff decisions",
  "Cannot override Master Orchestrator decisions",
  "Cannot approve, reject, or execute orchestrator proposals (reviewProposal / executeApprovedProposal)",
  "Cannot change another agent's role or impersonate other agent types for execution",
  "Cannot modify clinical workflows directly (e.g. appointment status, reminder pause)",
  "Cannot bypass RBAC, webhook security, or audit logging",
  "Cannot diagnose or give treatment advice",
] as const;

/** When a problem is detected — fixed order; steps 4–5 only when applicable. */
export const SUPERVISOR_RESPONSE_WORKFLOW = [
  "SupervisorRecommendation",
  "AuditLog",
  "AdminAlert",
  "StaffIntervention (serious risk only)",
  "Master Orchestrator correction request (pending staff/orchestrator approval)",
] as const;

/** Code patterns that must NOT appear in supervisor-agent.service.ts */
export const SUPERVISOR_FORBIDDEN_SERVICE_PATTERNS = [
  "reviewProposal",
  "executeApprovedProposal",
  "orchestratorService.sendSms",
  "orchestratorService.sendEmail",
  "orchestratorService.sendCall",
  "prisma.appointment.update",
  "prisma.agentAction.update",
  'agentType: "STAFF_ASSISTANT_AI"',
  'agentType: "APPOINTMENT_AI"',
  "UPDATE_APPOINTMENT",
  "UPDATE_CLIENT",
] as const;

export const ORCHESTRATOR_CORRECTION_REQUEST = {
  purpose: "supervisor_correction_request",
  actionType: "LOG_NOTE" as const,
  payloadKind: "SUPERVISOR_CORRECTION_REQUEST",
} as const;
