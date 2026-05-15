# MedFlow AI — Phase 1

Foundation for a healthcare AI communication platform. Phase 1 delivers authentication, role-based access, core data models, dashboard UI, unified client timelines, and audit logging.

**Out of scope for Phase 1:** AI calls, SMS, email, reminders, insurance, and medical records.

## Infrastructure

| Setting | Value |
|--------|--------|
| App URL | https://medflow.smartdeskai.cloud |
| n8n URL | https://n8n.smartdeskai.cloud |
| Timezone | America/Chicago |

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32` (do not use the example value in production)
- `NEXTAUTH_URL` — `http://localhost:3000` for local dev

Optional seed overrides:

- `SEED_ADMIN_EMAIL` (default: `admin@medflow.ai`)
- `SEED_ADMIN_PASSWORD` (default: `Admin123!`)

### 3. Start PostgreSQL

```bash
docker compose up -d
```

Or use any PostgreSQL 14+ instance reachable from `DATABASE_URL`.

### 4. Migrate and seed

```bash
npm run db:migrate
npm run db:seed
```

`db:migrate` runs `prisma migrate dev`, creates the database if needed, applies migrations, and runs the seed on first setup.

Alternative (prototyping only, no migration history):

```bash
npm run db:push
npm run db:seed
```

### 5. Run the app

```bash
npm run dev
```

Open http://localhost:3000 and sign in with the seeded admin (see table below).

| Role | Email | Password (default seed) |
|------|-------|-------------------------|
| Admin | admin@medflow.ai | Admin123! |

> Stop the dev server before `npm run build` if Prisma reports a file-lock (`EPERM`) on Windows.

## Phase 1 verification

```bash
npx tsc --noEmit
npx prisma db seed
npm run audit:phase1
npm run build
```

## Cross-phase verification (Phases 1–3)

After Phase 2 and Phase 3 work is in place:

```bash
npm run audit:phase1
npm run audit:phase2
npm run audit:phase3
npm run audit:cross-phase
npm run audit:full-coordination
```

`audit:cross-phase` runs coordination tests for Phases 1–4 (AI proposal → orchestrator → communication → timeline → audit, staff-override blocking, waiting room).

`audit:full-coordination` is the pre–next-phase gate: TypeScript, RBAC, cross-phase audits, data-integrity checks, end-to-end workflow (staff login → client → appointment → check-in → waiting room → AI proposal → orchestrator → communication → timeline → audit → staff override), and production build.

## Folder structure

```
medflow-ai/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── scripts/
│   └── phase1-audit.ts
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   ├── health/
│   │   │   ├── clients/
│   │   │   ├── appointments/
│   │   │   ├── staff-intervention/
│   │   │   ├── staff-tasks/
│   │   │   └── audit/
│   │   └── dashboard/
│   │       ├── page.tsx
│   │       ├── clients/
│   │       ├── appointments/
│   │       ├── staff-intervention/
│   │       ├── audit-logs/
│   │       └── settings/
│   ├── components/
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── rbac.ts
│   │   ├── audit.ts
│   │   ├── timeline.ts
│   │   ├── staff-override.ts
│   │   └── api-auth.ts
│   └── middleware.ts
├── docker-compose.yml
└── .env.example
```

## Database models (Phase 1)

| Model | Purpose |
|-------|---------|
| **User** | Staff accounts (bcrypt password hash) |
| **Role** | RBAC role definitions |
| **Client** | Patients / clients |
| **Appointment** | Visits with full status enum |
| **StaffTask** | Internal staff work items |
| **StaffIntervention** | Walk-ins, escalations, human takeover |
| **AuditLog** | Immutable action trail |
| **ClientTimelineEvent** | Unified per-client activity feed |
| **ConsentRecord** | Consent preferences (model only; APIs in later phases) |

### Roles

`ADMIN`, `MANAGER`, `FRONT_DESK_STAFF`, `BILLING_STAFF`, `MEDICAL_RECORDS_STAFF`, `CLINICAL_STAFF`, `READ_ONLY`

### Appointment statuses

`SCHEDULED`, `CONFIRMED`, `RESCHEDULE_REQUESTED`, `RESCHEDULED`, `CANCELLED`, `CHECKED_IN`, `WAITING`, `WITH_PROVIDER`, `COMPLETED`, `NO_SHOW`, `FOLLOW_UP_NEEDED`

### Staff intervention statuses

`WALK_IN`, `HUMAN_TAKEOVER`, `AI_ESCALATED`, `STAFF_REVIEW_REQUIRED`, `RESOLVED`, `FOLLOW_UP_NEEDED`, `URGENT`

## Design principles

1. **Unified timeline** — API mutations append `ClientTimelineEvent` records via `src/lib/timeline.ts`.
2. **Audit important actions** — Creates, updates, status changes, logins, and staff overrides use `src/lib/audit.ts`.
3. **Staff overrides AI** — `staffOverride` on `StaffTask` / `StaffIntervention` (schema default `true`); staff appointment writes set `staffOverride` via `src/lib/staff-override.ts`. Intervention updates log `STAFF_OVERRIDE` audit events.

## Dashboard routes

| Route | Description |
|-------|-------------|
| `/dashboard` | Overview |
| `/dashboard/clients` | Client list |
| `/dashboard/clients/[id]` | Profile + unified timeline |
| `/dashboard/appointments` | Appointments |
| `/dashboard/staff-intervention` | Staff interventions |
| `/dashboard/audit-logs` | Audit trail (RBAC: `audit:read`) |
| `/dashboard/settings` | Account & platform info |

Protected by NextAuth middleware (`/dashboard/*`).

## API overview

Session required on all routes except `/api/health` and `/api/auth/*`. Permissions: `src/lib/rbac.ts`.

| Method | Path |
|--------|------|
| GET | `/api/health` |
| GET, POST | `/api/clients` |
| GET, PATCH | `/api/clients/:id` |
| GET | `/api/clients/:id/timeline` |
| GET, POST | `/api/appointments` |
| GET, PATCH | `/api/appointments/:id` |
| GET, POST | `/api/staff-intervention` |
| PATCH | `/api/staff-intervention/:id` |
| GET, POST | `/api/staff-tasks` |
| GET | `/api/audit` |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` + production build |
| `npm run db:migrate` | Apply migrations (dev) |
| `npm run db:push` | Push schema without migrations |
| `npm run db:seed` | Seed roles + admin + sample data |
| `npm run db:studio` | Prisma Studio |

## Security notes

- `.env` is gitignored; never commit secrets.
- Passwords are stored as bcrypt hashes only.
- Default seed credentials are for **local development**; change `SEED_ADMIN_PASSWORD` and rotate before any shared environment.
- Login page does not display passwords in production builds.

## Phase 2

Communication logging (calls, SMS, email, agent actions) with stub providers. See **[README-PHASE2.md](./README-PHASE2.md)**.

## Phase 3

Master Orchestrator and AI agent coordination. See **[README-PHASE3.md](./README-PHASE3.md)**.

## Phase 3.5

Staff accounts, RBAC, and authentication hardening. See **[README-PHASE3-5.md](./README-PHASE3-5.md)**.

## Phase 4

Physical client management — walk-ins, check-ins, waiting room. See **[README-PHASE4.md](./README-PHASE4.md)**.

```bash
npm run audit:staff-rbac
```

## Next phases

Phase 4+ will wire real Twilio/Vapi/Gmail/n8n, reminders, insurance, and medical records APIs.
