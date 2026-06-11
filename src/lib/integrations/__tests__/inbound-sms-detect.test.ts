/**
 * @jest-environment node
 */
import { isInboundTwilioSmsPayload } from "../webhook-handler";

function params(entries: Record<string, string>) {
  return new URLSearchParams(entries);
}

describe("isInboundTwilioSmsPayload", () => {
  it("detects a Twilio inbound message (SmsStatus=received)", () => {
    expect(
      isInboundTwilioSmsPayload(
        params({
          MessageSid: "SM123",
          SmsStatus: "received",
          From: "+15551234567",
          To: "+15557654321",
          Body: "Can I reschedule?",
        })
      )
    ).toBe(true);
  });

  it("detects an inbound message with no status fields", () => {
    expect(
      isInboundTwilioSmsPayload(
        params({ From: "+15551234567", Body: "yes" })
      )
    ).toBe(true);
  });

  it("treats delivery status callbacks as outbound updates", () => {
    expect(
      isInboundTwilioSmsPayload(
        params({
          MessageSid: "SM123",
          MessageStatus: "delivered",
          From: "+15557654321",
          To: "+15551234567",
        })
      )
    ).toBe(false);
  });

  it("treats SmsStatus=delivered callbacks as outbound updates", () => {
    expect(
      isInboundTwilioSmsPayload(
        params({
          MessageSid: "SM123",
          SmsStatus: "delivered",
          From: "+15557654321",
          Body: "",
        })
      )
    ).toBe(false);
  });

  it("ignores payloads without a sender", () => {
    expect(isInboundTwilioSmsPayload(params({ Body: "hello" }))).toBe(false);
  });

  it("accepts an inbound message with empty body (e.g. MMS placeholder)", () => {
    expect(
      isInboundTwilioSmsPayload(
        params({ From: "+15551234567", Body: "", SmsStatus: "received" })
      )
    ).toBe(true);
  });
});
