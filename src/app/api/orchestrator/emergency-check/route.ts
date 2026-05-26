import { CommunicationChannel } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { detectEmergencyLanguage } from "@/lib/emergency-detect";
import { masterOrchestratorService } from "@/services/master-orchestrator.service";

const schema = z.object({
  text: z.string().min(1),
  clientId: z.string(),
  appointmentId: z.string().optional().nullable(),
  agentType: z.enum([
    "FRONT_DESK_AI",
    "INTAKE_AI",
    "APPOINTMENT_AI",
    "VOICE_CALL_AI",
    "SMS_REMINDER_AI",
    "EMAIL_AI",
    "STAFF_ASSISTANT_AI",
    "ESCALATION_AI",
  ]),
  channel: z.nativeEnum(CommunicationChannel).default("CALL"),
  purpose: z.string().default("emergency_detected"),
});

export async function POST(request: NextRequest) {
  const { error } = await requirePermission("orchestrator:write");
  if (error) return error;

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const detection = detectEmergencyLanguage(parsed.data.text);

  if (!detection.isEmergency) {
    return NextResponse.json({ isEmergency: false, matchedTerms: [] });
  }

  // Only trigger full automation halt for high-confidence emergency signals.
  if (!detection.isHighConfidence) {
    return NextResponse.json({
      isEmergency: true,
      isHighConfidence: false,
      matchedTerms: detection.matchedTerms,
      automationHalted: false,
      note: "Medium-confidence signal — flag for review but automation not halted",
    });
  }

  const proposal = await masterOrchestratorService.handleEmergency({
    clientId: parsed.data.clientId,
    appointmentId: parsed.data.appointmentId,
    agentType: parsed.data.agentType,
    actionType: "HALT_AUTOMATION",
    purpose: parsed.data.purpose,
    channel: parsed.data.channel,
    description: parsed.data.text.slice(0, 500),
    matchedTerms: detection.matchedTerms,
  });

  return NextResponse.json({
    isEmergency: true,
    matchedTerms: detection.matchedTerms,
    proposal,
    automationHalted: true,
  });
}
