-- Phase 11: Staff in-app notifications

CREATE TYPE "NotificationCategory" AS ENUM (
  'ACTION_REQUIRED',
  'URGENT',
  'EMERGENCY',
  'INFO',
  'SUCCESS',
  'WARNING',
  'SYSTEM',
  'AI_REVIEW',
  'SECURITY',
  'STAFF_OVERRIDE'
);

CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "NotificationStatus" AS ENUM (
  'UNREAD',
  'READ',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'RESOLVED',
  'DISMISSED',
  'ESCALATED'
);

CREATE TYPE "NotificationSource" AS ENUM (
  'INBOUND_CALL_HUMAN_REVIEW',
  'OUTBOUND_CALL_FAILED',
  'REMINDER_FAILED',
  'PATIENT_CONFIRMED_APPOINTMENT',
  'PATIENT_CANCELLED_APPOINTMENT',
  'PATIENT_RESCHEDULE_REQUESTED',
  'PATIENT_NO_RESPONSE',
  'WALK_IN_ARRIVED',
  'CHECK_IN_COMPLETED',
  'WAITING_ROOM_DELAY',
  'PATIENT_WITH_PROVIDER',
  'APPOINTMENT_COMPLETED',
  'PATIENT_NO_SHOW',
  'STAFF_INTERVENTION_REQUIRED',
  'AI_LOW_CONFIDENCE',
  'EMERGENCY_RISK_DETECTED',
  'INSURANCE_PAYMENT_ISSUE',
  'MEDICAL_RECORDS_REQUEST',
  'WEBHOOK_FAILURE',
  'INTEGRATION_FAILURE',
  'SUPERVISOR_WARNING',
  'DUPLICATE_ACTION_PREVENTED',
  'STAFF_OVERRIDE_ACTIVATED',
  'WORKFLOW_STUCK',
  'AUDIT_SECURITY_WARNING',
  'MANUAL_STAFF',
  'ORCHESTRATOR_ESCALATION'
);

ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'STAFF_NOTIFICATION';

CREATE TABLE "StaffNotification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "priority" "NotificationPriority" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "source" "NotificationSource" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "recommendedNextAction" TEXT,
    "clientId" TEXT,
    "appointmentId" TEXT,
    "staffTaskId" TEXT,
    "agentActionId" TEXT,
    "adminAlertId" TEXT,
    "workflowKey" TEXT,
    "assignedRole" "RoleType",
    "assignedUserId" TEXT,
    "staffInterventionId" TEXT,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minPriority" "NotificationPriority" NOT NULL DEFAULT 'LOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffNotification_sourceKey_idx" ON "StaffNotification"("sourceKey");
CREATE INDEX "StaffNotification_status_idx" ON "StaffNotification"("status");
CREATE INDEX "StaffNotification_category_idx" ON "StaffNotification"("category");
CREATE INDEX "StaffNotification_priority_idx" ON "StaffNotification"("priority");
CREATE INDEX "StaffNotification_assignedRole_idx" ON "StaffNotification"("assignedRole");
CREATE INDEX "StaffNotification_assignedUserId_idx" ON "StaffNotification"("assignedUserId");
CREATE INDEX "StaffNotification_createdAt_idx" ON "StaffNotification"("createdAt");

CREATE UNIQUE INDEX "NotificationPreference_userId_category_key" ON "NotificationPreference"("userId", "category");
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

ALTER TABLE "StaffNotification" ADD CONSTRAINT "StaffNotification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffNotification" ADD CONSTRAINT "StaffNotification_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
