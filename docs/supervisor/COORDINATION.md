# Supervisor — coordination with MedFlow (Phase 10)

## Boundary with Master Orchestrator

| Question | Answer |
|----------|--------|
| Can Supervisor approve proposals? | **No** |
| Can Supervisor execute proposals? | **No** |
| Can Supervisor override orchestrator decisions? | **No** |
| Can Supervisor submit correction requests? | **Yes** — pending approval only |
| Who approves corrective action? | Master Orchestrator + authorized staff |

Supervisor **observes** the orchestrator; it does **not** sit above it in the command chain.

## Integration map

| System | Supervisor interaction |
|--------|------------------------|
| **Master Orchestrator** | Observe proposals; submit correction *requests* only |
| **Other AI agents** | Monitor compliance; do not interfere with agent roles |
| **AgentAction** | Read-only compliance scans |
| **Appointment** | No direct mutations |
| **ClientTimelineEvent** | `SUPERVISOR_ALERT` on staff escalation path |
| **AuditLog** | Required on every scan and alert |
| **StaffIntervention** | Create on serious risk; staff decides resolution |
| **Reminder engine** | Monitor outcomes; do not send reminders |
| **n8n** | Unchanged; optional future observability only |
| **Webhooks** | No bypass; validated via existing security audits |

## Correction request contract

Service: `requestOrchestratorCorrection()` in `supervisor-agent.service.ts`

- `agentType`: `SUPERVISOR_AI`  
- `actionType`: `LOG_NOTE`  
- `purpose`: `supervisor_correction_request`  
- `proposedPayload.kind`: `SUPERVISOR_CORRECTION_REQUEST`  
- Status after submit: `PENDING_APPROVAL` until staff/orchestrator acts  

## Cross-session coordination

Deduped alerts/incidents; agent performance metrics; escalation loop detection per client.

## Dashboard

`/dashboard/supervisor` — read-only health + scan trigger (`supervisor:run`). Scan does not change orchestrator state without approval.
