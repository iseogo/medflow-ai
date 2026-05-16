/**
 * Phase 6 integrations audit — verifies mock-mode safety and configuration.
 * Usage: npm run audit:integrations
 */
import {
  canUseLiveIntegrations,
  integrationDashboardSnapshot,
  isEmailConfigured,
  isGoogleCalendarConfigured,
  isMockModeForced,
  isN8nConfigured,
  isOpenAiConfigured,
  isTwilioConfigured,
  isVoiceAiConfigured,
  isWebhookSecretConfigured,
} from "../src/lib/integrations/env";
import {
  auditApiRouteSecurity,
  hasSessionRbacGuard,
  isWebhookApiRoute,
  readRouteSource,
  relFromApiRoot,
  collectApiRouteFiles,
} from "./lib/api-route-security";
import { emailService } from "../src/services/email.service";
import { googleCalendarService } from "../src/services/google-calendar.service";
import { n8nService } from "../src/services/n8n.service";
import { openAiService } from "../src/services/openai.service";
import { twilioService } from "../src/services/twilio.service";
import { voiceAiReminderService } from "../src/services/voice-ai-reminder.service";

const passed: string[] = [];
const failed: string[] = [];
const warnings: string[] = [];

function ok(msg: string) {
  passed.push(msg);
}

function fail(msg: string) {
  failed.push(msg);
}

function warn(msg: string) {
  warnings.push(msg);
}

async function main() {
  console.log("\n=== MedFlow AI — Integrations Audit (Phase 6) ===\n");

  const snap = integrationDashboardSnapshot();

  if (isMockModeForced()) {
    ok("MOCK_MODE is enabled — external calls disabled");
  } else {
    warn("MOCK_MODE is off — live integrations may send real traffic");
  }

  if (isMockModeForced()) {
    if (!canUseLiveIntegrations()) {
      ok("canUseLiveIntegrations() is false while MOCK_MODE on");
    } else {
      fail("canUseLiveIntegrations() must be false when MOCK_MODE is enabled");
    }
  } else if (canUseLiveIntegrations()) {
    ok("canUseLiveIntegrations() is true (MOCK_MODE off)");
  }

  const services = [
    { name: "twilio", mode: twilioService.mode() },
    { name: "email", mode: emailService.mode() },
    { name: "voiceAi", mode: voiceAiReminderService.mode() },
    { name: "n8n", mode: n8nService.mode() },
    { name: "openai", mode: openAiService.mode() },
    { name: "googleCalendar", mode: googleCalendarService.mode() },
  ];

  for (const s of services) {
    if (s.mode === "mock") {
      ok(`${s.name} runtime mode is mock`);
    } else if (isMockModeForced()) {
      fail(`${s.name} runtime mode is live while MOCK_MODE=true`);
    } else {
      ok(`${s.name} runtime mode is live (MOCK_MODE off)`);
    }
  }

  const mockSms = await twilioService.sendSms({
    to: "+15555550100",
    body: "audit test — not sent externally in mock mode",
  });
  if (mockSms.provider.includes("mock")) {
    ok("Twilio sendSms returned mock provider id");
  } else {
    fail(`Twilio sendSms provider unexpected: ${mockSms.provider}`);
  }

  const mockEmail = await emailService.sendEmail({
    to: "audit@example.com",
    subject: "audit",
    body: "audit body",
  });
  if (mockEmail.provider.includes("mock")) {
    ok("Email sendEmail returned mock provider id");
  } else {
    fail(`Email provider unexpected: ${mockEmail.provider}`);
  }

  const mockVoice = await voiceAiReminderService.placeAiReminderCall({
    to: "+15555550101",
    clientFirstName: "Audit",
    appointmentAt: new Date(),
    providerName: "Dr. Test",
  });
  if (mockVoice.provider.includes("mock")) {
    ok("Voice AI returned mock provider id");
  } else {
    fail(`Voice AI provider unexpected: ${mockVoice.provider}`);
  }

  const mockN8n = await n8nService.triggerWorkflow({
    workflowName: "communication_sms",
    payload: { audit: true },
  });
  if (mockN8n.mode === "mock") {
    ok("n8n triggerWorkflow returned mock mode");
  } else if (isMockModeForced()) {
    fail("n8n must be mock when MOCK_MODE is enabled");
  } else {
    fail("n8n returned live without credentials");
  }

  const mockOpenAi = await openAiService.chat([
    { role: "user", content: "ping" },
  ]);
  if (mockOpenAi.mode === "mock") {
    ok("OpenAI chat returned mock mode");
  } else if (isMockModeForced()) {
    fail("OpenAI must be mock when MOCK_MODE is enabled");
  } else {
    fail("OpenAI returned live without credentials");
  }

  const mockCal = await googleCalendarService.createEvent({
    summary: "Audit slot",
    start: new Date(),
    end: new Date(Date.now() + 30 * 60 * 1000),
  });
  if (mockCal.mode === "mock") {
    ok("Google Calendar createEvent returned mock mode");
  } else if (isMockModeForced()) {
    fail("Google Calendar must be mock when MOCK_MODE is enabled");
  } else {
    fail("Google Calendar returned live without credentials");
  }

  for (const [key, status] of Object.entries(snap.providers)) {
    if (["mock", "not_configured", "configured", "healthy"].includes(status)) {
      ok(`Dashboard status for ${key}: ${status}`);
    } else {
      fail(`Invalid dashboard status for ${key}: ${status}`);
    }
  }

  const credChecks = [
    ["twilio", isTwilioConfigured()],
    ["email", isEmailConfigured()],
    ["voiceAi", isVoiceAiConfigured()],
    ["n8n", isN8nConfigured()],
    ["openai", isOpenAiConfigured()],
    ["googleCalendar", isGoogleCalendarConfigured()],
    ["webhooks", isWebhookSecretConfigured()],
  ] as const;

  for (const [name, configured] of credChecks) {
    if (!configured && snap.mockMode) {
      ok(`${name}: not configured (acceptable in mock-only dev)`);
    }
  }

  const apiSecurity = auditApiRouteSecurity();
  const sessionMissing = apiSecurity.sessionRoutes.filter((r) => !r.ok);
  for (const r of sessionMissing) {
    fail(`Admin API missing session/RBAC: ${r.rel.replace(/\\/g, "/")}`);
  }
  if (apiSecurity.sessionRoutes.length > 0 && sessionMissing.length === 0) {
    ok(
      `All ${apiSecurity.sessionRoutes.length} admin/dashboard API routes require session/RBAC`
    );
  }

  const webhookMissing = apiSecurity.webhookRoutes.filter((r) => !r.ok);
  for (const r of webhookMissing) {
    fail(`Webhook missing machine auth: ${r.rel.replace(/\\/g, "/")}`);
  }
  if (apiSecurity.webhookRoutes.length > 0 && webhookMissing.length === 0) {
    ok(
      `All ${apiSecurity.webhookRoutes.length} webhook routes use secret/signature auth (no session/RBAC)`
    );
  }

  for (const file of collectApiRouteFiles()) {
    const rel = relFromApiRoot(file);
    if (!isWebhookApiRoute(rel)) continue;
    const src = readRouteSource(file);
    if (hasSessionRbacGuard(src)) {
      fail(
        `Webhook route must not use session/RBAC: ${rel.replace(/\\/g, "/")}`
      );
    }
  }

  if (isWebhookSecretConfigured()) {
    ok("WEBHOOK_SECRET configured for MedFlow partner webhooks");
  } else if (snap.mockMode) {
    ok("WEBHOOK_SECRET unset (acceptable locally; routes fail closed in production)");
  } else {
    warn("WEBHOOK_SECRET unset — MedFlow webhooks return 503 until configured");
  }

  const twilioWebhookCount = apiSecurity.webhookRoutes.filter((r) => r.twilio).length;
  if (twilioWebhookCount > 0) {
    ok(`Twilio webhooks (${twilioWebhookCount}) validated via X-Twilio-Signature`);
  }

  const medflowWebhookCount = apiSecurity.webhookRoutes.filter((r) => !r.twilio).length;
  if (medflowWebhookCount > 0) {
    ok(
      `MedFlow partner webhooks (${medflowWebhookCount}) validated via WEBHOOK_SECRET / HMAC`
    );
  }

  console.log("PASSED:");
  for (const p of passed) console.log(`  ✓ ${p}`);
  console.log("\nWARNINGS:");
  if (warnings.length === 0) console.log("  (none)");
  else for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log("\nFAILED:");
  if (failed.length === 0) console.log("  (none)");
  else for (const f of failed) console.log(`  ✗ ${f}`);

  console.log(
    `\nAPI security score (session + webhook): ${apiSecurity.score}/100`
  );
  console.log(
    `Score: ${passed.length} passed, ${failed.length} failed, ${warnings.length} warnings\n`
  );

  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
