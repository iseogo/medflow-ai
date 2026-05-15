import { CommunicationChannel, TimelineEventType } from "@prisma/client";
import { createAuditLog } from "./audit";
import { addTimelineEvent } from "./timeline";

const TIMELINE_BY_CHANNEL: Record<
  CommunicationChannel,
  TimelineEventType
> = {
  CALL: "COMMUNICATION_CALL",
  SMS: "COMMUNICATION_SMS",
  EMAIL: "COMMUNICATION_EMAIL",
};

export async function recordCommunicationTimelineAndAudit(input: {
  clientId: string;
  channel: CommunicationChannel;
  entityType: "CallLog" | "SmsLog" | "EmailLog" | "AgentAction";
  entityId: string;
  title: string;
  description?: string;
  purpose: string;
  status: string;
  userId?: string;
  appointmentId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await addTimelineEvent({
    clientId: input.clientId,
    eventType: TIMELINE_BY_CHANNEL[input.channel],
    title: input.title,
    description: input.description,
    actorUserId: input.userId,
    metadata: {
      entityType: input.entityType,
      entityId: input.entityId,
      channel: input.channel,
      purpose: input.purpose,
      status: input.status,
      appointmentId: input.appointmentId ?? null,
      ...input.metadata,
    },
  });

  await createAuditLog({
    action: "CREATE",
    entityType: input.entityType,
    entityId: input.entityId,
    userId: input.userId,
    clientId: input.clientId,
    metadata: {
      channel: input.channel,
      purpose: input.purpose,
      status: input.status,
      appointmentId: input.appointmentId ?? null,
      ...input.metadata,
    },
  });
}

export async function recordAgentActionTimelineAndAudit(input: {
  clientId: string;
  entityId: string;
  title: string;
  description?: string;
  purpose: string;
  status: string;
  channel: CommunicationChannel;
  actionType: string;
  userId?: string;
  appointmentId?: string | null;
}) {
  await addTimelineEvent({
    clientId: input.clientId,
    eventType: "AGENT_ACTION",
    title: input.title,
    description: input.description,
    actorUserId: input.userId,
    metadata: {
      entityType: "AgentAction",
      entityId: input.entityId,
      actionType: input.actionType,
      channel: input.channel,
      purpose: input.purpose,
      status: input.status,
      appointmentId: input.appointmentId ?? null,
    },
  });

  await createAuditLog({
    action: "CREATE",
    entityType: "AgentAction",
    entityId: input.entityId,
    userId: input.userId,
    clientId: input.clientId,
    metadata: {
      actionType: input.actionType,
      channel: input.channel,
      purpose: input.purpose,
      status: input.status,
      appointmentId: input.appointmentId ?? null,
    },
  });
}
