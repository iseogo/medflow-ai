import {
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
});
