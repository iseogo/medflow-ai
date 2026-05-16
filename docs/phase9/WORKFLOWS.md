# Phase 9 — Workflows

Planning diagrams for inbound AI scheduling. **Not implemented.**

## 1. Inbound call — happy path

```mermaid
sequenceDiagram
  participant Caller
  participant Voice as Voice AI
  participant Intake as Intake Service
  participant Triage as Safety Triage
  participant Match as Provider Match
  participant Avail as Availability Engine
  participant Orch as Master Orchestrator
  participant Book as Booking Service
  participant Audit as Audit / Timeline

  Caller->>Voice: Inbound call
  Voice->>Voice: AI identity disclosure
  Voice->>Intake: Identify or create client (proposal)
  Intake-->>Orch: PROPOSE_CLIENT_UPSERT
  Orch-->>Intake: Approved
  Voice->>Intake: Collect reason, symptoms, urgency, prefs
  Intake->>Triage: Run safety scan
  Triage-->>Voice: ROUTINE / SOON — continue
  Voice->>Match: Find qualified providers
  Match->>Avail: Get open slots (top 3)
  Avail-->>Voice: Slot options
  Voice->>Caller: Offer slots
  Caller->>Voice: Select slot
  Voice->>Orch: PROPOSE_APPOINTMENT_BOOK
  Orch-->>Book: Approved
  Book->>Audit: Appointment + VIEW/CREATE logs
  Book->>Voice: Confirmation script
  Voice->>Caller: Confirm time + provider
```

## 2. Safety triage — emergency branch

```mermaid
flowchart TD
  A[Intake: symptoms + reason] --> B{Emergency language?}
  B -->|Yes| C[Halt automation]
  C --> D[Advise 911 + clinic emergency policy]
  C --> E[Create StaffIntervention URGENT]
  C --> F[AuditLog + EMERGENCY_DETECTED timeline]
  B -->|No| G{Urgency URGENT + high-risk service?}
  G -->|Yes| H[Staff review required — no auto-book]
  G -->|No| I[Continue matching]
  H --> J[StaffIntervention STAFF_REVIEW_REQUIRED]
```

**Note:** Triage detects **routing risk**, not medical diagnosis. Copy is policy-driven templates, not clinical assessment.

## 3. Provider matching

```mermaid
flowchart LR
  subgraph Inputs
    R[Reason / service type]
    S[Symptom tags]
    U[Urgency]
    G[Gender preference]
    L[Location]
  end

  subgraph Engine
    F[Filter: active + skills + service]
    Sc[Score: specialty fit]
    Cap[Apply daily capacity]
    Av[Intersect availability windows]
  end

  subgraph Output
    Rank[Ranked provider list]
    Expl[Explain codes for audit]
  end

  Inputs --> F --> Sc --> Cap --> Av --> Rank
  Av --> Expl
```

### Scoring dimensions (planned weights — tunable)

| Factor | Weight idea |
|--------|-------------|
| Service type match | High |
| Skill tag overlap | High |
| Available slot within preference window | Medium |
| Gender preference match | Medium (soft) |
| Current day load vs maxDaily | Medium |
| Specialty keyword match | Low–medium |

## 4. Calendar availability

Before offering a slot:

1. Resolve clinic `ClinicHours` for date  
2. Load `ProviderAvailabilityBlock` (+ subtract blocks marked `isBlocked`)  
3. Query existing `Appointment` where `status` not in (`CANCELLED`, `NO_SHOW`, `WALK_OUT`)  
4. For each candidate start time:  
   - `durationMinutes` from `ServiceType`  
   - Add buffer before/after  
   - Ensure end ≤ clinic close  
   - Ensure provider count < `maxDailyAppointments`  

```mermaid
flowchart TD
  Start[Candidate start time] --> H{Within clinic hours?}
  H -->|No| Reject[Reject slot]
  H -->|Yes| P{Provider block covers interval?}
  P -->|No| Reject
  P -->|Yes| O{Overlaps existing appointment?}
  O -->|Yes| Reject
  O -->|No| C{Under daily capacity?}
  C -->|No| Reject
  C -->|Yes| Accept[Valid slot]
```

## 5. Slot recommendation

Agent offers **only** slots passing validation. Presentation rules:

- Offer 2–3 options, earliest acceptable first  
- Respect preferred time window when possible  
- If no slot in window, explain and offer nearest alternatives  
- Never offer double-booked intervals  

## 6. Booking confirmation

On client selection (post-orchestrator approval):

| Step | System action |
|------|----------------|
| 1 | `Appointment.create` with `providerUserId`, `serviceTypeId`, `urgencyLevel` |
| 2 | `ClientTimelineEvent` `APPOINTMENT_CREATED` |
| 3 | `AuditLog` `CREATE` |
| 4 | Reminder schedule (Phase 5) unless paused |
| 5 | Optional `PROPOSE_SEND_SMS` / email confirmation |
| 6 | Update `CallLog.metadata` with redacted summary + session link |

## 7. Human handoff triggers

| Trigger | Action |
|---------|--------|
| Emergency symptoms | Halt + 911 script + urgent intervention |
| Unclear symptoms / low confidence | `STAFF_REVIEW_REQUIRED` |
| No provider match | Staff task + callback proposal |
| No availability | Offer waitlist proposal (future) or staff callback |
| Client asks for human | Immediate handoff |
| Insurance/payment issue | Front desk / billing staff task |
| High-risk service type | Booking proposal held for staff approval |

```mermaid
stateDiagram-v2
  [*] --> ActiveCall
  ActiveCall --> Escalated: handoff trigger
  ActiveCall --> Booked: orchestrator approved book
  Escalated --> StaffQueue: StaffIntervention created
  StaffQueue --> Booked: staff completes booking
  StaffQueue --> [*]: resolved without book
  Booked --> [*]
```

## 8. Governance checkpoints

See [GOVERNANCE.md](./GOVERNANCE.md).
