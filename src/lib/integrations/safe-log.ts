/**
 * Integration logging — delegates to Phase 8 PHI-safe logger.
 */
import {
  phiSafeErrorMessage,
  phiSafeLog,
  redactPhiFromText,
} from "@/lib/security/phi-safe-log";

export const redactSensitiveText = redactPhiFromText;
export const safeIntegrationErrorMessage = phiSafeErrorMessage;
export const safeLogContext = phiSafeLog;
