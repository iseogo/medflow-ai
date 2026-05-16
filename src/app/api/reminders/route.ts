import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { reminderEngineService } from "@/services/reminder-engine.service";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("reminders:read");
  if (error) return error;

  const take = Math.min(
    200,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("take") ?? "100", 10))
  );
  const logs = await reminderEngineService.listReminderLogs(take);
  return NextResponse.json(logs);
}
