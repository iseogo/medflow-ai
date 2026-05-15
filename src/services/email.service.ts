/**
 * Email stub — no Gmail/SMTP. Safe mock for Phase 2.
 */

export type StubEmailResult = {
  externalRef: string;
  status: "SENT" | "DELIVERED" | "BOUNCED" | "FAILED";
};

const STUB_DELAY_MS = 50;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stubId() {
  return `email_stub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const emailService = {
  async sendEmail(input: {
    to: string;
    from?: string;
    subject: string;
    body: string;
  }): Promise<StubEmailResult> {
    await delay(STUB_DELAY_MS);
    console.info("[email_stub] Email", {
      to: input.to,
      subject: input.subject,
      bodyLength: input.body.length,
    });
    return {
      externalRef: stubId(),
      status: "DELIVERED",
    };
  },
};

export default emailService;
