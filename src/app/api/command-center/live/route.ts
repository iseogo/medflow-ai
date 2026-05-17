import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { liveCommandCenterService } from "@/services/live-command-center.service";

export async function GET(req: NextRequest) {
  const { error, user } = await requirePermission("command-center:read");
  if (error) return error;

  const mode = req.nextUrl.searchParams.get("mode");
  const board = await liveCommandCenterService.getBoard(user!.role, user!.id, mode);

  return NextResponse.json(board);
}
