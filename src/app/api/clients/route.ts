import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requireAnyPermission, requirePermission } from "@/lib/api-auth";
import { clientIsActiveFromStatus } from "@/lib/client-form";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { addTimelineEvent } from "@/lib/timeline";
import { logger } from "@/lib/logger";

const preferredContact = z.enum(["PHONE", "EMAIL", "SMS"]).optional().nullable();
const clientStatus = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional();

const optionalEmail = z
  .union([z.string().email(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: optionalEmail,
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

export async function GET(request: NextRequest) {
  const { error, user, meta } = await requireAnyPermission(
    ["clients:read", "clients:read-limited"],
    request
  );
  if (error) return error;

  const limited =
    !hasPermission(user!.role, "clients:read") &&
    hasPermission(user!.role, "clients:read-limited");
  const search = request.nextUrl.searchParams.get("search") ?? "";
  const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "true";

  const where = {
    ...(activeOnly ? { isActive: true } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
            { mrn: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [clients, activeCount, totalCount] = await Promise.all([
    limited
      ? prisma.client.findMany({
          where,
          orderBy: { lastName: "asc" },
          take: 200,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            mrn: true,
            isActive: true,
            preferredContactMethod: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : prisma.client.findMany({
          where,
          orderBy: { lastName: "asc" },
          include: {
            _count: { select: { appointments: true, timelineEvents: true } },
          },
          take: 200,
        }),
    prisma.client.count({ where: { isActive: true } }),
    prisma.client.count(),
  ]);

  if (hasPermission(user!.role, "audit:read") || hasPermission(user!.role, "clients:write")) {
    await createAuditLog({
      action: "VIEW",
      entityType: "Client",
      entityId: "client-list",
      userId: user!.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { count: clients.length, activeCount },
    });
  }

  return NextResponse.json({ clients, activeCount, totalCount });
}

export async function POST(request: NextRequest) {
  const { error, user, meta } = await requirePermission("clients:write", request);
  if (error) return error;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.mrn) {
    const mrnDup = await prisma.client.findUnique({
      where: { mrn: parsed.data.mrn },
    });
    if (mrnDup) {
      return NextResponse.json({ error: "MRN already in use" }, { status: 409 });
    }
  }

  const isActive = parsed.data.status
    ? clientIsActiveFromStatus(parsed.data.status)
    : true;

  const client = await prisma.client.create({
    data: {
      firstName: parsed.data.firstName.trim(),
      lastName: parsed.data.lastName.trim(),
      email: parsed.data.email?.trim() || null,
      phone: parsed.data.phone?.trim() || null,
      dateOfBirth: parsed.data.dateOfBirth
        ? new Date(parsed.data.dateOfBirth)
        : undefined,
      mrn: parsed.data.mrn?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      preferredContactMethod: parsed.data.preferredContactMethod ?? null,
      addressLine1: parsed.data.addressLine1?.trim() || null,
      addressLine2: parsed.data.addressLine2?.trim() || null,
      city: parsed.data.city?.trim() || null,
      state: parsed.data.state?.trim() || null,
      postalCode: parsed.data.postalCode?.trim() || null,
      isActive,
    },
  });

  await addTimelineEvent({
    clientId: client.id,
    eventType: "CLIENT_CREATED",
    title: "Client profile created",
    actorUserId: user!.id,
  });

  await createAuditLog({
    action: "CREATE",
    entityType: "Client",
    entityId: client.id,
    userId: user!.id,
    clientId: client.id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { isActive },
  });

  logger.info("client_created", { clientId: client.id });

  return NextResponse.json(client, { status: 201 });
}
