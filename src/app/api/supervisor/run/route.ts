import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { supervisorAgentService } from "@/services/supervisor-agent.service";

export async function POST() {
  const { error, user } = await requirePermission("supervisor:run");
  if (error) return error;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await supervisorAgentService.runScan(user.id);
  return NextResponse.json(result);
}
