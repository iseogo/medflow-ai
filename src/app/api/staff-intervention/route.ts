import { Prisma, StaffInterventionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requireAnyPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  actorFromSession,
  applyStaffOverride,
  recordStaffOverride,
  staffOverrideOwnershipFields,
  STAFF_OVERRIDE_DEFAULTS,
} from "@/lib/staff-override";
import { notifyStaff } from "@/lib/notifications/notification-bridge";
import { addTimelineEvent } from "@/lib/timeline";

const createSchema = z.object({
  clientId: z.string().optional().nullable(),
  status: z.nativeEnum(StaffInterventionStatus),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  staffOverride: z.boolean().optional(),
  aiContext: z.record(z.unknown()).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireAnyPermission(
    ["staff-intervention:read", "walkins:read"],
    request
  );
  if (error) return error;

  const status = request.nextUrl.searchParams.get("status");
  const openOnly = request.nextUrl.searchParams.get("open") === "true";

  const interventions = await prisma.staffIntervention.findMany({
    where: {
      ...(status && { status: status as StaffInterventionStatus }),
      ...(openOnly && {
        status: { notIn: ["RESOLVED"] },
      }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
    take: 100,
  });

  return NextResponse.json(interventions);
}

export async function POST(request: NextRequest) {
  const { error, user, meta } = await requireAnyPermission(
    ["staff-intervention:write", "walkins:write"],
    request
  );
  if (error) return error;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const actor = actorFromSession(user!);
  const intervention = await prisma.staffIntervention.create({
    data: {
      ...parsed.data,
      ...staffOverrideOwnershipFields({
        ...actor,
        reason: parsed.data.title,
      }),
      staffOverride: applyStaffOverride(
        parsed.data.staffOverride ?? STAFF_OVERRIDE_DEFAULTS.staffIntervention
      ),
      aiContext: parsed.data.aiContext as Prisma.InputJsonValue | undefined,
    },
    include: {
      client: true,
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await notifyStaff({
    channel: "staff",
    source: "STAFF_INTERVENTION_REQUIRED",
    sourceKey: `staff-intervention:${intervention.id}`,
    title: intervention.title,
    message: intervention.description ?? "Staff intervention opened.",
    clientId: intervention.clientId ?? undefined,
    workflowKey: intervention.id,
    createdByUserId: user!.id,
    assignedUserId: intervention.assignedToId ?? undefined,
  });

  if (intervention.clientId) {
    await addTimelineEvent({
      clientId: intervention.clientId,
      eventType: "STAFF_INTERVENTION_CREATED",
      title: intervention.title,
      description: intervention.description ?? undefined,
      metadata: {
        interventionId: intervention.id,
        status: intervention.status,
        staffOverride: true,
      },
      actorUserId: user!.id,
    });
  }

  await recordStaffOverride({
    actor: { ...actor, reason: parsed.data.title },
    targetType: "StaffIntervention",
    targetId: intervention.id,
    clientId: intervention.clientId ?? undefined,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  await createAuditLog({
    action: "CREATE",
    entityType: "StaffIntervention",
    entityId: intervention.id,
    userId: user!.id,
    clientId: intervention.clientId ?? undefined,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { status: intervention.status },
  });

  return NextResponse.json(intervention, { status: 201 });
}
