# MedFlow AI — n8n workflows (Phase 7)

Import these JSON **templates** into your n8n instance. **No secrets included** — see [SAFETY.md](./SAFETY.md).

| File | Handler |
|------|---------|
| [01-inbound-call-handler.json](./01-inbound-call-handler.json) | Inbound calls |
| [02-outbound-call-handler.json](./02-outbound-call-handler.json) | Outbound calls |
| [03-reminder-48h-voice-sms-email.json](./03-reminder-48h-voice-sms-email.json) | 48h reminder |
| [04-reminder-24h-voice-sms-email.json](./04-reminder-24h-voice-sms-email.json) | 24h reminder |
| [05-reminder-2h-voice-sms-email.json](./05-reminder-2h-voice-sms-email.json) | 2h reminder |
| [06-reminder-30min-voice-sms-email.json](./06-reminder-30min-voice-sms-email.json) | 30min reminder |
| [07-sms-reply-handler.json](./07-sms-reply-handler.json) | SMS replies / status |
| [08-email-reply-handler.json](./08-email-reply-handler.json) | Email delivery |
| [09-walk-in-onboarding-handler.json](./09-walk-in-onboarding-handler.json) | Walk-in onboarding |
| [10-physical-check-in-handler.json](./10-physical-check-in-handler.json) | Physical check-in |
| [11-human-handoff-handler.json](./11-human-handoff-handler.json) | Human handoff |
| [12-ai-coordination-handler.json](./12-ai-coordination-handler.json) | AI coordination |

- **[SAFETY.md](./SAFETY.md)** — placeholders, test mode, live checklist  
- **[WEBHOOK-ENDPOINT-MAP.md](./WEBHOOK-ENDPOINT-MAP.md)** — URL and payload reference  
- **[SETUP-GUIDE.md](./SETUP-GUIDE.md)** — import and configuration steps  
- **[README-PHASE7.md](../README-PHASE7.md)** — phase overview

Regenerate: `npm run generate:n8n-workflows`
