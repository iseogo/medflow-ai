import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { supervisorAgentService } from "@/services/supervisor-agent.service";

export async function GET() {
  const { error } = await requirePermission("supervisor:read");
  if (error) return error;

  const summary = await supervisorAgentService.getDashboardSummary();
  return NextResponse.json(summary);
}
