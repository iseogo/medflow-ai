-- Phase 3.5: Staff accounts, RBAC, audit ownership, staff override ownership

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "User" ADD COLUMN "forcePasswordReset" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "status" = 'INACTIVE' WHERE "isActive" = false;
UPDATE "User" SET "status" = 'ACTIVE' WHERE "isActive" = true;

ALTER TABLE "User" DROP COLUMN "isActive";

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "User_status_idx" ON "User"("status");

ALTER TABLE "Appointment" ADD COLUMN "staffOverrideByUserId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "staffOverrideByName" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "staffOverrideReason" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "staffOverrideAt" TIMESTAMP(3);

ALTER TABLE "StaffTask" ADD COLUMN "staffOverrideByUserId" TEXT;
ALTER TABLE "StaffTask" ADD COLUMN "staffOverrideByName" TEXT;
ALTER TABLE "StaffTask" ADD COLUMN "staffOverrideReason" TEXT;
ALTER TABLE "StaffTask" ADD COLUMN "staffOverrideAt" TIMESTAMP(3);

ALTER TABLE "StaffIntervention" ADD COLUMN "staffOverrideByUserId" TEXT;
ALTER TABLE "StaffIntervention" ADD COLUMN "staffOverrideByName" TEXT;
ALTER TABLE "StaffIntervention" ADD COLUMN "staffOverrideReason" TEXT;
ALTER TABLE "StaffIntervention" ADD COLUMN "staffOverrideAt" TIMESTAMP(3);

ALTER TABLE "AgentAction" ADD COLUMN "staffOverrideByUserId" TEXT;
ALTER TABLE "AgentAction" ADD COLUMN "staffOverrideByName" TEXT;
ALTER TABLE "AgentAction" ADD COLUMN "staffOverrideReason" TEXT;
ALTER TABLE "AgentAction" ADD COLUMN "staffOverrideAt" TIMESTAMP(3);

ALTER TABLE "AuditLog" ADD COLUMN "targetType" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "targetId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "actorUserId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "actorName" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "actorRole" "RoleType";

UPDATE "AuditLog" SET "targetType" = "entityType", "targetId" = "entityId", "actorUserId" = "userId" WHERE "targetType" IS NULL;

CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

CREATE TABLE "StaffOverride" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" "RoleType" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffOverride_actorUserId_idx" ON "StaffOverride"("actorUserId");
CREATE INDEX "StaffOverride_targetType_targetId_idx" ON "StaffOverride"("targetType", "targetId");
CREATE INDEX "StaffOverride_createdAt_idx" ON "StaffOverride"("createdAt");

ALTER TABLE "StaffOverride" ADD CONSTRAINT "StaffOverride_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
