import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { agentHealthService } from "@/services/agent-health.service";

export async function GET() {
  const { error } = await requirePermission("orchestrator:read");
  if (error) return error;

  const report = await agentHealthService.getHealthReport();
  return NextResponse.json(report);
}
