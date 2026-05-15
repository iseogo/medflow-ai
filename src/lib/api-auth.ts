import { RoleType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "./auth";
import { hasPermission, Permission } from "./rbac";
import { getRequestMeta } from "./request-meta";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: RoleType;
  forcePasswordReset?: boolean;
};

export type RequestMeta = { ipAddress?: string; userAgent?: string };

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
      meta: {} as RequestMeta,
    };
  }
  return {
    error: null,
    user: session.user as SessionUser,
    meta: {} as RequestMeta,
  };
}

export async function requirePermission(permission: Permission, request?: NextRequest) {
  const { error, user } = await requireSession();
  if (error) return { error, user: null, meta: {} as RequestMeta };
  if (!hasPermission(user!.role, permission)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      user: null,
      meta: {} as RequestMeta,
    };
  }
  const meta: RequestMeta = request ? getRequestMeta(request) : {};
  return { error: null, user: user!, meta };
}

export async function requireAnyPermission(
  permissions: Permission[],
  request?: NextRequest
) {
  const { error, user } = await requireSession();
  if (error) return { error, user: null, meta: {} as RequestMeta };
  const allowed = permissions.some((p) => hasPermission(user!.role, p));
  if (!allowed) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      user: null,
      meta: {} as RequestMeta,
    };
  }
  const meta: RequestMeta = request ? getRequestMeta(request) : {};
  return { error: null, user: user!, meta };
}
