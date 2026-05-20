import {
  parseInboundMissedWebhookPayload,
  resolveMissedCallStatusFromWebhook,
  shouldTreatAsMissedInbound,
} from "../missed-call-handler";

describe("missed-call-handler", () => {
  it("maps no-answer variants", () => {
    expect(resolveMissedCallStatusFromWebhook("no-answer")).toBe("NO_ANSWER");
    expect(resolveMissedCallStatusFromWebhook("NO_ANSWER")).toBe("NO_ANSWER");
    expect(shouldTreatAsMissedInbound("busy")).toBe(true);
  });

  it("maps abandoned and failed", () => {
    expect(resolveMissedCallStatusFromWebhook("abandoned")).toBe("ABANDONED");
    expect(resolveMissedCallStatusFromWebhook("failed")).toBe("FAILED");
    expect(shouldTreatAsMissedInbound("missed")).toBe(true);
  });

  it("returns null for non-missed raw statuses", () => {
    expect(resolveMissedCallStatusFromWebhook("completed")).toBeNull();
    expect(shouldTreatAsMissedInbound("completed")).toBe(false);
  });

  it("parses inbound webhook payload with phone and status", () => {
    const parsed = parseInboundMissedWebhookPayload({
      From: "+13125550101",
      CallStatus: "no-answer",
      CallSid: "CA123",
    });
    expect(parsed?.phoneNumber).toBe("+13125550101");
    expect(parsed?.status).toBe("NO_ANSWER");
    expect(parsed?.externalRef).toBe("CA123");
  });

  it("parses Retell-style call_ended as missed", () => {
    const parsed = parseInboundMissedWebhookPayload(
      { event: "call_ended", from_number: "+13125559999" },
      { provider: "retell" }
    );
    expect(parsed?.status).toBe("NO_ANSWER");
    expect(parsed?.phoneNumber).toBe("+13125559999");
  });
});
