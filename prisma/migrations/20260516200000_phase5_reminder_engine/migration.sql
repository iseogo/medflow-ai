-- Phase 5: reminder engine + ReminderLog

CREATE TYPE "ReminderScheduleOffset" AS ENUM ('HOURS_48', 'HOURS_24', 'HOURS_2', 'MINUTES_30');
CREATE TYPE "ReminderOutcome" AS ENUM ('CONFIRMED', 'CANCELLED', 'RESCHEDULE_REQUESTED', 'NO_RESPONSE', 'FAILED', 'ESCALATED');

ALTER TYPE "TimelineEventType" ADD VALUE 'REMINDER_CYCLE_COMPLETED';

ALTER TABLE "Appointment" ADD COLUMN "reminderAutomationPaused" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Appointment_reminderAutomationPaused_idx" ON "Appointment"("reminderAutomationPaused");

CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reminderOffset" "ReminderScheduleOffset" NOT NULL,
    "outcome" "ReminderOutcome" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "voiceCallLogId" TEXT,
    "smsLogId" TEXT,
    "emailLogId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReminderLog_appointmentId_reminderOffset_key" ON "ReminderLog"("appointmentId", "reminderOffset");
CREATE INDEX "ReminderLog_clientId_idx" ON "ReminderLog"("clientId");
CREATE INDEX "ReminderLog_dueAt_idx" ON "ReminderLog"("dueAt");
CREATE INDEX "ReminderLog_outcome_idx" ON "ReminderLog"("outcome");

ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_voiceCallLogId_fkey" FOREIGN KEY ("voiceCallLogId") REFERENCES "CallLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_smsLogId_fkey" FOREIGN KEY ("smsLogId") REFERENCES "SmsLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_emailLogId_fkey" FOREIGN KEY ("emailLogId") REFERENCES "EmailLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
