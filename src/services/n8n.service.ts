import { isN8nLive } from "@/lib/integrations/env";
import { resolveN8nWebhookUrl } from "@/lib/integrations/n8n-routing";
import { integrationFetch } from "@/lib/integrations/http";
import { safeLogContext } from "@/lib/integrations/safe-log";

export type StubWorkflowResult = {
  workflowRunId: string;
  status: "QUEUED" | "COMPLETED" | "FAILED";
  mode: "live" | "mock";
};

const STUB_DELAY_MS = 30;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function webhookSecretHeader(): Record<string, string> {
  const secret =
    process.env.WEBHOOK_SECRET?.trim() ??
    process.env.MEDFLOW_WEBHOOK_SECRET?.trim();
  if (!secret) return {};
  return { "x-medflow-webhook-secret": secret };
}

async function stubTrigger(input: {
  workflowName: string;
  payload: Record<string, unknown>;
}): Promise<StubWorkflowResult> {
  await delay(STUB_DELAY_MS);
  const workflowRunId = `n8n_mock_${Date.now()}`;
  safeLogContext("n8n_mock", {
    workflow: input.workflowName,
    payloadKeyCount: Object.keys(input.payload).length,
  });
  return { workflowRunId, status: "COMPLETED", mode: "mock" };
}

async function liveTrigger(input: {
  workflowName: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<StubWorkflowResult> {
  const webhookUrl = resolveN8nWebhookUrl(input.workflowName);
  if (!webhookUrl) {
    return stubTrigger(input);
  }

  const res = await integrationFetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...webhookSecretHeader(),
      ...(input.idempotencyKey
        ? { "x-idempotency-key": input.idempotencyKey }
        : {}),
    },
    body: JSON.stringify({
      workflow: input.workflowName,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    safeLogContext("n8n_live_failed", {
      workflow: input.workflowName,
      status: res.status,
    });
    return {
      workflowRunId: `n8n_failed_${Date.now()}`,
      status: "FAILED",
      mode: "live",
    };
  }

  let workflowRunId = `n8n_${Date.now()}`;
  try {
    const text = await res.text();
    const json = JSON.parse(text) as { executionId?: string; id?: string };
    workflowRunId = json.executionId ?? json.id ?? workflowRunId;
  } catch {
    /* non-JSON response is ok */
  }

  return { workflowRunId, status: "COMPLETED", mode: "live" };
}

export const n8nService = {
  mode(): "live" | "mock" {
    return isN8nLive() ? "live" : "mock";
  },

  /**
   * `idempotencyKey` should be deterministic for the triggering record
   * (e.g. the log ID) so retried requests don't run the workflow twice.
   */
  async triggerWorkflow(input: {
    workflowName: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<StubWorkflowResult> {
    if (!isN8nLive()) {
      return stubTrigger(input);
    }
    const hasWebhook = Boolean(resolveN8nWebhookUrl(input.workflowName));
    if (!hasWebhook) {
      return stubTrigger(input);
    }
    return liveTrigger(input);
  },
};

export default n8nService;
