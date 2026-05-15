import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generatePasswordResetToken, hashResetToken } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().email(),
});

/**
 * Placeholder forgot-password flow — creates a token in DB (no email sent yet).
 * Returns generic success to avoid email enumeration.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && user.status === "ACTIVE") {
    const { token, tokenHash, expiresAt } = generatePasswordResetToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });
    if (process.env.NODE_ENV === "development") {
      console.info("[forgot-password placeholder] Reset token for", email, token);
    }
  }

  return NextResponse.json({
    message:
      "If an account exists for that email, password reset instructions have been recorded (email delivery is not configured in Phase 3.5).",
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const token = z.string().min(1).parse(body.token);
  const newPassword = z.string().min(8).parse(body.newPassword);

  const tokenHash = hashResetToken(token);
  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!record) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const { hashPassword } = await import("@/lib/password");
  const hashed = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: hashed,
        forcePasswordReset: false,
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ success: true });
}
