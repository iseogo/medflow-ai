/**
 * Phase 9 — Scheduling service interfaces (PLANNING ONLY)
 *
 * These types define contracts for future implementation.
 * No services import this module for runtime behavior yet.
 *
 * @see docs/phase9/SERVICE-INTERFACES.md
 * @see README-PHASE9.md
 */

// ---------------------------------------------------------------------------
// Enums (mirror planned Prisma enums — not generated until migration)
// ---------------------------------------------------------------------------

export type SchedulingUrgency = "ROUTINE" | "SOON" | "URGENT" | "EMERGENCY";

export type BookingSource = "STAFF" | "VOICE_AI" | "SMS_AI" | "WALK_IN" | "N8N";

export type SchedulingCallSessionStatus =
  | "GREETING"
  | "IDENTIFY_CLIENT"
  | "COLLECT_INTAKE"
  | "SAFETY_TRIAGE"
  | "MATCH_PROVIDER"
  | "OFFER_SLOTS"
  | "CONFIRM_BOOKING"
  | "COMPLETED"
  | "ESCALATED"
  | "ABANDONED";

export type GenderPreference = "NO_PREFERENCE" | "FEMALE" | "MALE" | "NON_BINARY";

export type SafetyTriageOutcome =
  | "CONTINUE_SCHEDULING"
  | "STAFF_REVIEW_REQUIRED"
  | "EMERGENCY_HALT";

export type SchedulingProposalActionType =
  | "PROPOSE_CLIENT_UPSERT"
  | "PROPOSE_SCHEDULING_INTAKE"
  | "PROPOSE_PROVIDER_MATCH"
  | "PROPOSE_SLOT_HOLD"
  | "PROPOSE_APPOINTMENT_BOOK"
  | "ESCALATE_TO_STAFF"
  | "HALT_AUTOMATION";

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export type SchedulingIntakePayload = {
  fullName: string;
  phone: string;
  dateOfBirth?: string;
  reasonForVisit: string;
  symptomSummary?: string;
  urgencyLevel: SchedulingUrgency;
  genderPreference?: GenderPreference;
  preferredTimeWindow?: {
    startIso?: string;
    endIso?: string;
    notes?: string;
  };
  serviceTypeCode?: string;
  clinicLocationId?: string;
};

export type ClientIdentificationInput = {
  phone: string;
  dateOfBirth?: string;
  fullName?: string;
};

export type ClientIdentificationResult =
  | { status: "FOUND"; clientId: string }
  | { status: "NOT_FOUND"; createProposalRequired: true }
  | { status: "AMBIGUOUS"; candidateClientIds: string[] };

// ---------------------------------------------------------------------------
// Safety triage (not clinical diagnosis)
// ---------------------------------------------------------------------------

export type SafetyTriageInput = {
  intake: SchedulingIntakePayload;
  transcriptSnippet?: string;
};

export type SafetyTriageResult = {
  outcome: SafetyTriageOutcome;
  urgencyLevel: SchedulingUrgency;
  emergencyDetected: boolean;
  matchedTermCount?: number;
  staffInterventionReason?: string;
  patientScript: string;
};

// ---------------------------------------------------------------------------
// Provider directory & matching
// ---------------------------------------------------------------------------

export type ProviderProfileView = {
  providerProfileId: string;
  userId: string;
  displayName: string;
  gender?: string;
  roleTitle: string;
  specialty: string;
  skills: string[];
  serviceTypeIds: string[];
  clinicLocationId: string;
  maxDailyAppointments: number;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
};

export type ProviderMatchInput = {
  intake: SchedulingIntakePayload;
  clientId: string;
  clinicLocationId: string;
  serviceTypeCode: string;
};

export type ProviderMatchCandidate = {
  providerProfileId: string;
  score: number;
  reasonCodes: string[];
};

export type ProviderMatchResult = {
  candidates: ProviderMatchCandidate[];
  selectedProviderId?: string;
  confidence: number;
  requiresStaffReview: boolean;
};

// ---------------------------------------------------------------------------
// Availability & slots
// ---------------------------------------------------------------------------

export type AvailabilityQuery = {
  providerProfileId: string;
  serviceTypeCode: string;
  clinicLocationId: string;
  rangeStartIso: string;
  rangeEndIso: string;
  preferredTimeWindow?: SchedulingIntakePayload["preferredTimeWindow"];
};

export type AvailableSlot = {
  startIso: string;
  endIso: string;
  providerProfileId: string;
  providerDisplayName: string;
};

export type SlotRecommendationInput = {
  match: ProviderMatchResult;
  availabilityQueries: AvailabilityQuery[];
  maxOffers?: number;
};

export type SlotRecommendationResult = {
  offeredSlots: AvailableSlot[];
  noAvailability: boolean;
  messageForPatient?: string;
};

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export type AppointmentBookPayload = {
  clientId: string;
  providerProfileId: string;
  serviceTypeCode: string;
  scheduledAtIso: string;
  durationMinutes: number;
  urgencyLevel: SchedulingUrgency;
  bookingSource: BookingSource;
  schedulingSessionId: string;
  callLogId?: string;
  reason?: string;
  requiresStaffReview: boolean;
};

export type BookingExecutionResult = {
  appointmentId: string;
  reminderScheduleEnqueued: boolean;
  confirmationProposed: boolean;
};

// ---------------------------------------------------------------------------
// Voice session
// ---------------------------------------------------------------------------

export type VoiceSessionContext = {
  sessionId: string;
  callLogId: string;
  status: SchedulingCallSessionStatus;
  clientId?: string;
};

// ---------------------------------------------------------------------------
// Service interfaces (implement in Phase 9+ build)
// ---------------------------------------------------------------------------

export interface IVoiceSessionService {
  startSession(input: { callLogId: string; externalCallRef: string }): Promise<VoiceSessionContext>;
  advanceStatus(sessionId: string, status: SchedulingCallSessionStatus): Promise<VoiceSessionContext>;
  attachClient(sessionId: string, clientId: string): Promise<void>;
  complete(sessionId: string): Promise<void>;
  escalate(sessionId: string, reason: string): Promise<{ staffInterventionId: string }>;
}

export interface IIntakeCollectorService {
  identifyClient(input: ClientIdentificationInput): Promise<ClientIdentificationResult>;
  validateIntake(payload: Partial<SchedulingIntakePayload>): {
    valid: boolean;
    missingFields: string[];
  };
  buildIntakeProposal(
    sessionId: string,
    payload: SchedulingIntakePayload
  ): Promise<{ actionType: "PROPOSE_SCHEDULING_INTAKE"; payload: SchedulingIntakePayload }>;
}

export interface ISafetyTriageService {
  evaluate(input: SafetyTriageInput): Promise<SafetyTriageResult>;
}

export interface IProviderMatchingService {
  match(input: ProviderMatchInput): Promise<ProviderMatchResult>;
}

export interface IAvailabilityEngineService {
  findSlots(query: AvailabilityQuery): Promise<AvailableSlot[]>;
  isSlotValid(slot: AvailableSlot, query: AvailabilityQuery): Promise<boolean>;
}

export interface ISlotRecommendationService {
  recommend(input: SlotRecommendationInput): Promise<SlotRecommendationResult>;
}

export interface IBookingExecutionService {
  executeAfterApproval(payload: AppointmentBookPayload): Promise<BookingExecutionResult>;
}

export interface ISchedulingOrchestratorBridge {
  submitProposal(input: {
    agentType: "VOICE_CALL_AI" | "INTAKE_AI" | "APPOINTMENT_AI";
    actionType: SchedulingProposalActionType;
    clientId: string;
    callLogId?: string;
    proposedPayload: Record<string, unknown>;
    description?: string;
  }): Promise<{ proposalId: string; status: string }>;
}
