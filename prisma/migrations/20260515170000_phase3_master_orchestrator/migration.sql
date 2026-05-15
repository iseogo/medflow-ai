-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('MASTER_ORCHESTRATOR', 'FRONT_DESK_AI', 'INTAKE_AI', 'APPOINTMENT_AI', 'VOICE_CALL_AI', 'SMS_REMINDER_AI', 'EMAIL_AI', 'STAFF_ASSISTANT_AI', 'ESCALATION_AI');

-- CreateEnum
CREATE TYPE "AgentProposalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ESCALATED', 'EXECUTED');

-- AlterEnum
ALTER TYPE "TimelineEventType" ADD VALUE 'AGENT_PROPOSAL_CREATED';
ALTER TYPE "TimelineEventType" ADD VALUE 'AGENT_PROPOSAL_APPROVED';
ALTER TYPE "TimelineEventType" ADD VALUE 'AGENT_PROPOSAL_REJECTED';
ALTER TYPE "TimelineEventType" ADD VALUE 'AGENT_PROPOSAL_ESCALATED';
ALTER TYPE "TimelineEventType" ADD VALUE 'EMERGENCY_DETECTED';

-- AlterTable
ALTER TABLE "AgentAction" DROP COLUMN IF EXISTS "status",
ADD COLUMN     "agentType" "AgentType" NOT NULL DEFAULT 'ESCALATION_AI',
ADD COLUMN     "proposalStatus" "AgentProposalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
ADD COLUMN     "proposedPayload" JSONB,
ADD COLUMN     "orchestratorNotes" TEXT,
ADD COLUMN     "isEmergency" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "automationHalted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "staffOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "executedAt" TIMESTAMP(3),
ALTER COLUMN "agentName" SET DEFAULT 'Legacy Agent';

-- CreateIndex
CREATE INDEX "AgentAction_proposalStatus_idx" ON "AgentAction"("proposalStatus");
CREATE INDEX "AgentAction_agentType_idx" ON "AgentAction"("agentType");
CREATE INDEX "AgentAction_isEmergency_idx" ON "AgentAction"("isEmergency");
CREATE INDEX "AgentAction_clientId_appointmentId_purpose_channel_agentType_actionType_idx" ON "AgentAction"("clientId", "appointmentId", "purpose", "channel", "agentType", "actionType");

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
