# MedFlow AI — Phase 9: Intelligent inbound scheduling (planning only)

> **Status: Planning / documentation only.**  
> No live scheduling, no live medical triage, no Prisma migrations, no changes to Phase 1–8 runtime workflows.

## Requirement

When a client calls inbound, the AI agent collects needs and visit reason, matches the best qualified nurse/provider, verifies availability, offers valid slots, and finalizes booking — governed by the **Master Orchestrator** with full auditability.

## Preservation (must not break)

- Session and cross-session coordination  
- Master Orchestrator control; staff override priority  
- `AuditLog` and `ClientTimelineEvent` consistency  
- AI agent collaboration boundaries  
- Webhook security (Phase 6/8)  
- HIPAA-conscious safety rules (Phase 8)  
- `MOCK_MODE` default protection  
- Reminder engine, n8n templates, RBAC, existing audits  

See [docs/phase9/ROADMAP.md](./docs/phase9/ROADMAP.md).

## Documents

| Document | Purpose |
|----------|---------|
| [docs/phase9/ROADMAP.md](./docs/phase9/ROADMAP.md) | Roadmap insertion & milestones |
| [docs/phase9/REQUIREMENTS.md](./docs/phase9/REQUIREMENTS.md) | Workflow steps 1–9 |
| [docs/phase9/COORDINATION.md](./docs/phase9/COORDINATION.md) | Links to Orchestrator, Appointment, audit, reminders, n8n |
| [docs/phase9/ARCHITECTURE.md](./docs/phase9/ARCHITECTURE.md) | Components & boundaries |
| [docs/phase9/DATA-MODEL-PLAN.md](./docs/phase9/DATA-MODEL-PLAN.md) | `ProviderProfile`, `ProviderSkill`, `ProviderAvailability`, `ProviderCapacityRule`, `SchedulingRecommendation` |
| [docs/phase9/WORKFLOWS.md](./docs/phase9/WORKFLOWS.md) | Mermaid diagrams |
| [docs/phase9/GOVERNANCE.md](./docs/phase9/GOVERNANCE.md) | Risk tiers & orchestrator rules |
| [docs/phase9/SERVICE-INTERFACES.md](./docs/phase9/SERVICE-INTERFACES.md) | Service module map |

## Planned service interfaces (TypeScript, no runtime)

| File | Role |
|------|------|
| [provider-matching.service.ts](./src/lib/scheduling/planning/provider-matching.service.ts) | Provider ranking |
| [availability-checking.service.ts](./src/lib/scheduling/planning/availability-checking.service.ts) | Slot validation |
| [intelligent-scheduling.service.ts](./src/lib/scheduling/planning/intelligent-scheduling.service.ts) | Inbound flow facade |
| [interfaces.ts](./src/lib/scheduling/planning/interfaces.ts) | Shared types |

## Validation (planning phase)

```bash
npm run audit:coordination
npm run audit:architecture
npm run audit:security
npm run audit:production
npm run build
```

Expected: all audits pass; no schema migration; no live calls/SMS/email.

## Builds on existing MedFlow

Phases 1–8: `Appointment`, `Client`, `CallLog`, `StaffIntervention`, `AgentAction`, reminder engine, n8n, webhook auth, security middleware.
