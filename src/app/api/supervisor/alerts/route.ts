import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { adminAlertService } from "@/services/admin-alert.service";

export async function GET() {
  const { error } = await requirePermission("supervisor:read");
  if (error) return error;

  const alerts = await adminAlertService.listOpen(100);
  return NextResponse.json({ alerts });
}
