/**
 * In-memory sliding-window rate limiter (per IP + route prefix).
 * For multi-instance production, use Redis or edge rate limiting.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSec: number };

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(input.key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(input.key, {
      count: 1,
      resetAt: now + input.windowMs,
    });
    return { allowed: true, remaining: input.limit - 1 };
  }

  if (existing.count >= input.limit) {
    const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  existing.count += 1;
  return { allowed: true, remaining: input.limit - existing.count };
}

export function rateLimitConfig() {
  return {
    apiPerMinute: parseInt(process.env.RATE_LIMIT_API_PER_MINUTE ?? "120", 10) || 120,
    authPerMinute: parseInt(process.env.RATE_LIMIT_AUTH_PER_MINUTE ?? "20", 10) || 20,
    webhookPerMinute:
      parseInt(process.env.RATE_LIMIT_WEBHOOK_PER_MINUTE ?? "300", 10) || 300,
    windowMs: 60_000,
  };
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}
