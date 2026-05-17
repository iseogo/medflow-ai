# Supervisor AI — governance (Phase 10)

## Authority model

**Master Orchestrator** is the **central decision authority** for all AI agent actions.

**Supervisor AI** has **no authority** over the Master Orchestrator. It must **not** control, replace, override, or interfere with the normal roles of other AI agents.

```
┌─────────────┐     proposals      ┌──────────────────────┐     approve/execute     ┌────────┐
│  AI Agents  │ ────────────────► │  Master Orchestrator │ ◄────────────────────── │ Staff  │
└─────────────┘                   └──────────────────────┘                         └────────┘
        ▲                                    ▲
        │ observe only                       │ observe only (no authority)
        └────────────────────────────────────┘
                    Supervisor AI
```

## Supervisor role (allowed)

- Observe and monitor `AgentAction`, orchestrator queue, reminders, webhooks
- Audit and detect inconsistencies, unsafe behavior, missing logs, workflow failures
- Create `SupervisorRecommendation`
- Create `AuditLog` (`SUPERVISOR_SCAN`, alert lifecycle)
- Create `AdminAlert`
- Create `StaffIntervention` when operational risk is **serious** (advisory escalation to staff)
- **Request review** from Master Orchestrator (correction request proposal — **pending approval only**)

## Supervisor restrictions (forbidden)

- **No authority** over Master Orchestrator (`reviewProposal`, `executeApprovedProposal`, approve/reject)
- Cannot control, replace, override, or interfere with other AI agents' normal roles
- Cannot impersonate other agent types for execution (e.g. `STAFF_ASSISTANT_AI` proposals)
- Patient-facing: no SMS, email, or calls
- No direct book / cancel / reschedule appointments
- Cannot override staff decisions
- Cannot override Master Orchestrator decisions
- Cannot modify clinical workflows directly (appointment status, reminder pause, etc.)
- Cannot bypass RBAC, webhook security, or audit logging
- No diagnosis or treatment advice

## When Supervisor detects a problem

Fixed response order:

1. **SupervisorRecommendation** — advisory record  
2. **AuditLog** — scan + alert lifecycle  
3. **AdminAlert** — operational notification  
4. **StaffIntervention** — only if risk is serious (staff retains authority)  
5. **Master Orchestrator correction request** — `SUPERVISOR_AI` + `LOG_NOTE` proposal with `SUPERVISOR_CORRECTION_REQUEST` payload; **pending** staff/orchestrator approval  

Only **Master Orchestrator** or **authorized staff** may approve corrective action.

## Staff authority

**Staff override always wins** over AI and Supervisor recommendations.

## Phase 9 scheduling

Supervisor does not implement inbound scheduling (planning only). It may flag coordination anomalies only.

## Auditing

PHI-safe metadata on all Supervisor writes. See [COORDINATION.md](./COORDINATION.md).
