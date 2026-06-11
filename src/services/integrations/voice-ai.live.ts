import {
  isRetellLive,
  isVapiLive,
  retellConfig,
  vapiConfig,
} from "@/lib/integrations/env";
import { formatClinicDateTime } from "@/lib/datetime";
import { IntegrationHttpError, integrationFetch } from "@/lib/integrations/http";
import type { AiVoiceReminderIntent } from "../voice-ai-reminder.service";

type LiveVoiceResult = {
  externalRef: string;
  connectStatus: "ANSWERED" | "NO_ANSWER" | "FAILED";
  answered: boolean;
  simulatedClientIntent: AiVoiceReminderIntent;
  durationSeconds?: number;
};

function parseIntentFromMetadata(
  meta: Record<string, unknown> | undefined
): AiVoiceReminderIntent {
  const raw = String(meta?.clientIntent ?? meta?.intent ?? "NONE").toUpperCase();
  if (raw === "CONFIRMED") return "CONFIRMED";
  if (raw === "CANCELLED") return "CANCELLED";
  if (raw === "RESCHEDULE_REQUESTED") return "RESCHEDULE_REQUESTED";
  return "NONE";
}

export async function vapiLiveReminderCall(input: {
  to: string;
  clientFirstName: string;
  appointmentAt: Date;
  providerName?: string | null;
}): Promise<LiveVoiceResult> {
  const cfg = vapiConfig();
  const body: Record<string, unknown> = {
    assistantId: cfg.assistantId,
    customer: { number: input.to },
    assistantOverrides: {
      variableValues: {
        clientFirstName: input.clientFirstName,
        appointmentAt: input.appointmentAt.toISOString(),
        appointmentAtSpoken: formatClinicDateTime(input.appointmentAt),
        providerName: input.providerName ?? "your provider",
      },
    },
  };
  if (cfg.phoneNumberId) {
    body.phoneNumberId = cfg.phoneNumberId;
  }

  const res = await integrationFetch("https://api.vapi.ai/call/phone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new IntegrationHttpError("Vapi call failed", res.status, text);
  }

  const json = JSON.parse(text) as {
    id: string;
    status?: string;
    metadata?: Record<string, unknown>;
  };

  const status = (json.status ?? "").toLowerCase();
  const answered =
    status === "ended" || status === "in-progress" || status === "queued";

  return {
    externalRef: json.id,
    connectStatus: answered ? "ANSWERED" : "NO_ANSWER",
    answered,
    simulatedClientIntent: parseIntentFromMetadata(json.metadata),
    durationSeconds: undefined,
  };
}

export async function retellLiveReminderCall(input: {
  to: string;
  clientFirstName: string;
  appointmentAt: Date;
  providerName?: string | null;
}): Promise<LiveVoiceResult> {
  const cfg = retellConfig();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim();

  const res = await integrationFetch(
    "https://api.retellai.com/v2/create-phone-call",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from_number: fromNumber,
        to_number: input.to,
        override_agent_id: cfg.agentId,
        retell_llm_dynamic_variables: {
          client_first_name: input.clientFirstName,
          appointment_at: input.appointmentAt.toISOString(),
          appointment_at_spoken: formatClinicDateTime(input.appointmentAt),
          provider_name: input.providerName ?? "your provider",
        },
      }),
    }
  );

  const text = await res.text();
  if (!res.ok) {
    throw new IntegrationHttpError("Retell call failed", res.status, text);
  }

  const json = JSON.parse(text) as {
    call_id: string;
    call_status?: string;
  };

  const answered =
    json.call_status === "ongoing" || json.call_status === "registered";

  return {
    externalRef: json.call_id,
    connectStatus: answered ? "ANSWERED" : "NO_ANSWER",
    answered,
    simulatedClientIntent: "NONE",
    durationSeconds: undefined,
  };
}

export async function voiceAiLiveReminderCall(input: {
  to: string;
  clientFirstName: string;
  appointmentAt: Date;
  providerName?: string | null;
}): Promise<LiveVoiceResult> {
  if (isVapiLive()) return vapiLiveReminderCall(input);
  if (isRetellLive()) return retellLiveReminderCall(input);
  throw new Error("No live voice AI provider configured");
}
