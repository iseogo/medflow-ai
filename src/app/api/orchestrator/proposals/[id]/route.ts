import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  masterOrchestratorService,
  MasterOrchestratorError,
} from "@/services/master-orchestrator.service";

const reviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "ESCALATE"]),
  orchestratorNotes: z.string().optional(),
  execute: z.boolean().optional(),
});

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { error } = await requirePermission("orchestrator:read");
  if (error) return error;

  const proposal = await prisma.agentAction.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      appointment: true,
      reviewedBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  if (!proposal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(proposal);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { error, user } = await requirePermission("orchestrator:review");
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await masterOrchestratorService.reviewProposal(
      params.id,
      parsed.data.decision,
      {
        userId: user!.id,
        staffOverride: true,
        orchestratorNotes: parsed.data.orchestratorNotes,
        autoExecute: parsed.data.execute ?? parsed.data.decision === "APPROVE",
      }
    );

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof MasterOrchestratorError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    throw e;
  }
}
