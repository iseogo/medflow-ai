/**
 * @jest-environment node
 */
import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import {
  validateMedflowWebhookSecret,
  validateTwilioSignature,
} from "../webhook-auth";

describe("validateMedflowWebhookSecret", () => {
  const prevSecret = process.env.WEBHOOK_SECRET;

  beforeAll(() => {
    process.env.WEBHOOK_SECRET = "test-secret";
  });
  afterAll(() => {
    process.env.WEBHOOK_SECRET = prevSecret;
  });

  function makeRequest(headers: Record<string, string>, body = "{}") {
    return new NextRequest("http://localhost/api/webhooks/test", {
      method: "POST",
      headers,
      body,
    });
  }

  it("accepts the secret header", () => {
    const req = makeRequest({ "x-medflow-webhook-secret": "test-secret" });
    expect(validateMedflowWebhookSecret(req).ok).toBe(true);
  });

  it("accepts a bearer token", () => {
    const req = makeRequest({ authorization: "Bearer test-secret" });
    expect(validateMedflowWebhookSecret(req).ok).toBe(true);
  });

  it("accepts a valid HMAC-SHA256 body signature", () => {
    const body = JSON.stringify({ event: "x" });
    const sig = createHmac("sha256", "test-secret").update(body).digest("hex");
    const req = makeRequest({ "x-medflow-signature": `sha256=${sig}` }, body);
    expect(validateMedflowWebhookSecret(req, body).ok).toBe(true);
  });

  it("rejects a wrong secret", () => {
    const req = makeRequest({ "x-medflow-webhook-secret": "nope" });
    const result = validateMedflowWebhookSecret(req);
    expect(result.ok).toBe(false);
  });
});

describe("validateTwilioSignature", () => {
  const prevToken = process.env.TWILIO_AUTH_TOKEN;

  beforeAll(() => {
    process.env.TWILIO_AUTH_TOKEN = "twilio-auth-token";
  });
  afterAll(() => {
    process.env.TWILIO_AUTH_TOKEN = prevToken;
  });

  const url = "https://example.com/api/webhooks/twilio/status";
  const rawBody = "CallSid=CA123&CallStatus=completed";

  /** Twilio signs url + concatenated sorted params with HMAC-SHA1 (base64). */
  function twilioSign(authToken: string): string {
    const params = new URLSearchParams(rawBody);
    let data = url;
    for (const key of Array.from(params.keys()).sort()) {
      data += key + params.get(key);
    }
    return createHmac("sha1", authToken).update(data).digest("base64");
  }

  function makeRequest(signature?: string) {
    return new NextRequest(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...(signature ? { "x-twilio-signature": signature } : {}),
      },
      body: rawBody,
    });
  }

  it("accepts a signature computed the way Twilio computes it", () => {
    const req = makeRequest(twilioSign("twilio-auth-token"));
    expect(validateTwilioSignature(req, rawBody, url).ok).toBe(true);
  });

  it("rejects a signature made with the wrong token", () => {
    const req = makeRequest(twilioSign("wrong-token"));
    expect(validateTwilioSignature(req, rawBody, url).ok).toBe(false);
  });

  it("rejects when the signature header is missing", () => {
    const req = makeRequest();
    expect(validateTwilioSignature(req, rawBody, url).ok).toBe(false);
  });
});

describe("validateTwilioSignature (SignalWire compatibility)", () => {
  const prevTwilio = process.env.TWILIO_AUTH_TOKEN;
  const prevSignalWire = process.env.SIGNALWIRE_API_TOKEN;

  beforeAll(() => {
    delete process.env.TWILIO_AUTH_TOKEN;
    process.env.SIGNALWIRE_API_TOKEN = "signalwire-api-token";
  });
  afterAll(() => {
    process.env.TWILIO_AUTH_TOKEN = prevTwilio;
    process.env.SIGNALWIRE_API_TOKEN = prevSignalWire;
  });

  const url = "https://example.com/api/webhooks/twilio/sms";
  const rawBody = "MessageSid=SM123&SmsStatus=received&From=%2B15551234567&Body=hello";

  function sign(token: string): string {
    const params = new URLSearchParams(rawBody);
    let data = url;
    for (const key of Array.from(params.keys()).sort()) {
      data += key + params.get(key);
    }
    return createHmac("sha1", token).update(data).digest("base64");
  }

  function makeRequest(headers: Record<string, string>) {
    return new NextRequest(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body: rawBody,
    });
  }

  it("accepts a SignalWire token signature on the x-signalwire-signature header", () => {
    const req = makeRequest({
      "x-signalwire-signature": sign("signalwire-api-token"),
    });
    expect(validateTwilioSignature(req, rawBody, url).ok).toBe(true);
  });

  it("accepts a SignalWire token signature on the x-twilio-signature header", () => {
    const req = makeRequest({
      "x-twilio-signature": sign("signalwire-api-token"),
    });
    expect(validateTwilioSignature(req, rawBody, url).ok).toBe(true);
  });

  it("rejects a signature made with an unknown token", () => {
    const req = makeRequest({ "x-signalwire-signature": sign("wrong-token") });
    expect(validateTwilioSignature(req, rawBody, url).ok).toBe(false);
  });
});
