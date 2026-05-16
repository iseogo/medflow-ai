# Phase 9 — Data model plan (not migrated)

Proposed Prisma additions. **Do not apply until implementation phase.** Names may change during review.

## Extensions to existing models

### `Appointment` (extend)

| Field | Type | Notes |
|-------|------|-------|
| `providerUserId` | `String?` → `User` | Replaces free-text `providerName` over time |
| `serviceTypeId` | `String?` → `ServiceType` | Visit type for matching |
| `urgencyLevel` | `SchedulingUrgency` | From intake |
| `bookedVia` | `BookingSource` | `VOICE_AI`, `STAFF`, `WALK_IN`, … |
| `schedulingSessionId` | `String?` | Link to call session |
| `requiresStaffReview` | `Boolean` | High-risk holds |
| `matchScore` | `Float?` | Audit/debug only; not shown to patient |

Keep `providerName` for display backward compatibility during migration.

### `CallLog` (extend metadata contract)

Structured `metadata` JSON schema (documented, not enforced by DB):

```json
{
  "schedulingSessionId": "cuid",
  "intakeComplete": true,
  "transcriptRef": "storage-key-or-stub",
  "redactedSummary": "Patient requested follow-up for ...",
  "orchestratorProposalIds": ["..."]
}
```

### `AgentAction` (new `actionType` values — application enum)

Planned proposal types (string `actionType`):

- `PROPOSE_CLIENT_UPSERT`  
- `PROPOSE_SCHEDULING_INTAKE`  
- `PROPOSE_PROVIDER_MATCH`  
- `PROPOSE_APPOINTMENT_BOOK`  
- `PROPOSE_SLOT_HOLD` (optional short TTL hold)  

## New enums

```prisma
enum SchedulingUrgency {
  ROUTINE
  SOON
  URGENT
  EMERGENCY
}

enum BookingSource {
  STAFF
  VOICE_AI
  SMS_AI
  WALK_IN
  N8N
}

enum ProviderProfileStatus {
  ACTIVE
  INACTIVE
  ON_LEAVE
}

enum SchedulingCallSessionStatus {
  GREETING
  IDENTIFY_CLIENT
  COLLECT_INTAKE
  SAFETY_TRIAGE
  MATCH_PROVIDER
  OFFER_SLOTS
  CONFIRM_BOOKING
  COMPLETED
  ESCALATED
  ABANDONED
}

enum GenderPreference {
  NO_PREFERENCE
  FEMALE
  MALE
  NON_BINARY
}
```

## New models

### `ClinicLocation`

| Field | Type |
|-------|------|
| id | cuid |
| name | String |
| timezone | String @default("America/Chicago") |
| address fields | optional |
| isActive | Boolean |

### `ServiceType`

Catalog of visit reasons the clinic schedules (not ICD codes).

| Field | Type |
|-------|------|
| id | cuid |
| code | String @unique |
| displayName | String |
| defaultDurationMinutes | Int |
| bufferBeforeMinutes | Int |
| bufferAfterMinutes | Int |
| requiresStaffReview | Boolean |
| allowedUrgencyMax | SchedulingUrgency |

### `ProviderProfile`

Links `User` (clinical staff) to scheduling capabilities. **Planning name — not migrated.**

| Field | Type |
|-------|------|
| id | cuid |
| userId | String @unique → User |
| displayName | String |
| gender | String? |
| roleTitle | String |
| specialty | String |
| clinicLocationId | String → ClinicLocation |
| status | ProviderProfileStatus |
| metadata | Json? |

Skills and services are normalized via `ProviderSkill` and M2M to `ServiceType` (below).

### `ProviderSkill`

Tags a provider with schedulable capabilities (replaces ad-hoc string arrays).

| Field | Type |
|-------|------|
| id | cuid |
| providerProfileId | String → ProviderProfile |
| skillCode | String |
| skillLabel | String |
| proficiency | String? (`PRIMARY`, `SECONDARY`) |
| isActive | Boolean @default(true) |

### `ProviderAvailability`

Calendar windows when a provider may accept appointments (recurring or one-off).

| Field | Type |
|-------|------|
| id | cuid |
| providerProfileId | String |
| clinicLocationId | String |
| dayOfWeek | Int? (0–6, null if `specificDate` set) |
| startTime | String (HH:mm clinic local) |
| endTime | String |
| specificDate | DateTime? |
| isBlocked | Boolean (PTO / meeting — subtracts from availability) |
| effectiveFrom | DateTime? |
| effectiveTo | DateTime? |

### `ProviderCapacityRule`

Daily load limits and buffers per provider (and optional per service type).

| Field | Type |
|-------|------|
| id | cuid |
| providerProfileId | String |
| maxDailyAppointments | Int |
| bufferBeforeMinutes | Int @default(0) |
| bufferAfterMinutes | Int @default(0) |
| serviceTypeId | String? (null = all services) |
| isActive | Boolean @default(true) |

M2M: `ProviderProfile` ↔ `ServiceType` for “services they can handle.”

### `ClinicHours`

Default open hours per location / day.

| Field | Type |
|-------|------|
| clinicLocationId | String |
| dayOfWeek | Int |
| openTime | String |
| closeTime | String |
| isClosed | Boolean |

### `SchedulingCallSession`

Voice intake state container.

| Field | Type |
|-------|------|
| id | cuid |
| callLogId | String? → CallLog |
| clientId | String? |
| status | SchedulingCallSessionStatus |
| intakePayload | Json |
| matchResult | Json? |
| offeredSlots | Json? |
| selectedSlot | Json? |
| confidenceScore | Float? |
| automationHalted | Boolean |
| staffInterventionId | String? |
| expiresAt | DateTime |

### `SchedulingRecommendation`

Persisted slot offers for audit and session replay (not a live booking).

| Field | Type |
|-------|------|
| id | cuid |
| schedulingCallSessionId | String |
| clientId | String |
| providerProfileId | String |
| serviceTypeId | String |
| slotStart | DateTime |
| slotEnd | DateTime |
| matchScore | Float |
| rank | Int |
| valid | Boolean |
| invalidatedReason | String? |
| offeredAt | DateTime |
| selectedAt | DateTime? |
| metadata | Json? (sanitized — no raw symptoms) |

### `ProviderMatchDecision` (audit artifact)

| Field | Type |
|-------|------|
| id | cuid |
| sessionId | String |
| rankedProviderIds | Json |
| selectedProviderId | String? |
| scores | Json |
| reasonCodes | String[] |
| createdAt | DateTime |

## Planned entity checklist

| Model | Purpose |
|-------|---------|
| `ProviderProfile` | Identity, role, specialty, location, status |
| `ProviderSkill` | Skills tags for matching |
| `ProviderAvailability` | Calendar windows |
| `ProviderCapacityRule` | Max daily load + buffers |
| `SchedulingRecommendation` | Offered slots audit trail |
| `SchedulingCallSession` | Voice session state |
| `ServiceType` / `ClinicLocation` | Catalog + hours |

## Entity relationship (planned)

```mermaid
erDiagram
  User ||--o| ProviderProfile : has
  ProviderProfile ||--o{ ProviderSkill : skills
  ProviderProfile ||--o{ ProviderAvailability : calendar
  ProviderProfile ||--o{ ProviderCapacityRule : capacity
  ProviderProfile }o--o{ ServiceType : handles
  ClinicLocation ||--o{ ProviderProfile : hosts
  ClinicLocation ||--o{ ClinicHours : hours
  SchedulingCallSession ||--o{ SchedulingRecommendation : offers
  Client ||--o{ SchedulingCallSession : calls
  SchedulingCallSession ||--o| CallLog : links
  SchedulingCallSession ||--o| StaffIntervention : may_escalate
  Client ||--o{ Appointment : books
  Appointment }o--|| ProviderProfile : assigned
  Appointment }o--o| ServiceType : typed
```

## Migration strategy (when implementing)

1. Add enums + `ClinicLocation`, `ServiceType`, seed defaults  
2. Add `ProviderProfile` + availability (seed 2–3 demo providers)  
3. Add `SchedulingCallSession`  
4. Extend `Appointment` with FK to provider (nullable; backfill `providerName`)  
5. Add indexes: `(providerUserId, scheduledAt)`, `(status, scheduledAt)`  

## Indexing & performance

- Availability queries: `(providerProfileId, specificDate)` + appointment overlap check on `scheduledAt` + `durationMinutes`  
- Session lookup: `(callLogId)` unique where not null  

## PHI considerations

- `intakePayload` may contain symptoms — encrypt at rest if required by policy; minimum: redact in audit metadata (Phase 8)  
- Do not duplicate full transcript in `AuditLog.metadata`  
