# MedFlow AI — n8n setup guide (Phase 7)

> **Templates only** — see [SAFETY.md](./SAFETY.md). Workflow JSON contains **placeholders**, not real credentials.

## Prerequisites

- Your n8n instance (admin access)
- MedFlow AI with `WEBHOOK_SECRET` set locally or in staging
- Phase 6 docs: [`docs/INTEGRATIONS.md`](../docs/INTEGRATIONS.md)

## 1. n8n environment variables (placeholders)

In n8n **Settings → Variables**, create:

| Variable | Example (local) | Notes |
|----------|-----------------|-------|
| `MEDFLOW_API_BASE_URL` | `http://localhost:3000` | No trailing slash |
| `MEDFLOW_WEBHOOK_SECRET` | *(paste from MedFlow `.env`)* | Never commit |
| `MEDFLOW_TEST_MODE` | `true` | **Keep true** until credentials are ready |
| `TWILIO_CREDENTIAL_ID` | *(n8n credential name)* | Optional until live |
| `EMAIL_CREDENTIAL_ID` | *(n8n credential name)* | Optional until live |
| `VAPI_CREDENTIAL_ID` | *(n8n credential name)* | Optional until live |
| `OPENAI_CREDENTIAL_ID` | *(n8n credential name)* | Optional until live |
| `GOOGLE_CREDENTIAL_ID` | *(n8n credential name)* | Optional until live |

Never store API keys in workflow JSON — use n8n **Credentials** UI only.

## 2. Import workflows

1. Open n8n → **Workflows** → **Import from file**
2. Import each JSON from [`n8n-workflows/`](./) in order `01` … `12`
3. Open each workflow → **Webhook Trigger** node → copy **Production URL**
4. Paste URL into MedFlow `.env` (see [WEBHOOK-ENDPOINT-MAP.md](./WEBHOOK-ENDPOINT-MAP.md))

Regenerate JSON after template changes:

```bash
npm run generate:n8n-workflows
```

## 3. MedFlow `.env` wiring

Keep `MOCK_MODE=true` until n8n and MedFlow are fully configured. Paste **your** n8n Production webhook URLs (from each workflow’s Webhook node):

```env
MOCK_MODE=true
WEBHOOK_SECRET=
N8N_BASE_URL=https://YOUR-N8N-HOST

N8N_WEBHOOK_INBOUND_CALL=https://YOUR-N8N-HOST/webhook/medflow/inbound-call
N8N_WEBHOOK_OUTBOUND_CALL=https://YOUR-N8N-HOST/webhook/medflow/outbound-call
# ... see WEBHOOK-ENDPOINT-MAP.md for all paths
```

## 4. Test mode (default)

Imported workflows run in **test mode** until you set `MEDFLOW_TEST_MODE=false` in n8n.

| Mode | Behavior |
|------|----------|
| Test (`MEDFLOW_TEST_MODE` not `false`) | Returns `{ mode: "test", dryRun: true }` — **no** MedFlow HTTP, **no** calls/SMS/email |
| Live | Requires `MEDFLOW_API_BASE_URL` + `MEDFLOW_WEBHOOK_SECRET` + manual carrier credentials |

## 5. Activate workflows

For each imported workflow:

1. Leave `MEDFLOW_TEST_MODE=true` for first test
2. Toggle **Active**
3. **Test workflow** with sample IDs only (no real patient data)
4. Confirm response includes `"mode":"test"`

## 6. Go live (checklist)

Only when ready:

1. Create Twilio/Vapi/Email/OpenAI credentials in n8n UI  
2. Set `TWILIO_CREDENTIAL_ID`, etc. to match credential names  
3. Set `MEDFLOW_TEST_MODE=false` in n8n  
4. Set MedFlow `MOCK_MODE=false` and provider keys  
5. Re-test one workflow with test appointment/log IDs  

## 7. Test MedFlow → n8n

With `MOCK_MODE=false` and webhook URLs set:

```bash
npm run audit:integrations
```

Send a test SMS from the dashboard; MedFlow should POST to `N8N_WEBHOOK_SMS`.

## 8. Test n8n → MedFlow (live mode only)

```bash
curl -X POST "%MEDFLOW_API_BASE_URL%/api/webhooks/sms" \
  -H "Content-Type: application/json" \
  -H "x-medflow-webhook-secret: YOUR_SECRET" \
  -d "{\"smsLogId\":\"EXISTING_ID\",\"MessageStatus\":\"delivered\"}"
```

Expect `{"received":true,"eventType":"sms"}`.

## 9. Workflow internals (each JSON)

| Step | Node | Purpose |
|------|------|---------|
| Safety — Template Only | Sticky Note | Placeholder rules |
| Webhook Trigger | Webhook | Inbound events |
| Validate Payload | Code | Required fields (IDs only) |
| Test Mode Gate | Code | Checks `MEDFLOW_TEST_MODE` + credentials |
| Live Mode Enabled? | IF | Skips MedFlow HTTP in test mode |
| Respond Test Mode | Respond | `{ dryRun: true }` |
| Call MedFlow API | HTTP | Only in live mode |
| Carrier Placeholders | Sticky Note | Wire Twilio/Vapi/Email manually |

HTTP nodes use built-in **retry** (3 tries, 2s apart) where supported.

## 10. Reminder scheduling (optional)

MedFlow’s reminder engine runs via `POST /api/reminders/run` (staff RBAC). For n8n-driven schedules:

1. Add n8n **Cron** node before reminder workflows, **or**
2. Let MedFlow trigger `reminder_voice_ai` → n8n reminder webhook when live

Do not send real patient traffic until `MOCK_MODE=false` and test numbers are configured.

## 11. Security checklist

- [ ] `WEBHOOK_SECRET` set in MedFlow and n8n
- [ ] `MEDFLOW_WEBHOOK_ALLOW_UNAUTHENTICATED` **not** set in production
- [ ] Twilio callbacks use signature validation (MedFlow `/api/webhooks/twilio/*` or n8n verification)
- [ ] No PHI in n8n execution logs (use IDs only)
- [ ] Workflows tagged `MedFlow AI` / `Phase 7` for inventory

## Troubleshooting

| Issue | Fix |
|-------|-----|
| MedFlow 401 on callback | Match `WEBHOOK_SECRET` ↔ `MEDFLOW_WEBHOOK_SECRET` |
| MedFlow 503 | Set `WEBHOOK_SECRET` in MedFlow `.env` |
| n8n 404 | Activate workflow; use Production URL not Test URL |
| No n8n fire | `MOCK_MODE=false` and correct `N8N_WEBHOOK_*` URL |
| Validation 422 | Include required IDs (`callLogId`, `appointmentId`, etc.) |
