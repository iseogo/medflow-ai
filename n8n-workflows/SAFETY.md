# Phase 7 n8n templates — safety rules

These JSON files are **importable templates only**. They must never contain:

- Real API keys, tokens, or secrets  
- Production phone numbers or email addresses  
- Patient names, MRNs, or clinical data  
- Hardcoded production URLs  

## Placeholders (configure in n8n Variables)

| Variable | Purpose |
|----------|---------|
| `MEDFLOW_API_BASE_URL` | MedFlow app origin (no trailing slash) |
| `MEDFLOW_WEBHOOK_SECRET` | Same value as MedFlow `WEBHOOK_SECRET` |
| `MEDFLOW_TEST_MODE` | Default `true` — blocks live MedFlow HTTP and all carrier sends |
| `TWILIO_CREDENTIAL_ID` | n8n credential reference name/ID for Twilio |
| `EMAIL_CREDENTIAL_ID` | SendGrid/Gmail credential |
| `VAPI_CREDENTIAL_ID` | Vapi voice credential |
| `OPENAI_CREDENTIAL_ID` | OpenAI credential |
| `GOOGLE_CREDENTIAL_ID` | Google Calendar credential |

## Test mode (default)

Every workflow includes a **Test Mode Gate**:

1. `MEDFLOW_TEST_MODE` unset or not `false` → **test mode**  
2. Returns `{ mode: "test", dryRun: true }` — **no** MedFlow HTTP, **no** carrier traffic  
3. Set `MEDFLOW_TEST_MODE=false` **only after** you manually configure all required credentials in n8n  

## Live mode requirements

All must be true before live traffic:

- `MEDFLOW_TEST_MODE=false`  
- `MEDFLOW_API_BASE_URL` set  
- `MEDFLOW_WEBHOOK_SECRET` set  
- Carrier credentials created in n8n UI and referenced by placeholder IDs  
- MedFlow `MOCK_MODE=false` (server-side) for real provider traffic  

## Regenerate templates

```bash
npm run generate:n8n-workflows
```

The generator runs forbidden-pattern checks (no `sk-`, Twilio SIDs, production domains in JSON output).
