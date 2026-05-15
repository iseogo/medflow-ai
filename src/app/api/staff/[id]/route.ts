import { RoleType, UserStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/api-auth";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { userPublicSelect } from "@/lib/user-public";

const updateSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  roleType: z.nativeEnum(RoleType).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  forcePasswordReset: z.boolean().optional(),
  resetPassword: z.string().min(8).optional(),
});

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { error } = await requirePermission("users:manage", request);
  if (error) return error;

  const staff = await prisma.user.findUnique({
    where: { id: params.id },
    select: userPublicSelect,
  });
  if (!staff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(staff);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { error, user, meta } = await requirePermission("users:manage", request);
  if (error) return error;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id: params.id },
    include: { role: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (parsed.data.resetPassword) {
    const pwError = validatePasswordStrength(parsed.data.resetPassword);
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 });
    }
  }

  let roleId = existing.roleId;
  if (parsed.data.roleType) {
    const role = await prisma.role.findUnique({
      where: { type: parsed.data.roleType },
    });
    if (!role) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    roleId = role.id;
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.email && { email: parsed.data.email.toLowerCase().trim() }),
      ...(parsed.data.firstName && { firstName: parsed.data.firstName }),
      ...(parsed.data.lastName && { lastName: parsed.data.lastName }),
      ...(parsed.data.status && { status: parsed.data.status }),
      ...(parsed.data.forcePasswordReset !== undefined && {
        forcePasswordReset: parsed.data.forcePasswordReset,
      }),
      ...(parsed.data.resetPassword && {
        passwordHash: await hashPassword(parsed.data.resetPassword),
        forcePasswordReset: true,
      }),
      roleId,
    },
    select: userPublicSelect,
  });

  await createAuditLog({
    action: "UPDATE",
    entityType: "User",
    entityId: updated.id,
    targetType: "User",
    targetId: updated.id,
    userId: user!.id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: {
      status: updated.status,
      roleType: updated.role.type,
      passwordReset: Boolean(parsed.data.resetPassword),
    },
  });

  return NextResponse.json(updated);
}
