import { RoleType } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: RoleType;
      forcePasswordReset: boolean;
    };
  }

  interface User {
    id: string;
    role: RoleType;
    forcePasswordReset?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: RoleType;
    forcePasswordReset?: boolean;
    invalid?: boolean;
  }
}
