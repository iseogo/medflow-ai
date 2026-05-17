import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { notificationService } from "@/services/notification.service";

const patchSchema = z.object({
  action: z.enum([
    "read",
    "acknowledge",
    "resolve",
    "escalate",
    "dismiss",
    "in_progress",
  ]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, user } = await requirePermission("notifications:write", request);
  if (error) return error;

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await notificationService.transition(
      params.id,
      parsed.data.action,
      user!.id,
      user!.role
    );
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ notification: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Forbidden";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
