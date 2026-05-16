import { RoleType } from "@prisma/client";
import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { canReadClients, hasPermission } from "@/lib/rbac";
import type { RequestMeta } from "@/lib/api-auth";
import type { SessionUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export class DataAccessDeniedError extends Error {
  constructor(message = "Access denied to client data") {
    super(message);
    this.name = "DataAccessDeniedError";
  }
}

export async function assertClientExists(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, isActive: true },
  });
  if (!client) {
    throw new DataAccessDeniedError("Client not found");
  }
  return client;
}

/**
 * Enforce RBAC before returning PHI-bearing client records.
 */
export async function assertClientDataAccess(input: {
  user: SessionUser;
  clientId: string;
  action: "read" | "write";
  meta?: RequestMeta;
}) {
  if (input.action === "write" && !hasPermission(input.user.role, "clients:write")) {
    throw new DataAccessDeniedError("Insufficient permission to modify client");
  }
  if (input.action === "read" && !canReadClients(input.user.role)) {
    throw new DataAccessDeniedError("Insufficient permission to view client");
  }

  await assertClientExists(input.clientId);

  await createAuditLog({
    action: "VIEW",
    entityType: "Client",
    entityId: input.clientId,
    targetType: "Client",
    targetId: input.clientId,
    clientId: input.clientId,
    userId: input.user.id,
    actorUserId: input.user.id,
    actorRole: input.user.role,
    ipAddress: input.meta?.ipAddress,
    userAgent: input.meta?.userAgent,
    metadata: {
      accessType: input.action,
      enforcement: "data-access-check",
    },
  });
}

export function dataAccessErrorResponse(error: unknown) {
  if (error instanceof DataAccessDeniedError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return null;
}

export function canAccessRoleResource(role: RoleType, permission: string): boolean {
  return hasPermission(role, permission as never);
}
