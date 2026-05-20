/**
 * Thin handler helpers for inbound call status → missed-call pipeline (pure, testable).
 */
import {
  isMissedInboundCallStatus,
  mapInboundStatusToMissed,
} from "@/lib/missed-call/missed-call-statuses";

export function resolveMissedCallStatusFromWebhook(
  rawStatus: string
): ReturnType<typeof mapInboundStatusToMissed> {
  return mapInboundStatusToMissed(rawStatus);
}

export function shouldTreatAsMissedInbound(rawStatus: string): boolean {
  const mapped = mapInboundStatusToMissed(rawStatus);
  return mapped !== null && isMissedInboundCallStatus(mapped);
}
