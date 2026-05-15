import { RoleType, UserStatus } from "@prisma/client";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { createAuditLog } from "./audit";
import { prisma } from "./prisma";
import { verifyPassword } from "./password";

const ACTIVE: UserStatus = "ACTIVE";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          include: { role: true },
        });

        if (!user || user.status !== ACTIVE) return null;

        const valid = await verifyPassword(credentials.password, user.passwordHash);
        if (!valid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        const headers = req?.headers;
        const forwarded = headers?.["x-forwarded-for"];
        const ipAddress =
          (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined) ??
          (typeof headers?.["x-real-ip"] === "string" ? headers["x-real-ip"] : undefined);

        await createAuditLog({
          action: "LOGIN",
          entityType: "User",
          entityId: user.id,
          targetType: "User",
          targetId: user.id,
          userId: user.id,
          actorUserId: user.id,
          actorName: `${user.firstName} ${user.lastName}`,
          actorRole: user.role.type,
          ipAddress,
          userAgent: typeof headers?.["user-agent"] === "string" ? headers["user-agent"] : undefined,
        });

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role.type,
          forcePasswordReset: user.forcePasswordReset,
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: RoleType }).role;
        token.forcePasswordReset = (user as { forcePasswordReset?: boolean }).forcePasswordReset ?? false;
      }
      if (trigger === "update" && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { forcePasswordReset: true, status: true },
        });
        if (fresh) {
          token.forcePasswordReset = fresh.forcePasswordReset;
          if (fresh.status !== ACTIVE) {
            token.invalid = true;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.invalid) {
        return { ...session, user: undefined };
      }
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as RoleType;
        session.user.forcePasswordReset = Boolean(token.forcePasswordReset);
      }
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (token?.id) {
        await createAuditLog({
          action: "LOGOUT",
          entityType: "User",
          entityId: token.id as string,
          targetType: "User",
          targetId: token.id as string,
          userId: token.id as string,
          actorUserId: token.id as string,
        });
      }
    },
  },
};
