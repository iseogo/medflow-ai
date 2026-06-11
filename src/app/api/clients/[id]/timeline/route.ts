import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  assertClientDataAccess,
  dataAccessErrorResponse,
} from "@/lib/security/data-access";
import { getClientTimeline } from "@/lib/timeline";

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { error, user, meta } = await requirePermission("clients:read", request);
  if (error) return error;

  try {
    await assertClientDataAccess({
      user: user!,
      clientId: params.id,
      action: "read",
      meta,
    });
  } catch (e) {
    const denied = dataAccessErrorResponse(e);
    if (denied) return denied;
    throw e;
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
