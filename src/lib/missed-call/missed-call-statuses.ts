import { CommunicationStatus } from "@prisma/client";

/** Inbound call outcomes that require staff follow-up. */
export const MISSED_INBOUND_CALL_STATUSES = new Set<CommunicationStatus>([
  "NO_ANSWER",
  "MISSED",
  "ABANDONED",
  "FAILED",
]);

export type MissedCallTriggerReason =
  | "status_update"
  | "caller_hangup"
  | "voice_ai_connection_failed"
  | "n8n_inbound_workflow_failure";

export function isMissedInboundCallStatus(
  status: CommunicationStatus | string
): boolean {
  return MISSED_INBOUND_CALL_STATUSES.has(status as CommunicationStatus);
}

export function mapInboundStatusToMissed(
  raw: string
): CommunicationStatus | null {
  const s = raw.trim().toLowerCase().replace(/_/g, "-");
  switch (s) {
    case "no-answer":
    case "no_answer":
      return "NO_ANSWER";
    case "missed":
      return "MISSED";
    case "abandoned":
    case "canceled":
    case "cancelled":
      return "ABANDONED";
    case "failed":
      return "FAILED";
    case "busy":
      return "NO_ANSWER";
    default:
      return null;
  }
}
