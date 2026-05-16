/**
 * Redact secrets and PHI from strings before logging or audit metadata.
 */

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{10,}/g,
  /Bearer\s+[a-zA-Z0-9._\-+/=]{8,}/gi,
  /api[_-]?key[=:]\s*["']?[\w-]+/gi,
  /password[=:]\s*["']?[^\s"']+/gi,
  /token[=:]\s*["']?[\w.-]+/gi,
  /AC[a-z0-9]{32}/gi,
  /\+1\d{10,}/g,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

export function redactSensitiveText(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}

export function safeIntegrationErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return redactSensitiveText(error.message).slice(0, 200);
  }
  return "integration_error";
}

export function safeLogContext(
  label: string,
  ctx: Record<string, string | number | boolean | undefined>
): void {
  const safe: Record<string, string | number | boolean> = { label };
  for (const [k, v] of Object.entries(ctx)) {
    if (v === undefined) continue;
    if (typeof v === "string") {
      safe[k] =
        k === "to" || k === "phone" || k === "email"
          ? "[redacted]"
          : redactSensitiveText(v).slice(0, 120);
    } else {
      safe[k] = v;
    }
  }
  console.info("[integration]", safe);
}
