-- Phase 4: Physical client management

ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'WALK_OUT';

CREATE TYPE "WalkInVisitType" AS ENUM ('FIRST_TIME', 'RETURNING');
CREATE TYPE "WalkInOnboardingStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PhysicalCheckInType" AS ENUM ('APPOINTMENT', 'WALK_IN');
CREATE TYPE "WaitingRoomState" AS ENUM ('WAITING', 'CALLED', 'WITH_PROVIDER', 'COMPLETED', 'WALK_OUT', 'NO_SHOW');

ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'WALK_IN_REGISTERED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'WALK_IN_ONBOARDING';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'WALK_IN_COMPLETED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'PHYSICAL_CHECK_IN';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'WAITING_ROOM_ARRIVED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'WAITING_ROOM_STATUS_CHANGED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'PROVIDER_NOTIFIED';

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "addressLine1" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "addressLine2" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "preferredLanguage" TEXT DEFAULT 'en';
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "communicationPreferences" JSONB;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "insurancePlaceholder" JSONB;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "documentsPlaceholder" JSONB;

CREATE INDEX IF NOT EXISTS "Client_email_idx" ON "Client"("email");

CREATE TABLE "WalkInVisit" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "visitType" "WalkInVisitType" NOT NULL,
    "onboardingStatus" "WalkInOnboardingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "onboardingStep" TEXT,
    "staffNotes" TEXT,
    "insurancePlaceholder" JSONB,
    "documentsPlaceholder" JSONB,
    "appointmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "staffOverride" BOOLEAN NOT NULL DEFAULT true,
    "staffOverrideByUserId" TEXT,
    "staffOverrideByName" TEXT,
    "staffOverrideReason" TEXT,
    "staffOverrideAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WalkInVisit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhysicalCheckIn" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "walkInVisitId" TEXT,
    "checkInType" "PhysicalCheckInType" NOT NULL,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInById" TEXT NOT NULL,
    "notes" TEXT,
    "staffOverride" BOOLEAN NOT NULL DEFAULT true,
    "staffOverrideByUserId" TEXT,
    "staffOverrideByName" TEXT,
    "staffOverrideReason" TEXT,
    "staffOverrideAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PhysicalCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WaitingRoomStatus" (
    "id" TEXT NOT NULL,
    "physicalCheckInId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "state" "WaitingRoomState" NOT NULL DEFAULT 'WAITING',
    "queuePosition" INTEGER,
    "location" TEXT,
    "arrivedAt" TIMESTAMP(3) NOT NULL,
    "calledAt" TIMESTAMP(3),
    "withProviderAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "walkOutAt" TIMESTAMP(3),
    "waitDurationMinutes" INTEGER,
    "providerNotifiedAt" TIMESTAMP(3),
    "staffNotifiedAt" TIMESTAMP(3),
    "staffOverride" BOOLEAN NOT NULL DEFAULT true,
    "staffOverrideByUserId" TEXT,
    "staffOverrideByName" TEXT,
    "staffOverrideReason" TEXT,
    "staffOverrideAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WaitingRoomStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WaitingRoomStatus_physicalCheckInId_key" ON "WaitingRoomStatus"("physicalCheckInId");
CREATE INDEX "WalkInVisit_clientId_idx" ON "WalkInVisit"("clientId");
CREATE INDEX "WalkInVisit_onboardingStatus_idx" ON "WalkInVisit"("onboardingStatus");
CREATE INDEX "WalkInVisit_arrivedAt_idx" ON "WalkInVisit"("arrivedAt");
CREATE INDEX "PhysicalCheckIn_clientId_idx" ON "PhysicalCheckIn"("clientId");
CREATE INDEX "PhysicalCheckIn_appointmentId_idx" ON "PhysicalCheckIn"("appointmentId");
CREATE INDEX "PhysicalCheckIn_arrivedAt_idx" ON "PhysicalCheckIn"("arrivedAt");
CREATE INDEX "WaitingRoomStatus_clientId_idx" ON "WaitingRoomStatus"("clientId");
CREATE INDEX "WaitingRoomStatus_appointmentId_idx" ON "WaitingRoomStatus"("appointmentId");
CREATE INDEX "WaitingRoomStatus_state_idx" ON "WaitingRoomStatus"("state");
CREATE INDEX "WaitingRoomStatus_arrivedAt_idx" ON "WaitingRoomStatus"("arrivedAt");

ALTER TABLE "WalkInVisit" ADD CONSTRAINT "WalkInVisit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalkInVisit" ADD CONSTRAINT "WalkInVisit_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalkInVisit" ADD CONSTRAINT "WalkInVisit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PhysicalCheckIn" ADD CONSTRAINT "PhysicalCheckIn_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhysicalCheckIn" ADD CONSTRAINT "PhysicalCheckIn_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhysicalCheckIn" ADD CONSTRAINT "PhysicalCheckIn_walkInVisitId_fkey" FOREIGN KEY ("walkInVisitId") REFERENCES "WalkInVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhysicalCheckIn" ADD CONSTRAINT "PhysicalCheckIn_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WaitingRoomStatus" ADD CONSTRAINT "WaitingRoomStatus_physicalCheckInId_fkey" FOREIGN KEY ("physicalCheckInId") REFERENCES "PhysicalCheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitingRoomStatus" ADD CONSTRAINT "WaitingRoomStatus_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitingRoomStatus" ADD CONSTRAINT "WaitingRoomStatus_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
