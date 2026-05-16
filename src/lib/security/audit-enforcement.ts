import { AuditAction, RoleType } from "@prisma/client";
import { createAuditLog } from "@/lib/audit";
import { sanitizeMetadataForAudit } from "./phi-safe-log";

export type ApiAccessAuditInput = {
  userId: string;
  actorRole: RoleType;
  method: string;
  path: string;
  ipAddress?: string;
  userAgent?: string;
  clientId?: string;
};

/**
 * Records API access for compliance tracing (no request body / PHI).
 */
export async function logApiAccess(input: ApiAccessAuditInput) {
  const action: AuditAction =
    input.method === "GET" || input.method === "HEAD" ? "VIEW" : "UPDATE";

  return createAuditLog({
    action,
    entityType: "ApiRoute",
    entityId: input.path,
    targetType: "ApiRoute",
    targetId: `${input.method} ${input.path}`,
    userId: input.userId,
    actorUserId: input.userId,
    actorRole: input.actorRole,
    clientId: input.clientId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: sanitizeMetadataForAudit({
      method: input.method,
      path: input.path,
      enforcement: "api-audit-middleware",
    }),
  });
}

export async function logExportAccess(input: {
  userId: string;
  actorRole: RoleType;
  exportType: string;
  recordCount?: number;
  clientId?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  return createAuditLog({
    action: "EXPORT",
    entityType: "DataExport",
    entityId: input.exportType,
    targetType: "DataExport",
    targetId: input.exportType,
    userId: input.userId,
    actorUserId: input.userId,
    actorRole: input.actorRole,
    clientId: input.clientId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: sanitizeMetadataForAudit({
      exportType: input.exportType,
      recordCount: input.recordCount,
      enforcement: "export-logging",
    }),
  });
}

export async function logFileAccessPlaceholder(input: {
  userId: string;
  actorRole: RoleType;
  fileRef: string;
  operation: "read" | "write" | "delete";
  clientId?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  return createAuditLog({
    action: "FILE_ACCESS",
    entityType: "FileAsset",
    entityId: input.fileRef,
    targetType: "FileAsset",
    targetId: input.fileRef,
    userId: input.userId,
    actorUserId: input.userId,
    actorRole: input.actorRole,
    clientId: input.clientId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: sanitizeMetadataForAudit({
      operation: input.operation,
      placeholder: true,
      note: "Wire to object storage access logs when files are enabled",
    }),
  });
}
