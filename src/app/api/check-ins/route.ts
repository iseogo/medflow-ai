import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAnyPermission } from "@/lib/api-auth";
import { physicalClientService } from "@/services/physical-client.service";

const checkInSchema = z.object({
  clientId: z.string(),
  appointmentId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  notifyProvider: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireAnyPermission(["checkins:read", "walkins:read"], request);
  if (error) return error;

  const q = request.nextUrl.searchParams.get("q");
  if (q) {
    const results = await physicalClientService.searchForCheckIn(q);
    return NextResponse.json(results);
  }

  const checkIns = await physicalClientService.listCheckIns();
  return NextResponse.json(checkIns);
}

export async function POST(request: NextRequest) {
  const { error, user, meta } = await requireAnyPermission(["checkins:write"], request);
  if (error) return error;

  const body = await request.json();
  const parsed = checkInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await physicalClientService.performReturningCheckIn(
      parsed.data,
      { id: user!.id, name: user!.name, role: user!.role },
      meta
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Check-in failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
