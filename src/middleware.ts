import { withAuth } from "next-auth/middleware";
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { RoleType } from "@prisma/client";
import { isPublicApiPath } from "@/lib/security/api-rbac";
import { enqueueApiAccessAudit } from "@/middleware/audit";
import { applyApiRbacMiddleware, applyDashboardRbacMiddleware } from "@/middleware/rbac";
import { applySecurityMiddleware } from "@/middleware/security";

type MiddlewareToken = {
  id?: string;
  role?: RoleType;
  forcePasswordReset?: boolean;
  invalid?: boolean;
};

export default withAuth(
  async function middleware(req: NextRequest) {
    const apiDenied = await applyApiRbacMiddleware(req);
    if (apiDenied) {
      return applySecurityMiddleware(req, apiDenied);
    }

    if (req.nextUrl.pathname.startsWith("/api/")) {
      await enqueueApiAccessAudit(req);
      return applySecurityMiddleware(req, NextResponse.next());
    }

    const token = (await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    })) as MiddlewareToken | null;
    const dashDenied = applyDashboardRbacMiddleware(req, token ?? {});
    if (dashDenied) {
      return applySecurityMiddleware(req, dashDenied);
    }

    return applySecurityMiddleware(req, NextResponse.next());
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;
        if (pathname.startsWith("/api/") && isPublicApiPath(pathname)) {
          return true;
        }
        return Boolean(token?.id && !(token as { invalid?: boolean }).invalid);
      },
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
