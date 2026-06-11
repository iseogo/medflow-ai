import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission("audit:read");
  if (error) return error;

  const entityType = request.nextUrl.searchParams.get("entityType");
  const clientId = request.nextUrl.searchParams.get("clientId");
  const parsedLimit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 200)
    : 50;

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(entityType && { entityType }),
      ...(clientId && { clientId }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    take: limit,
  });

  return NextResponse.json(logs);
}
