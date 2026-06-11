/**
 * @jest-environment node
 */
import { buildAutoReply, classifySmsIntent } from "../sms-intent";

describe("classifySmsIntent", () => {
  it.each([
    ["yes", "CONFIRM"],
    ["Yes!", "CONFIRM"],
    ["Y", "CONFIRM"],
    ["confirmed", "CONFIRM"],
    ["Sounds good, see you there", "CONFIRM"],
    ["I'll be there", "CONFIRM"],
  ])("classifies %p as CONFIRM", (body, intent) => {
    expect(classifySmsIntent(body).intent).toBe(intent);
  });

  it.each([
    ["Can I reschedule?", "RESCHEDULE"],
    ["I need to change my appointment time", "RESCHEDULE"],
    ["can't make it tomorrow", "RESCHEDULE"],
    ["Is there a different time available", "RESCHEDULE"],
    ["running late, sorry!", "RESCHEDULE"],
  ])("classifies %p as RESCHEDULE", (body, intent) => {
    expect(classifySmsIntent(body).intent).toBe(intent);
  });

  it.each([
    ["Please cancel my appointment", "CANCEL"],
    ["I won't be coming in", "CANCEL"],
    ["cancelling for tomorrow", "CANCEL"],
  ])("classifies %p as CANCEL", (body, intent) => {
    expect(classifySmsIntent(body).intent).toBe(intent);
  });

  it.each([
    ["STOP", "STOP"],
    ["stop", "STOP"],
    ["Unsubscribe", "STOP"],
    ["opt out", "STOP"],
  ])("classifies %p as STOP", (body, intent) => {
    expect(classifySmsIntent(body).intent).toBe(intent);
  });

  it("does not treat appointment cancellation as STOP", () => {
    expect(classifySmsIntent("cancel my appointment").intent).toBe("CANCEL");
  });

  it.each([
    ["I want to talk to a human", "HUMAN_REQUEST"],
    ["Can someone call me back?", "HUMAN_REQUEST"],
    ["speak with a person please", "HUMAN_REQUEST"],
    ["is this a bot?", "HUMAN_REQUEST"],
    ["I need a real person", "HUMAN_REQUEST"],
  ])("classifies %p as HUMAN_REQUEST", (body, intent) => {
    expect(classifySmsIntent(body).intent).toBe(intent);
  });

  it.each([
    ["What should I bring to the visit?", "QUESTION"],
    ["Do you take Aetna insurance", "QUESTION"],
    ["where is the office located?", "QUESTION"],
  ])("classifies %p as QUESTION", (body, intent) => {
    expect(classifySmsIntent(body).intent).toBe(intent);
  });

  it("falls back to UNKNOWN for ambiguous messages", () => {
    expect(classifySmsIntent("the blue one").intent).toBe("UNKNOWN");
    expect(classifySmsIntent("").intent).toBe("UNKNOWN");
    expect(classifySmsIntent("   ").intent).toBe("UNKNOWN");
  });

  it("prefers human handoff over confirm-like phrasing", () => {
    expect(classifySmsIntent("ok but I want to speak to a person").intent).toBe(
      "HUMAN_REQUEST"
    );
  });
});

describe("buildAutoReply", () => {
  it("personalizes the confirm reply with name and appointment", () => {
    const reply = buildAutoReply("CONFIRM", {
      firstName: "Sarah",
      appointmentLabel: "Jun 12, 10:00 AM",
    });
    expect(reply).toContain("Sarah");
    expect(reply).toContain("Jun 12, 10:00 AM");
  });

  it("directs to 911 in the emergency template", () => {
    expect(buildAutoReply("EMERGENCY")).toContain("911");
  });

  it("never produces empty replies", () => {
    for (const kind of [
      "CONFIRM",
      "RESCHEDULE",
      "CANCEL",
      "HUMAN_REQUEST",
      "EMERGENCY",
      "FALLBACK",
    ] as const) {
      expect(buildAutoReply(kind).length).toBeGreaterThan(10);
      expect(buildAutoReply(kind).length).toBeLessThanOrEqual(320);
    }
  });
});
