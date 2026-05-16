# MedFlow AI — Integration reference (Phase 6)

## Architecture

```
┌─────────────────┐     server-only env      ┌──────────────────┐
│  API routes /   │ ───────────────────────► │  *Service        │
│  services       │                          │  (live | mock)   │
└────────┬────────┘                          └────────┬─────────┘
         │                                            │
         │ POST webhooks                              │ REST APIs
         ▼                                            ▼
┌─────────────────┐                          Twilio, Gmail, Vapi,
│ /api/webhooks/* │                          Retell, OpenAI, n8n
└─────────────────┘
```

Client React code must **not** read `OPENAI_API_KEY`, `TWILIO_*`, etc. Use `GET /api/integrations/status` for status labels only (`mock`, `configured`, `not_configured`, `healthy`).

## MOCK_MODE (required for local dev)

```env
MOCK_MODE=true
EMAIL_FROM=
SENDGRID_API_KEY=
WEBHOOK_SECRET=
```

| Rule | Behavior |
|------|----------|
| `MOCK_MODE=true` | **No outbound** calls to Twilio, Vapi, Retell, Gmail, SendGrid, Google Calendar, OpenAI, or n8n |
| Missing provider keys | Provider stays in mock/stub even if `MOCK_MODE=false` |
| Secrets | Server-side only — never in frontend, logs, audit rows, DB, or error messages |

Run `npm run audit:integrations` with `MOCK_MODE=true` before shipping integration changes.

## Environment variables

See [`.env.example`](../.env.example). Summary:

| Group | Variables |
|-------|-----------|
| Safety | `MOCK_MODE` (default `true`), `WEBHOOK_SECRET`, `EMAIL_FROM` |
| OpenAI | `OPENAI_API_KEY`, optional `OPENAI_MODEL` |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| Vapi | `VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, optional `VAPI_PHONE_NUMBER_ID` |
| Retell | `RETELL_API_KEY`, `RETELL_AGENT_ID` |
| Gmail | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` |
| SendGrid | `SENDGRID_API_KEY` (optional alternative to Gmail) |
| Calendar | `GOOGLE_*` or reuse Gmail OAuth + `GOOGLE_CALENDAR_ID` |
| n8n outbound | `N8N_BASE_URL`, `N8N_WEBHOOK_*` |
| MedFlow inbound | `WEBHOOK_SECRET` (legacy alias: `MEDFLOW_WEBHOOK_SECRET`) |

## Webhook authentication

### MedFlow partner webhooks (`/api/webhooks/...`)

1. Set `WEBHOOK_SECRET` to a long random string.
2. On each `POST`, include one of:
   - `x-medflow-webhook-secret: <secret>`
   - `Authorization: Bearer <secret>`
   - `x-medflow-signature: sha256=<hex>` where hex = HMAC-SHA256(secret, raw body)

### Twilio webhooks (`/api/webhooks/twilio/...`)

Twilio signs `application/x-www-form-urlencoded` bodies with `X-Twilio-Signature`. Validation uses `TWILIO_AUTH_TOKEN` and the full public URL of the route.

## Example payloads

### MedFlow SMS webhook

```json
{
  "smsLogId": "clxxx",
  "MessageSid": "SMxxx",
  "MessageStatus": "delivered"
}
```

### MedFlow appointment webhook

```json
{
  "appointmentId": "clxxx",
  "status": "CONFIRMED"
}
```

### n8n receives (outbound from MedFlow)

```json
{
  "workflow": "communication_sms",
  "payload": { "smsLogId": "...", "clientId": "..." },
  "timestamp": "2026-05-16T12:00:00.000Z"
}
```

## Service files

| File | Role |
|------|------|
| `src/lib/integrations/env.ts` | Feature flags, no secret export |
| `src/lib/integrations/webhook-auth.ts` | Secret + Twilio signature validation |
| `src/lib/integrations/n8n-routing.ts` | Workflow → webhook URL |
| `src/lib/integrations/webhook-handler.ts` | Inbound webhook side effects |
| `src/services/twilio.service.ts` | SMS + voice facade |
| `src/services/email.service.ts` | Email facade |
| `src/services/n8n.service.ts` | n8n trigger facade |
| `src/services/voice-ai-reminder.service.ts` | AI reminder calls |
| `src/services/openai.service.ts` | Chat completions |
| `src/services/google-calendar.service.ts` | Calendar events |

## Local development

1. Copy `.env.example` → `.env` (keeps `MOCK_MODE=true`)
2. Leave provider API keys empty — all outbound traffic uses mock success/failure responses
3. Optional: `MEDFLOW_WEBHOOK_ALLOW_UNAUTHENTICATED=true` to test webhooks without `WEBHOOK_SECRET` (local only)
4. `npm run audit:integrations` — verifies mock paths and dashboard statuses
5. To exercise inbound webhooks: `curl -X POST http://localhost:3000/api/webhooks/sms -H "Content-Type: application/json" -H "x-medflow-webhook-secret: <secret>" -d '{"smsLogId":"..."}'`

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Status `mock` | Expected when `MOCK_MODE=true` or credentials missing |
| Status `configured` | Credentials set but `MOCK_MODE` blocks live calls |
| Status `healthy` | `MOCK_MODE=false` and full credential set for that provider |
| n8n not firing | `MOCK_MODE=false`, workflow URL mapping, and `N8N_WEBHOOK_*` set |
| Webhook 401 | `WEBHOOK_SECRET` / `x-medflow-webhook-secret` header |
| Webhook 503 | Secret not set in production |
| Twilio 401 on callback | Public URL must match Twilio console exactly |
| Secret in logs | Use `safeLogContext` — integration logs must not include PHI or keys |
