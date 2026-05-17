# Supervisor dashboard plan

Route: `/dashboard/supervisor`  
Permissions: `supervisor:read` (ADMIN, MANAGER)

## Panels

| Panel | Data source |
|-------|-------------|
| Coordination score | `getDashboardSummary()` |
| Open admin alerts | `AdminAlert` status=OPEN |
| Unresolved incidents | `CoordinationIncident` resolved=false |
| Pending recommendations | `SupervisorRecommendation` status=PENDING |
| Pending orchestrator proposals | `AgentAction` PENDING_APPROVAL |
| Agent health table | `AgentPerformanceMetric` latest |
| MOCK_MODE banner | `isMockModeForced()` |

## Actions

- **Run supervisor scan** → `POST /api/supervisor/run` (`supervisor:run`)
- Acknowledge alert → `PATCH /api/supervisor/alerts/:id` (future UI button)

## Future enhancements

- Retry queue for failed reminders (orchestrator proposal only)
- Drill-down per incident type
- Export incident report (audit logged)
