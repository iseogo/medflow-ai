import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { zReminderScheduleOffset } from "@/lib/reminder-types";
import {
  ReminderEngineError,
  reminderEngineService,
} from "@/services/reminder-engine.service";

const runSchema = z.object({
  windowMinutes: z.number().int().min(1).max(120).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  appointmentId: z.string().optional(),
  offset: zReminderScheduleOffset.optional(),
});

export async function POST(request: NextRequest) {
  const { error, user } = await requirePermission("reminders:write");
  if (error) return error;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.appointmentId && parsed.data.offset) {
      const log = await reminderEngineService.processReminderCycle(
        parsed.data.appointmentId,
        parsed.data.offset,
        user.id
      );
      return NextResponse.json({ mode: "single", log });
    }

    const batch = await reminderEngineService.runDueReminders({
      windowMinutes: parsed.data.windowMinutes,
      limit: parsed.data.limit,
      appointmentId: parsed.data.appointmentId,
      systemUserId: user.id,
    });
    return NextResponse.json({ mode: "batch", ...batch });
  } catch (e) {
    if (e instanceof ReminderEngineError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Reminder run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
