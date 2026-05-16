# MedFlow AI — n8n ↔ MedFlow webhook endpoint map

**n8n host:** `YOUR-N8N-HOST` (from your instance)  
**MedFlow base URL:** `MEDFLOW_API_BASE_URL` (n8n variable — e.g. `http://localhost:3000`)

## Direction summary

| Direction | Auth | Purpose |
|-----------|------|---------|
| **MedFlow → n8n** | `x-medflow-webhook-secret` (optional on n8n side) | MedFlow triggers automation when `MOCK_MODE=false` |
| **n8n → MedFlow** | `x-medflow-webhook-secret` = `WEBHOOK_SECRET` | n8n posts status / coordination updates |
| **Carrier → n8n** | Twilio signature / provider token | Twilio/Vapi/Retell hit n8n first, n8n forwards to MedFlow |

## n8n production webhook URLs

After import and activation, production URLs follow:

```
https://YOUR-N8N-HOST/webhook/{path}
```

| # | Workflow JSON | n8n path | MedFlow `.env` key |
|---|---------------|----------|-------------------|
| 1 | `01-inbound-call-handler.json` | `medflow/inbound-call` | `N8N_WEBHOOK_INBOUND_CALL` |
| 2 | `02-outbound-call-handler.json` | `medflow/outbound-call` | `N8N_WEBHOOK_OUTBOUND_CALL` |
| 3 | `03-reminder-48h-voice-sms-email.json` | `medflow/reminder-48h` | `N8N_WEBHOOK_REMINDER_48H` |
| 4 | `04-reminder-24h-voice-sms-email.json` | `medflow/reminder-24h` | `N8N_WEBHOOK_REMINDER_24H` |
| 5 | `05-reminder-2h-voice-sms-email.json` | `medflow/reminder-2h` | `N8N_WEBHOOK_REMINDER_2H` |
| 6 | `06-reminder-30min-voice-sms-email.json` | `medflow/reminder-30min` | `N8N_WEBHOOK_REMINDER_30M` |
| 7 | `07-sms-reply-handler.json` | `medflow/sms-reply` | `N8N_WEBHOOK_SMS` |
| 8 | `08-email-reply-handler.json` | `medflow/email-reply` | `N8N_WEBHOOK_EMAIL` |
| 9 | `09-walk-in-onboarding-handler.json` | `medflow/walk-in-onboarding` | `N8N_WEBHOOK_WALK_IN` |
| 10 | `10-physical-check-in-handler.json` | `medflow/physical-check-in` | `N8N_WEBHOOK_CHECK_IN` |
| 11 | `11-human-handoff-handler.json` | `medflow/human-handoff` | `N8N_WEBHOOK_STAFF_INTERVENTION` |
| 12 | `12-ai-coordination-handler.json` | `medflow/ai-coordination` | `N8N_WEBHOOK_AI_COORDINATION` |

Copy each **Production URL** from the n8n Webhook node into the matching MedFlow env var.

## MedFlow inbound API (n8n → MedFlow)

All use `POST` + `Content-Type: application/json` + header `x-medflow-webhook-secret`.

| MedFlow route | Used by workflows | Required payload fields |
|---------------|-------------------|-------------------------|
| `/api/webhooks/inbound-call` | 01 | `callLogId`, `CallStatus` |
| `/api/webhooks/outbound-call` | 02 | `callLogId`, `CallStatus` |
| `/api/webhooks/reminders` | 03–06 | `appointmentId`, `CallStatus` or `status` |
| `/api/webhooks/sms` | 07 | `smsLogId`, `MessageStatus` |
| `/api/webhooks/email` | 08 | `emailLogId`, `status` |
| `/api/webhooks/staff-intervention` | 09, 11 | `interventionId`, `status` |
| `/api/webhooks/appointment` | 10, 12 | `appointmentId`, `status` |

### Twilio direct (optional bypass n8n)

| MedFlow route | Auth |
|---------------|------|
| `/api/webhooks/twilio/sms` | `X-Twilio-Signature` |
| `/api/webhooks/twilio/voice` | `X-Twilio-Signature` |

## MedFlow outbound payload (MedFlow → n8n)

When MedFlow calls n8n (`n8n.service.ts`):

```json
{
  "workflow": "communication_sms",
  "payload": { "smsLogId": "…", "clientId": "…" },
  "timestamp": "2026-05-16T12:00:00.000Z"
}
```

| MedFlow `workflow` name | Typical n8n workflow |
|-------------------------|----------------------|
| `communication_call` | 02 Outbound Call |
| `communication_sms` | 07 SMS Reply |
| `communication_email` | 08 Email Reply |
| `reminder_voice_ai` | 03–06 (by offset routing in n8n) |
| `inbound_call` | 01 Inbound Call |
| `outbound_call` | 02 Outbound Call |
| `staff_intervention` | 11 Human Handoff |

## Reminder offsets

| Workflow | `reminderOffset` sent to MedFlow |
|----------|----------------------------------|
| 03 | `HOURS_48` |
| 04 | `HOURS_24` |
| 05 | `HOURS_2` |
| 06 | `MINUTES_30` |

MedFlow runs voice/SMS/email logic in `reminder-engine.service.ts`; n8n workflows coordinate external carriers and post status back to `/api/webhooks/reminders`.
