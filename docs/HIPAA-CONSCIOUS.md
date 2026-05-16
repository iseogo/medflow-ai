# HIPAA-conscious operations (MedFlow AI)

> **Final HIPAA compliance requires legal review, vendor agreements, Business Associate Agreements (BAAs), organizational policies, staff training, and operational controls.**  
> MedFlow AI Phase 8 provides **technical safeguards** to support a HIPAA-conscious posture — not a certification or legal guarantee.

## What Phase 8 adds

| Control | Implementation |
|---------|----------------|
| PHI-safe logging | `src/lib/security/phi-safe-log.ts` — redacts phones, emails, MRNs, secrets in logs and audit metadata |
| RBAC | Dashboard + API middleware (`src/middleware/rbac.ts`, `src/lib/security/api-rbac.ts`) |
| Audit enforcement | Sanitized audit rows + API access logging (`src/lib/security/audit-enforcement.ts`) |
| Session timeout | JWT `maxAge` / `updateAge` via `SESSION_MAX_AGE_SECONDS` |
| Webhook validation | Existing `webhook-auth.ts` (secret, HMAC, Twilio signature) |
| Rate limiting | `src/middleware/security.ts` per IP |
| Secure headers | Middleware + `next.config.mjs` |
| Data access checks | `assertClientDataAccess()` before returning client PHI |
| Export logging | `logExportAccess()` |
| File access placeholder | `logFileAccessPlaceholder()` for future storage |
| AI safety | No diagnosis/treatment advice; AI identity; 911 escalation |

## Organizational requirements (out of scope for code)

- Signed BAAs with hosting, email, SMS, voice, and AI vendors  
- Risk analysis and security risk management process  
- Workforce training and sanction policy  
- Incident response and breach notification procedures  
- Minimum necessary policies and access reviews  
- Physical and facility controls for workstations  

## Recommended production settings

```env
SESSION_MAX_AGE_SECONDS=1800
SESSION_UPDATE_AGE_SECONDS=900
MOCK_MODE=true
WEBHOOK_SECRET=<strong-random>
RATE_LIMIT_API_PER_MINUTE=120
```

## AI patient interactions

Automated agents must:

1. Identify as an AI assistant  
2. Never diagnose or prescribe  
3. Escalate emergency language to staff and advise calling **911**  
4. Submit actions only through the Master Orchestrator  

See `src/lib/security/ai-safety.ts`.

## Audits

```bash
npm run audit:security
npm run audit:coordination
npm run audit:architecture
```
