import { logger } from "@/lib/logger";
import { sanitizeMetadataForAudit } from "@/lib/security/phi-safe-log";

/** Structured inbound-call workflow logging (PHI-safe). */
export function inboundCallDebug(
  step: string,
  ctx?: Record<string, unknown>
) {
  const safe = ctx
    ? (sanitizeMetadataForAudit(ctx) as Record<string, unknown>)
    : undefined;
  logger.info(`inbound_call:${step}`, safe);
}
