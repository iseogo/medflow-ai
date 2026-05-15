import { N8N_URL } from "@/lib/constants";

/**
 * n8n stub — logs workflow intent without calling n8n.smartdeskai.cloud.
 */

export type StubWorkflowResult = {
  workflowRunId: string;
  status: "QUEUED" | "COMPLETED" | "FAILED";
};

const STUB_DELAY_MS = 30;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const n8nService = {
  async triggerWorkflow(input: {
    workflowName: string;
    payload: Record<string, unknown>;
  }): Promise<StubWorkflowResult> {
    await delay(STUB_DELAY_MS);
    const workflowRunId = `n8n_stub_${Date.now()}`;
    console.info("[n8n_stub] Workflow", {
      url: N8N_URL,
      workflow: input.workflowName,
      payloadKeys: Object.keys(input.payload),
      workflowRunId,
    });
    return { workflowRunId, status: "COMPLETED" };
  },
};

export default n8nService;
