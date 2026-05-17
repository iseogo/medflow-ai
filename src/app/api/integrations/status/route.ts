import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { integrationDashboardSnapshot, isMockModeForced } from "@/lib/integrations/env";
import { notifyStaff } from "@/lib/notifications/notification-bridge";
import { emailService } from "@/services/email.service";
import { n8nService } from "@/services/n8n.service";
import { openAiService } from "@/services/openai.service";
import { twilioService } from "@/services/twilio.service";
import { voiceAiReminderService } from "@/services/voice-ai-reminder.service";
import { googleCalendarService } from "@/services/google-calendar.service";

/** Server-only — status labels only, never secret values or PHI. */
export async function GET() {
  const { error } = await requirePermission("settings:read");
  if (error) return error;

  const dashboard = integrationDashboardSnapshot();

  if (!isMockModeForced() && dashboard.providers.webhooks !== "configured") {
    await notifyStaff({
      channel: "system",
      source: "INTEGRATION_FAILURE",
      sourceKey: "integration:webhooks-unconfigured",
      title: "Integration configuration issue",
      message: "Webhooks are not configured. Set WEBHOOK_SECRET before enabling live mode.",
    }).catch(() => undefined);
  }

  return NextResponse.json({
    mockMode: dashboard.mockMode,
    canUseLive: dashboard.canUseLive,
    providers: dashboard.providers,
    runtime: {
      twilio: twilioService.mode(),
      email: emailService.mode(),
      voiceAi: voiceAiReminderService.mode(),
      n8n: n8nService.mode(),
      openai: openAiService.mode(),
      googleCalendar: googleCalendarService.mode(),
    },
    channels: {
      email: dashboard.emailChannel,
      voice: dashboard.voiceChannel,
    },
    webhookSecretConfigured: dashboard.providers.webhooks === "configured",
  });
}
