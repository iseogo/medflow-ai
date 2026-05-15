-- Add CHECKED_IN to waiting room queue (active board states)
ALTER TYPE "WaitingRoomState" ADD VALUE IF NOT EXISTS 'CHECKED_IN' BEFORE 'WAITING';
