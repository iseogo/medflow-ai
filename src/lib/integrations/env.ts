/**
 * Server-only integration configuration. Never import from client components.
 */

export type IntegrationMode = "live" | "mock";

export type IntegrationHealthStatus =
  | "mock"
  | "not_configured"
  | "configured"
  | "healthy";

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

/** Fail fast with a clear message instead of passing undefined credentials to providers. */
function requireEnv(key: string): string {
  const v = env(key);
  if (!v) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return v;
}

function envTruthy(key: string): boolean {
  const v = env(key)?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Global kill-switch — defaults to true when unset (safe local dev). */
export function isMockModeForced(): boolean {
  const raw = process.env.MOCK_MODE;
  if (raw === undefined || raw.trim() === "") return true;
  const v = raw.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return v === "1" || v === "true" || v === "yes";
}

/** Live outbound calls only when mock is off AND credentials exist. */
export function canUseLiveIntegrations(): boolean {
  return !isMockModeForced();
}

export function isSignalWireConfigured(): boolean {
  return Boolean(
    env("SIGNALWIRE_SPACE_URL") &&
      env("SIGNALWIRE_PROJECT_ID") &&
      env("SIGNALWIRE_API_TOKEN") &&
      env("SIGNALWIRE_PHONE_NUMBER")
  );
}

export function isTwilioConfigured(): boolean {
  return (
    isSignalWireConfigured() ||
    Boolean(
      env("TWILIO_ACCOUNT_SID") &&
        env("TWILIO_AUTH_TOKEN") &&
        env("TWILIO_PHONE_NUMBER")
    )
  );
}

/** Active SMS/voice provider — SignalWire wins when both are configured. */
export function smsProviderName(): "signalwire" | "twilio" {
  return isSignalWireConfigured() ? "signalwire" : "twilio";
}

export function isGmailConfigured(): boolean {
  return Boolean(
    env("GMAIL_CLIENT_ID") &&
      env("GMAIL_CLIENT_SECRET") &&
      env("GMAIL_REFRESH_TOKEN")
  );
}

export function isSendGridConfigured(): boolean {
  return Boolean(env("SENDGRID_API_KEY"));
}

export function isEmailConfigured(): boolean {
  return isGmailConfigured() || isSendGridConfigured();
}

export function isN8nConfigured(): boolean {
  return Boolean(env("N8N_BASE_URL"));
}

export function isVapiConfigured(): boolean {
  return Boolean(env("VAPI_API_KEY") && env("VAPI_ASSISTANT_ID"));
}

export function isRetellConfigured(): boolean {
  return Boolean(env("RETELL_API_KEY") && env("RETELL_AGENT_ID"));
}

export function isVoiceAiConfigured(): boolean {
  return isVapiConfigured() || isRetellConfigured();
}

export function isOpenAiConfigured(): boolean {
  return Boolean(env("OPENAI_API_KEY"));
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    env("GOOGLE_CLIENT_ID") &&
      env("GOOGLE_CLIENT_SECRET") &&
      (env("GOOGLE_REFRESH_TOKEN") || env("GMAIL_REFRESH_TOKEN"))
  );
}

export function isWebhookSecretConfigured(): boolean {
  return Boolean(env("WEBHOOK_SECRET") ?? env("MEDFLOW_WEBHOOK_SECRET"));
}

export function isTwilioLive(): boolean {
  return canUseLiveIntegrations() && isTwilioConfigured();
}

export function isGmailLive(): boolean {
  return canUseLiveIntegrations() && isGmailConfigured();
}

export function isSendGridLive(): boolean {
  return canUseLiveIntegrations() && isSendGridConfigured();
}

export function isEmailLive(): boolean {
  return canUseLiveIntegrations() && isEmailConfigured();
}

export function isN8nLive(): boolean {
  return canUseLiveIntegrations() && isN8nConfigured();
}

export function isVapiLive(): boolean {
  return canUseLiveIntegrations() && isVapiConfigured();
}

export function isRetellLive(): boolean {
  return canUseLiveIntegrations() && isRetellConfigured();
}

export function isVoiceAiLive(): boolean {
  return canUseLiveIntegrations() && isVoiceAiConfigured();
}

export function isOpenAiLive(): boolean {
  return canUseLiveIntegrations() && isOpenAiConfigured();
}

export function isGoogleCalendarLive(): boolean {
  return canUseLiveIntegrations() && isGoogleCalendarConfigured();
}

function resolveHealth(configured: boolean): IntegrationHealthStatus {
  if (isMockModeForced()) {
    return configured ? "configured" : "mock";
  }
  if (!configured) return "not_configured";
  return "healthy";
}

export function integrationDashboardSnapshot() {
  return {
    mockMode: isMockModeForced(),
    canUseLive: canUseLiveIntegrations(),
    providers: {
      twilio: resolveHealth(isTwilioConfigured()),
      email: resolveHealth(isEmailConfigured()),
      voiceAi: resolveHealth(isVoiceAiConfigured()),
      n8n: resolveHealth(isN8nConfigured()),
      openai: resolveHealth(isOpenAiConfigured()),
      googleCalendar: resolveHealth(isGoogleCalendarConfigured()),
      webhooks: isWebhookSecretConfigured() ? "configured" : "not_configured",
    },
    emailChannel: isSendGridConfigured()
      ? "sendgrid"
      : isGmailConfigured()
        ? "gmail"
        : "none",
    voiceChannel: isVapiConfigured()
      ? "vapi"
      : isRetellConfigured()
        ? "retell"
        : "none",
  };
}

/** @deprecated Use integrationDashboardSnapshot — kept for audits. */
export function integrationStatusSnapshot() {
  const snap = integrationDashboardSnapshot();
  return {
    mockMode: snap.mockMode,
    twilio: snap.providers.twilio,
    email: snap.providers.email,
    voiceAi: snap.providers.voiceAi,
    n8n: snap.providers.n8n,
    openai: snap.providers.openai,
    googleCalendar: snap.providers.googleCalendar,
  };
}

/**
 * Twilio-compatible REST config. SignalWire's LaML API mirrors Twilio's
 * 2010-04-01 surface, so the same client code works against either —
 * only the base URL and credentials change.
 */
export function twilioConfig() {
  if (isSignalWireConfigured()) {
    const space = requireEnv("SIGNALWIRE_SPACE_URL")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    return {
      provider: "signalwire" as const,
      accountSid: requireEnv("SIGNALWIRE_PROJECT_ID"),
      authToken: requireEnv("SIGNALWIRE_API_TOKEN"),
      phoneNumber: requireEnv("SIGNALWIRE_PHONE_NUMBER"),
      apiBaseUrl: `https://${space}/api/laml/2010-04-01`,
    };
  }
  return {
    provider: "twilio" as const,
    accountSid: requireEnv("TWILIO_ACCOUNT_SID"),
    authToken: requireEnv("TWILIO_AUTH_TOKEN"),
    phoneNumber: requireEnv("TWILIO_PHONE_NUMBER"),
    apiBaseUrl: "https://api.twilio.com/2010-04-01",
  };
}

export function n8nBaseUrl(): string {
  return env("N8N_BASE_URL") ?? "https://n8n.smartdeskai.cloud";
}

export function emailFromAddress(): string | undefined {
  return (
    env("EMAIL_FROM") ??
    env("GMAIL_FROM_EMAIL") ??
    env("SENDGRID_FROM_EMAIL")
  );
}

export function openAiConfig() {
  return {
    apiKey: requireEnv("OPENAI_API_KEY"),
    model: env("OPENAI_MODEL") ?? "gpt-4o-mini",
  };
}

export function googleOAuthConfig() {
  const clientId = env("GOOGLE_CLIENT_ID") ?? env("GMAIL_CLIENT_ID");
  const clientSecret =
    env("GOOGLE_CLIENT_SECRET") ?? env("GMAIL_CLIENT_SECRET");
  const refreshToken =
    env("GOOGLE_REFRESH_TOKEN") ?? env("GMAIL_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google OAuth not configured: set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN (or GMAIL_* equivalents)"
    );
  }
  return {
    clientId,
    clientSecret,
    refreshToken,
    calendarId: env("GOOGLE_CALENDAR_ID") ?? "primary",
  };
}

export function gmailOAuthConfig() {
  return {
    clientId: requireEnv("GMAIL_CLIENT_ID"),
    clientSecret: requireEnv("GMAIL_CLIENT_SECRET"),
    refreshToken: requireEnv("GMAIL_REFRESH_TOKEN"),
    fromEmail: emailFromAddress(),
  };
}

export function vapiConfig() {
  return {
    apiKey: requireEnv("VAPI_API_KEY"),
    assistantId: requireEnv("VAPI_ASSISTANT_ID"),
    phoneNumberId: env("VAPI_PHONE_NUMBER_ID"),
  };
}

export function retellConfig() {
  return {
    apiKey: requireEnv("RETELL_API_KEY"),
    agentId: requireEnv("RETELL_AGENT_ID"),
  };
}
