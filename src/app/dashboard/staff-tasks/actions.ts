"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user;
}

export async function updateTaskStatus(taskId: string, newStatus: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
  const user = await requireSession();

  const task = await prisma.staffTask.update({
    where: { id: taskId },
    data: {
      status: newStatus,
      completedAt: newStatus === "COMPLETED" ? new Date() : undefined,
    },
    select: { id: true, clientId: true, title: true },
  });

  await createAuditLog({
    action: "STATUS_CHANGE",
    entityType: "StaffTask",
    entityId: taskId,
    userId: user.id,
    clientId: task.clientId ?? undefined,
    metadata: { newStatus, title: task.title, source: "staff_tasks_page" },
  });

  revalidatePath("/dashboard/staff-tasks");
  revalidatePath("/dashboard");
}
