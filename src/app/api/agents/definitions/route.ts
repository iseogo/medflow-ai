import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { AGENT_DEFINITIONS } from "@/lib/agents/definitions";

export async function GET() {
  const { error } = await requirePermission("orchestrator:read");
  if (error) return error;

  const agents = Object.values(AGENT_DEFINITIONS).map((a) => ({
    type: a.type,
    displayName: a.displayName,
    systemPrompt: a.systemPrompt,
    allowedActions: a.allowedActions,
    forbiddenActions: a.forbiddenActions,
    escalationRules: a.escalationRules,
    humanHandoffRules: a.humanHandoffRules,
  }));

  return NextResponse.json(agents);
}
