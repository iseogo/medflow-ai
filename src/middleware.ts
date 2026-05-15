import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { canAccessDashboardRoute } from "@/lib/route-permissions";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;
    const role = token?.role;

    if (!role) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (pathname !== "/dashboard/access-denied" && !canAccessDashboardRoute(role, pathname)) {
      return NextResponse.redirect(new URL("/dashboard/access-denied", req.url));
    }

    if (
      token.forcePasswordReset &&
      !pathname.startsWith("/dashboard/settings") &&
      pathname !== "/dashboard/access-denied"
    ) {
      const url = new URL("/dashboard/settings", req.url);
      url.searchParams.set("changePassword", "1");
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token?.id,
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*"],
};
