import { isOpenAiLive, openAiConfig } from "@/lib/integrations/env";
import { IntegrationHttpError, integrationFetch } from "@/lib/integrations/http";
import { safeLogContext } from "@/lib/integrations/safe-log";

export type OpenAiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenAiChatResult = {
  content: string;
  model: string;
  mode: "live" | "mock";
};

const STUB_DELAY_MS = 40;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mockChat(messages: OpenAiChatMessage[]): Promise<OpenAiChatResult> {
  await delay(STUB_DELAY_MS);
  safeLogContext("openai_mock", { messageCount: messages.length });
  return {
    content: "[mock] Integration response placeholder.",
    model: "mock",
    mode: "mock",
  };
}

async function liveChat(
  messages: OpenAiChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<OpenAiChatResult> {
  const { apiKey, model } = openAiConfig();
  const res = await integrationFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 1024,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new IntegrationHttpError("OpenAI request failed", res.status, "[redacted]");
  }

  const json = JSON.parse(text) as {
    choices: { message: { content: string } }[];
    model: string;
  };

  return {
    content: json.choices[0]?.message?.content ?? "",
    model: json.model,
    mode: "live",
  };
}

export const openAiService = {
  mode(): "live" | "mock" {
    return isOpenAiLive() ? "live" : "mock";
  },

  async chat(
    messages: OpenAiChatMessage[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<OpenAiChatResult> {
    if (!isOpenAiLive()) {
      return mockChat(messages);
    }
    return liveChat(messages, options);
  },
};

export default openAiService;
