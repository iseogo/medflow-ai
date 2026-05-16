/**
 * AI voice-first reminder calls — Vapi, Retell, or mock.
 */
import { isVoiceAiLive } from "@/lib/integrations/env";
import { safeLogContext } from "@/lib/integrations/safe-log";
import { voiceAiLiveReminderCall } from "./integrations/voice-ai.live";

export type AiVoiceReminderIntent =
  | "NONE"
  | "CONFIRMED"
  | "CANCELLED"
  | "RESCHEDULE_REQUESTED";

export type AiVoiceReminderResult = {
  externalRef: string;
  connectStatus: "ANSWERED" | "NO_ANSWER" | "FAILED";
  answered: boolean;
  simulatedClientIntent: AiVoiceReminderIntent;
  durationSeconds?: number;
  provider: string;
};

function readStubConnect(): boolean {
  const v = process.env.REMINDER_VOICE_STUB_CONNECT?.toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

function readStubIntent(): AiVoiceReminderIntent {
  const raw = (process.env.REMINDER_VOICE_STUB_INTENT ?? "NONE").toUpperCase();
  if (raw === "CONFIRMED") return "CONFIRMED";
  if (raw === "CANCELLED") return "CANCELLED";
  if (raw === "RESCHEDULE_REQUESTED") return "RESCHEDULE_REQUESTED";
  return "NONE";
}

async function mockReminderCall(): Promise<AiVoiceReminderResult> {
  const shouldConnect = readStubConnect();
  const intent = readStubIntent();

  if (!shouldConnect) {
    safeLogContext("voice_ai_mock", { connect: false });
    return {
      externalRef: `voice_ai_mock_noconnect_${Date.now()}`,
      connectStatus: "NO_ANSWER",
      answered: false,
      simulatedClientIntent: "NONE",
      provider: "voice_ai_mock",
    };
  }

  safeLogContext("voice_ai_mock", { connect: true, intent });
  return {
    externalRef: `voice_ai_mock_${Date.now()}`,
    connectStatus: "ANSWERED",
    answered: true,
    simulatedClientIntent: intent,
    durationSeconds: 90,
    provider: "voice_ai_mock",
  };
}

export const voiceAiReminderService = {
  mode(): "live" | "mock" {
    return isVoiceAiLive() ? "live" : "mock";
  },

  async placeAiReminderCall(input: {
    to: string;
    clientFirstName: string;
    appointmentAt: Date;
    providerName?: string | null;
  }): Promise<AiVoiceReminderResult> {
    if (!isVoiceAiLive()) {
      return mockReminderCall();
    }
    const live = await voiceAiLiveReminderCall(input);
    const provider = process.env.VAPI_API_KEY?.trim() ? "vapi" : "retell";
    return { ...live, provider };
  },
};

export default voiceAiReminderService;
