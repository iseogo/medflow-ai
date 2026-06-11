/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/audit", () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/missed-call/process-inbound-missed-webhook", () => ({
  processInboundMissedWebhook: jest.fn().mockResolvedValue({ recorded: false }),
}));

import { POST } from "../route";

describe("POST /api/webhooks/retell", () => {
  const prevSecret = process.env.WEBHOOK_SECRET;
  const prevAllow = process.env.MEDFLOW_WEBHOOK_ALLOW_UNAUTHENTICATED;

  beforeAll(() => {
    process.env.WEBHOOK_SECRET = "test-webhook-secret";
    process.env.MEDFLOW_WEBHOOK_ALLOW_UNAUTHENTICATED = "false";
  });

  afterAll(() => {
    process.env.WEBHOOK_SECRET = prevSecret;
    process.env.MEDFLOW_WEBHOOK_ALLOW_UNAUTHENTICATED = prevAllow;
  });

  it("rejects when secret header is wrong", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/retell", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-medflow-webhook-secret": "wrong",
      },
      body: JSON.stringify({ event: "test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepts valid secret and returns JSON", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/retell", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-medflow-webhook-secret": "test-webhook-secret",
      },
      body: JSON.stringify({ event: "call_ended" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    expect(json.channel).toBe("retell");
  });
});
