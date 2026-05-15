# MedFlow AI — Phase 3.5: Staff Accounts, RBAC & Auth Hardening

Phase 3.5 ensures every staff member has an individual account, role-based permissions, and auditable actions before walk-ins and live AI communications.

**Still out of scope:** Twilio, Vapi, real SMS/email, insurance verification, medical records APIs.

## Staff accounts

| Field | Description |
|-------|-------------|
| Full name | `firstName`, `lastName` |
| Email | Unique login |
| Role | One of 7 `RoleType` values |
| Status | `ACTIVE`, `INACTIVE`, `SUSPENDED` |
| `forcePasswordReset` | Must change password on next login |
| `lastLoginAt` | Updated on successful login |
| `createdAt` / `updatedAt` | Standard timestamps |

### Dashboard: `/dashboard/staff`

**Admin** and **Manager** (`users:manage`) can:

- Create staff users (individual bcrypt password, `forcePasswordReset` default `true`)
- Edit profile and role
- Deactivate (`INACTIVE`)
- Reset password (forces change on next login)

### Seed users (local dev only)

| Email | Password | Role |
|-------|----------|------|
| admin@medflow.ai | Admin123! | ADMIN |
| manager@medflow.ai | Manager123! | MANAGER |
| frontdesk@medflow.ai | FrontDesk123! | FRONT_DESK_STAFF |
| billing@medflow.ai | Billing123! | BILLING_STAFF |
| records@medflow.ai | Records123! | MEDICAL_RECORDS_STAFF |
| clinical@medflow.ai | Clinical123! | CLINICAL_STAFF |
| readonly@medflow.ai | ReadOnly123! | READ_ONLY |

All passwords are stored as **bcrypt** hashes only — no shared password.

## Password security

- `src/lib/password.ts` — hash, verify, strength rules, reset token helpers
- **Change password:** `/dashboard/settings` (+ API `POST /api/auth/change-password`)
- **Forgot password (placeholder):** `/forgot-password` + `POST /api/auth/forgot-password` (creates `PasswordResetToken`; logs token in dev, no email yet)
- **Session:** JWT, 8-hour max age; `forcePasswordReset` redirects to settings until cleared
- **Login / logout** audit events with actor fields and IP when available

## RBAC

Permissions are defined in `src/lib/rbac.ts`. Dashboard routes are mapped in `src/lib/route-permissions.ts` and enforced in `src/middleware.ts`.

| Role | Access summary |
|------|----------------|
| ADMIN | Full access |
| MANAGER | Staff, clients, appointments, audit, reports, communications read |
| FRONT_DESK_STAFF | Clients, appointments, walk-ins / staff intervention |
| BILLING_STAFF | Limited clients, billing tasks |
| MEDICAL_RECORDS_STAFF | Limited clients, `/dashboard/medical-records` placeholder |
| CLINICAL_STAFF | Appointments, check-ins, clinical notes placeholder |
| READ_ONLY | View-only across allowed routes |

Unauthorized dashboard access → `/dashboard/access-denied`.

## Audit ownership

`AuditLog` fields: `actorUserId`, `actorName`, `actorRole`, `action`, `targetType`, `targetId`, `createdAt`, `ipAddress`, `userAgent`.

`createAuditLog()` resolves actor from the user record when omitted.

## Staff override ownership

Replaces anonymous `staffOverride: true` with:

- `staffOverrideByUserId`
- `staffOverrideByName`
- `staffOverrideReason`
- `staffOverrideAt`

Plus `StaffOverride` table for ownership history. AI cannot override staff actions; active staff interventions block new AI proposals (`src/lib/ai-automation-guard.ts`).

## Verification

```bash
npm run db:push
npm run db:seed
npm run audit:staff-rbac
npm run audit:cross-phase
npx tsc --noEmit
npm run build
```

## Key files

| Path | Purpose |
|------|---------|
| `prisma/schema.prisma` | `UserStatus`, `PasswordResetToken`, `StaffOverride`, audit fields |
| `src/middleware.ts` | Route RBAC + forced password change |
| `src/app/dashboard/staff/` | Staff management UI |
| `src/app/api/staff/` | Staff CRUD API |
| `scripts/staff-rbac-audit.ts` | Automated Phase 3.5 checks |

## Next: Phase 4

Physical walk-ins UI and real communication providers behind existing orchestrator gates.
