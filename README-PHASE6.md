# MedFlow AI — Phase 6: Real external integrations

Phase 6 wires **production-ready integration adapters** with **mock mode enabled by default**. All secrets stay **server-side**; the dashboard never receives API keys or patient identifiers.

## MOCK_MODE (default safe)

Set in `.env`:

```env
MOCK_MODE=true
```

When `MOCK_MODE=true`, MedFlow **never** calls Twilio, Vapi, Retell, Gmail, SendGrid, Google Calendar, OpenAI, or n8n — even if API keys are present.

When `MOCK_MODE=false`, a provider goes **live** only if its required env keys are also set.

| Dashboard status | Meaning |
|------------------|---------|
| **mock** | `MOCK_MODE=true` and credentials missing |
| **configured** | Credentials present but `MOCK_MODE` blocks live traffic |
| **not_configured** | `MOCK_MODE=false` but missing credentials |
| **healthy** | `MOCK_MODE=false` and credentials complete (live allowed) |

## Providers

| Provider | Service |
|----------|---------|
| Twilio | `twilio.service.ts` |
| Gmail / SendGrid | `email.service.ts` (`EMAIL_FROM`, `SENDGRID_API_KEY`) |
| Vapi / Retell | `voice-ai-reminder.service.ts` |
| n8n | `n8n.service.ts` |
| OpenAI | `openai.service.ts` |
| Google Calendar | `google-calendar.service.ts` |

Copy **[`.env.example`](./.env.example)** to `.env`. See **[`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md)**.

## Audit

```bash
npm run audit:integrations
```

Runs mock smoke tests (no external network when `MOCK_MODE=true`).

## Integration dashboard

**Settings → Integrations** (or `GET /api/integrations/status` with `settings:read`). Shows status labels only — **no secrets**, no PHI.

Runtime column shows `mock` or `live` for each service facade.

## Outbound n8n

`n8nService.triggerWorkflow({ workflowName, payload })` maps workflow names to env URLs:

| `workflowName` | Env var |
|----------------|---------|
| `communication_call` | `N8N_WEBHOOK_OUTBOUND_CALL` |
| `communication_sms` | `N8N_WEBHOOK_SMS` |
| `communication_email` | `N8N_WEBHOOK_EMAIL` |
| `reminder_voice_ai` | `N8N_WEBHOOK_REMINDERS` |
| `appointment_*` | `N8N_WEBHOOK_APPOINTMENT` |
| `staff_intervention` | `N8N_WEBHOOK_STAFF_INTERVENTION` |
| `inbound_call` | `N8N_WEBHOOK_INBOUND_CALL` |

POST body includes `workflow`, `payload`, and `timestamp`. When `WEBHOOK_SECRET` is set, it is sent as `x-medflow-webhook-secret`.

## Inbound webhooks (MedFlow)

Configure n8n (or partners) to call:

| Path | Purpose |
|------|---------|
| `POST /api/webhooks/inbound-call` | Inbound call events |
| `POST /api/webhooks/outbound-call` | Outbound / status callbacks |
| `POST /api/webhooks/sms` | SMS status / side effects |
| `POST /api/webhooks/email` | Email delivery updates |
| `POST /api/webhooks/appointment` | Appointment status sync |
| `POST /api/webhooks/reminders` | Reminder engine callbacks |
| `POST /api/webhooks/staff-intervention` | Intervention updates |

**Authentication:** set `WEBHOOK_SECRET` and send:

- Header `x-medflow-webhook-secret: <secret>`, or  
- `Authorization: Bearer <secret>`, or  
- `x-medflow-signature: sha256=<hmac-sha256-hex>` of the raw body

Without a secret, production requests return **503**. For local dev only: `MEDFLOW_WEBHOOK_ALLOW_UNAUTHENTICATED=true`.

## Twilio callbacks

| Path | Auth |
|------|------|
| `POST /api/webhooks/twilio/sms` | `X-Twilio-Signature` |
| `POST /api/webhooks/twilio/voice` | `X-Twilio-Signature` |

Updates `SmsLog` / `CallLog` rows by `MessageSid` / `CallSid` (`externalRef`).

## Security checklist

- Never add integration keys to `NEXT_PUBLIC_*`
- Never import `@/lib/integrations/env` from client components
- Rotate `WEBHOOK_SECRET` and provider tokens on compromise
- Never log secrets, tokens, phone numbers, or email addresses in application logs
- Use HTTPS for all webhook URLs in production

## Related phases

- Phase 5 — Reminder engine (uses integrations above)
- Phase 3 — Master Orchestrator (SMS/email/call via `orchestratorService`)
