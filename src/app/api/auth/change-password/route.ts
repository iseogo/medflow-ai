import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { requireSession } from "@/lib/api-auth";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-meta";
import { logger } from "@/lib/logger";

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(8).optional(),
});

export async function POST(request: NextRequest) {
  const { error, user } = await requireSession();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (
    parsed.data.confirmPassword !== undefined &&
    parsed.data.confirmPassword !== parsed.data.newPassword
  ) {
    return NextResponse.json({ error: "New passwords do not match" }, { status: 400 });
  }

  const pwError = validatePasswordStrength(parsed.data.newPassword);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user!.id },
    include: { role: true },
  });
  if (!dbUser || dbUser.status !== "ACTIVE") {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }

  const valid = await verifyPassword(
    parsed.data.currentPassword,
    dbUser.passwordHash
  );
  if (!valid) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 400 }
    );
  }

  const meta = getRequestMeta(request);
  await prisma.user.update({
    where: { id: dbUser.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      forcePasswordReset: false,
    },
  });

  await createAuditLog({
    action: "UPDATE",
    entityType: "User",
    entityId: dbUser.id,
    targetType: "User",
    targetId: dbUser.id,
    userId: dbUser.id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { passwordChanged: true },
  });

  logger.info("password_changed", { userId: dbUser.id });

  return NextResponse.json({ success: true, message: "Password updated successfully" });
}
