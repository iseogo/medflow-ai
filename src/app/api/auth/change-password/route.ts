import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { getRequestMeta } from "@/lib/request-meta";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const pwError = validatePasswordStrength(parsed.data.newPassword);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
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
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
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
    metadata: { field: "password" },
  });

  return NextResponse.json({ success: true });
}
