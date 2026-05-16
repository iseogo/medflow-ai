import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/api-auth";
import {
  assertClientDataAccess,
  dataAccessErrorResponse,
} from "@/lib/security/data-access";
import { prisma } from "@/lib/prisma";
import { addTimelineEvent } from "@/lib/timeline";

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  dateOfBirth: z.string().datetime().optional().nullable(),
  mrn: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { error, user, meta } = await requirePermission("clients:read", request);
  if (error) return error;

  try {
    await assertClientDataAccess({
      user: user!,
      clientId: params.id,
      action: "read",
      meta,
    });
  } catch (e) {
    const denied = dataAccessErrorResponse(e);
    if (denied) return denied;
    throw e;
  }

  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      appointments: { orderBy: { scheduledAt: "desc" }, take: 10 },
      consentRecords: { orderBy: { recordedAt: "desc" } },
      _count: { select: { timelineEvents: true } },
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json(client);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { error, user } = await requirePermission("clients:write");
  if (error) return error;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.client.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { dateOfBirth, ...rest } = parsed.data;
  const client = await prisma.client.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(dateOfBirth !== undefined && {
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      }),
    },
  });

  await addTimelineEvent({
    clientId: client.id,
    eventType: "CLIENT_UPDATED",
    title: "Client profile updated",
    actorUserId: user!.id,
    metadata: { fields: Object.keys(parsed.data) },
  });

  await createAuditLog({
    action: "UPDATE",
    entityType: "Client",
    entityId: client.id,
    userId: user!.id,
    clientId: client.id,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json(client);
}
