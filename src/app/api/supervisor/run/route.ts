import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { supervisorAgentService } from "@/services/supervisor-agent.service";

export async function POST() {
  const { error, user } = await requirePermission("supervisor:run");
  if (error) return error;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await supervisorAgentService.runScan(user.id);
    return NextResponse.json(result);
  } catch (e) {
    logger.error("supervisor_run_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Supervisor scan failed" },
      { status: 500 }
    );
  }
}
