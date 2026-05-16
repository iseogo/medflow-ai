/**
 * AI safety guardrails — not clinical advice; identify as AI; escalate emergencies.
 */

import { detectEmergencyLanguage } from "@/lib/emergency-detect";

export const AI_IDENTITY_DISCLOSURE =
  "I am an AI assistant for MedFlow scheduling and logistics. I cannot provide medical diagnosis or treatment advice.";

export const EMERGENCY_SERVICES_GUIDANCE =
  "If you are experiencing a medical emergency, call 911 (or your local emergency number) immediately and seek emergency care. A staff member will also be notified.";

const CLINICAL_ADVICE_PATTERNS = [
  /\byou\s+have\s+(?:a\s+)?[\w\s]{3,40}(?:disease|condition|disorder|infection)\b/i,
  /\b(?:diagnos(?:is|ed)|prognosis)\b/i,
  /\b(?:take|prescribe|dosage|mg\s+of)\s+[\w\s]{2,30}(?:daily|twice|medication|antibiotic)\b/i,
  /\b(?:treatment\s+plan|medical\s+advice)\b/i,
  /\bstop\s+taking\s+your\b/i,
];

export type AiSafetyCheckResult =
  | { ok: true }
  | { ok: false; code: string; message: string; escalate: boolean };

export function getAiSafetySystemPromptAddition(): string {
  return [
    AI_IDENTITY_DISCLOSURE,
    "Never diagnose conditions or recommend treatments, medications, or dosages.",
    "If the user describes an emergency, tell them to call 911 immediately and escalate to staff.",
    "Always defer clinical questions to licensed healthcare professionals.",
  ].join(" ");
}

export function validateAiUserFacingContent(text: string): AiSafetyCheckResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true };

  for (const pattern of CLINICAL_ADVICE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        ok: false,
        code: "CLINICAL_ADVICE_BLOCKED",
        message:
          "Content appears to contain diagnosis or treatment advice. Escalate to clinical staff.",
        escalate: true,
      };
    }
  }

  const emergency = detectEmergencyLanguage(trimmed);
  if (emergency.isEmergency) {
    return {
      ok: false,
      code: "EMERGENCY_DETECTED",
      message: EMERGENCY_SERVICES_GUIDANCE,
      escalate: true,
    };
  }

  return { ok: true };
}

export function validateAgentProposalContent(input: {
  description?: string;
  contentForEmergencyScan?: string;
  proposedPayload?: Record<string, unknown>;
}): AiSafetyCheckResult {
  const parts = [
    input.description,
    input.contentForEmergencyScan,
    typeof input.proposedPayload?.messageBody === "string"
      ? input.proposedPayload.messageBody
      : undefined,
    typeof input.proposedPayload?.body === "string"
      ? input.proposedPayload.body
      : undefined,
  ].filter(Boolean) as string[];

  for (const part of parts) {
    const check = validateAiUserFacingContent(part);
    if (!check.ok) return check;
  }

  return { ok: true };
}

export function emergencyEscalationGuardrails(matchedTerms: string[]) {
  return {
    haltAutomation: true,
    staffInterventionStatus: "URGENT" as const,
    patientMessage: EMERGENCY_SERVICES_GUIDANCE,
    aiDisclosure: AI_IDENTITY_DISCLOSURE,
    matchedTermsCount: matchedTerms.length,
  };
}
