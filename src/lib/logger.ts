/**
 * Minimal structured logger — no external transport (Sentry optional via monitoring/sentry).
 * Server-only; do not import from client components.
 */

type LogContext = Record<string, unknown> | undefined;

function line(level: string, msg: string, ctx?: LogContext) {
  const payload = ctx && Object.keys(ctx).length ? ` ${JSON.stringify(ctx)}` : "";
  return `[${level.toUpperCase()}] ${msg}${payload}`;
}

export const logger = {
  debug(msg: string, ctx?: LogContext) {
    if (process.env.LOG_LEVEL?.toLowerCase() === "debug") {
      console.debug(line("debug", msg, ctx));
    }
  },
  info(msg: string, ctx?: LogContext) {
    console.info(line("info", msg, ctx));
  },
  warn(msg: string, ctx?: LogContext) {
    console.warn(line("warn", msg, ctx));
  },
  error(msg: string, ctx?: LogContext) {
    console.error(line("error", msg, ctx));
  },
};
