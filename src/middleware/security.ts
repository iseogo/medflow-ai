import { NextRequest, NextResponse } from "next/server";
import { applySecureHeaders } from "@/lib/security/secure-headers";
import {
  checkRateLimit,
  clientIpFromHeaders,
  rateLimitConfig,
} from "@/lib/security/rate-limit";
import { isPublicApiPath } from "@/lib/security/api-rbac";

export function applySecurityMiddleware(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  const secured = applySecureHeaders(response);
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith("/api/")) {
    return secured;
  }

  const cfg = rateLimitConfig();
  const ip = clientIpFromHeaders(request.headers);
  const isAuth = pathname.startsWith("/api/auth");
  const isWebhook = isPublicApiPath(pathname) && pathname.includes("/webhooks");

  const limit = isAuth
    ? cfg.authPerMinute
    : isWebhook
      ? cfg.webhookPerMinute
      : cfg.apiPerMinute;

  const bucketKey = `${ip}:${isAuth ? "auth" : isWebhook ? "webhook" : "api"}`;
  const rl = checkRateLimit({
    key: bucketKey,
    limit,
    windowMs: cfg.windowMs,
  });

  if (!rl.allowed) {
    return applySecureHeaders(
      NextResponse.json(
        { error: "Too many requests", retryAfterSec: rl.retryAfterSec },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        }
      )
    );
  }

  secured.headers.set("X-RateLimit-Remaining", String(rl.remaining));
  return secured;
}
