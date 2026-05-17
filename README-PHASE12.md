# Phase 12 — Reliability Guards

Operational safeguards to prevent coordination failures before they happen.

## Guards

| Guard | Module | Behavior |
|-------|--------|----------|
| Appointment overlap | `appointment-overlap.ts` | Provider + time + buffer; clinic hours; blocks double-booking |
| Communication idempotency | `communication-idempotency.ts` | Time-window dedup key; AuditLog; repeat → staff notification |
| Workflow retries | `workflow-guard.ts` | Max 3 attempts; FAILED/NEEDS_REVIEW; StaffTask + AdminAlert |
| AI action conflicts | `ai-action-conflict.ts` | Blocks conflicting pending proposals (orchestrator only) |
| Stuck workflows | `stuck-workflow-detector.ts` | Proposals, reminders, pending comms → alert + notification |

Supervisor AI **detects** stuck/conflict issues and escalates via alerts — corrections still go through **Master Orchestrator**.

## Audit

```bash
npm run audit:reliability
```
