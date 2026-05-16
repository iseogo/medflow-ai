# MedFlow AI — Phase 9: Intelligent inbound scheduling (planning only)

> **Status: Planning / documentation only.** No live scheduling engine, calendar sync, or medical triage implementation in this phase.

Phase 9 defines how an **inbound voice AI agent** will collect intake, perform **safety triage** (not clinical diagnosis), match clients to qualified providers, verify availability, offer slots, and book appointments — all through the **Master Orchestrator** with full auditability.

## Scope

| In scope (Phase 9 docs) | Out of scope (future implementation) |
|-------------------------|--------------------------------------|
| Architecture & workflows | Live Twilio/voice STT production loop |
| Proposed data model | Real-time calendar sync (Google/Outlook) |
| Service interfaces (types only) | Medical diagnosis / treatment triage |
| Governance & handoff rules | Auto-booking without orchestrator approval |
| Mermaid workflow diagrams | Insurance eligibility APIs |

## Documents

| Document | Purpose |
|----------|---------|
| [docs/phase9/ARCHITECTURE.md](./docs/phase9/ARCHITECTURE.md) | System components, boundaries, integration points |
| [docs/phase9/DATA-MODEL-PLAN.md](./docs/phase9/DATA-MODEL-PLAN.md) | Proposed Prisma models & migrations (not applied) |
| [docs/phase9/WORKFLOWS.md](./docs/phase9/WORKFLOWS.md) | End-to-end call → book / escalate flows |
| [docs/phase9/GOVERNANCE.md](./docs/phase9/GOVERNANCE.md) | Orchestrator, audit, staff override, risk tiers |
| [docs/phase9/SERVICE-INTERFACES.md](./docs/phase9/SERVICE-INTERFACES.md) | Service contracts & module map |
| [src/lib/scheduling/planning/interfaces.ts](./src/lib/scheduling/planning/interfaces.ts) | TypeScript planning interfaces (no runtime) |

## High-level flow

```
Inbound call → Voice AI (intake) → Safety triage → Provider matching
    → Availability engine → Slot offers → Orchestrator proposal → Book / Handoff
```

## Builds on existing MedFlow

- `Appointment`, `Client`, `CallLog`, `StaffIntervention`, `AgentAction` (orchestrator)
- Phase 8: PHI-safe logging, RBAC, audit, AI safety (`src/lib/security/ai-safety.ts`)
- Phase 5: Reminder engine after booking
- Phase 6/7: Webhooks & n8n for voice/SMS/email side effects

## Next implementation phase (not Phase 9)

When moving from planning to build:

1. Apply `DATA-MODEL-PLAN.md` migrations  
2. Implement services behind `src/lib/scheduling/planning/interfaces.ts`  
3. Extend `ProposedActionKey` + orchestrator handlers  
4. Wire voice webhook → intake session state machine  
5. Add `npm run audit:scheduling` static checks  
