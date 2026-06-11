-- Indexes for time-windowed communication log queries
CREATE INDEX "CallLog_direction_createdAt_idx" ON "CallLog"("direction", "createdAt");
CREATE INDEX "CallLog_status_createdAt_idx" ON "CallLog"("status", "createdAt");
CREATE INDEX "SmsLog_status_createdAt_idx" ON "SmsLog"("status", "createdAt");
CREATE INDEX "EmailLog_status_createdAt_idx" ON "EmailLog"("status", "createdAt");
