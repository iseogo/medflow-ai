/** Phase 11/12 — reliability guard thresholds (MOCK_MODE safe). */

export const APPOINTMENT_BUFFER_MINUTES = 10;

/** Minutes between appointment end and next start for same provider. */
export const PROVIDER_SLOT_BUFFER_MINUTES = APPOINTMENT_BUFFER_MINUTES;

/** Outbound comm idempotency window (duplicate block). */
export const COMMUNICATION_IDEMPOTENCY_WINDOW_MINUTES = 30;

/** Repeat duplicate blocks before staff notification. */
export const DUPLICATE_NOTIFY_THRESHOLD = 2;

export const DUPLICATE_NOTIFY_LOOKBACK_HOURS = 1;

export const WORKFLOW_MAX_RETRIES = 3;

/** Pending orchestrator proposals older than this are stuck. */
export const STUCK_PROPOSAL_HOURS = 24;

/** Reminder jobs without log outcome after due + grace. */
export const STUCK_REMINDER_GRACE_HOURS = 2;

/** Call/SMS logs stuck in PENDING. */
export const STUCK_COMMUNICATION_HOURS = 4;

/** Provider clinic hours (local wall clock — America/Chicago assumed in app). */
export const PROVIDER_AVAILABILITY = {
  startHour: 8,
  endHour: 17,
  weekdaysOnly: true,
} as const;

export const ACTIVE_APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "RESCHEDULE_REQUESTED",
  "CHECKED_IN",
  "WAITING",
  "WITH_PROVIDER",
] as const;
