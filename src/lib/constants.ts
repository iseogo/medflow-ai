export const APP_TIMEZONE = "America/Chicago";
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://medflow.smartdeskai.cloud";
export const N8N_URL =
  process.env.NEXT_PUBLIC_N8N_URL ?? "https://n8n.smartdeskai.cloud";

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  CONFIRMED: "Confirmed",
  RESCHEDULE_REQUESTED: "Reschedule Requested",
  RESCHEDULED: "Rescheduled",
  CANCELLED: "Cancelled",
  CHECKED_IN: "Checked In",
  WAITING: "Waiting",
  WITH_PROVIDER: "With Provider",
  COMPLETED: "Completed",
  NO_SHOW: "No Show",
  WALK_OUT: "Walk-out",
  FOLLOW_UP_NEEDED: "Follow-up Needed",
};

export const WAITING_ROOM_STATE_LABELS: Record<string, string> = {
  CHECKED_IN: "Checked in",
  WAITING: "Waiting",
  CALLED: "Called",
  WITH_PROVIDER: "With provider",
  COMPLETED: "Completed",
  WALK_OUT: "Walk-out",
  NO_SHOW: "No-show",
};

export const WALK_IN_ONBOARDING_LABELS: Record<string, string> = {
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const INTERVENTION_STATUS_LABELS: Record<string, string> = {
  WALK_IN: "Walk-in",
  HUMAN_TAKEOVER: "Human Takeover",
  AI_ESCALATED: "AI Escalated",
  STAFF_REVIEW_REQUIRED: "Staff Review",
  RESOLVED: "Resolved",
  FOLLOW_UP_NEEDED: "Follow-up Needed",
  URGENT: "Urgent",
};

export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ESCALATED: "Escalated",
  EXECUTED: "Executed",
};

export const AGENT_TYPE_LABELS: Record<string, string> = {
  MASTER_ORCHESTRATOR: "Master Orchestrator",
  FRONT_DESK_AI: "Front Desk AI",
  INTAKE_AI: "Intake AI",
  APPOINTMENT_AI: "Appointment AI",
  VOICE_CALL_AI: "Voice Call AI",
  SMS_REMINDER_AI: "SMS Reminder AI",
  EMAIL_AI: "Email AI",
  STAFF_ASSISTANT_AI: "Staff Assistant AI",
  ESCALATION_AI: "Escalation AI",
  SUPERVISOR_AI: "Supervisor AI",
};

export const COMMUNICATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  SENT: "Sent",
  DELIVERED: "Delivered",
  ANSWERED: "Answered",
  FAILED: "Failed",
  NO_ANSWER: "No Answer",
  BOUNCED: "Bounced",
  RESPONDED: "Responded",
  ESCALATED: "Escalated",
};

export const USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
};

export const REMINDER_OFFSET_LABELS: Record<string, string> = {
  HOURS_48: "48 hours before",
  HOURS_24: "24 hours before",
  HOURS_2: "2 hours before",
  MINUTES_30: "30 minutes before",
};

export const REMINDER_OUTCOME_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  RESCHEDULE_REQUESTED: "Reschedule requested",
  NO_RESPONSE: "No response",
  FAILED: "Failed",
  ESCALATED: "Escalated",
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  FRONT_DESK_STAFF: "Front Desk",
  BILLING_STAFF: "Billing",
  MEDICAL_RECORDS_STAFF: "Medical Records",
  CLINICAL_STAFF: "Clinical",
  READ_ONLY: "Read Only",
};
