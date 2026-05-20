# MedFlow AI — Inbound Call Coordination

## Architecture summary

Inbound voice events enter through **three webhook surfaces**, converge on a single **missed-call capture pipeline**, and fan out through the **Master Orchestrator** to staff tasks, notifications, supervisor observation, and audit logs. The **Inbound Calls** dashboard reads live `CallLog` rows from PostgreSQL via Prisma.

| Layer | Responsibility |
|--------|----------------|
| **Webhooks** | Retell (`/api/webhooks/retell`), Twilio voice (`/api/webhooks/twilio/voice`), MedFlow generic (`/api/webhooks/inbound-call`) |
| **Parser** | `parseInboundMissedWebhookPayload` — NO_ANSWER, MISSED, ABANDONED, FAILED |
| **Capture** | `missedCallService.captureMissedInboundCall` — CallLog, AuditLog, timeline (if client known) |
| **Orchestrator** | STAFF_ASSISTANT_AI `CREATE_STAFF_TASK`, VOICE_CALL_AI `LOG_NOTE` |
| **Notifications** | `notifyStaff` with `channel: "orchestrator"`, source `MISSED_INBOUND_CALL` |
| **Supervisor** | `observeMissedInboundCall` — recommendations only, no direct staff notify |
| **Escalation** | Dedup + 3+ calls/hour → manager notification + CRITICAL priority |
| **UI** | `/dashboard/inbound-calls` + `GET /api/inbound-calls` |
| **Test** | `POST /api/inbound-calls/simulate` (MOCK_MODE + auth) |

Production safety: webhooks are **public API paths** (no session) but **fail closed** without `WEBHOOK_SECRET` / Twilio signature. Staff APIs require RBAC (`communications:read`). Simulate requires `MOCK_MODE=true`.

Docker: multi-stage build, `prisma migrate deploy` in entrypoint, `/api/health` HEALTHCHECK.

## Workflow map — AI agents & integrations

```mermaid
flowchart TB
  subgraph ingress [Ingress]
    R[Retell POST /api/webhooks/retell]
    T[Twilio POST /api/webhooks/twilio/voice]
    M[MedFlow POST /api/webhooks/inbound-call]
    SIM[POST /api/inbound-calls/simulate MOCK_MODE]
  end

  subgraph parse [Parse and capture]
    P[parseInboundMissedWebhookPayload]
    CAP[missedCallService.captureMissedInboundCall]
    CL[(CallLog)]
    AL[(AuditLog)]
  end

  subgraph orchestrator [Master Orchestrator]
    MO[masterOrchestratorService.submitProposal]
    STA[STAFF_ASSISTANT_AI CREATE_STAFF_TASK]
    VOICE[VOICE_CALL_AI LOG_NOTE]
    ST[(StaffTask)]
  end

  subgraph notify [Staff channel]
    NS[notifyStaff orchestrator]
    SN[(StaffNotification)]
  end

  subgraph govern [Governance]
    SUP[SUPERVISOR_AI observeMissedInboundCall]
    REC[(SupervisorRecommendation)]
    ESC[ESCALATION via repeated missed dedup]
  end

  subgraph ui [Dashboard]
    PAGE[/dashboard/inbound-calls]
    API[GET /api/inbound-calls]
  end

  R --> P
  T --> P
  M --> P
  SIM --> CAP
  P --> CAP
  CAP --> CL
  CAP --> AL
  CAP --> MO
  MO --> STA
  MO --> VOICE
  STA --> ST
  CAP --> NS
  NS --> SN
  CAP --> SUP
  SUP --> REC
  CAP --> ESC
  CL --> PAGE
  CL --> API
```

## Handoff chain (missed inbound)

1. Webhook receives status (no-answer / missed / abandoned / failed).
2. `CallLog` created or updated (`purpose: missed_inbound_call_follow_up`, `direction: INBOUND`).
3. `AuditLog` entity `MissedInboundCall`.
4. **STAFF_ASSISTANT_AI** → orchestrator → **StaffTask** (auto-approved for missed follow-up).
5. **notifyStaff** → **StaffNotification** (`MISSED_INBOUND_CALL`).
6. **SUPERVISOR_AI** observation → recommendation + audit (no direct notify).
7. **VOICE_CALL_AI** `LOG_NOTE` for coordination visibility.
8. **ClientTimelineEvent** when caller is identified.

## Debugging

Set `LOG_LEVEL=debug` for verbose parser skips. All inbound steps log via `inbound_call:*` keys (PHI-safe: phone suffix only).

```bash
npm run audit:inbound-calls
npm run audit:missed-calls
npm run audit:agent-system
```

Simulate (dev, MOCK_MODE=true, logged in):

```http
POST /api/inbound-calls/simulate
Content-Type: application/json

{"status":"NO_ANSWER","cleanup":true}
```

## Environment (Docker / production)

| Variable | Purpose |
|----------|---------|
| `WEBHOOK_SECRET` | MedFlow + Retell webhook auth |
| `TWILIO_AUTH_TOKEN` | Twilio signature validation |
| `MOCK_MODE` | `true` for simulate + stub transports |
| `DATABASE_URL` | Prisma / PostgreSQL |
| `MEDFLOW_WEBHOOK_ALLOW_UNAUTHENTICATED` | Local dev only, never production |
