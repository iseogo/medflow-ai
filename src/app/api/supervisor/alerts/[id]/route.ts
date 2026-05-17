import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { adminAlertService } from "@/services/admin-alert.service";

const patchSchema = z.object({
  action: z.enum(["acknowledge", "resolve"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, user } = await requirePermission("supervisor:run");
  if (error) return error;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const alert =
    parsed.data.action === "acknowledge"
      ? await adminAlertService.acknowledge(params.id, user.id)
      : await adminAlertService.resolve(params.id, user.id);

  return NextResponse.json({ alert });
}
