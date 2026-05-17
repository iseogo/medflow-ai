# Phase 11 — Staff Notification & Alert System

In-app staff notifications for operational events. **No real SMS, email, or push** while `MOCK_MODE=true`.

## Models

- `StaffNotification` — title, message, category, priority, status, source, links to client/appointment/task/agent/workflow
- `NotificationPreference` — per-user category preferences (in-app only)

## Services

- `notification.service.ts` — emit (dedup), list, unread count, transitions + audit
- `notification-routing.service.ts` — role visibility
- `notification-priority.service.ts` — critical/emergency rules
- `notification-color-map.ts` — dashboard visual tones

## Governance

- AI agents **do not** call `notificationService` directly
- Emits use `actorChannel`: `orchestrator` | `supervisor` | `staff` | `system`
- Emergency/critical → `StaffIntervention` when required
- Critical/high → `AuditLog` on create

## Dashboard

- Header bell with unread badge → `/dashboard/notifications`
- Actions: mark read, acknowledge, in progress, resolve, escalate

## Audit

```bash
npm run audit:notifications
```
