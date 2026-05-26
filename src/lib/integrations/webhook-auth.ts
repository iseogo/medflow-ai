import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SECRET_HEADER = "x-medflow-webhook-secret";
const SIGNATURE_HEADER = "x-medflow-signature";

function envSecret(): string | undefined {
  const v =
    process.env.WEBHOOK_SECRET?.trim() ??
    process.env.MEDFLOW_WEBHOOK_SECRET?.trim();
  return v && v.length > 0 ? v : undefined;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Validates MedFlow webhook secret (header or Bearer token).
 * When WEBHOOK_SECRET is unset, rejects all requests (fail closed in production).
 * Set MEDFLOW_WEBHOOK_ALLOW_UNAUTHENTICATED=true only for local dev.
 */
export function validateMedflowWebhookSecret(
  request: NextRequest,
  rawBody?: string
): { ok: true } | { ok: false; response: NextResponse } {
  const secret = envSecret();
  const allowDev =
    process.env.MEDFLOW_WEBHOOK_ALLOW_UNAUTHENTICATED === "true" &&
    process.env.NODE_ENV !== "production";

  if (!secret) {
    if (allowDev) return { ok: true };
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 503 }
      ),
    };
  }

  const headerSecret = request.headers.get(SECRET_HEADER);
  const auth = request.headers.get("authorization");
  const bearer =
    auth?.startsWith("Bearer ") ? auth.slice(7).trim() : undefined;

  if (headerSecret && safeEqual(headerSecret, secret)) {
    return { ok: true };
  }
  if (bearer && safeEqual(bearer, secret)) {
    return { ok: true };
  }

  if (rawBody) {
    const sig = request.headers.get(SIGNATURE_HEADER);
    if (sig) {
      const expected = createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");
      const normalized = sig.replace(/^sha256=/, "");
      if (safeEqual(normalized, expected)) {
        return { ok: true };
      }
    }
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

/**
 * Twilio request signature validation (when TWILIO_AUTH_TOKEN is set).
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */
export function validateTwilioSignature(
  request: NextRequest,
  rawBody: string,
  url: string
): { ok: true } | { ok: false; response: NextResponse } {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) {
    const allowDev =
      process.env.MEDFLOW_WEBHOOK_ALLOW_UNAUTHENTICATED === "true" &&
      process.env.NODE_ENV !== "production";
    if (allowDev) return { ok: true };
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Twilio auth not configured" },
        { status: 503 }
      ),
    };
  }

  const signature = request.headers.get("x-twilio-signature");
  if (!signature) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing Twilio signature" }, { status: 401 }),
    };
  }

  const params = new URLSearchParams(rawBody);
  const sortedKeys = Array.from(params.keys()).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params.get(key);
  }

  // Twilio signs with HMAC-SHA1 (not SHA256) per https://www.twilio.com/docs/usage/security
  const expected = createHmac("sha1", authToken)
    .update(data)
    .digest("base64");

  if (safeEqual(signature, expected)) {
    return { ok: true };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Invalid Twilio signature" }, { status: 401 }),
  };
}

export async function readWebhookBody(request: NextRequest): Promise<string> {
  return request.text();
}
