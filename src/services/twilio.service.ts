/**
 * Twilio SMS + Voice — live only when MOCK_MODE is off and credentials are set.
 */

import { isTwilioLive, smsProviderName } from "@/lib/integrations/env";
import { safeLogContext } from "@/lib/integrations/safe-log";
import {
  twilioLivePlaceCall,
  twilioLiveSendSms,
} from "./integrations/twilio.live";

export type StubCallResult = {
  externalRef: string;
  status: "SENT" | "ANSWERED" | "NO_ANSWER" | "FAILED";
  durationSeconds?: number;
  provider: string;
};

export type StubSmsResult = {
  externalRef: string;
  status: "SENT" | "DELIVERED" | "FAILED";
  provider: string;
};

const STUB_DELAY_MS = 50;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stubId(prefix: string) {
  return `${prefix}_mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function stubSendSms(input: {
  body: string;
}): Promise<StubSmsResult> {
  await delay(STUB_DELAY_MS);
  safeLogContext("twilio_sms_mock", { bodyLength: input.body.length });
  return {
    externalRef: stubId("sms"),
    status: "DELIVERED",
    provider: "twilio_mock",
  };
}

async function stubPlaceCall(input: {
  direction: "INBOUND" | "OUTBOUND";
}): Promise<StubCallResult> {
  await delay(STUB_DELAY_MS);
  safeLogContext("twilio_call_mock", { direction: input.direction });
  return {
    externalRef: stubId("call"),
    status: input.direction === "OUTBOUND" ? "ANSWERED" : "SENT",
    durationSeconds: input.direction === "OUTBOUND" ? 120 : undefined,
    provider: "twilio_mock",
  };
}

export const twilioService = {
  mode(): "live" | "mock" {
    return isTwilioLive() ? "live" : "mock";
  },

  async sendSms(input: {
    to: string;
    from?: string;
    body: string;
  }): Promise<StubSmsResult> {
    if (!isTwilioLive()) {
      return stubSendSms({ body: input.body });
    }
    const result = await twilioLiveSendSms(input);
    return { ...result, provider: smsProviderName() };
  },

  async placeCall(input: {
    to: string;
    from?: string;
    direction: "INBOUND" | "OUTBOUND";
  }): Promise<StubCallResult> {
    if (!isTwilioLive()) {
      return stubPlaceCall({ direction: input.direction });
    }
    const result = await twilioLivePlaceCall(input);
    return { ...result, provider: smsProviderName() };
  },
};

export default twilioService;
