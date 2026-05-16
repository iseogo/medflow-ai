import { z } from "zod";

/** String unions aligned with Prisma enums `ReminderScheduleOffset` / `ReminderOutcome` */

export const REMINDER_SCHEDULE_OFFSETS = [
  "HOURS_48",
  "HOURS_24",
  "HOURS_2",
  "MINUTES_30",
] as const;
export type ReminderScheduleOffset =
  (typeof REMINDER_SCHEDULE_OFFSETS)[number];

export const REMINDER_OUTCOMES = [
  "CONFIRMED",
  "CANCELLED",
  "RESCHEDULE_REQUESTED",
  "NO_RESPONSE",
  "FAILED",
  "ESCALATED",
] as const;
export type ReminderOutcome = (typeof REMINDER_OUTCOMES)[number];

export const zReminderScheduleOffset = z.enum(REMINDER_SCHEDULE_OFFSETS);
