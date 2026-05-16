import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { RoleType } from "@prisma/client";
import { logApiAccess } from "@/lib/security/audit-enforcement";
import { clientIpFromHeaders } from "@/lib/security/rate-limit";
import { isPublicApiPath } from "@/lib/security/api-rbac";

const SENSITIVE_API_PREFIXES = [
  "/api/clients",
  "/api/appointments",
  "/api/audit",
  "/api/medical",
  "/api/staff",
  "/api/orchestrator",
  "/api/agent-actions",
  "/api/reminders",
];

/**
 * Fire-and-forget API access audit for sensitive routes (no PHI in metadata).
 */
export async function enqueueApiAccessAudit(request: NextRequest): Promise<void> {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/") || isPublicApiPath(pathname)) return;

  const sensitive = SENSITIVE_API_PREFIXES.some((p) => pathname.startsWith(p));
  if (!sensitive) return;

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token?.id || !token.role) return;

  const clientIdMatch = pathname.match(
    /\/api\/clients\/([^/]+)/
  );
  const clientId = clientIdMatch?.[1];

  void logApiAccess({
    userId: token.id as string,
    actorRole: token.role as RoleType,
    method: request.method.toUpperCase(),
    path: pathname,
    ipAddress: clientIpFromHeaders(request.headers),
    userAgent: request.headers.get("user-agent") ?? undefined,
    clientId,
  }).catch(() => {
    /* audit must not block request */
  });
}
