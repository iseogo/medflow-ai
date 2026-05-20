import { AgentType } from "@prisma/client";
import { AGENT_REGISTRY, allAgentTypes, assertRegistryComplete } from "@/lib/agents/agent-registry";
import { getAgentDefinition, isActionAllowed } from "@/lib/agents/definitions";
import { isMockModeForced } from "@/lib/integrations/env";
import { prisma } from "@/lib/prisma";

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export type AgentHealthRow = {
  agentType: AgentType;
  displayName: string;
  responsibility: string;
  status: "healthy" | "degraded" | "idle" | "misconfigured";
  recentProposals: number;
  pendingProposals: number;
  wiringComplete: boolean;
  definitionValid: boolean;
  notes: string[];
};

export const agentHealthService = {
  async getHealthReport(): Promise<{
    mockMode: boolean;
    registryComplete: boolean;
    missingFromRegistry: AgentType[];
    agents: AgentHealthRow[];
    handoffChainDocumented: boolean;
  }> {
    const prismaTypes = Object.values(AgentType);
    const missingFromRegistry = assertRegistryComplete(prismaTypes);
    const since = new Date(Date.now() - LOOKBACK_MS);

    const grouped = await prisma.agentAction.groupBy({
      by: ["agentType", "proposalStatus"],
      where: { createdAt: { gte: since }, agentType: { not: "MASTER_ORCHESTRATOR" } },
      _count: { id: true },
    });

    const recentByAgent = new Map<AgentType, number>();
    const pendingByAgent = new Map<AgentType, number>();
    for (const row of grouped) {
      const t = row.agentType;
      recentByAgent.set(t, (recentByAgent.get(t) ?? 0) + row._count.id);
      if (row.proposalStatus === "PENDING_APPROVAL") {
        pendingByAgent.set(t, (pendingByAgent.get(t) ?? 0) + row._count.id);
      }
    }

    const agents: AgentHealthRow[] = allAgentTypes().map((agentType) => {
      const reg = AGENT_REGISTRY[agentType];
      const notes: string[] = [];
      let definitionValid = true;

      try {
        const def = getAgentDefinition(agentType);
        if (!def.allowedActions.length) {
          definitionValid = false;
          notes.push("No allowed actions");
        }
        if (!isActionAllowed(agentType, def.allowedActions[0] ?? "LOG_NOTE")) {
          definitionValid = false;
          notes.push("isActionAllowed mismatch");
        }
      } catch {
        definitionValid = false;
        notes.push("Definition lookup failed");
      }

      const wiring = reg.wiring;
      const wiringComplete =
        wiring.definition &&
        wiring.masterOrchestrator &&
        wiring.agentCoordinationDashboard &&
        wiring.auditLogs &&
        (agentType === "SUPERVISOR_AI" ? !wiring.notifications : true);

      const recentProposals = recentByAgent.get(agentType) ?? 0;
      const pendingProposals = pendingByAgent.get(agentType) ?? 0;

      let status: AgentHealthRow["status"] = "healthy";
      if (!definitionValid || !wiringComplete) {
        status = "misconfigured";
      } else if (recentProposals === 0 && agentType !== "SUPERVISOR_AI") {
        status = "idle";
      } else if (pendingProposals > 5) {
        status = "degraded";
        notes.push(`${pendingProposals} pending proposals`);
      }

      if (agentType === "SUPERVISOR_AI" && wiring.notifications) {
        status = "misconfigured";
        notes.push("Supervisor must not emit staff notifications");
      }

      return {
        agentType,
        displayName: reg.displayName,
        responsibility: reg.responsibility,
        status,
        recentProposals,
        pendingProposals,
        wiringComplete,
        definitionValid,
        notes,
      };
    });

    return {
      mockMode: isMockModeForced(),
      registryComplete: missingFromRegistry.length === 0,
      missingFromRegistry,
      agents,
      handoffChainDocumented: true,
    };
  },
};
