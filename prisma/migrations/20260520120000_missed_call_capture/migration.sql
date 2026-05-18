-- Missed inbound call capture: statuses + notification source
ALTER TYPE "CommunicationStatus" ADD VALUE IF NOT EXISTS 'MISSED';
ALTER TYPE "CommunicationStatus" ADD VALUE IF NOT EXISTS 'ABANDONED';
ALTER TYPE "NotificationSource" ADD VALUE IF NOT EXISTS 'MISSED_INBOUND_CALL';
