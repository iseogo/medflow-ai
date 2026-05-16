# MedFlow AI — Phase 5: Reminder engine (logic only)

Phase 5 adds an **AI voice-first** appointment reminder engine. All external providers remain **stubbed** (no real Twilio, Vapi, Retell, Gmail SMTP, or n8n execution).

## Goals

- **Every reminder cycle** attempts, in order:
  1. **AI voice call** (simulated via `voiceAiReminderService` + transport stub)
  2. **SMS** (existing `orchestratorService.sendSms` → Twilio stub)
  3. **Email** (existing `orchestratorService.sendEmail` → email stub)
- **Schedules** (minutes before `appointment.scheduledAt`):
  - 48 hours (`HOURS_48`)
  - 24 hours (`HOURS_24`)
  - 2 hours (`HOURS_2`)
  - 30 minutes (`MINUTES_30`)

## Preconditions (before any send)

The engine refuses to run when any of these fail:

| Check | Behavior |
|--------|----------|
| **Consent** | PHONE required for voice; SMS/EMAIL for those channels. If none granted → `NO_CONSENT` (skipped in batch). |
| **Appointment status** | Only `SCHEDULED` and `CONFIRMED` are eligible. |
| **Duplicate cycle** | `ReminderLog` is unique on `(appointmentId, reminderOffset)`. Communication dedup uses distinct `purpose` per channel. |
| **Staff paused automation** | `appointment.reminderAutomationPaused` or global `assertAiAutomationAllowed` (Phase 3 staff interventions / halts). |

## Data model

- **`ReminderLog`**: one row per `(appointment, reminderOffset)` with `ReminderOutcome`, optional links to `CallLog` / `SmsLog` / `EmailLog`, and JSON `metadata`.
- **`Appointment.reminderAutomationPaused`**: staff can pause reminder automation per appointment (`PATCH /api/appointments/[id]` with `reminderAutomationPaused`).

## Outcomes (`ReminderOutcome`)

- `CONFIRMED` — client confirmed visit; appointment set to **CONFIRMED**
- `CANCELLED` — client cancelled; appointment **CANCELLED**, staff task, slot treated as reopened in timeline metadata
- `RESCHEDULE_REQUESTED` — appointment **RESCHEDULE_REQUESTED**; staff task with placeholder copy for offering slots
- `NO_RESPONSE` — cycle completed; transport ok / no decisive intent (stub default)
- `FAILED` — voice failure without near-visit escalation tier
- `ESCALATED` — voice failed on **2h** or **30m** window after SMS+email fallbacks; **urgent staff task** created

## Voice failure handling

If the AI voice step does not complete successfully (`NO_ANSWER` / `FAILED`):

- Call log updated to `NO_ANSWER` or `FAILED`
- **SMS** and **email** still run (if consented), using separate dedup purposes
- For **`HOURS_2`** and **`MINUTES_30`**, an **urgent staff task** is created (escalation)

## Stub configuration (local testing)

Environment variables for **voice AI stub only** (optional):

| Variable | Effect |
|----------|--------|
| `REMINDER_VOICE_STUB_CONNECT` | `0` / `false` — simulate failed / no-answer voice |
| `REMINDER_VOICE_STUB_INTENT` | `NONE` (default), `CONFIRMED`, `CANCELLED`, `RESCHEDULE_REQUESTED` — simulated client reply when connected |

## API

| Method | Path | Permission |
|--------|------|-------------|
| `GET` | `/api/reminders` | `reminders:read` |
| `POST` | `/api/reminders/run` | `reminders:write` |

**POST body (batch):**

```json
{ "windowMinutes": 15, "limit": 50, "appointmentId": "optional-filter" }
```

**POST body (single test):**

```json
{ "appointmentId": "...", "offset": "HOURS_48" }
```

`offset` must be one of: `HOURS_48`, `HOURS_24`, `HOURS_2`, `MINUTES_30`.

## Dashboard

- **`/dashboard/reminders`** — log table + “Run due reminders” + optional manual single cycle (for QA).

## RBAC

New permissions: **`reminders:read`**, **`reminders:write`**.

- **ADMIN**, **MANAGER**, **FRONT_DESK_STAFF**: read + write  
- **CLINICAL_STAFF**, **READ_ONLY**: read only  

## Services (entry points)

- `src/services/voice-ai-reminder.service.ts` — AI voice reminder stub  
- `src/services/reminder-engine.service.ts` — scheduling, guards, outcomes, `ReminderLog`  
- `src/lib/communication-dedup.ts` — duplicate prevention (unchanged contract)  

## Migration

Apply Prisma migration: `20260516200000_phase5_reminder_engine`.

```bash
npx prisma migrate dev
# or
npx prisma db push
npx prisma generate
```

## Cron (future)

Call `POST /api/reminders/run` on a schedule (e.g. every 5–10 minutes) with a service account or protected `CRON_SECRET` header in a later phase.

---

**Phase 5 scope ends at logic + stubs.** Production voice/SMS/email and n8n orchestration are intentionally out of scope.
