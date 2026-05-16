import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { RoleType } from "@prisma/client";
import { apiRbacAllowed, isPublicApiPath } from "@/lib/security/api-rbac";
import { canAccessDashboardRoute } from "@/lib/route-permissions";

type MiddlewareToken = {
  id?: string;
  role?: RoleType;
  forcePasswordReset?: boolean;
  invalid?: boolean;
};

export async function applyApiRbacMiddleware(
  request: NextRequest
): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/") || isPublicApiPath(pathname)) {
    return null;
  }

  const token = (await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })) as MiddlewareToken | null;

  if (!token?.id || token.invalid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!token.role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const method = request.method.toUpperCase();
  if (!apiRbacAllowed(token.role, pathname, method)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

export function applyDashboardRbacMiddleware(
  request: NextRequest,
  token: MiddlewareToken
): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  const role = token.role;

  if (!role) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (
    pathname !== "/dashboard/access-denied" &&
    !canAccessDashboardRoute(role, pathname)
  ) {
    return NextResponse.redirect(new URL("/dashboard/access-denied", request.url));
  }

  if (
    token.forcePasswordReset &&
    !pathname.startsWith("/dashboard/settings") &&
    pathname !== "/dashboard/access-denied"
  ) {
    const url = new URL("/dashboard/settings", request.url);
    url.searchParams.set("changePassword", "1");
    return NextResponse.redirect(url);
  }

  return null;
}
