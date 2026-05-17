import { WorkflowHealthStatus } from "@prisma/client";
import { createAuditLog } from "@/lib/audit";
import { sanitizeMetadataForAudit } from "@/lib/security/phi-safe-log";
import { prisma } from "@/lib/prisma";
import { adminAlertService } from "@/services/admin-alert.service";
import { WORKFLOW_MAX_RETRIES } from "./constants";

type WorkflowMeta = {
  attemptCount?: number;
  maxRetries?: number;
  lastError?: string;
  needsReview?: boolean;
};

function parseMeta(metadata: unknown): WorkflowMeta {
  if (!metadata || typeof metadata !== "object") return {};
  return metadata as WorkflowMeta;
}

export const workflowGuard = {
  async recordAttempt(input: {
    workflowKey: string;
    message: string;
    clientId?: string;
    appointmentId?: string;
    agentActionId?: string;
  }) {
    const latest = await prisma.workflowHealthEvent.findFirst({
      where: { workflowKey: input.workflowKey },
      orderBy: { recordedAt: "desc" },
    });

    const prev = parseMeta(latest?.metadata);
    const attemptCount = (prev.attemptCount ?? 0) + 1;

    return prisma.workflowHealthEvent.create({
      data: {
        workflowKey: input.workflowKey,
        status: attemptCount > 1 ? "DEGRADED" : "HEALTHY",
        message: input.message,
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        agentActionId: input.agentActionId,
        metadata: sanitizeMetadataForAudit({
          attemptCount,
          maxRetries: WORKFLOW_MAX_RETRIES,
          reliabilityGuard: true,
        }),
      },
    });
  },

  async markSuccess(workflowKey: string) {
    return prisma.workflowHealthEvent.create({
      data: {
        workflowKey,
        status: "HEALTHY",
        message: "Workflow completed",
        metadata: sanitizeMetadataForAudit({
          attemptCount: 0,
          reliabilityGuard: true,
        }),
      },
    });
  },

  async markFailure(input: {
    workflowKey: string;
    error: string;
    clientId?: string;
    appointmentId?: string;
    actorUserId?: string;
  }) {
    const latest = await prisma.workflowHealthEvent.findFirst({
      where: { workflowKey: input.workflowKey },
      orderBy: { recordedAt: "desc" },
    });
    const prev = parseMeta(latest?.metadata);
    const attemptCount = (prev.attemptCount ?? 0) + 1;
    const exhausted = attemptCount >= WORKFLOW_MAX_RETRIES;

    const status: WorkflowHealthStatus = exhausted ? "FAILED" : "DEGRADED";

    await prisma.workflowHealthEvent.create({
      data: {
        workflowKey: input.workflowKey,
        status,
        message: input.error,
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        metadata: sanitizeMetadataForAudit({
          attemptCount,
          maxRetries: WORKFLOW_MAX_RETRIES,
          lastError: input.error,
          needsReview: exhausted,
          reliabilityGuard: true,
        }),
      },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "ReliabilityGuard",
      entityId: input.workflowKey,
      userId: input.actorUserId,
      clientId: input.clientId,
      metadata: sanitizeMetadataForAudit({
        guard: "workflow_failure",
        attemptCount,
        exhausted,
        error: input.error,
      }),
    });

    if (exhausted && input.clientId) {
      const admin = await prisma.user.findFirst({
        where: { role: { type: "ADMIN" }, status: "ACTIVE" },
      });

      await adminAlertService.create({
        severity: "WARNING",
        code: "WORKFLOW_EXHAUSTED",
        title: "Workflow failed after retries",
        message: input.error,
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        actorUserId: input.actorUserId ?? admin?.id,
      });

      if (admin) {
        await prisma.staffTask.create({
          data: {
            title: "Workflow needs review",
            description: `${input.workflowKey}: ${input.error}`,
            clientId: input.clientId,
            createdById: admin.id,
            priority: "HIGH",
            staffOverride: true,
          },
        });
      }
    }

    return { attemptCount, exhausted, status };
  },

  shouldRetry(workflowKey: string): Promise<boolean> {
    return prisma.workflowHealthEvent
      .findFirst({
        where: { workflowKey },
        orderBy: { recordedAt: "desc" },
      })
      .then((latest) => {
        const meta = parseMeta(latest?.metadata);
        return (meta.attemptCount ?? 0) < WORKFLOW_MAX_RETRIES;
      });
  },
};
