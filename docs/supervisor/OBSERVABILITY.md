# Supervisor — future observability integration

Phase 10 stores events in PostgreSQL. Future integrations (not enabled):

| Platform | Use case |
|----------|----------|
| **Datadog** | Metrics from `AgentPerformanceMetric`; monitors on open `AdminAlert` count |
| **Sentry** | Workflow `FAILED` / `STUCK` events |
| **n8n** | Scheduled `POST /api/supervisor/run` with `WEBHOOK_SECRET` |
| **Slack / email** | Admin notify on `CRITICAL` alerts (staff-only, not patients) |

## Recommended metrics

- `medflow.supervisor.alerts.open` by severity
- `medflow.orchestrator.proposals.pending`
- `medflow.reminders.failed` count
- `medflow.coordination.score`

## Cron (future)

```bash
# Example — authenticate as admin session or machine token when implemented
curl -X POST https://medflow.smartdeskai.cloud/api/supervisor/run
```

Keep `MOCK_MODE=true` in non-production.
