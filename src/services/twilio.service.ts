/**
 * Twilio stub — no real API calls. Safe for local/dev Phase 2.
 */

export type StubCallResult = {
  externalRef: string;
  status: "SENT" | "ANSWERED" | "NO_ANSWER" | "FAILED";
  durationSeconds?: number;
};

export type StubSmsResult = {
  externalRef: string;
  status: "SENT" | "DELIVERED" | "FAILED";
};

const STUB_DELAY_MS = 50;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stubId(prefix: string) {
  return `${prefix}_stub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const twilioService = {
  async sendSms(input: {
    to: string;
    from?: string;
    body: string;
  }): Promise<StubSmsResult> {
    await delay(STUB_DELAY_MS);
    console.info("[twilio_stub] SMS", { to: input.to, bodyLength: input.body.length });
    return {
      externalRef: stubId("sms"),
      status: "DELIVERED",
    };
  },

  async placeCall(input: {
    to: string;
    from?: string;
    direction: "INBOUND" | "OUTBOUND";
  }): Promise<StubCallResult> {
    await delay(STUB_DELAY_MS);
    console.info("[twilio_stub] Call", { to: input.to, direction: input.direction });
    return {
      externalRef: stubId("call"),
      status: input.direction === "OUTBOUND" ? "ANSWERED" : "SENT",
      durationSeconds: input.direction === "OUTBOUND" ? 120 : undefined,
    };
  },
};

export default twilioService;
