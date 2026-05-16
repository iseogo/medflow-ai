/**
 * PLANNING ONLY — Phase 9 intelligent inbound scheduling orchestration interface.
 * Coordinates intake → safety triage → matching → availability → orchestrator proposals.
 * No runtime implementation. Do not import from API routes or services yet.
 *
 * All mutations must go through Master Orchestrator (Phase 3).
 * @see docs/phase9/COORDINATION.md
 */

import type {
  AppointmentBookPayload,
  BookingExecutionResult,
  SafetyTriageInput,
  SafetyTriageResult,
  SchedulingIntakePayload,
  SlotRecommendationInput,
  SlotRecommendationResult,
  VoiceSessionContext,
} from "./interfaces";
import type { IAvailabilityCheckingService } from "./availability-checking.service";
import type { IProviderMatchingService } from "./provider-matching.service";

export type InboundSchedulingStepResult =
  | { step: "INTAKE"; continue: boolean }
  | { step: "SAFETY_TRIAGE"; result: SafetyTriageResult }
  | { step: "MATCH"; providerProfileId?: string; requiresStaffReview: boolean }
  | { step: "SLOTS"; result: SlotRecommendationResult }
  | { step: "BOOK_PROPOSED"; proposalId: string }
  | { step: "HANDOFF"; staffInterventionId: string };

/**
 * Facade for inbound call scheduling. Composes matching + availability;
 * submits proposals via orchestrator bridge (future); never writes PHI to audit metadata.
 */
export interface IIntelligentSchedulingService {
  readonly matching: IProviderMatchingService;
  readonly availability: IAvailabilityCheckingService;

  startInboundSession(input: {
    callLogId: string;
    externalCallRef: string;
  }): Promise<VoiceSessionContext>;

  runSafetyTriage(input: SafetyTriageInput): Promise<SafetyTriageResult>;

  recommendSlots(input: SlotRecommendationInput): Promise<SlotRecommendationResult>;

  proposeBooking(input: {
    sessionId: string;
    clientId: string;
    intake: SchedulingIntakePayload;
    selectedSlot: { startIso: string; providerProfileId: string };
  }): Promise<{ proposalId: string }>;

  executeApprovedBooking(
    payload: AppointmentBookPayload
  ): Promise<BookingExecutionResult>;
}

/** Future implementation path: src/services/scheduling/intelligent-scheduling.service.ts */
