import { twilioConfig } from "@/lib/integrations/env";
import { IntegrationHttpError, integrationFetch } from "@/lib/integrations/http";

type LiveSmsResult = {
  externalRef: string;
  status: "SENT" | "DELIVERED" | "FAILED";
};

type LiveCallResult = {
  externalRef: string;
  status: "SENT" | "ANSWERED" | "NO_ANSWER" | "FAILED";
  durationSeconds?: number;
};

function basicAuthHeader(accountSid: string, authToken: string) {
  const token = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return `Basic ${token}`;
}

function formBody(data: Record<string, string>) {
  return new URLSearchParams(data).toString();
}

function mapCallStatus(twilioStatus: string): LiveCallResult["status"] {
  switch (twilioStatus) {
    case "completed":
    case "in-progress":
      return "ANSWERED";
    case "busy":
    case "no-answer":
    case "canceled":
      return "NO_ANSWER";
    case "failed":
      return "FAILED";
    default:
      return "SENT";
  }
}

export async function twilioLiveSendSms(input: {
  to: string;
  from?: string;
  body: string;
}): Promise<LiveSmsResult> {
  const { accountSid, authToken, phoneNumber } = twilioConfig();
  const res = await integrationFetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(accountSid, authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody({
        To: input.to,
        From: input.from ?? phoneNumber,
        Body: input.body,
      }),
    }
  );

  const text = await res.text();
  if (!res.ok) {
    throw new IntegrationHttpError("Twilio SMS failed", res.status, text);
  }

  const json = JSON.parse(text) as { sid: string; status: string };
  const status =
    json.status === "delivered" || json.status === "sent"
      ? "DELIVERED"
      : json.status === "failed" || json.status === "undelivered"
        ? "FAILED"
        : "SENT";

  return { externalRef: json.sid, status };
}

export async function twilioLivePlaceCall(input: {
  to: string;
  from?: string;
  direction: "INBOUND" | "OUTBOUND";
}): Promise<LiveCallResult> {
  const { accountSid, authToken, phoneNumber } = twilioConfig();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL;
  const statusCallback =
    appUrl && process.env.NODE_ENV === "production"
      ? `${appUrl.replace(/\/$/, "")}/api/webhooks/twilio/voice`
      : undefined;

  const body: Record<string, string> = {
    To: input.to,
    From: input.from ?? phoneNumber,
  };
  if (statusCallback) {
    body.StatusCallback = statusCallback;
    body.StatusCallbackMethod = "POST";
  }

  const res = await integrationFetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(accountSid, authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody(body),
    }
  );

  const text = await res.text();
  if (!res.ok) {
    throw new IntegrationHttpError("Twilio call failed", res.status, text);
  }

  const json = JSON.parse(text) as {
    sid: string;
    status: string;
    duration?: string;
  };

  return {
    externalRef: json.sid,
    status: mapCallStatus(json.status),
    durationSeconds: json.duration ? parseInt(json.duration, 10) : undefined,
  };
}
