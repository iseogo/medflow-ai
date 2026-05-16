import {
  emailFromAddress,
  gmailOAuthConfig,
  isGmailLive,
  isSendGridLive,
} from "@/lib/integrations/env";
import { IntegrationHttpError, integrationFetch } from "@/lib/integrations/http";
type LiveEmailResult = {
  externalRef: string;
  status: "SENT" | "DELIVERED" | "BOUNCED" | "FAILED";
};

async function getGoogleAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await integrationFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new IntegrationHttpError("Google token refresh failed", res.status, text);
  }
  const json = JSON.parse(text) as { access_token: string };
  return json.access_token;
}

function toBase64Url(str: string) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildMimeMessage(input: {
  to: string;
  from: string;
  subject: string;
  body: string;
}) {
  const lines = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.body,
  ];
  return lines.join("\r\n");
}

export async function gmailLiveSendEmail(input: {
  to: string;
  from?: string;
  subject: string;
  body: string;
}): Promise<LiveEmailResult> {
  const cfg = gmailOAuthConfig();
  const accessToken = await getGoogleAccessToken(
    cfg.clientId,
    cfg.clientSecret,
    cfg.refreshToken
  );
  const from =
    input.from ?? cfg.fromEmail ?? emailFromAddress() ?? "noreply@medflow.ai";
  const raw = toBase64Url(
    buildMimeMessage({ to: input.to, from, subject: input.subject, body: input.body })
  );

  const res = await integrationFetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    }
  );

  const text = await res.text();
  if (!res.ok) {
    throw new IntegrationHttpError("Gmail send failed", res.status, text);
  }

  const json = JSON.parse(text) as { id: string };
  return { externalRef: json.id, status: "DELIVERED" };
}

export async function sendGridLiveSendEmail(input: {
  to: string;
  from?: string;
  subject: string;
  body: string;
}): Promise<LiveEmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY!.trim();
  const from =
    input.from ?? emailFromAddress() ?? "noreply@medflow.ai";

  const res = await integrationFetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: from },
      subject: input.subject,
      content: [{ type: "text/plain", value: input.body }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new IntegrationHttpError("SendGrid send failed", res.status, text);
  }

  const messageId = res.headers.get("x-message-id") ?? `sendgrid_${Date.now()}`;
  return { externalRef: messageId, status: "DELIVERED" };
}

export async function emailLiveSend(input: {
  to: string;
  from?: string;
  subject: string;
  body: string;
}): Promise<LiveEmailResult> {
  if (isGmailLive()) return gmailLiveSendEmail(input);
  if (isSendGridLive()) return sendGridLiveSendEmail(input);
  throw new Error("No live email provider configured");
}
