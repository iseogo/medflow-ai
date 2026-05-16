/**
 * Maps internal workflow names to n8n webhook URL env vars.
 */

const WORKFLOW_ENV_MAP: Record<string, string> = {
  communication_call: "N8N_WEBHOOK_OUTBOUND_CALL",
  communication_sms: "N8N_WEBHOOK_SMS",
  communication_email: "N8N_WEBHOOK_EMAIL",
  reminder_voice_ai: "N8N_WEBHOOK_REMINDERS",
  appointment_created: "N8N_WEBHOOK_APPOINTMENT",
  appointment_updated: "N8N_WEBHOOK_APPOINTMENT",
  staff_intervention: "N8N_WEBHOOK_STAFF_INTERVENTION",
  inbound_call: "N8N_WEBHOOK_INBOUND_CALL",
  outbound_call: "N8N_WEBHOOK_OUTBOUND_CALL",
};

export function resolveN8nWebhookUrl(workflowName: string): string | undefined {
  const envKey = WORKFLOW_ENV_MAP[workflowName];
  if (!envKey) return undefined;
  const url = process.env[envKey]?.trim();
  return url && url.length > 0 ? url : undefined;
}
