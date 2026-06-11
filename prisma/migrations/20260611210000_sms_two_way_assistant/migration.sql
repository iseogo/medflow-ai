-- Two-way SMS managed by SMS Assistant AI
ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'SMS_ASSISTANT_AI';

ALTER TABLE "SmsLog" ADD COLUMN "direction" "CallDirection" NOT NULL DEFAULT 'OUTBOUND';

CREATE INDEX "SmsLog_direction_createdAt_idx" ON "SmsLog"("direction", "createdAt");
