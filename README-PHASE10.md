# MedFlow AI — Phase 10: Supervisor AI / Quality Control

Oversight layer that **observes** AI agents and orchestrator decisions — **without authority** over the Master Orchestrator or other agents.

## Architecture

```
AI Agents → Master Orchestrator (central authority) ← Staff approval
                ↑
        Supervisor AI (observe / audit / recommend only)
                ↓
        AuditLog + AdminAlert + StaffIntervention (serious risk)
```

Supervisor **cannot** approve, reject, execute, or override orchestrator decisions.

## Services

| Service | Path |
|---------|------|
| Supervisor Agent | `src/services/supervisor-agent.service.ts` |
| Admin alerts | `src/services/admin-alert.service.ts` |
| Coordination monitor | `src/services/coordination-monitor.service.ts` |
| Workflow health | `src/services/workflow-health.service.ts` |
| Rules | `src/lib/supervisor/rules.ts` |

## API

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/supervisor/status` | `supervisor:read` |
| POST | `/api/supervisor/run` | `supervisor:run` |
| GET | `/api/supervisor/alerts` | `supervisor:read` |
| PATCH | `/api/supervisor/alerts/:id` | `supervisor:run` |

## Data model

- `AdminAlert`
- `WorkflowHealthEvent`
- `AgentPerformanceMetric`
- `CoordinationIncident`
- `SupervisorRecommendation`
- `AgentType.SUPERVISOR_AI`
- `AuditAction.SUPERVISOR_SCAN`

## Docs

- [docs/supervisor/AI-GOVERNANCE.md](./docs/supervisor/AI-GOVERNANCE.md)
- [docs/supervisor/COORDINATION.md](./docs/supervisor/COORDINATION.md)
- [docs/supervisor/OBSERVABILITY.md](./docs/supervisor/OBSERVABILITY.md)
- [docs/supervisor/DASHBOARD-PLAN.md](./docs/supervisor/DASHBOARD-PLAN.md)

## Audit

```bash
npm run audit:supervisor
npm run audit:coordination
npm run audit:security
npm run audit:architecture
npm run audit:production
npm run build
```

## Migration

```bash
npx prisma migrate deploy
```

## Governance

See [docs/supervisor/AI-GOVERNANCE.md](./docs/supervisor/AI-GOVERNANCE.md) and [src/lib/supervisor/governance.ts](./src/lib/supervisor/governance.ts).

## Constraints preserved

- Master Orchestrator remains the **central decision authority**
- Supervisor has **no authority** over orchestrator or other agents
- Staff override highest authority
- HIPAA-conscious AI safety
- `MOCK_MODE` default — no live patient APIs from Supervisor
- Phase 9 scheduling remains planning-only
