# MedFlow AI — Phase 4: Physical Client Management

Phase 4 adds front-desk workflows for **first-time walk-ins** and **returning physical check-ins**, with a live **waiting room** queue. Every action writes to the client timeline, audit log, and Master Orchestrator (as staff-override events).

**Still out of scope:** Real Twilio/Vapi/SMS/email, insurance verification APIs, document upload storage.

## Models

| Model | Purpose |
|-------|---------|
| `WalkInVisit` | First-time or returning walk-in registration + onboarding |
| `PhysicalCheckIn` | Arrival / check-in event linked to client + optional appointment |
| `WaitingRoomStatus` | Queue state, wait duration, provider notification timestamps |

### Client extensions

- Address fields (`addressLine1`, `city`, `state`, `postalCode`)
- `preferredLanguage`
- `communicationPreferences` (JSON)
- `insurancePlaceholder` / `documentsPlaceholder` (JSON placeholders)

### Enums

- `WaitingRoomState`: `CHECKED_IN`, `WAITING`, `CALLED`, `WITH_PROVIDER`, `COMPLETED`, `WALK_OUT`, `NO_SHOW`
- Active board (`/dashboard/waiting-room`): `CHECKED_IN`, `WAITING`, `WITH_PROVIDER` — excludes `COMPLETED`, `NO_SHOW`, `WALK_OUT`
- `AppointmentStatus` includes `WALK_OUT`
- Timeline types: `WALK_IN_REGISTERED`, `PHYSICAL_CHECK_IN`, `WAITING_ROOM_ARRIVED`, `WAITING_ROOM_STATUS_CHANGED`, `PROVIDER_NOTIFIED`

## Dashboard

| Route | Purpose |
|-------|---------|
| `/dashboard/walk-ins` | First-time walk-in setup form + recent visits |
| `/dashboard/check-ins` | Search returning clients + check in |
| `/dashboard/waiting-room` | Live queue and status updates |

RBAC: `walkins:read` / `walkins:write`, `checkins:read` / `checkins:write` (Front desk, Manager, Admin, Clinical for check-ins).

## First-time walk-in flow

Staff submits `/api/walk-ins` (POST) which:

1. Creates **Client** with demographics, contact, language, comm prefs
2. Records **Consent** (voice/SMS/email)
3. Stores insurance + document **placeholders**
4. Creates **Appointment** and **WalkInVisit** (onboarding in progress)
5. Creates **PhysicalCheckIn** + **WaitingRoomStatus** (`WAITING`)
6. Opens **StaffIntervention** + **StaffTask** for onboarding
7. Timeline + audit + **staff override** + **Master Orchestrator** notification

## Returning check-in flow

`GET /api/check-ins?q=` searches by name, phone, email, MRN, or appointment ID.

`POST /api/check-ins` checks the client in, updates appointment to `WAITING`, creates waiting room entry, optionally notifies provider via staff task.

## Waiting room

`GET /api/waiting-room` — active queue  
`PATCH /api/waiting-room` — `{ waitingRoomId, state }` updates queue and syncs appointment status (`WITH_PROVIDER`, `COMPLETED`, `WALK_OUT`, `NO_SHOW`).

Wait duration is stored in `waitDurationMinutes` and shown live in the UI.

## Orchestrator integration

`src/lib/orchestrator-notify.ts` records staff physical events as **executed** `AgentAction` rows with `staffOverride` ownership — AI does not auto-act on these.

## Services

| File | Role |
|------|------|
| `src/services/physical-client.service.ts` | Walk-in, check-in, waiting room logic |
| `src/lib/physical-events.ts` | Timeline + audit + override + orchestrator wrapper |

## API summary

| Method | Path |
|--------|------|
| GET, POST | `/api/walk-ins` |
| GET, POST | `/api/check-ins` (`?q=` search on GET) |
| GET, PATCH | `/api/waiting-room` |

## Setup

```bash
npm run db:push
npm run db:seed
npm run dev
```

Sign in as `frontdesk@medflow.ai` / `FrontDesk123!` (change password on first login if prompted).

## Verification

```bash
npx tsc --noEmit
npm run build
npm run audit:cross-phase
```

## Next phases

Real document upload, insurance eligibility APIs, and communication provider integrations behind the existing orchestrator gates.
