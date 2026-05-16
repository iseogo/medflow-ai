# MedFlow AI — Phase 8: HIPAA-conscious security hardening

> **Final HIPAA compliance requires legal review, vendor agreements, BAAs, organizational policies, staff training, and operational controls.**  
> Phase 8 adds technical safeguards — not a compliance certification.

## Deliverables

| Area | Location |
|------|----------|
| PHI-safe logging | `src/lib/security/phi-safe-log.ts` |
| Security middleware | `src/middleware/security.ts` |
| RBAC middleware | `src/middleware/rbac.ts` |
| Audit middleware | `src/middleware/audit.ts` |
| Data access checks | `src/lib/security/data-access.ts` |
| AI safety guardrails | `src/lib/security/ai-safety.ts` |
| Export / file audit helpers | `src/lib/security/audit-enforcement.ts` |
| Security README | [docs/SECURITY.md](./docs/SECURITY.md) |
| HIPAA-conscious guide | [docs/HIPAA-CONSCIOUS.md](./docs/HIPAA-CONSCIOUS.md) |

## Controls summary

- **PHI-safe logging** — redacted console and audit metadata  
- **RBAC** — dashboard + API middleware (webhooks exempt, machine auth)  
- **Audit logging** — API access on sensitive routes; sanitized metadata  
- **Session timeout** — `SESSION_MAX_AGE_SECONDS` (recommend 1800 for production)  
- **Webhook signatures** — Phase 6 `webhook-auth.ts` (unchanged contract)  
- **Rate limiting** — per-IP sliding window  
- **Secure headers** — CSP, frame deny, HSTS (production)  
- **Data access checks** — `assertClientDataAccess` on client detail API  
- **Export / file logging** — audit helpers for compliance trails  
- **AI safety** — no clinical advice; AI disclosure; emergency → 911 + staff  

## Environment

```env
SESSION_MAX_AGE_SECONDS=1800
SESSION_UPDATE_AGE_SECONDS=900
RATE_LIMIT_API_PER_MINUTE=120
RATE_LIMIT_AUTH_PER_MINUTE=20
WEBHOOK_SECRET=
MOCK_MODE=true
```

## Audit

```bash
npm run audit:security
npm run audit:coordination
```

## Migration

```bash
npx prisma migrate deploy
```

Adds `EXPORT` and `FILE_ACCESS` to `AuditAction` enum.
