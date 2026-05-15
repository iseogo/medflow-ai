# MedFlow AI — Phase 2: Communication Logging

Phase 2 adds a **communication logging system** on top of the Phase 1 foundation. All external providers are **stubs** — nothing is sent to Twilio, Vapi, Gmail, or n8n in production yet.

## What's new

### Database models

| Model | Description |
|-------|-------------|
| `CallLog` | Voice call records (inbound/outbound) |
| `SmsLog` | SMS message records |
| `EmailLog` | Email records |
| `AgentAction` | AI agent coordination events |

### `CommunicationStatus` enum

`PENDING`, `SENT`, `DELIVERED`, `ANSWERED`, `FAILED`, `NO_ANSWER`, `BOUNCED`, `RESPONDED`, `ESCALATED`

### Dashboard pages

| Route | Purpose |
|-------|---------|
| `/dashboard/calls` | All call logs |
| `/dashboard/outbound-calls` | Outbound calls only |
| `/dashboard/sms` | SMS logs |
| `/dashboard/emails` | Email logs |
| `/dashboard/agent-coordination` | Agent proposals (expanded in Phase 3) |

### Service stubs (`src/services/`)

| File | Role |
|------|------|
| `twilio.service.ts` | Mock SMS + voice (no Twilio API) |
| `email.service.ts` | Mock email send (no SMTP/Gmail) |
| `n8n.service.ts` | Mock workflow trigger (logs only) |
| `orchestrator.service.ts` | Coordinates send → log → timeline → audit |

### API routes

| Method | Path | Description |
|--------|------|-------------|
| GET, POST | `/api/calls` | List / log calls |
| GET, POST | `/api/calls/outbound` | Outbound calls |
| GET, POST | `/api/sms`, `/api/sms/send` | SMS logs |
| GET, POST | `/api/emails`, `/api/emails/send` | Email logs |
| GET, POST | `/api/agent-actions` | Agent coordination |

RBAC permissions: `communications:read`, `communications:write`

## Behavior

Every communication:

1. **Links to a client** (required) and **appointment** (optional)
2. **Checks for duplicates** — same `clientId` + `appointmentId` + `channel` + `purpose` → HTTP 409
3. **Creates `ClientTimelineEvent`** on the client timeline
4. **Creates `AuditLog`** for the action

Duplicate logic: `src/lib/communication-dedup.ts`  
Timeline + audit helpers: `src/lib/communication-log.ts`

## Setup

From Phase 1, with PostgreSQL running:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

## Verification

```bash
npx tsc --noEmit
npm run audit:phase2
npm run audit:cross-phase
npm run build
```

Migration name: `phase2_communication_logging` (created on first `migrate dev` after pulling).

## Example API usage

**Send SMS (stub):**

```bash
curl -X POST http://localhost:3000/api/sms/send \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d '{
    "clientId": "<client-id>",
    "appointmentId": "<appointment-id>",
    "purpose": "appointment_reminder",
    "messageBody": "Your visit is tomorrow at 10 AM."
  }'
```

**Outbound call (stub):**

```bash
curl -X POST http://localhost:3000/api/calls/outbound \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d '{
    "clientId": "<client-id>",
    "purpose": "follow_up_outreach"
  }'
```

Repeating the same `clientId`, `appointmentId`, `purpose`, and channel returns **409 Duplicate**.

## Out of scope (Phase 2)

- Real Twilio / Vapi voice
- Real Gmail / SMTP
- Live n8n webhooks
- Automated reminder schedules (Phase 3+)

## Phase 3 coordination

AI agents cannot call communication APIs directly. All AI sends go through the Master Orchestrator (`README-PHASE3.md`). Staff sends use `source: "staff"` on the Phase 2 orchestrator.

Run `npm run audit:cross-phase` after Phase 3 to verify the full flow.

## Next: Phase 4

Wire real Twilio/Vapi/Gmail/n8n behind the same interfaces without changing log schema or orchestrator gates.
