import {
  AppointmentStatus,
  CommunicationStatus,
  ConsentType,
  Prisma,
} from "@prisma/client";
import { CallDirection, TimelineEventType } from "@prisma/client";
import {
  AiAutomationBlockedError,
  assertAiAutomationAllowed,
} from "@/lib/ai-automation-guard";
import {
  assertNoDuplicateCommunication,
  DuplicateCommunicationError,
} from "@/lib/communication-dedup";
import { recordCommunicationTimelineAndAudit } from "@/lib/communication-log";
import { prisma } from "@/lib/prisma";
import type { ReminderOutcome, ReminderScheduleOffset } from "@/lib/reminder-types";
import { REMINDER_SCHEDULE_OFFSETS } from "@/lib/reminder-types";
import { addTimelineEvent } from "@/lib/timeline";
import { notificationService } from "@/services/notification.service";
import { n8nService } from "./n8n.service";
import { orchestratorService } from "./orchestrator.service";
import {
  AiVoiceReminderIntent,
  voiceAiReminderService,
} from "./voice-ai-reminder.service";

type ReminderAppointmentRow = {
  id: string;
  scheduledAt: Date;
  status: AppointmentStatus;
  reminderAutomationPaused: boolean;
  clientId: string;
  providerName: string | null;
  reason: string | null;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    consentRecords: { type: ConsentType; granted: boolean }[];
  };
};

export type ReminderListDbRow = {
  id: string;
  reminderOffset: ReminderScheduleOffset;
  outcome: ReminderOutcome;
  dueAt: Date;
  createdAt: Date;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    mrn: string | null;
    phone: string | null;
    email: string | null;
  };
  appointment: {
    id: string;
    scheduledAt: Date;
    status: AppointmentStatus;
    providerName: string | null;
    reason: string | null;
  };
};

const reminderLogModel = (
  prisma as unknown as {
    reminderLog: {
      findUnique: (args: {
        where: {
          appointmentId_reminderOffset: {
            appointmentId: string;
            reminderOffset: ReminderScheduleOffset;
          };
        };
      }) => Promise<{ id: string } | null>;
      create: (args: {
        data: {
          appointmentId: string;
          clientId: string;
          reminderOffset: ReminderScheduleOffset;
          outcome: ReminderOutcome;
          dueAt: Date;
          voiceCallLogId: string | null;
          smsLogId: string | null;
          emailLogId: string | null;
          metadata?: Prisma.InputJsonValue;
        };
      }) => Promise<{
        id: string;
        appointmentId: string;
        clientId: string;
        reminderOffset: ReminderScheduleOffset;
        outcome: ReminderOutcome;
        dueAt: Date;
        createdAt: Date;
      }>;
      findMany: (args: unknown) => Promise<ReminderListDbRow[]>;
    };
  }
).reminderLog;

const REMINDER_OFFSETS: ReminderScheduleOffset[] = [
  ...REMINDER_SCHEDULE_OFFSETS,
];

const ACTIVE_APPT_STATUSES: AppointmentStatus[] = ["SCHEDULED", "CONFIRMED"];

function offsetToMinutes(o: ReminderScheduleOffset): number {
  switch (o) {
    case "HOURS_48":
      return 48 * 60;
    case "HOURS_24":
      return 24 * 60;
    case "HOURS_2":
      return 120;
    case "MINUTES_30":
      return 30;
    default:
      return 0;
  }
}

function purposeVoice(appointmentId: string, offset: ReminderScheduleOffset) {
  return `reminder_${offset}_voice_${appointmentId}`;
}

function purposeSms(appointmentId: string, offset: ReminderScheduleOffset) {
  return `reminder_${offset}_sms_${appointmentId}`;
}

function purposeEmail(appointmentId: string, offset: ReminderScheduleOffset) {
  return `reminder_${offset}_email_${appointmentId}`;
}

export class ReminderEngineError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "APPOINTMENT_NOT_FOUND"
      | "AUTOMATION_PAUSED"
      | "INVALID_STATUS"
      | "DUPLICATE_CYCLE"
      | "NO_CONSENT"
  ) {
    super(message);
    this.name = "ReminderEngineError";
  }
}

async function resolveSystemUserId(explicit?: string) {
  if (explicit) return explicit;
  const admin = await prisma.user.findFirst({
    where: { email: "admin@medflow.ai" },
    select: { id: true },
  });
  return admin?.id;
}

async function resolveClientPhone(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { phone: true },
  });
  return client?.phone ?? "+10000000000";
}

async function resolveClientEmail(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { email: true, firstName: true, lastName: true },
  });
  return (
    client?.email ??
    `${client?.firstName ?? "client"}.${client?.lastName ?? "unknown"}@example.com`
  );
}

function hasConsent(
  consents: { type: string; granted: boolean }[],
  type: "PHONE" | "SMS" | "EMAIL"
) {
  return consents.some((c) => c.type === type && c.granted);
}

function mapVoiceStatus(s: "ANSWERED" | "NO_ANSWER" | "FAILED"): CommunicationStatus {
  if (s === "ANSWERED") return "ANSWERED";
  if (s === "NO_ANSWER") return "NO_ANSWER";
  return "FAILED";
}

async function notifyStaffTask(input: {
  title: string;
  description: string;
  clientId: string;
  createdById: string;
  priority: "NORMAL" | "HIGH" | "URGENT";
}) {
  return prisma.staffTask.create({
    data: {
      title: input.title,
      description: input.description,
      clientId: input.clientId,
      createdById: input.createdById,
      priority: input.priority,
    },
  });
}

async function applyClientIntent(
  intent: AiVoiceReminderIntent,
  appointmentId: string,
  clientId: string,
  systemUserId: string
): Promise<ReminderOutcome | null> {
  if (intent === "NONE") return null;

  if (intent === "CONFIRMED") {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "CONFIRMED" },
    });
    await addTimelineEvent({
      clientId,
      eventType: "APPOINTMENT_STATUS_CHANGED",
      title: "Appointment confirmed (AI voice reminder)",
      metadata: { appointmentId, source: "reminder_engine" },
      actorUserId: systemUserId,
    });
    await notificationService.emit({
      source: "PATIENT_CONFIRMED_APPOINTMENT",
      sourceKey: `patient-confirmed:${appointmentId}`,
      title: "Patient confirmed appointment",
      message: "Client confirmed via AI voice reminder.",
      clientId,
      appointmentId,
      createdByUserId: systemUserId,
      actorChannel: "orchestrator",
    });
    return "CONFIRMED";
  }

  if (intent === "CANCELLED") {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "CANCELLED" },
    });
    await addTimelineEvent({
      clientId,
      eventType: "APPOINTMENT_STATUS_CHANGED",
      title: "Appointment cancelled (AI voice reminder)",
      description: "Slot released for rescheduling",
      metadata: { appointmentId, source: "reminder_engine", slotReopened: true },
      actorUserId: systemUserId,
    });
    const task = await notifyStaffTask({
      title: "Client cancelled via reminder call",
      description: `Appointment ${appointmentId} cancelled by client during AI reminder. Slot reopened.`,
      clientId,
      createdById: systemUserId,
      priority: "URGENT",
    });
    await notificationService.emit({
      source: "PATIENT_CANCELLED_APPOINTMENT",
      sourceKey: `patient-cancelled:${appointmentId}`,
      title: "Patient cancelled appointment",
      message: "Client cancelled during AI voice reminder. Slot reopened.",
      clientId,
      appointmentId,
      staffTaskId: task.id,
      createdByUserId: systemUserId,
      actorChannel: "orchestrator",
    });
    return "CANCELLED";
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "RESCHEDULE_REQUESTED" },
  });
  await addTimelineEvent({
    clientId,
    eventType: "APPOINTMENT_STATUS_CHANGED",
    title: "Reschedule requested (AI voice reminder)",
    metadata: {
      appointmentId,
      source: "reminder_engine",
      availableSlotsPlaceholder: true,
    },
    actorUserId: systemUserId,
  });
  const task = await notifyStaffTask({
    title: "Reschedule requested — offer available slots",
    description:
      "Client asked to reschedule during AI voice reminder. Use scheduling placeholder to propose alternative times.",
    clientId,
    createdById: systemUserId,
    priority: "HIGH",
  });
  await notificationService.emit({
    source: "PATIENT_RESCHEDULE_REQUESTED",
    sourceKey: `patient-reschedule:${appointmentId}`,
    title: "Reschedule requested",
    message: "Client asked to reschedule during AI voice reminder.",
    clientId,
    appointmentId,
    staffTaskId: task.id,
    createdByUserId: systemUserId,
    actorChannel: "orchestrator",
  });
  return "RESCHEDULE_REQUESTED";
}

export const reminderEngineService = {
  offsetToMinutes,

  async processReminderCycle(
    appointmentId: string,
    offset: ReminderScheduleOffset,
    systemUserId?: string
  ) {
    const userId = await resolveSystemUserId(systemUserId);
    if (!userId) {
      throw new Error("No system user — seed admin@medflow.ai");
    }

    const existing = await reminderLogModel.findUnique({
      where: {
        appointmentId_reminderOffset: { appointmentId, reminderOffset: offset },
      },
    });
    if (existing) {
      throw new ReminderEngineError(
        "Reminder already sent for this window",
        "DUPLICATE_CYCLE"
      );
    }

    const appointment = (await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        client: {
          include: { consentRecords: true },
        },
      },
    })) as ReminderAppointmentRow | null;

    if (!appointment) {
      throw new ReminderEngineError("Appointment not found", "APPOINTMENT_NOT_FOUND");
    }

    if (appointment.reminderAutomationPaused) {
      throw new ReminderEngineError(
        "Reminder automation paused for this appointment",
        "AUTOMATION_PAUSED"
      );
    }

    if (!ACTIVE_APPT_STATUSES.includes(appointment.status)) {
      throw new ReminderEngineError(
        `Appointment status ${appointment.status} not eligible for reminders`,
        "INVALID_STATUS"
      );
    }

    try {
      await assertAiAutomationAllowed(appointment.clientId);
    } catch (e) {
      if (e instanceof AiAutomationBlockedError) {
        throw new ReminderEngineError(
          "Staff or system paused automation for this client",
          "AUTOMATION_PAUSED"
        );
      }
      throw e;
    }

    const consents = appointment.client.consentRecords.map((c) => ({
      type: c.type,
      granted: c.granted,
    }));

    const phoneOk = hasConsent(consents, "PHONE");
    const smsOk = hasConsent(consents, "SMS");
    const emailOk = hasConsent(consents, "EMAIL");

    if (!phoneOk && !smsOk && !emailOk) {
      throw new ReminderEngineError(
        "Client has no reminder channels (PHONE/SMS/EMAIL consent)",
        "NO_CONSENT"
      );
    }

    const dueAt = new Date(
      appointment.scheduledAt.getTime() - offsetToMinutes(offset) * 60_000
    );

    const meta: Record<string, unknown> = {
      reminderOffset: offset,
      channels: { voice: phoneOk, sms: smsOk, email: emailOk },
    };

    let voiceCallLogId: string | null = null;
    let smsLogId: string | null = null;
    let emailLogId: string | null = null;
    let voiceFailed = false;
    let clientIntent: AiVoiceReminderIntent = "NONE";
    let terminalOutcome: ReminderOutcome | null = null;

    /** 1 — AI voice first */
    if (phoneOk) {
      const voicePurpose = purposeVoice(appointmentId, offset);
      try {
        await assertNoDuplicateCommunication({
          clientId: appointment.clientId,
          appointmentId,
          channel: "CALL",
          purpose: voicePurpose,
        });
      } catch (e) {
        if (e instanceof DuplicateCommunicationError) {
          throw new ReminderEngineError(
            "Duplicate voice reminder",
            "DUPLICATE_CYCLE"
          );
        }
        throw e;
      }

      const phone = await resolveClientPhone(appointment.clientId);
      const callLog = await prisma.callLog.create({
        data: {
          clientId: appointment.clientId,
          appointmentId,
          purpose: voicePurpose,
          direction: "OUTBOUND" as CallDirection,
          phoneNumber: phone,
          status: "PENDING",
          metadata: {
            aiVoiceReminder: true,
            reminderOffset: offset,
          } as Prisma.InputJsonValue,
        },
      });

      const ai = await voiceAiReminderService.placeAiReminderCall({
        to: phone,
        clientFirstName: appointment.client.firstName,
        appointmentAt: appointment.scheduledAt,
        providerName: appointment.providerName,
      });

      clientIntent = ai.simulatedClientIntent;
      const commStatus = mapVoiceStatus(ai.connectStatus);
      voiceFailed = ai.connectStatus !== "ANSWERED";

      await prisma.callLog.update({
        where: { id: callLog.id },
        data: {
          status: commStatus,
          externalRef: ai.externalRef,
          durationSeconds: ai.durationSeconds,
          transcript: ai.answered
            ? `stub: intent=${clientIntent}`
            : "stub: no answer / failed",
        },
      });

      voiceCallLogId = callLog.id;

      await recordCommunicationTimelineAndAudit({
        clientId: appointment.clientId,
        channel: "CALL",
        entityType: "CallLog",
        entityId: callLog.id,
        title: `AI voice reminder — ${offset.replace(/_/g, " ").toLowerCase()}`,
        description: `Status: ${commStatus}`,
        purpose: voicePurpose,
        status: commStatus,
        userId,
        appointmentId,
        metadata: {
          aiVoiceReminder: true,
          simulatedIntent: clientIntent,
          externalRef: ai.externalRef,
        },
      });

      await n8nService.triggerWorkflow({
        workflowName: "reminder_voice_ai",
        payload: { callLogId: callLog.id, appointmentId },
      });

      const handled = await applyClientIntent(
        clientIntent,
        appointmentId,
        appointment.clientId,
        userId
      );
      if (handled) {
        terminalOutcome = handled;
        meta.clientIntent = clientIntent;
        meta.terminalFromVoice = true;
      }
    } else {
      meta.voiceSkippedReason = "no_phone_consent";
    }

    const ctx = { source: "automation" as const, userId };

    /** If client cancelled or reschedule via voice, still send SMS+email for paper trail? Spec implied stop — skip */
    const skipSmsEmail =
      terminalOutcome === "CANCELLED" ||
      terminalOutcome === "RESCHEDULE_REQUESTED";

    /** 2 — SMS */
    if (smsOk && !skipSmsEmail) {
      const smsPurpose = purposeSms(appointmentId, offset);
      try {
        const body = `Reminder: appointment on ${appointment.scheduledAt.toISOString().slice(0, 16)} — reply not monitored (stub).`;
        const sms = await orchestratorService.sendSms(
          {
            clientId: appointment.clientId,
            appointmentId,
            purpose: smsPurpose,
            messageBody: body,
          },
          ctx
        );
        smsLogId = sms.id;
      } catch (e) {
        meta.smsError = e instanceof Error ? e.message : "sms_failed";
      }
    }

    /** 3 — Email */
    if (emailOk && !skipSmsEmail) {
      const emailPurpose = purposeEmail(appointmentId, offset);
      try {
        const toEmail = await resolveClientEmail(appointment.clientId);
        const email = await orchestratorService.sendEmail(
          {
            clientId: appointment.clientId,
            appointmentId,
            purpose: emailPurpose,
            subject: `Appointment reminder — ${appointment.reason ?? "visit"}`,
            body: `Hello ${appointment.client.firstName},\n\nThis is a reminder for your visit scheduled at ${appointment.scheduledAt.toISOString()}.\n\n— MedFlow AI (stub)\n`,
            toEmail,
          },
          ctx
        );
        emailLogId = email.id;
      } catch (e) {
        meta.emailError = e instanceof Error ? e.message : "email_failed";
      }
    }

    /** Staff escalation: voice failed on 2h / 30m tiers (when voice was attempted) */
    let escalationTaskId: string | null = null;
    if (
      phoneOk &&
      voiceFailed &&
      (offset === "HOURS_2" || offset === "MINUTES_30")
    ) {
      const task = await notifyStaffTask({
        title: `Urgent: voice reminder failed (${offset})`,
        description:
          "AI voice reminder did not complete successfully near visit time. SMS/email fallbacks were attempted. Follow up with the client.",
        clientId: appointment.clientId,
        createdById: userId,
        priority: "URGENT",
      });
      escalationTaskId = task.id;
      meta.escalationTaskId = task.id;
    }

    /** Final outcome */
    let outcome: ReminderOutcome =
      terminalOutcome ??
      (escalationTaskId
        ? "ESCALATED"
        : voiceFailed && phoneOk
          ? "FAILED"
          : "NO_RESPONSE");

    if (
      terminalOutcome === "CONFIRMED" ||
      terminalOutcome === "CANCELLED" ||
      terminalOutcome === "RESCHEDULE_REQUESTED"
    ) {
      outcome = terminalOutcome;
    }

    const reminderLog = await reminderLogModel.create({
      data: {
        appointmentId,
        clientId: appointment.clientId,
        reminderOffset: offset,
        outcome,
        dueAt,
        voiceCallLogId,
        smsLogId,
        emailLogId,
        metadata: meta as Prisma.InputJsonValue,
      },
    });

    await addTimelineEvent({
      clientId: appointment.clientId,
      eventType:
        "REMINDER_CYCLE_COMPLETED" as unknown as TimelineEventType,
      title: `Reminder cycle ${offset.replace(/_/g, " ").toLowerCase()}`,
      description: `Outcome: ${outcome}`,
      metadata: {
        reminderLogId: reminderLog.id,
        outcome,
        appointmentId,
      },
      actorUserId: userId,
    });

    if (outcome === "FAILED" || outcome === "ESCALATED") {
      await notificationService.emit({
        source: "REMINDER_FAILED",
        sourceKey: `reminder-failed:${reminderLog.id}`,
        title: "Reminder failed or escalated",
        message: `Reminder ${offset} outcome: ${outcome}. Review reminder log and contact patient.`,
        clientId: appointment.clientId,
        appointmentId,
        staffTaskId: escalationTaskId ?? undefined,
        metadata: { reminderLogId: reminderLog.id, outcome, offset },
        createdByUserId: userId,
        actorChannel: "orchestrator",
      });
    } else if (outcome === "NO_RESPONSE") {
      await notificationService.emit({
        source: "PATIENT_NO_RESPONSE",
        sourceKey: `patient-no-response:${reminderLog.id}`,
        title: "Patient did not respond",
        message: `No response on reminder ${offset.replace(/_/g, " ").toLowerCase()}.`,
        clientId: appointment.clientId,
        appointmentId,
        metadata: { reminderLogId: reminderLog.id },
        createdByUserId: userId,
        actorChannel: "orchestrator",
      });
    }

    return reminderLog;
  },

  /** Find (appointmentId, offset) pairs due in the rolling window (default 15m). */
  async listDueReminderJobs(input: {
    now?: Date;
    windowMinutes?: number;
    appointmentId?: string;
  }) {
    const now = input.now ?? new Date();
    const windowMs =
      (input.windowMinutes ?? 15) * 60_000;

    const where: Prisma.AppointmentWhereInput = input.appointmentId
      ? {
          id: input.appointmentId,
          scheduledAt: { gt: now },
          reminderAutomationPaused: false,
          status: { in: ACTIVE_APPT_STATUSES },
        }
      : {
          status: { in: ACTIVE_APPT_STATUSES },
          scheduledAt: { gt: now },
          reminderAutomationPaused: false,
        };

    const appts = await prisma.appointment.findMany({
      where,
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        reminderAutomationPaused: true,
      },
    });

    const jobs: { appointmentId: string; offset: ReminderScheduleOffset; dueAt: Date }[] =
      [];

    for (const appt of appts) {
      if (appt.reminderAutomationPaused) continue;
      if (!ACTIVE_APPT_STATUSES.includes(appt.status)) continue;
      for (const offset of REMINDER_OFFSETS) {
        const dueAt = new Date(
          appt.scheduledAt.getTime() - offsetToMinutes(offset) * 60_000
        );
        if (now >= dueAt && now.getTime() < dueAt.getTime() + windowMs) {
          jobs.push({ appointmentId: appt.id, offset, dueAt });
        }
      }
    }

    return jobs;
  },

  async runDueReminders(input?: {
    windowMinutes?: number;
    limit?: number;
    appointmentId?: string;
    systemUserId?: string;
  }) {
    const jobs = await this.listDueReminderJobs({
      windowMinutes: input?.windowMinutes,
      appointmentId: input?.appointmentId,
    });

    const limit = input?.limit ?? 50;
    const results: {
      ok: boolean;
      /** True when the job was considered but intentionally not executed (duplicate, paused, etc.). */
      skipped?: boolean;
      skipCode?: string;
      appointmentId: string;
      offset: ReminderScheduleOffset;
      error?: string;
      reminderLogId?: string;
    }[] = [];

    /** `limit` = max jobs attempted (success, failure, or skip each consume one slot). */
    let attempts = 0;
    for (const job of jobs) {
      if (attempts >= limit) break;
      try {
        const log = await this.processReminderCycle(
          job.appointmentId,
          job.offset,
          input?.systemUserId
        );
        results.push({
          ok: true,
          appointmentId: job.appointmentId,
          offset: job.offset,
          reminderLogId: log.id,
        });
        attempts++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const code =
          e instanceof ReminderEngineError ? e.code : "UNKNOWN";
        if (
          code === "DUPLICATE_CYCLE" ||
          code === "AUTOMATION_PAUSED" ||
          code === "INVALID_STATUS" ||
          code === "NO_CONSENT"
        ) {
          results.push({
            ok: false,
            skipped: true,
            skipCode: code,
            appointmentId: job.appointmentId,
            offset: job.offset,
            error: msg,
          });
          attempts++;
          continue;
        }
        results.push({
          ok: false,
          appointmentId: job.appointmentId,
          offset: job.offset,
          error: msg,
        });
        attempts++;
      }
    }

    const processed = results.filter((r) => r.ok).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.ok && !r.skipped).length;

    return { processed, skipped, failed, attempted: results.length, results };
  },

  async listReminderLogs(take = 100) {
    return reminderLogModel.findMany({
      take,
      orderBy: { createdAt: "desc" },
      include: {
        appointment: {
          select: {
            id: true,
            scheduledAt: true,
            status: true,
            providerName: true,
            reason: true,
          },
        },
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            phone: true,
            email: true,
          },
        },
      },
    });
  },
};

export default reminderEngineService;
