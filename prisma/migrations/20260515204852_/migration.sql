-- DropIndex
DROP INDEX "AgentAction_clientId_appointmentId_purpose_channel_idx";

-- RenameIndex
ALTER INDEX "AgentAction_clientId_appointmentId_purpose_channel_agentType_ac" RENAME TO "AgentAction_clientId_appointmentId_purpose_channel_agentTyp_idx";
