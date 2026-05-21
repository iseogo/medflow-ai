import { RoleType, UserStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/api-auth";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { resolveRoleId } from "@/lib/roles/ensure-roles";
import { userPublicSelect } from "@/lib/user-public";
import { logger } from "@/lib/logger";

const updateSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  roleType: z.nativeEnum(RoleType).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  forcePasswordReset: z.boolean().optional(),
  resetPassword: z.string().min(8).optional(),
});

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { error, user, meta } = await requirePermission("users:manage", request);
  if (error) return error;

  const staff = await prisma.user.findUnique({
    where: { id: params.id },
    select: userPublicSelect,
  });
  if (!staff) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  await createAuditLog({
    action: "VIEW",
    entityType: "User",
    entityId: staff.id,
    userId: user!.id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

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
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  if (parsed.data.email) {
    const email = parsed.data.email.toLowerCase().trim();
    const dup = await prisma.user.findFirst({
      where: { email, NOT: { id: params.id } },
    });
    if (dup) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
  }

  if (parsed.data.resetPassword) {
    const pwError = validatePasswordStrength(parsed.data.resetPassword);
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 });
    }
  }

  let roleId = existing.roleId;
  if (parsed.data.roleType) {
    const resolved = await resolveRoleId(parsed.data.roleType);
    if (!resolved) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    roleId = resolved;
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.email && { email: parsed.data.email.toLowerCase().trim() }),
      ...(parsed.data.firstName && { firstName: parsed.data.firstName.trim() }),
      ...(parsed.data.lastName && { lastName: parsed.data.lastName.trim() }),
      ...(parsed.data.phone !== undefined && {
        phone: parsed.data.phone?.trim() || null,
      }),
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
    action: parsed.data.status === "INACTIVE" ? "STATUS_CHANGE" : "UPDATE",
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
      fieldsChanged: Object.keys(parsed.data).filter(
        (k) => parsed.data[k as keyof typeof parsed.data] !== undefined
      ),
    },
  });

  return NextResponse.json(updated);
}

/** Soft-deactivate staff (sets status INACTIVE). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { error, user, meta } = await requirePermission("users:manage", request);
  if (error) return error;

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  if (existing.id === user!.id) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account" },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { status: "INACTIVE" },
    select: userPublicSelect,
  });

  await createAuditLog({
    action: "DELETE",
    entityType: "User",
    entityId: updated.id,
    targetType: "User",
    targetId: updated.id,
    userId: user!.id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { status: "INACTIVE", deactivated: true },
  });

  logger.info("staff_user_deactivated", { userId: updated.id });

  return NextResponse.json(updated);
}
