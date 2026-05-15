import { WaitingRoomState } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAnyPermission } from "@/lib/api-auth";
import { physicalClientService } from "@/services/physical-client.service";

export async function GET(request: NextRequest) {
  const { error } = await requireAnyPermission(["checkins:read", "walkins:read"], request);
  if (error) return error;

  const all = request.nextUrl.searchParams.get("all") === "true";
  const queue = await physicalClientService.listWaitingRoom(!all);
  return NextResponse.json(queue);
}

const patchSchema = z.object({
  waitingRoomId: z.string(),
  state: z.nativeEnum(WaitingRoomState),
});

export async function PATCH(request: NextRequest) {
  const { error, user, meta } = await requireAnyPermission(["checkins:write"], request);
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
    const updated = await physicalClientService.updateWaitingRoomState(
      parsed.data.waitingRoomId,
      parsed.data.state,
      { id: user!.id, name: user!.name, role: user!.role },
      meta
    );
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
