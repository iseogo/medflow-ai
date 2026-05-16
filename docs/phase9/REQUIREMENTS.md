# Phase 9 — Functional requirements (planning)

**Planning only.** No live scheduling or medical triage implementation.

## Workflow

### 1. Inbound call starts

- AI voice agent answers professionally and identifies as an AI assistant.  
- Agent identifies the client **or** creates a new client profile (via orchestrator proposal).  
- Agent collects:
  - Full name  
  - Phone number  
  - Date of birth (if required by clinic policy)  
  - Reason for visit  
  - Symptoms / needs (intake context only — not diagnosis)  
  - Urgency level  
  - Gender preference for nurse (if applicable)  
  - Preferred appointment time  

### 2. Safety triage

- If emergency symptoms are detected → **do not schedule normally**.  
- Escalate to staff and/or advise emergency pathway per clinic policy (e.g. 911 guidance).  
- Create `StaffIntervention` and `AuditLog`.  
- Uses routing-risk detection (Phase 8 `ai-safety` / emergency language) — **not** live clinical triage.

### 3. Nurse / provider matching

System must maintain provider profiles with:

- Name  
- Gender  
- Role  
- Specialty  
- Skills  
- Services they can handle  
- Availability calendar  
- Location / clinic  
- Max daily capacity  
- Active / inactive status  

*(Planned models: `ProviderProfile`, `ProviderSkill`, `ProviderAvailability`, `ProviderCapacityRule` — see [DATA-MODEL-PLAN.md](./DATA-MODEL-PLAN.md).)*

### 4. Matching logic

Compare:

- Client symptoms / reason for visit (tags, not diagnosis)  
- Required service type  
- Urgency level  
- Preferred nurse gender  
- Provider specialty / skills  
- Provider availability  
- Existing appointment load  

### 5. Calendar availability

Before offering a time:

- Check nurse availability calendar  
- Exclude already booked slots (`Appointment`)  
- Apply clinic working hours  
- Apply appointment duration  
- Apply buffer time  
- Apply provider capacity rules  

### 6. Slot recommendation

Offer **only** valid slots where:

- Provider is qualified  
- Provider is available  
- Slot is not double-booked  
- Client preferences respected when possible  

Persist recommendation artifact: `SchedulingRecommendation` (planned).

### 7. Booking confirmation

After client chooses (orchestrator-approved):

- Create `Appointment`  
- Assign selected nurse / provider  
- Create `ClientTimelineEvent`  
- Create `AuditLog`  
- Trigger reminder schedule (Phase 5)  
- Optionally propose confirmation SMS / email (`MOCK_MODE` safe)  
- Record call summary and transcript **metadata** (PHI-redacted in audit)  

### 8. Human handoff

Escalate to staff when:

- Symptoms are unclear  
- No provider match exists  
- No availability exists  
- Emergency risk is detected  
- Client asks for human  
- Confidence is low  
- Insurance / payment issue appears  

### 9. Governance

- AI cannot finalize high-risk appointments without staff review.  
- Staff override always wins.  
- All actions go through Master Orchestrator.  
- All scheduling decisions are auditable.  

## Non-functional requirements

- No modification to Phase 1–8 runtime behavior during planning phase.  
- No schema migration until explicit implementation phase.  
- No live PSTN, SMS, or email in planning validation runs.  
