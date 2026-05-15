import { RoleType, UserStatus } from "@prisma/client";

export const userPublicSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  forcePasswordReset: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roleId: true,
  role: { select: { id: true, type: true, name: true } },
} as const;

export type PublicStaffUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  forcePasswordReset: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roleId: string;
  role: { id: string; type: RoleType; name: string };
};
