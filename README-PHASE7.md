# MedFlow AI — Phase 7: n8n workflow automation

Phase 7 delivers **importable n8n workflow templates** (JSON) and documentation to connect your n8n instance with MedFlow’s Phase 6 webhook layer.

**Safety:** Templates contain **placeholders only** — no API keys, secrets, phone numbers, or patient data. Default **test mode** blocks live calls, SMS, and email until you configure credentials manually in n8n.

See **[n8n-workflows/SAFETY.md](./n8n-workflows/SAFETY.md)**.

## Deliverables

| Asset | Location |
|-------|----------|
| 12 workflow JSON files | [`n8n-workflows/`](./n8n-workflows/) |
| Endpoint map | [`n8n-workflows/WEBHOOK-ENDPOINT-MAP.md`](./n8n-workflows/WEBHOOK-ENDPOINT-MAP.md) |
| Setup guide | [`n8n-workflows/SETUP-GUIDE.md`](./n8n-workflows/SETUP-GUIDE.md) |
| Generator (maintainers) | [`scripts/generate-n8n-workflows.ts`](./scripts/generate-n8n-workflows.ts) |

## Workflows

1. **Inbound Call Handler** — `01-inbound-call-handler.json`
2. **Outbound Call Handler** — `02-outbound-call-handler.json`
3. **48h Reminder** (voice + SMS + email callbacks) — `03-reminder-48h-voice-sms-email.json`
4. **24h Reminder** — `04-reminder-24h-voice-sms-email.json`
5. **2h Reminder** — `05-reminder-2h-voice-sms-email.json`
6. **30min Reminder** — `06-reminder-30min-voice-sms-email.json`
7. **SMS Reply Handler** — `07-sms-reply-handler.json`
8. **Email Reply Handler** — `08-email-reply-handler.json`
9. **Walk-In Onboarding Handler** — `09-walk-in-onboarding-handler.json`
10. **Physical Check-In Handler** — `10-physical-check-in-handler.json`
11. **Human Handoff Handler** — `11-human-handoff-handler.json`
12. **AI Coordination Handler** — `12-ai-coordination-handler.json`

Each workflow includes: safety notes, webhook trigger, validation, **test mode gate**, optional live MedFlow API call, error handling, retry, audit step, and carrier placeholder notes.

### Placeholders (n8n Variables)

`MEDFLOW_API_BASE_URL` · `MEDFLOW_WEBHOOK_SECRET` · `MEDFLOW_TEST_MODE` (default safe) · `TWILIO_CREDENTIAL_ID` · `EMAIL_CREDENTIAL_ID` · `VAPI_CREDENTIAL_ID` · `OPENAI_CREDENTIAL_ID` · `GOOGLE_CREDENTIAL_ID`

## Quick start

```bash
# Regenerate JSON (optional)
npm run generate:n8n-workflows

# Import JSON files in n8n UI, then:
# 1. Set MEDFLOW_API_BASE_URL + MEDFLOW_WEBHOOK_SECRET + MEDFLOW_TEST_MODE=true in n8n
# 2. Import templates — confirm test responses (dryRun)
# 3. Copy webhook Production URLs → MedFlow .env N8N_WEBHOOK_*
# 4. Configure carrier credentials in n8n UI; set MEDFLOW_TEST_MODE=false only when ready
# 5. MedFlow MOCK_MODE=false only for production provider traffic
```

See **[SETUP-GUIDE.md](./n8n-workflows/SETUP-GUIDE.md)** for full steps.

## Sample payloads

### MedFlow → n8n (outbound trigger)

```json
{
  "workflow": "communication_sms",
  "payload": { "smsLogId": "clxxx", "clientId": "clyyy" },
  "timestamp": "2026-05-16T18:00:00.000Z"
}
```

### n8n → MedFlow (SMS status)

```json
{
  "smsLogId": "clxxx",
  "MessageSid": "SMxxx",
  "MessageStatus": "delivered"
}
```

Header: `x-medflow-webhook-secret: <WEBHOOK_SECRET>`

### n8n → MedFlow (48h reminder)

```json
{
  "appointmentId": "clappt",
  "callLogId": "clcall",
  "reminderOffset": "HOURS_48",
  "CallStatus": "completed"
}
```

## Relationship to Phase 6

| Phase 6 | Phase 7 |
|---------|---------|
| MedFlow services + mock/live providers | n8n visual automation |
| `/api/webhooks/*` machine auth | n8n HTTP nodes call these routes |
| `N8N_WEBHOOK_*` env vars | Filled with n8n Production URLs |

## Audits

```bash
npm run audit:integrations
npm run audit:architecture
npm run audit:production
```

## Related docs

- [README-PHASE6.md](./README-PHASE6.md) — integrations + MOCK_MODE
- [docs/INTEGRATIONS.md](./docs/INTEGRATIONS.md) — webhook auth reference
