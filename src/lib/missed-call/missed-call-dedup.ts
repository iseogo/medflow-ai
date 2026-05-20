import { StaffTaskPriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const TASK_DEDUP_MINUTES = 30;
const ESCALATION_WINDOW_MS = 60 * 60 * 1000;
const ESCALATION_THRESHOLD = 3;

export const MISSED_TASK_TITLE = "Missed inbound call — call patient back";

export type MissedCallDedupResult = {
  skipNewTask: boolean;
  recentCount1h: number;
  escalateToManager: boolean;
  priority: StaffTaskPriority;
  existingTaskId?: string;
};

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-10) || phone.trim();
}

export async function assessMissedCallDedup(
  phoneNumber: string
): Promise<MissedCallDedupResult> {
  const phoneKey = normalizePhone(phoneNumber);
  const since30 = new Date(Date.now() - TASK_DEDUP_MINUTES * 60_000);
  const since1h = new Date(Date.now() - ESCALATION_WINDOW_MS);

  const recentTasks = await prisma.staffTask.findMany({
    where: {
      title: MISSED_TASK_TITLE,
      description: { contains: phoneKey },
      createdAt: { gte: since1h },
    },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const matching = recentTasks;

  const recentCount1h = matching.length + 1;
  const escalateToManager = recentCount1h >= ESCALATION_THRESHOLD;

  const within30 = matching.find((t) => t.createdAt >= since30);
  let priority: StaffTaskPriority = "HIGH";
  if (escalateToManager) {
    priority = "URGENT";
  } else if (matching.length >= 1) {
    priority = "URGENT";
  }

  return {
    skipNewTask: Boolean(within30),
    recentCount1h,
    escalateToManager,
    priority,
    existingTaskId: within30?.id,
  };
}

export { TASK_DEDUP_MINUTES, ESCALATION_THRESHOLD };
