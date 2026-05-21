import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/api-auth";
import {
  assertClientDataAccess,
  dataAccessErrorResponse,
} from "@/lib/security/data-access";
import { clientIsActiveFromStatus } from "@/lib/client-form";
import { prisma } from "@/lib/prisma";
import { addTimelineEvent } from "@/lib/timeline";
import { logger } from "@/lib/logger";

const preferredContact = z.enum(["PHONE", "EMAIL", "SMS"]).optional().nullable();
const clientStatus = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional();

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  mrn: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  preferredContactMethod: preferredContact,
  status: clientStatus,
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
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

  await createAuditLog({
    action: "VIEW",
    entityType: "Client",
    entityId: client.id,
    userId: user!.id,
    clientId: client.id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json(client);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { error, user, meta } = await requirePermission("clients:write", request);
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

  if (parsed.data.mrn && parsed.data.mrn !== existing.mrn) {
    const mrnDup = await prisma.client.findFirst({
      where: { mrn: parsed.data.mrn, NOT: { id: params.id } },
    });
    if (mrnDup) {
      return NextResponse.json({ error: "MRN already in use" }, { status: 409 });
    }
  }

  const { dateOfBirth, status, ...rest } = parsed.data;
  const fieldKeys = Object.keys(parsed.data).filter(
    (k) => parsed.data[k as keyof typeof parsed.data] !== undefined
  );

  const client = await prisma.client.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(dateOfBirth !== undefined && {
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      }),
      ...(status !== undefined && {
        isActive: clientIsActiveFromStatus(status),
      }),
    },
  });

  await addTimelineEvent({
    clientId: client.id,
    eventType: "CLIENT_UPDATED",
    title: "Client profile updated",
    actorUserId: user!.id,
    metadata: { fieldCount: fieldKeys.length },
  });

  await createAuditLog({
    action: status === "INACTIVE" || status === "ARCHIVED" ? "STATUS_CHANGE" : "UPDATE",
    entityType: "Client",
    entityId: client.id,
    userId: user!.id,
    clientId: client.id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: {
      isActive: client.isActive,
      fieldCount: fieldKeys.length,
    },
  });

  return NextResponse.json(client);
}

/** Archive/deactivate client (sets isActive false). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { error, user, meta } = await requirePermission("clients:write", request);
  if (error) return error;

  const existing = await prisma.client.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const client = await prisma.client.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  await addTimelineEvent({
    clientId: client.id,
    eventType: "CLIENT_UPDATED",
    title: "Client profile deactivated",
    actorUserId: user!.id,
  });

  await createAuditLog({
    action: "DELETE",
    entityType: "Client",
    entityId: client.id,
    userId: user!.id,
    clientId: client.id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { isActive: false, deactivated: true },
  });

  logger.info("client_deactivated", { clientId: client.id });

  return NextResponse.json(client);
}
