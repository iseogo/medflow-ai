import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { runCoordinationMockProbe } from "@/lib/agents/coordination-mock-probe";
import { isMockModeForced } from "@/lib/integrations/env";

/**
 * MOCK_MODE-only — runs missed-call handoff probe and cleans up test rows.
 */
export async function POST() {
  const { error } = await requirePermission("orchestrator:read");
  if (error) return error;

  if (!isMockModeForced()) {
    return NextResponse.json(
      { error: "Coordination mock probe requires MOCK_MODE=true" },
      { status: 403 }
    );
  }

  const result = await runCoordinationMockProbe();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
