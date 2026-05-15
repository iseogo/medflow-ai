import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getClientTimeline } from "@/lib/timeline";

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { error, user } = await requirePermission("clients:read");
  if (error) return error;

  const client = await prisma.client.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const events = await getClientTimeline(params.id);

  await prisma.auditLog.create({
    data: {
      action: "VIEW",
      entityType: "ClientTimeline",
      entityId: params.id,
      userId: user!.id,
      clientId: params.id,
    },
  });

  return NextResponse.json(events);
}
