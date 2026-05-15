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

const submitSchema = z.object({
  agentType: z.nativeEnum(AgentType),
  clientId: z.string(),
  appointmentId: z.string().optional().nullable(),
  channel: z.nativeEnum(CommunicationChannel),
  purpose: z.string().min(1),
  actionType: z.string().min(1),
  description: z.string().optional(),
  proposedPayload: z.record(z.unknown()).optional(),
  contentForEmergencyScan: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("orchestrator:read");
  if (error) return error;

  const status = request.nextUrl.searchParams.get("status");
  const emergency = request.nextUrl.searchParams.get("emergency");

  const proposals = await prisma.agentAction.findMany({
    where: {
      ...(status && {
        proposalStatus: status as import("@prisma/client").AgentProposalStatus,
      }),
      ...(emergency === "true" && { isEmergency: true }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      appointment: { select: { id: true, scheduledAt: true } },
      reviewedBy: { select: { firstName: true, lastName: true } },
    },
    take: 200,
  });

  return NextResponse.json(proposals);
}

export async function POST(request: NextRequest) {
  const { error, user } = await requirePermission("orchestrator:write");
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = submitSchema.safeParse(body);
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
