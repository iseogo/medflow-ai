import { AgentType, CommunicationChannel } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import {
  masterOrchestratorService,
  MasterOrchestratorError,
} from "@/services/master-orchestrator.service";

const createSchema = z.object({
  agentType: z.nativeEnum(AgentType),
  clientId: z.string(),
  appointmentId: z.string().optional().nullable(),
  purpose: z.string().min(1),
  channel: z.nativeEnum(CommunicationChannel),
  actionType: z.string().min(1),
  description: z.string().optional(),
  proposedPayload: z.record(z.unknown()).optional(),
  contentForEmergencyScan: z.string().optional(),
});

/** @deprecated Prefer POST /api/orchestrator/proposals */
export async function GET(request: NextRequest) {
  const { error } = await requirePermission("orchestrator:read");
  if (error) return error;

  const clientId = request.nextUrl.searchParams.get("clientId");
  const actions = await prisma.agentAction.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      appointment: { select: { id: true, scheduledAt: true } },
    },
    take: 200,
  });

  return NextResponse.json(actions);
}

export async function POST(request: NextRequest) {
  const { error, user } = await requirePermission("orchestrator:write");
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const proposal = await masterOrchestratorService.submitProposal(
      parsed.data,
      { userId: user!.id }
    );

    return NextResponse.json(proposal, { status: 201 });
  } catch (e) {
    if (e instanceof MasterOrchestratorError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    return handleApiError(e);
  }
}
