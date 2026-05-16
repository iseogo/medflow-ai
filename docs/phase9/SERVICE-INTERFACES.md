# Phase 9 — Service interfaces

Contracts for future implementation. TypeScript definitions live in:

`src/lib/scheduling/planning/interfaces.ts`

**No runtime implementations in Phase 9.**

## Module map (planned)

| Service | File (future) | Responsibility |
|---------|---------------|----------------|
| `VoiceSessionService` | `src/services/scheduling/voice-session.service.ts` | Call/session lifecycle |
| `IntakeCollectorService` | `src/services/scheduling/intake-collector.service.ts` | Field collection & validation |
| `SafetyTriageService` | `src/services/scheduling/safety-triage.service.ts` | Emergency + urgency gates |
| `ProviderMatchingService` | `src/services/scheduling/provider-matching.service.ts` | Rank providers |
| `AvailabilityEngineService` | `src/services/scheduling/availability-engine.service.ts` | Valid slot computation |
| `SlotRecommendationService` | `src/services/scheduling/slot-recommendation.service.ts` | Present ranked slots |
| `BookingExecutionService` | `src/services/scheduling/booking-execution.service.ts` | Post-approval persistence |
| `SchedulingOrchestratorBridge` | `src/services/scheduling/orchestrator-bridge.service.ts` | Proposal builders |

## Dependency direction

```
voice-session → intake → safety-triage → provider-matching → availability → slot-recommendation
                                                              ↓
                                                    orchestrator-bridge
                                                              ↓
                                                    booking-execution (on approve)
```

## Orchestrator bridge

All mutations submit to `masterOrchestratorService` with:

- `agentType: VOICE_CALL_AI | INTAKE_AI | APPOINTMENT_AI`  
- `actionType` from planning enum  
- `proposedPayload` matching interface types  
- `clientId`, optional `appointmentId`, `callLogId`  

## External integrations

| Integration | Phase | Role |
|-------------|-------|------|
| Twilio voice webhook | 6 | Ingress |
| n8n | 7 | Optional STT/TTS orchestration |
| SendGrid / SMS | 6 | Confirmations (proposed) |
| Reminder engine | 5 | Post-book schedules |

## Testing strategy (future)

- Unit: availability overlap, capacity, scoring  
- Integration: mock orchestrator approvals  
- Audit: `npm run audit:scheduling` (to be added with implementation)  

## See also

- [interfaces.ts](../../src/lib/scheduling/planning/interfaces.ts)  
- [ARCHITECTURE.md](./ARCHITECTURE.md)  
