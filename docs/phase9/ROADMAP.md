# Phase 9 roadmap — Intelligent inbound call scheduling

**Status: Planning / documentation only (inserted into MedFlow roadmap).**

## Requirement summary

When a client calls inbound, the AI voice agent must:

1. Collect client needs and reason for visit (not clinical diagnosis)  
2. Match the client to the best qualified nurse/provider  
3. Verify provider availability  
4. Offer valid appointment slots  
5. Finalize booking through governance controls  

**Out of scope for this roadmap entry:** live scheduling engine, live medical triage, schema migrations, API/route changes, or modifications to Phase 1–8 stable workflows.

## Roadmap position

| Phase | Status | Focus |
|-------|--------|--------|
| 1–4 | **Stable** | Foundation, comms, orchestrator, physical front desk |
| 5 | **Stable** | Reminder engine |
| 6 | **Stable** | Integrations + `MOCK_MODE` |
| 7 | **Stable** | n8n workflow templates |
| 8 | **Stable** | HIPAA-conscious security hardening |
| **9** | **Planning** | Inbound scheduling + provider matching (this document) |
| 9+ build | Future | Migrations, services, voice session implementation |
| 10+ | Future | Insurance APIs, medical records, production cron scale |

## Preservation constraints (must not break)

Future Phase 9 **implementation** must preserve:

| Area | Requirement |
|------|-------------|
| Session coordination | Effective state within each `SchedulingCallSession` |
| Cross-session coordination | No conflicting proposals; idempotent orchestrator handling |
| Master Orchestrator | All mutations via `AgentAction` proposals |
| Staff override | Staff actions supersede AI; existing override fields |
| Audit log consistency | `AuditLog` + PHI-safe metadata (Phase 8) |
| Client timeline | `ClientTimelineEvent` for book, escalate, emergency |
| AI agent collaboration | `VOICE_CALL_AI`, `INTAKE_AI`, `APPOINTMENT_AI` boundaries |
| Webhook security | `/api/webhooks/*` machine auth unchanged |
| HIPAA-conscious safety | `ai-safety.ts`; no diagnosis/treatment advice |
| Mock-mode protection | `MOCK_MODE=true` default; no live calls/SMS/email until configured |
| Phase 1–8 audits | `audit:coordination`, `audit:architecture`, `audit:security`, `audit:production` remain passing |
| Reminder engine | Post-book reminder schedule unchanged contract |
| n8n workflows | Phase 7 templates remain valid; Phase 9 adds optional handlers later |
| Provider abstraction | Phase 6 integration stubs; no bypass |

## Deliverables (planning phase — current)

- [x] [REQUIREMENTS.md](./REQUIREMENTS.md) — workflow steps 1–9  
- [x] [ARCHITECTURE.md](./ARCHITECTURE.md) — components & boundaries  
- [x] [DATA-MODEL-PLAN.md](./DATA-MODEL-PLAN.md) — planned entities (not migrated)  
- [x] [WORKFLOWS.md](./WORKFLOWS.md) — diagrams  
- [x] [GOVERNANCE.md](./GOVERNANCE.md) — risk tiers & orchestrator rules  
- [x] [COORDINATION.md](./COORDINATION.md) — links to existing MedFlow models  
- [x] [SERVICE-INTERFACES.md](./SERVICE-INTERFACES.md) — module map  
- [x] Planning TypeScript interfaces under `src/lib/scheduling/planning/`  

## Implementation milestones (future — not Phase 9 planning)

1. Prisma migration per `DATA-MODEL-PLAN.md`  
2. Implement `provider-matching`, `availability-checking`, `intelligent-scheduling` services  
3. Orchestrator proposal types + approval UI queue  
4. Voice webhook session state machine (mock-first)  
5. `npm run audit:scheduling`  
6. Pilot with `MOCK_MODE=true`  

## Success criteria (future build)

- Inbound mock call completes book or handoff with full audit trail  
- Emergency path never auto-books  
- Staff override cancels in-flight AI proposals  
- All five production audits pass  
