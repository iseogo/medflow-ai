# MedFlow AI — Phase 3: Master Orchestrator

Phase 3 centralizes all AI behavior behind a **Master Orchestrator**. AI agents cannot act independently or modify core records without a proposal workflow.

**Still out of scope:** Real Twilio/Vapi calls, live SMS/email delivery, and automated reminder schedules.

## Architecture

```
AI Agent → submitProposal() → Master Orchestrator (auto/staff review)
         → APPROVE → executeApprovedProposal() → Communication stubs (Phase 2)
         → REJECT / ESCALATE → Staff intervention / tasks
```

Staff-initiated communications use `source: "staff"` and bypass proposals.

## Agent definitions

Nine agents in `src/lib/agents/definitions.ts`:

| Agent | Role |
|-------|------|
| Master Orchestrator Agent | Approves, rejects, escalates — never contacts patients |
| Front Desk AI Agent | Check-in context, notes |
| Intake AI Agent | Intake notes only |
| Appointment AI Agent | Proposes schedule changes |
| Voice Call AI Agent | Proposes calls |
| SMS Reminder AI Agent | Proposes SMS |
| Email AI Agent | Proposes email |
| Staff Assistant AI Agent | Proposes internal staff tasks |
| Escalation AI Agent | Escalations and halt automation |

Each definition includes:

- `systemPrompt`
- `allowedActions`
- `forbiddenActions`
- `escalationRules`
- `humanHandoffRules`

`GET /api/agents/definitions` returns the full catalog.

## Proposal workflow

1. AI calls `POST /api/orchestrator/proposals` (or legacy `POST /api/agent-actions`).
2. Emergency text scan may trigger **emergency flow** immediately.
3. Forbidden actions are rejected at submission.
4. Master Orchestrator auto-reviews (rule-based stub).
5. Staff calls `PATCH /api/orchestrator/proposals/:id` with `APPROVE`, `REJECT`, or `ESCALATE` (`orchestrator:review`).
6. Approved actions execute via Phase 2 communication stubs.

### `AgentProposalStatus`

`PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `ESCALATED`, `EXECUTED`

## Emergency safety flow

`POST /api/orchestrator/emergency-check` or emergency language in `contentForEmergencyScan` on proposals:

- Stops normal automation (`automationHalted: true`)
- Creates **URGENT** `StaffTask`
- Creates **URGENT** `StaffIntervention`
- Writes `EMERGENCY_DETECTED` timeline event + audit log
- Marks proposal `ESCALATED` with `isEmergency: true`
- Surfaces on `/dashboard/agent-coordination`

Emergency patterns: chest pain, can't breathe, stroke, 911, suicide, etc. (`src/lib/emergency-detect.ts`).

## Services

| File | Purpose |
|------|---------|
| `src/services/master-orchestrator.service.ts` | Proposals, review, execute, emergency |
| `src/services/orchestrator.service.ts` | Phase 2 comm stubs (requires `staff` or `master_orchestrator` source) |
| `src/services/twilio.service.ts` | Stub only |
| `src/services/email.service.ts` | Stub only |
| `src/services/n8n.service.ts` | Stub only |

## Dashboard

`/dashboard/agent-coordination` shows:

- Emergency banner
- Counts: pending, approved, rejected, escalated
- Tables per status + full list

## API summary

| Method | Path |
|--------|------|
| GET | `/api/agents/definitions` |
| GET, POST | `/api/orchestrator/proposals` |
| GET, PATCH | `/api/orchestrator/proposals/:id` |
| POST | `/api/orchestrator/emergency-check` |

RBAC: `orchestrator:read`, `orchestrator:write`, `orchestrator:review`

## Verification

```bash
npm run audit:phase3
npm run audit:cross-phase
```

## Setup

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

## Next: Phase 4

Replace stub services with real providers while keeping the Master Orchestrator gate unchanged.
