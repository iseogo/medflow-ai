/**
 * Sentry — optional stub. Install `@sentry/nextjs` and set SENTRY_DSN to enable.
 * Keeps production builds working without Sentry dependencies.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  // Intentionally noop: add @sentry/nextjs and follow their Next.js wizard when ready.
}

export function captureException(_error: unknown, _context?: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN?.trim()) return;
}
