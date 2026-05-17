import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { notificationService } from "@/services/notification.service";

export async function GET(request: NextRequest) {
  const { error, user } = await requirePermission("notifications:read", request);
  if (error) return error;

  const limit = Math.min(
    Number(request.nextUrl.searchParams.get("limit") ?? "50"),
    100
  );

  const notifications = await notificationService.listForUser(
    user!.role,
    user!.id,
    limit
  );

  return NextResponse.json({ notifications });
}
