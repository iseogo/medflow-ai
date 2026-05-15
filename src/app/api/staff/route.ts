import { RoleType, UserStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/api-auth";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { userPublicSelect } from "@/lib/user-public";

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  roleType: z.nativeEnum(RoleType),
  password: z.string().min(8),
  status: z.nativeEnum(UserStatus).optional(),
  forcePasswordReset: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const { error, user, meta } = await requirePermission("users:manage", request);
  if (error) return error;

  const staff = await prisma.user.findMany({
    select: userPublicSelect,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  await createAuditLog({
    action: "VIEW",
    entityType: "User",
    entityId: "staff-list",
    userId: user!.id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { count: staff.length },
  });

  return NextResponse.json(staff);
}

export async function POST(request: NextRequest) {
  const { error, user, meta } = await requirePermission("users:manage", request);
  if (error) return error;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const pwError = validatePasswordStrength(parsed.data.password);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const role = await prisma.role.findUnique({
    where: { type: parsed.data.roleType },
  });
  if (!role) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const created = await prisma.user.create({
    data: {
      email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      passwordHash,
      roleId: role.id,
      status: parsed.data.status ?? "ACTIVE",
      forcePasswordReset: parsed.data.forcePasswordReset ?? true,
    },
    select: userPublicSelect,
  });

  await createAuditLog({
    action: "CREATE",
    entityType: "User",
    entityId: created.id,
    targetType: "User",
    targetId: created.id,
    userId: user!.id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { roleType: role.type, status: created.status },
  });

  return NextResponse.json(created, { status: 201 });
}
