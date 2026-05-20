import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { inboundCallsService } from "@/services/inbound-calls.service";

/** List missed inbound calls from database (same data as dashboard page). */
export async function GET() {
  const { error } = await requirePermission("communications:read");
  if (error) return error;

  const rows = await inboundCallsService.listMissedInboundCalls();
  return NextResponse.json({ rows, count: rows.length });
}
