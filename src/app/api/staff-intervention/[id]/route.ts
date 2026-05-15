import { StaffInterventionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requireAnyPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  actorFromSession,
  recordStaffOverride,
  staffOverrideOwnershipFields,
} from "@/lib/staff-override";
import { addTimelineEvent } from "@/lib/timeline";

const updateSchema = z.object({
  status: z.nativeEnum(StaffInterventionStatus).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  staffOverride: z.boolean().optional(),
  aiContext: z.record(z.unknown()).optional().nullable(),
});

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { error, user, meta } = await requireAnyPermission(
    ["staff-intervention:write", "walkins:write"],
    request
  );
  if (error) return error;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.staffIntervention.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resolved =
    parsed.data.status === "RESOLVED" && existing.status !== "RESOLVED";

  const { assignedToId, aiContext, ...rest } = parsed.data;
  const actor = actorFromSession(user!);
  const intervention = await prisma.staffIntervention.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(assignedToId !== undefined && { assignedToId }),
      ...(aiContext !== undefined && {
        aiContext: aiContext as import("@prisma/client").Prisma.InputJsonValue,
      }),
      ...staffOverrideOwnershipFields({
        ...actor,
        reason: `Intervention update: ${parsed.data.status ?? existing.status}`,
      }),
      staffOverride: true,
      ...(resolved && { resolvedAt: new Date() }),
    },
    include: {
      client: true,
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  if (intervention.clientId) {
    await addTimelineEvent({
      clientId: intervention.clientId,
      eventType: "STAFF_OVERRIDE",
      title: `Staff intervention: ${intervention.title}`,
      description: `Status updated to ${intervention.status}`,
      metadata: {
        interventionId: intervention.id,
        previousStatus: existing.status,
        newStatus: intervention.status,
      },
      actorUserId: user!.id,
    });
  }

  await recordStaffOverride({
    actor: {
      ...actor,
      reason: `Intervention update: ${intervention.status}`,
    },
    targetType: "StaffIntervention",
    targetId: intervention.id,
    clientId: intervention.clientId ?? undefined,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  await createAuditLog({
    action: "UPDATE",
    entityType: "StaffIntervention",
    entityId: intervention.id,
    userId: user!.id,
    clientId: intervention.clientId ?? undefined,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: {
      previousStatus: existing.status,
      newStatus: intervention.status,
    },
  });

  return NextResponse.json(intervention);
}
