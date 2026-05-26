"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { MISSED_TASK_TITLE } from "@/lib/missed-call/missed-call-dedup";
import { revalidatePath } from "next/cache";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user;
}

export async function markMissedCallHandled(callLogId: string) {
  const user = await requireSession();

  const notification = await prisma.staffNotification.findFirst({
    where: {
      source: "MISSED_INBOUND_CALL",
      metadata: { path: ["callLogId"], equals: callLogId },
    },
    select: { id: true, clientId: true },
  });

  if (notification) {
    await prisma.staffNotification.update({
      where: { id: notification.id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
    });
  }

  await createAuditLog({
    action: "UPDATE",
    entityType: "CallLog",
    entityId: callLogId,
    userId: user.id,
    clientId: notification?.clientId ?? undefined,
    metadata: { action: "missed_call_handled", source: "inbound_calls_page" },
  });

  revalidatePath("/dashboard/inbound-calls");
}

export async function createCallbackTask(input: {
  callLogId: string;
  clientId: string;
  callerPhone: string;
}) {
  const user = await requireSession();

  const existing = await prisma.staffTask.findFirst({
    where: {
      clientId: input.clientId,
      title: MISSED_TASK_TITLE,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    select: { id: true },
  });

  if (existing) return { taskId: existing.id, created: false };

  const task = await prisma.staffTask.create({
    data: {
      title: MISSED_TASK_TITLE,
      description: `Missed inbound call from ${input.callerPhone}. Please call the patient back.`,
      status: "PENDING",
      priority: "HIGH",
      clientId: input.clientId,
      createdById: user.id,
    },
  });

  await prisma.staffNotification.updateMany({
    where: {
      source: "MISSED_INBOUND_CALL",
      metadata: { path: ["callLogId"], equals: input.callLogId },
    },
    data: { staffTaskId: task.id },
  });

  await createAuditLog({
    action: "CREATE",
    entityType: "StaffTask",
    entityId: task.id,
    userId: user.id,
    clientId: input.clientId,
    metadata: { callLogId: input.callLogId, source: "inbound_calls_page" },
  });

  revalidatePath("/dashboard/inbound-calls");
  return { taskId: task.id, created: true };
}
