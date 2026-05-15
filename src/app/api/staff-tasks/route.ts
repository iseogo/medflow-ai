import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requireAnyPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  actorFromSession,
  recordStaffOverride,
  staffOverrideOwnershipFields,
  STAFF_OVERRIDE_DEFAULTS,
} from "@/lib/staff-override";
import { addTimelineEvent } from "@/lib/timeline";
import { StaffTaskPriority, StaffTaskStatus } from "@prisma/client";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  priority: z.nativeEnum(StaffTaskPriority).optional(),
  dueAt: z.string().datetime().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireAnyPermission(["staff-tasks:read", "billing:read"], request);
  if (error) return error;

  const status = request.nextUrl.searchParams.get("status");
  const tasks = await prisma.staffTask.findMany({
    where: status ? { status: status as StaffTaskStatus } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
    take: 100,
  });

  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const { error, user, meta } = await requireAnyPermission(
    ["staff-tasks:write", "billing:write"],
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
  const task = await prisma.staffTask.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      clientId: parsed.data.clientId,
      assignedToId: parsed.data.assignedToId,
      priority: parsed.data.priority ?? "NORMAL",
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
      createdById: user!.id,
      ...staffOverrideOwnershipFields({ ...actor, reason: parsed.data.title }),
      staffOverride: STAFF_OVERRIDE_DEFAULTS.staffTask,
    },
    include: { client: true, assignedTo: true },
  });

  if (task.clientId) {
    await addTimelineEvent({
      clientId: task.clientId,
      eventType: "STAFF_TASK_CREATED",
      title: task.title,
      actorUserId: user!.id,
      metadata: { taskId: task.id, staffOverride: true },
    });
  }

  await recordStaffOverride({
    actor: { ...actor, reason: parsed.data.title },
    targetType: "StaffTask",
    targetId: task.id,
    clientId: task.clientId ?? undefined,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  await createAuditLog({
    action: "CREATE",
    entityType: "StaffTask",
    entityId: task.id,
    userId: user!.id,
    clientId: task.clientId ?? undefined,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json(task, { status: 201 });
}
