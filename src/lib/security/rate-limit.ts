/**
 * In-memory sliding-window rate limiter (per IP + route prefix).
 *
 * WARNING: This limiter is process-local. It resets on restart and provides no
 * protection in multi-instance deployments (Vercel, horizontal scaling, etc.).
 * Before going to production at scale, replace with a Redis-backed or CDN-level
 * rate limiter (e.g. Upstash Redis, Vercel KV, or edge middleware).
 */

if (process.env.NODE_ENV === "production" && !process.env.RATE_LIMIT_BACKEND_CONFIGURED) {
  console.warn(
    "[medflow] WARNING: Using in-memory rate limiter in production. " +
    "Set RATE_LIMIT_BACKEND_CONFIGURED=redis once a distributed limiter is wired up. " +
    "See src/lib/security/rate-limit.ts for migration instructions."
  );
}

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
