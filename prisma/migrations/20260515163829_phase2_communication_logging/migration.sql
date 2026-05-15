-- CreateEnum
CREATE TYPE "CommunicationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'ANSWERED', 'FAILED', 'NO_ANSWER', 'BOUNCED', 'RESPONDED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('CALL', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TimelineEventType" ADD VALUE 'COMMUNICATION_CALL';
ALTER TYPE "TimelineEventType" ADD VALUE 'COMMUNICATION_SMS';
ALTER TYPE "TimelineEventType" ADD VALUE 'COMMUNICATION_EMAIL';
ALTER TYPE "TimelineEventType" ADD VALUE 'AGENT_ACTION';

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'PENDING',
    "purpose" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL DEFAULT 'CALL',
    "direction" "CallDirection" NOT NULL,
    "phoneNumber" TEXT,
    "durationSeconds" INTEGER,
    "externalRef" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'twilio_stub',
    "transcript" TEXT,
    "metadata" JSONB,
    "initiatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'PENDING',
    "purpose" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL DEFAULT 'SMS',
    "toNumber" TEXT,
    "fromNumber" TEXT,
    "messageBody" TEXT,
    "externalRef" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'twilio_stub',
    "metadata" JSONB,
    "initiatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'PENDING',
    "purpose" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "body" TEXT,
    "toEmail" TEXT,
    "fromEmail" TEXT,
    "externalRef" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'email_stub',
    "metadata" JSONB,
    "initiatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'PENDING',
    "purpose" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "actionType" TEXT NOT NULL,
    "agentName" TEXT NOT NULL DEFAULT 'medflow_agent_stub',
    "description" TEXT,
    "callLogId" TEXT,
    "smsLogId" TEXT,
    "emailLogId" TEXT,
    "metadata" JSONB,
    "initiatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallLog_clientId_idx" ON "CallLog"("clientId");

-- CreateIndex
CREATE INDEX "CallLog_appointmentId_idx" ON "CallLog"("appointmentId");

-- CreateIndex
CREATE INDEX "CallLog_status_idx" ON "CallLog"("status");

-- CreateIndex
CREATE INDEX "CallLog_clientId_appointmentId_purpose_channel_idx" ON "CallLog"("clientId", "appointmentId", "purpose", "channel");

-- CreateIndex
CREATE INDEX "SmsLog_clientId_idx" ON "SmsLog"("clientId");

-- CreateIndex
CREATE INDEX "SmsLog_appointmentId_idx" ON "SmsLog"("appointmentId");

-- CreateIndex
CREATE INDEX "SmsLog_status_idx" ON "SmsLog"("status");

-- CreateIndex
CREATE INDEX "SmsLog_clientId_appointmentId_purpose_channel_idx" ON "SmsLog"("clientId", "appointmentId", "purpose", "channel");

-- CreateIndex
CREATE INDEX "EmailLog_clientId_idx" ON "EmailLog"("clientId");

-- CreateIndex
CREATE INDEX "EmailLog_appointmentId_idx" ON "EmailLog"("appointmentId");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "EmailLog_clientId_appointmentId_purpose_channel_idx" ON "EmailLog"("clientId", "appointmentId", "purpose", "channel");

-- CreateIndex
CREATE INDEX "AgentAction_clientId_idx" ON "AgentAction"("clientId");

-- CreateIndex
CREATE INDEX "AgentAction_appointmentId_idx" ON "AgentAction"("appointmentId");

-- CreateIndex
CREATE INDEX "AgentAction_status_idx" ON "AgentAction"("status");

-- CreateIndex
CREATE INDEX "AgentAction_clientId_appointmentId_purpose_channel_idx" ON "AgentAction"("clientId", "appointmentId", "purpose", "channel");

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
