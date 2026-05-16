# Phase 9 — Service interfaces (planning only)

**No runtime implementations.** Phase 1–8 services are unchanged.

## Primary planning interfaces (required)

| Planning file | Future implementation | Responsibility |
|---------------|----------------------|----------------|
| [`provider-matching.service.ts`](../../src/lib/scheduling/planning/provider-matching.service.ts) | `src/services/scheduling/provider-matching.service.ts` | Rank providers by skills, specialty, urgency, gender pref, load |
| [`availability-checking.service.ts`](../../src/lib/scheduling/planning/availability-checking.service.ts) | `src/services/scheduling/availability-checking.service.ts` | Clinic hours, buffers, conflicts, capacity |
| [`intelligent-scheduling.service.ts`](../../src/lib/scheduling/planning/intelligent-scheduling.service.ts) | `src/services/scheduling/intelligent-scheduling.service.ts` | Inbound session orchestration + orchestrator proposals |

Shared types: [`interfaces.ts`](../../src/lib/scheduling/planning/interfaces.ts)

## Supporting interfaces (future)

| Interface | File | Responsibility |
|-----------|------|----------------|
| `IVoiceSessionService` | `interfaces.ts` | Call/session lifecycle |
| `IIntakeCollectorService` | `interfaces.ts` | Field collection |
| `ISafetyTriageService` | `interfaces.ts` | Emergency routing (not clinical triage) |
| `ISchedulingOrchestratorBridge` | `interfaces.ts` | Master Orchestrator proposals |

## Dependency direction

```
intelligent-scheduling
  ├── provider-matching
  ├── availability-checking
  └── orchestrator bridge (future) → master-orchestrator.service
```

## Orchestrator bridge

All mutations submit to `masterOrchestratorService` with:

- `agentType: VOICE_CALL_AI | INTAKE_AI | APPOINTMENT_AI`  
- `actionType` from `SchedulingProposalActionType` in `interfaces.ts`  
- `proposedPayload` matching interface types  
- `clientId`, optional `appointmentId`, `callLogId`  

## External integrations (unchanged contracts)

| Integration | Phase | Role |
|-------------|-------|------|
| Twilio voice webhook | 6 | Ingress |
| n8n | 7 | Optional STT/TTS |
| SendGrid / SMS | 6 | Confirmations (proposed, mock-first) |
| Reminder engine | 5 | Post-book schedules |

## Testing strategy (future build)

- Unit: matching scores, availability overlap, capacity  
- Integration: mock orchestrator approvals  
- `npm run audit:scheduling` (to be added with implementation)  

## See also

- [COORDINATION.md](./COORDINATION.md)  
- [REQUIREMENTS.md](./REQUIREMENTS.md)  
- [ROADMAP.md](./ROADMAP.md)  
