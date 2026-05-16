/**
 * PHI-safe logging — redact identifiers before console, audit metadata, or errors.
 * Server-side only.
 */
import type { Prisma } from "@prisma/client";

const PHI_PATTERNS: RegExp[] = [
  /\+1\d{10,}/g,
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\bMRN[:\s#-]*[\w-]+/gi,
];

const SECRET_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{10,}/g,
  /Bearer\s+[a-zA-Z0-9._\-+/=]{8,}/gi,
  /api[_-]?key[=:]\s*["']?[\w-]+/gi,
  /password[=:]\s*["']?[^\s"']+/gi,
  /token[=:]\s*["']?[\w.-]+/gi,
  /AC[a-z0-9]{32}/gi,
];

const REDACTED_KEYS = new Set([
  "phone",
  "email",
  "to",
  "from",
  "toNumber",
  "fromNumber",
  "toEmail",
  "fromEmail",
  "messageBody",
  "body",
  "subject",
  "firstName",
  "lastName",
  "name",
  "mrn",
  "dateOfBirth",
  "addressLine1",
  "addressLine2",
  "transcript",
  "contentForEmergencyScan",
  "description",
]);

export function redactPhiFromText(input: string): string {
  let out = input;
  for (const pattern of [...SECRET_PATTERNS, ...PHI_PATTERNS]) {
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}

export function sanitizeLogValue(key: string, value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (REDACTED_KEYS.has(key)) return "[redacted]";
  if (typeof value === "string") {
    return redactPhiFromText(value).slice(0, 200);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return { count: value.length };
  }
  if (typeof value === "object") {
    return sanitizeMetadataForAudit(value as Record<string, unknown>);
  }
  return "[redacted]";
}

export function sanitizeMetadataForAudit(
  metadata: Record<string, unknown> | undefined | null
): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    out[k] = sanitizeLogValue(k, v);
  }
  return out as Prisma.InputJsonValue;
}

export function phiSafeLog(
  label: string,
  ctx: Record<string, string | number | boolean | undefined>
): void {
  const safe: Record<string, string | number | boolean> = { label };
  for (const [k, v] of Object.entries(ctx)) {
    if (v === undefined) continue;
    const sanitized = sanitizeLogValue(k, v);
    if (
      typeof sanitized === "string" ||
      typeof sanitized === "number" ||
      typeof sanitized === "boolean"
    ) {
      safe[k] = sanitized;
    } else {
      safe[k] = "[redacted]";
    }
  }
  console.info("[medflow]", safe);
}

export function phiSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return redactPhiFromText(error.message).slice(0, 200);
  }
  return "error";
}
