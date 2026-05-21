import { RoleType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ROLE_DEFINITIONS: {
  type: RoleType;
  name: string;
  description: string;
}[] = [
  { type: "ADMIN", name: "Administrator", description: "Full system access" },
  { type: "MANAGER", name: "Manager", description: "Operations and reporting" },
  {
    type: "FRONT_DESK_STAFF",
    name: "Front Desk",
    description: "Scheduling and check-in",
  },
  { type: "BILLING_STAFF", name: "Billing", description: "Billing and payments" },
  {
    type: "MEDICAL_RECORDS_STAFF",
    name: "Medical Records",
    description: "Records and compliance",
  },
  { type: "CLINICAL_STAFF", name: "Clinical", description: "Clinical workflows" },
  { type: "READ_ONLY", name: "Read Only", description: "View-only access" },
];

/** Ensures all RoleType rows exist before staff assignment. */
export async function ensureRolesExist(): Promise<void> {
  for (const role of ROLE_DEFINITIONS) {
    await prisma.role.upsert({
      where: { type: role.type },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }
}

export async function resolveRoleId(roleType: RoleType): Promise<string | null> {
  await ensureRolesExist();
  const role = await prisma.role.findUnique({ where: { type: roleType } });
  return role?.id ?? null;
}
