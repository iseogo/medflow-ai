import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { notificationService } from "@/services/notification.service";

export async function GET() {
  const { error, user } = await requirePermission("notifications:read");
  if (error) return error;

  const count = await notificationService.unreadCount(user!.role, user!.id);
  return NextResponse.json({ count });
}
