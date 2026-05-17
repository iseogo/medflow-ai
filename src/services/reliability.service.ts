import { stuckWorkflowDetector } from "@/lib/reliability/stuck-workflow-detector";

export const reliabilityService = {
  async runStuckWorkflowScan(actorUserId?: string) {
    const findings = await stuckWorkflowDetector.scanAll();
    const escalated = await stuckWorkflowDetector.escalateFindings(
      findings,
      actorUserId
    );
    return { findingsCount: findings.length, escalated };
  },
};
