import { createAuditLog } from "@/lib/audit";
import { sanitizeMetadataForAudit } from "@/lib/security/phi-safe-log";
import type { ProposalDedupKey } from "@/lib/proposal-dedup";

export async function logDuplicateProposalPrevented(input: {
  key: ProposalDedupKey;
  existingId: string;
  userId?: string;
}) {
  const idempotencyKey = [
    input.key.clientId,
    input.key.appointmentId ?? "none",
    input.key.channel,
    input.key.purpose,
    input.key.agentType,
    input.key.actionType,
  ].join(":");

  await createAuditLog({
    action: "CREATE",
    entityType: "ReliabilityGuard",
    entityId: idempotencyKey,
    userId: input.userId,
    clientId: input.key.clientId,
    metadata: sanitizeMetadataForAudit({
      guard: "duplicate_proposal",
      existingProposalId: input.existingId,
      ...input.key,
    }),
  });
}
