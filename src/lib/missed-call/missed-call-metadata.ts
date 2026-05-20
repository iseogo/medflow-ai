import { CommunicationStatus } from "@prisma/client";
import type { MissedCallTriggerReason } from "@/lib/missed-call/missed-call-statuses";

export type AiFollowUpStatus =
  | "PENDING"
  | "ORCHESTRATOR_QUEUED"
  | "NOTIFICATION_SENT"
  | "SUPERVISOR_OBSERVED"
  | "FAILED";

export type CallbackStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export type MissedCallMetadata = {
  missedCall: true;
  callerNumber: string;
  recordedAt: string;
  missedStatus: CommunicationStatus;
  triggerReason: MissedCallTriggerReason;
  phoneKey: string;
  clientIdentified: boolean;
  aiFollowUpStatus: AiFollowUpStatus;
  callbackStatus: CallbackStatus;
  provider?: string;
  externalRef?: string;
};

export function buildMissedCallMetadata(input: {
  phoneNumber: string;
  phoneKey: string;
  status: CommunicationStatus;
  triggerReason: MissedCallTriggerReason;
  clientIdentified: boolean;
  aiFollowUpStatus?: AiFollowUpStatus;
  callbackStatus?: CallbackStatus;
  provider?: string;
  externalRef?: string;
  existing?: Record<string, unknown> | null;
}): MissedCallMetadata {
  const base =
    input.existing && typeof input.existing === "object"
      ? (input.existing as Record<string, unknown>)
      : {};
  return {
    ...base,
    missedCall: true,
    callerNumber: input.phoneNumber,
    recordedAt:
      typeof base.recordedAt === "string" ? base.recordedAt : new Date().toISOString(),
    missedStatus: input.status,
    triggerReason: input.triggerReason,
    phoneKey: input.phoneKey,
    clientIdentified: input.clientIdentified,
    aiFollowUpStatus: input.aiFollowUpStatus ?? "PENDING",
    callbackStatus: input.callbackStatus ?? "PENDING",
    provider: input.provider ?? (base.provider as string | undefined),
    externalRef: input.externalRef ?? (base.externalRef as string | undefined),
  };
}

export function isOpenMissedCallMetadata(
  metadata: unknown
): metadata is MissedCallMetadata {
  if (!metadata || typeof metadata !== "object") return false;
  const m = metadata as MissedCallMetadata;
  return m.missedCall === true && m.callbackStatus !== "COMPLETED";
}
