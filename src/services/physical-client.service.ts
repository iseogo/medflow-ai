import {
  AppointmentStatus,
  ConsentType,
  Prisma,
  WaitingRoomState,
} from "@prisma/client";
import {
  ACTIVE_WAITING_ROOM_STATES,
  assertValidWaitingRoomTransition,
} from "@/lib/waiting-room";
import { prisma } from "@/lib/prisma";
import {
  actorFromSession,
  recordPhysicalEvent,
  staffOverrideOwnershipFields,
} from "@/lib/physical-events";
import type { StaffOverrideActor } from "@/lib/staff-override";
import type { RequestMeta } from "@/lib/api-auth";
import { notificationService } from "@/services/notification.service";

export type CommunicationPreferencesInput = {
  voice?: boolean;
  sms?: boolean;
  email?: boolean;
  preferredChannel?: string;
};

export type ConsentInput = {
  voice?: boolean;
  sms?: boolean;
  email?: boolean;
};

export type InsurancePlaceholderInput = {
  carrier?: string;
  memberId?: string;
  groupNumber?: string;
  notes?: string;
};

export type FirstTimeWalkInInput = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  preferredLanguage?: string;
  communicationPreferences?: CommunicationPreferencesInput;
  consent?: ConsentInput;
  insurancePlaceholder?: InsurancePlaceholderInput;
  documentsPlaceholder?: { name: string; status: string }[];
  staffNotes?: string | null;
  appointment: {
    scheduledAt: string;
    reason?: string | null;
    providerName?: string | null;
    location?: string | null;
    durationMinutes?: number;
  };
};

export type ReturningCheckInInput = {
  clientId: string;
  appointmentId?: string | null;
  notes?: string | null;
  notifyProvider?: boolean;
};

function buildCtx(
  actor: StaffOverrideActor,
  clientId: string,
  meta?: RequestMeta
) {
  return {
    actor,
    clientId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  };
}

function computeWaitMinutes(arrivedAt: Date, endAt: Date = new Date()) {
  return Math.max(0, Math.round((endAt.getTime() - arrivedAt.getTime()) / 60000));
}

async function nextQueuePosition(
  tx: Prisma.TransactionClient = prisma as unknown as Prisma.TransactionClient
) {
  const active = await tx.waitingRoomStatus.count({
    where: { state: { in: ACTIVE_WAITING_ROOM_STATES } },
  });
  return active + 1;
}

async function upsertWaitingRoomForCheckIn(
  tx: Prisma.TransactionClient,
  params: {
    clientId: string;
    appointmentId?: string | null;
    physicalCheckInId: string;
    arrivedAt: Date;
    location?: string | null;
    override: Record<string, unknown>;
  }
) {
  const existing = await tx.waitingRoomStatus.findFirst({
    where: {
      clientId: params.clientId,
      state: { in: [...ACTIVE_WAITING_ROOM_STATES, "CALLED"] },
    },
    orderBy: { arrivedAt: "desc" },
  });

  if (existing) {
    return tx.waitingRoomStatus.update({
      where: { id: existing.id },
      data: {
        state: "CHECKED_IN",
        physicalCheckInId: params.physicalCheckInId,
        appointmentId: params.appointmentId ?? existing.appointmentId,
        arrivedAt: params.arrivedAt,
        staffNotifiedAt: params.arrivedAt,
        location: params.location ?? existing.location,
        ...params.override,
      },
    });
  }

  const queuePosition = await nextQueuePosition(tx);
  return tx.waitingRoomStatus.create({
    data: {
      physicalCheckInId: params.physicalCheckInId,
      clientId: params.clientId,
      appointmentId: params.appointmentId,
      state: "CHECKED_IN",
      queuePosition,
      location: params.location ?? "Waiting room",
      arrivedAt: params.arrivedAt,
      staffNotifiedAt: params.arrivedAt,
      ...params.override,
    },
  });
}

export const physicalClientService = {
  async createFirstTimeWalkIn(
    input: FirstTimeWalkInInput,
    staff: { id: string; name: string; role: StaffOverrideActor["role"] },
    meta?: RequestMeta
  ) {
    const actor = actorFromSession({
      id: staff.id,
      name: staff.name,
      role: staff.role,
    });
    const override = staffOverrideOwnershipFields({
      ...actor,
      reason: "First-time walk-in registration",
    });

    const commPrefs = input.communicationPreferences ?? {};
    const insurance = input.insurancePlaceholder ?? { status: "placeholder" };
    const documents =
      input.documentsPlaceholder?.length ?
        input.documentsPlaceholder
      : [{ name: "ID / insurance card", status: "placeholder_pending_upload" }];

    const mrn = `MRN-${Date.now().toString(36).toUpperCase()}`;

    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
          mrn,
          notes: input.staffNotes,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          city: input.city,
          state: input.state,
          postalCode: input.postalCode,
          preferredLanguage: input.preferredLanguage ?? "en",
          communicationPreferences: commPrefs as Prisma.InputJsonValue,
          insurancePlaceholder: insurance as Prisma.InputJsonValue,
          documentsPlaceholder: documents as Prisma.InputJsonValue,
        },
      });

      const consentTypes: { type: ConsentType; granted: boolean }[] = [
        { type: "PHONE", granted: input.consent?.voice ?? false },
        { type: "SMS", granted: input.consent?.sms ?? false },
        { type: "EMAIL", granted: input.consent?.email ?? false },
      ];
      for (const c of consentTypes) {
        await tx.consentRecord.create({
          data: { clientId: client.id, type: c.type, granted: c.granted },
        });
      }

      const appointment = await tx.appointment.create({
        data: {
          clientId: client.id,
          scheduledAt: new Date(input.appointment.scheduledAt),
          durationMinutes: input.appointment.durationMinutes ?? 30,
          status: "CHECKED_IN",
          reason: input.appointment.reason ?? "First-time walk-in visit",
          providerName: input.appointment.providerName,
          location: input.appointment.location ?? "Waiting room",
          notes: input.staffNotes,
          ...override,
        },
      });

      const walkIn = await tx.walkInVisit.create({
        data: {
          clientId: client.id,
          visitType: "FIRST_TIME",
          onboardingStatus: "IN_PROGRESS",
          onboardingStep: "registered",
          staffNotes: input.staffNotes,
          insurancePlaceholder: insurance as Prisma.InputJsonValue,
          documentsPlaceholder: documents as Prisma.InputJsonValue,
          appointmentId: appointment.id,
          createdById: staff.id,
          ...override,
        },
      });

      const checkIn = await tx.physicalCheckIn.create({
        data: {
          clientId: client.id,
          appointmentId: appointment.id,
          walkInVisitId: walkIn.id,
          checkInType: "WALK_IN",
          checkedInById: staff.id,
          notes: input.staffNotes,
          ...override,
        },
      });

      const arrivedAt = new Date();
      const waitingRoom = await upsertWaitingRoomForCheckIn(tx, {
        clientId: client.id,
        appointmentId: appointment.id,
        physicalCheckInId: checkIn.id,
        arrivedAt,
        location: input.appointment.location ?? "Waiting room",
        override,
      });

      await tx.staffIntervention.create({
        data: {
          clientId: client.id,
          status: "WALK_IN",
          title: "First-time walk-in — onboarding",
          description: input.staffNotes,
          assignedToId: staff.id,
          ...override,
        },
      });

      await tx.staffTask.create({
        data: {
          title: "Complete walk-in onboarding",
          description: `Onboarding for ${client.firstName} ${client.lastName}`,
          clientId: client.id,
          createdById: staff.id,
          assignedToId: staff.id,
          priority: "HIGH",
          ...override,
        },
      });

      return { client, appointment, walkIn, checkIn, waitingRoom };
    });

    const ctx = buildCtx(actor, result.client.id, meta);

    await recordPhysicalEvent({
      ctx,
      timelineType: "CLIENT_CREATED",
      timelineTitle: "Client registered — first-time walk-in",
      timelineDescription: `MRN ${result.client.mrn}`,
      timelineMetadata: { walkInVisitId: result.walkIn.id, mrn: result.client.mrn },
      auditAction: "CREATE",
      entityType: "WalkInVisit",
      entityId: result.walkIn.id,
      orchestratorEventType: "WALK_IN_REGISTERED",
      orchestratorDescription: `First-time walk-in: ${result.client.firstName} ${result.client.lastName}`,
      orchestratorMetadata: {
        walkInVisitId: result.walkIn.id,
        appointmentId: result.appointment.id,
      },
      appointmentId: result.appointment.id,
    });

    await notificationService.emit({
      source: "WALK_IN_ARRIVED",
      sourceKey: `walk-in:${result.walkIn.id}`,
      title: "Walk-in arrived",
      message: `${result.client.firstName} ${result.client.lastName} registered as walk-in.`,
      clientId: result.client.id,
      appointmentId: result.appointment.id,
      createdByUserId: actor.userId,
      actorChannel: "staff",
    });

    await recordPhysicalEvent({
      ctx,
      timelineType: "WAITING_ROOM_ARRIVED",
      timelineTitle: "Arrived — waiting room",
      timelineDescription: `Queue #${result.waitingRoom.queuePosition}`,
      timelineMetadata: {
        waitingRoomId: result.waitingRoom.id,
        queuePosition: result.waitingRoom.queuePosition,
      },
      auditAction: "CREATE",
      entityType: "WaitingRoomStatus",
      entityId: result.waitingRoom.id,
      orchestratorEventType: "WAITING_ROOM_ARRIVED",
      orchestratorDescription: "Client placed in waiting room after walk-in registration",
      appointmentId: result.appointment.id,
    });

    return result;
  },

  async searchForCheckIn(query: string) {
    const q = query.trim();
    if (!q) return [];

    const appointmentMatch = await prisma.appointment.findMany({
      where: { id: q },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            mrn: true,
          },
        },
      },
      take: 5,
    });
    if (appointmentMatch.length) {
      return appointmentMatch.map((a) => ({
        matchType: "appointment" as const,
        client: a.client,
        appointment: {
          id: a.id,
          scheduledAt: a.scheduledAt,
          status: a.status,
          providerName: a.providerName,
          reason: a.reason,
        },
      }));
    }

    const clients = await prisma.client.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { mrn: { contains: q, mode: "insensitive" } },
        ],
      },
      include: {
        appointments: {
          where: {
            scheduledAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            status: { in: ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "WAITING"] },
          },
          orderBy: { scheduledAt: "asc" },
          take: 3,
        },
      },
      take: 15,
    });

    return clients.map((c) => ({
      matchType: "client" as const,
      client: {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        mrn: c.mrn,
      },
      appointments: c.appointments,
    }));
  },

  async performReturningCheckIn(
    input: ReturningCheckInInput,
    staff: { id: string; name: string; role: StaffOverrideActor["role"] },
    meta?: RequestMeta
  ) {
    const actor = actorFromSession({
      id: staff.id,
      name: staff.name,
      role: staff.role,
    });
    const override = staffOverrideOwnershipFields({
      ...actor,
      reason: "Returning client physical check-in",
    });

    const client = await prisma.client.findUnique({
      where: { id: input.clientId },
    });
    if (!client) throw new Error("CLIENT_NOT_FOUND");

    let appointment = input.appointmentId
      ? await prisma.appointment.findFirst({
          where: { id: input.appointmentId, clientId: client.id },
        })
      : await prisma.appointment.findFirst({
          where: {
            clientId: client.id,
            scheduledAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
            status: { in: ["SCHEDULED", "CONFIRMED"] },
          },
          orderBy: { scheduledAt: "asc" },
        });

    const arrivedAt = new Date();

    const result = await prisma.$transaction(async (tx) => {
      if (appointment) {
        appointment = await tx.appointment.update({
          where: { id: appointment.id },
          data: {
            status: "CHECKED_IN",
            ...override,
          },
        });
      }

      const checkIn = await tx.physicalCheckIn.create({
        data: {
          clientId: client.id,
          appointmentId: appointment?.id,
          checkInType: appointment ? "APPOINTMENT" : "WALK_IN",
          checkedInById: staff.id,
          notes: input.notes,
          arrivedAt,
          ...override,
        },
      });

      const waitingRoom = await upsertWaitingRoomForCheckIn(tx, {
        clientId: client.id,
        appointmentId: appointment?.id,
        physicalCheckInId: checkIn.id,
        arrivedAt,
        location: appointment?.location ?? "Waiting room",
        override,
      });

      if (input.notifyProvider !== false && appointment?.providerName) {
        await tx.staffTask.create({
          data: {
            title: `Patient arrived: ${client.firstName} ${client.lastName}`,
            description: `Checked in for ${appointment.providerName}. ${input.notes ?? ""}`,
            clientId: client.id,
            createdById: staff.id,
            priority: "NORMAL",
            ...override,
          },
        });
      }

      return { client, appointment, checkIn, waitingRoom };
    });

    const ctx = buildCtx(actor, client.id, meta);

    await recordPhysicalEvent({
      ctx,
      timelineType: "PHYSICAL_CHECK_IN",
      timelineTitle: "Physical check-in",
      timelineDescription: input.notes ?? undefined,
      timelineMetadata: {
        checkInId: result.checkIn.id,
        appointmentId: result.appointment?.id,
      },
      auditAction: "CREATE",
      entityType: "PhysicalCheckIn",
      entityId: result.checkIn.id,
      orchestratorEventType: "PHYSICAL_CHECK_IN",
      orchestratorDescription: `Returning check-in: ${client.firstName} ${client.lastName}`,
      appointmentId: result.appointment?.id,
    });

    await recordPhysicalEvent({
      ctx,
      timelineType: "WAITING_ROOM_ARRIVED",
      timelineTitle: "Waiting room — arrived",
      timelineMetadata: {
        waitingRoomId: result.waitingRoom.id,
        queuePosition: result.waitingRoom.queuePosition,
      },
      auditAction: "STATUS_CHANGE",
      entityType: "WaitingRoomStatus",
      entityId: result.waitingRoom.id,
      orchestratorEventType: "WAITING_ROOM_ARRIVED",
      orchestratorDescription: "Client added to waiting room queue",
      appointmentId: result.appointment?.id,
    });

    if (result.appointment?.providerName) {
      await recordPhysicalEvent({
        ctx,
        timelineType: "PROVIDER_NOTIFIED",
        timelineTitle: `Provider notified: ${result.appointment.providerName}`,
        auditAction: "CREATE",
        entityType: "StaffTask",
        entityId: result.checkIn.id,
        orchestratorEventType: "PROVIDER_NOTIFIED",
        orchestratorDescription: `Staff/provider notified for ${result.appointment.providerName}`,
        appointmentId: result.appointment.id,
      });

      await prisma.waitingRoomStatus.update({
        where: { id: result.waitingRoom.id },
        data: { providerNotifiedAt: new Date() },
      });
    }

    return result;
  },

  async updateWaitingRoomState(
    waitingRoomId: string,
    state: WaitingRoomState,
    staff: { id: string; name: string; role: StaffOverrideActor["role"] },
    meta?: RequestMeta
  ) {
    const actor = actorFromSession({
      id: staff.id,
      name: staff.name,
      role: staff.role,
    });
    const override = staffOverrideOwnershipFields({
      ...actor,
      reason: `Waiting room → ${state}`,
    });

    const existing = await prisma.waitingRoomStatus.findUnique({
      where: { id: waitingRoomId },
      include: { appointment: true, physicalCheckIn: true },
    });
    if (!existing) throw new Error("WAITING_ROOM_NOT_FOUND");

    assertValidWaitingRoomTransition(existing.state, state);

    const now = new Date();
    const waitDurationMinutes = computeWaitMinutes(existing.arrivedAt, now);

    const appointmentStatusMap: Partial<Record<WaitingRoomState, AppointmentStatus>> = {
      CHECKED_IN: "CHECKED_IN",
      WAITING: "WAITING",
      CALLED: "WAITING",
      WITH_PROVIDER: "WITH_PROVIDER",
      COMPLETED: "COMPLETED",
      WALK_OUT: "WALK_OUT",
      NO_SHOW: "NO_SHOW",
    };

    const updated = await prisma.$transaction(async (tx) => {
      const room = await tx.waitingRoomStatus.update({
        where: { id: waitingRoomId },
        data: {
          state,
          waitDurationMinutes,
          ...(state === "CALLED" && { calledAt: now }),
          ...(state === "WITH_PROVIDER" && { withProviderAt: now }),
          ...(state === "COMPLETED" && { completedAt: now }),
          ...(state === "WALK_OUT" && { walkOutAt: now }),
          ...override,
        },
      });

      if (existing.appointmentId && appointmentStatusMap[state]) {
        await tx.appointment.update({
          where: { id: existing.appointmentId },
          data: {
            status: appointmentStatusMap[state]!,
            ...override,
          },
        });
      }

      return room;
    });

    const ctx = buildCtx(actor, existing.clientId, meta);

    await recordPhysicalEvent({
      ctx,
      timelineType: "WAITING_ROOM_STATUS_CHANGED",
      timelineTitle: `Waiting room: ${state}`,
      timelineDescription: `Wait time: ${waitDurationMinutes} min`,
      timelineMetadata: {
        waitingRoomId,
        state,
        waitDurationMinutes,
      },
      auditAction: "STATUS_CHANGE",
      entityType: "WaitingRoomStatus",
      entityId: waitingRoomId,
      orchestratorEventType: "WAITING_ROOM_STATUS_CHANGED",
      orchestratorDescription: `Waiting room status updated to ${state}`,
      appointmentId: existing.appointmentId,
    });

    return updated;
  },

  async listWaitingRoom(activeOnly = true) {
    return prisma.waitingRoomStatus.findMany({
      where: activeOnly ? { state: { in: ACTIVE_WAITING_ROOM_STATES } } : undefined,
      orderBy: [{ queuePosition: "asc" }, { arrivedAt: "asc" }],
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            phone: true,
          },
        },
        appointment: {
          select: {
            id: true,
            scheduledAt: true,
            providerName: true,
            reason: true,
            status: true,
          },
        },
        physicalCheckIn: {
          select: { id: true, arrivedAt: true, checkInType: true },
        },
      },
    });
  },

  async listWalkIns(limit = 50) {
    return prisma.walkInVisit.findMany({
      orderBy: { arrivedAt: "desc" },
      take: limit,
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            phone: true,
          },
        },
        appointment: {
          select: { id: true, scheduledAt: true, status: true, providerName: true },
        },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
  },

  async listCheckIns(limit = 50) {
    return prisma.physicalCheckIn.findMany({
      orderBy: { arrivedAt: "desc" },
      take: limit,
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        appointment: {
          select: { id: true, scheduledAt: true, status: true, providerName: true },
        },
        waitingRoom: true,
        checkedInBy: { select: { firstName: true, lastName: true } },
      },
    });
  },
};

export default physicalClientService;
