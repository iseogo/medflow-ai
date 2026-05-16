# MedFlow AI — Security reference (Phase 8)

## Middleware stack

| Layer | File | Scope |
|-------|------|--------|
| Security | `src/middleware/security.ts` | Rate limits, secure headers |
| RBAC | `src/middleware/rbac.ts` | Dashboard routes + API coarse permissions |
| Audit | `src/middleware/audit.ts` | Sensitive API access audit (async, no PHI) |

Composed in root `src/middleware.ts` for `/dashboard/*` and `/api/*`.

## Webhook authentication

Machine-to-machine routes under `/api/webhooks/*` skip session RBAC but require:

- `WEBHOOK_SECRET` header / Bearer / HMAC (`src/lib/integrations/webhook-auth.ts`)
- Twilio signature on `/api/webhooks/twilio/*`

## PHI-safe logging

Use `phiSafeLog()` / `sanitizeMetadataForAudit()` — never log:

- Full phone numbers or emails  
- Message bodies or clinical notes  
- API keys or webhook secrets  

Integration code uses `src/lib/integrations/safe-log.ts` (delegates to PHI-safe module).

## Data access

Before returning a client record:

```typescript
await assertClientDataAccess({ user, clientId, action: "read", meta });
```

Writes an audit `VIEW` row without embedding PHI in metadata.

## Export and file access

```typescript
import { logExportAccess, logFileAccessPlaceholder } from "@/lib/security/audit-enforcement";

await logExportAccess({ userId, actorRole, exportType: "clients_csv", recordCount: 42 });
await logFileAccessPlaceholder({ userId, actorRole, fileRef: "s3://bucket/key", operation: "read" });
```

## Session policy

Configured in `src/lib/auth.ts` via `src/lib/security/session-policy.ts`.

## Rate limits (defaults)

| Bucket | Limit / minute |
|--------|------------------|
| API (authenticated) | 120 |
| Auth | 20 |
| Webhooks | 300 |

Override with `RATE_LIMIT_*` env vars.

## Related

- [HIPAA-CONSCIOUS.md](./HIPAA-CONSCIOUS.md)  
- [INTEGRATIONS.md](./INTEGRATIONS.md)  
- [README-PHASE8.md](../README-PHASE8.md)
