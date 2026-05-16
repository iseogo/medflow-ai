/**
 * Email — Gmail or SendGrid when live; mock when MOCK_MODE or missing credentials.
 */

import { isEmailLive } from "@/lib/integrations/env";
import { safeLogContext } from "@/lib/integrations/safe-log";
import { emailLiveSend } from "./integrations/email.live";

export type StubEmailResult = {
  externalRef: string;
  status: "SENT" | "DELIVERED" | "BOUNCED" | "FAILED";
  provider: string;
};

const STUB_DELAY_MS = 50;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stubId() {
  return `email_mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function stubSendEmail(input: {
  subject: string;
  body: string;
}): Promise<StubEmailResult> {
  await delay(STUB_DELAY_MS);
  safeLogContext("email_mock", {
    subjectLength: input.subject.length,
    bodyLength: input.body.length,
  });
  return {
    externalRef: stubId(),
    status: "DELIVERED",
    provider: "email_mock",
  };
}

export const emailService = {
  mode(): "live" | "mock" {
    return isEmailLive() ? "live" : "mock";
  },

  async sendEmail(input: {
    to: string;
    from?: string;
    subject: string;
    body: string;
  }): Promise<StubEmailResult> {
    if (!isEmailLive()) {
      return stubSendEmail({
        subject: input.subject,
        body: input.body,
      });
    }
    const result = await emailLiveSend(input);
    const provider = process.env.SENDGRID_API_KEY?.trim()
      ? "sendgrid"
      : "gmail";
    return { ...result, provider };
  },
};

export default emailService;
