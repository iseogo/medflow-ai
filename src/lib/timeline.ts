import { Prisma, TimelineEventType } from "@prisma/client";
import { prisma } from "./prisma";

export type TimelineEventInput = {
  clientId: string;
  eventType: TimelineEventType;
  title: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
  actorUserId?: string;
};

export async function addTimelineEvent(input: TimelineEventInput) {
  return prisma.clientTimelineEvent.create({
    data: {
      clientId: input.clientId,
      eventType: input.eventType,
      title: input.title,
      description: input.description,
      metadata: input.metadata ?? undefined,
      actorUserId: input.actorUserId,
    },
  });
}

export async function getClientTimeline(clientId: string) {
  return prisma.clientTimelineEvent.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: {
      actor: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
}
