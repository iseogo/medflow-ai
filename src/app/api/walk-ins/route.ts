import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAnyPermission } from "@/lib/api-auth";
import { physicalClientService } from "@/services/physical-client.service";

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  dateOfBirth: z.string().datetime().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  preferredLanguage: z.string().optional(),
  communicationPreferences: z
    .object({
      voice: z.boolean().optional(),
      sms: z.boolean().optional(),
      email: z.boolean().optional(),
      preferredChannel: z.string().optional(),
    })
    .optional(),
  consent: z
    .object({
      voice: z.boolean().optional(),
      sms: z.boolean().optional(),
      email: z.boolean().optional(),
    })
    .optional(),
  insurancePlaceholder: z
    .object({
      carrier: z.string().optional(),
      memberId: z.string().optional(),
      groupNumber: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  documentsPlaceholder: z
    .array(z.object({ name: z.string(), status: z.string() }))
    .optional(),
  staffNotes: z.string().optional().nullable(),
  appointment: z.object({
    scheduledAt: z.string().datetime(),
    reason: z.string().optional().nullable(),
    providerName: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    durationMinutes: z.number().int().positive().optional(),
  }),
});

export async function GET(request: NextRequest) {
  const { error } = await requireAnyPermission(["walkins:read", "checkins:read"], request);
  if (error) return error;

  const visits = await physicalClientService.listWalkIns();
  return NextResponse.json(visits);
}

export async function POST(request: NextRequest) {
  const { error, user, meta } = await requireAnyPermission(
    ["walkins:write"],
    request
  );
  if (error) return error;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await physicalClientService.createFirstTimeWalkIn(
      parsed.data,
      { id: user!.id, name: user!.name, role: user!.role },
      meta
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Walk-in failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
