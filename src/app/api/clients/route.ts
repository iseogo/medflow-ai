import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requireAnyPermission, requirePermission } from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { addTimelineEvent } from "@/lib/timeline";

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  dateOfBirth: z.string().datetime().optional().nullable(),
  mrn: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const { error, user } = await requireAnyPermission(
    ["clients:read", "clients:read-limited"],
    request
  );
  if (error) return error;

  const limited =
    !hasPermission(user!.role, "clients:read") &&
    hasPermission(user!.role, "clients:read-limited");
  const search = request.nextUrl.searchParams.get("search") ?? "";
  const where = search
    ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search } },
          { mrn: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const clients = limited
    ? await prisma.client.findMany({
        where,
        orderBy: { lastName: "asc" },
        take: 100,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          mrn: true,
          isActive: true,
          createdAt: true,
        },
      })
    : await prisma.client.findMany({
        where,
        orderBy: { lastName: "asc" },
        include: {
          _count: { select: { appointments: true, timelineEvents: true } },
        },
        take: 100,
      });

  return NextResponse.json(clients);
}

export async function POST(request: NextRequest) {
  const { error, user } = await requirePermission("clients:write");
  if (error) return error;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const client = await prisma.client.create({
    data: {
      ...parsed.data,
      dateOfBirth: parsed.data.dateOfBirth
        ? new Date(parsed.data.dateOfBirth)
        : undefined,
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
  });

  return NextResponse.json(client, { status: 201 });
}
