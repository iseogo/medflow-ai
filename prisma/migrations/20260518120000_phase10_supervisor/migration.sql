-- Phase 10: Supervisor AI / quality control

-- AlterEnum AgentType
ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'SUPERVISOR_AI';

-- AlterEnum AuditAction
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUPERVISOR_SCAN';

-- AlterEnum TimelineEventType
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'SUPERVISOR_ALERT';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'WORKFLOW_HEALTH';

-- CreateEnum
CREATE TYPE "AdminAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "AdminAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');
CREATE TYPE "WorkflowHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'FAILED', 'STUCK');
CREATE TYPE "CoordinationIncidentType" AS ENUM (
  'DUPLICATE_ACTION',
  'CONFLICTING_ACTION',
  'UNAUTHORIZED_SEND',
  'MISSING_AUDIT',
  'MISSING_TIMELINE',
  'REMINDER_FAILURE',
  'WEBHOOK_FAILURE',
  'STUCK_WORKFLOW',
  'AGENT_VIOLATION',
  'ESCALATION_LOOP',
  'LOW_CONFIDENCE',
  'SCHEDULING_CONFLICT',
  'COMMUNICATION_INCONSISTENCY',
  'STAFF_OVERRIDE_VIOLATION',
  'EMERGENCY_RULE_VIOLATION',
  'AI_SAFETY_VIOLATION',
  'ORCHESTRATOR_ANOMALY'
);
CREATE TYPE "SupervisorRecommendationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'DEFERRED');

-- CreateTable
CREATE TABLE "AdminAlert" (
    "id" TEXT NOT NULL,
    "severity" "AdminAlertSeverity" NOT NULL,
    "status" "AdminAlertStatus" NOT NULL DEFAULT 'OPEN',
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "clientId" TEXT,
    "agentActionId" TEXT,
    "appointmentId" TEXT,
    "metadata" JSONB,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowHealthEvent" (
    "id" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "status" "WorkflowHealthStatus" NOT NULL,
    "message" TEXT,
    "clientId" TEXT,
    "appointmentId" TEXT,
    "agentActionId" TEXT,
    "metadata" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowHealthEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentPerformanceMetric" (
    "id" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "proposalsSubmitted" INTEGER NOT NULL DEFAULT 0,
    "proposalsApproved" INTEGER NOT NULL DEFAULT 0,
    "proposalsRejected" INTEGER NOT NULL DEFAULT 0,
    "proposalsEscalated" INTEGER NOT NULL DEFAULT 0,
    "violationsDetected" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentPerformanceMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoordinationIncident" (
    "id" TEXT NOT NULL,
    "incidentType" "CoordinationIncidentType" NOT NULL,
    "severity" "AdminAlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "clientId" TEXT,
    "agentActionId" TEXT,
    "appointmentId" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoordinationIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupervisorRecommendation" (
    "id" TEXT NOT NULL,
    "status" "SupervisorRecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "correctiveAction" TEXT,
    "clientId" TEXT,
    "agentActionId" TEXT,
    "incidentId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupervisorRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAlert_status_idx" ON "AdminAlert"("status");
CREATE INDEX "AdminAlert_severity_idx" ON "AdminAlert"("severity");
CREATE INDEX "AdminAlert_code_idx" ON "AdminAlert"("code");
CREATE INDEX "AdminAlert_createdAt_idx" ON "AdminAlert"("createdAt");

CREATE INDEX "WorkflowHealthEvent_workflowKey_idx" ON "WorkflowHealthEvent"("workflowKey");
CREATE INDEX "WorkflowHealthEvent_status_idx" ON "WorkflowHealthEvent"("status");
CREATE INDEX "WorkflowHealthEvent_recordedAt_idx" ON "WorkflowHealthEvent"("recordedAt");

CREATE UNIQUE INDEX "AgentPerformanceMetric_agentType_periodStart_periodEnd_key" ON "AgentPerformanceMetric"("agentType", "periodStart", "periodEnd");
CREATE INDEX "AgentPerformanceMetric_agentType_idx" ON "AgentPerformanceMetric"("agentType");
CREATE INDEX "AgentPerformanceMetric_periodStart_idx" ON "AgentPerformanceMetric"("periodStart");

CREATE INDEX "CoordinationIncident_incidentType_idx" ON "CoordinationIncident"("incidentType");
CREATE INDEX "CoordinationIncident_resolved_idx" ON "CoordinationIncident"("resolved");
CREATE INDEX "CoordinationIncident_createdAt_idx" ON "CoordinationIncident"("createdAt");

CREATE INDEX "SupervisorRecommendation_status_idx" ON "SupervisorRecommendation"("status");
CREATE INDEX "SupervisorRecommendation_code_idx" ON "SupervisorRecommendation"("code");
CREATE INDEX "SupervisorRecommendation_createdAt_idx" ON "SupervisorRecommendation"("createdAt");

ALTER TABLE "AdminAlert" ADD CONSTRAINT "AdminAlert_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoordinationIncident" ADD CONSTRAINT "CoordinationIncident_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
