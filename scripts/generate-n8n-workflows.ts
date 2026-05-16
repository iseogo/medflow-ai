/**
 * Generates importable n8n workflow JSON templates for Phase 7.
 * SAFETY: No real API keys, secrets, phone numbers, or patient data in output.
 * Usage: npx tsx scripts/generate-n8n-workflows.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const OUT_DIR = path.join(process.cwd(), "n8n-workflows");

/** n8n expressions — placeholders only, no production URL fallbacks */
const MEDFLOW_API_URL =
  "={{ $env.MEDFLOW_API_BASE_URL }}/api/webhooks";
const SECRET_HEADER = "={{ $env.MEDFLOW_WEBHOOK_SECRET }}";

const FORBIDDEN_IN_OUTPUT = [
  /sk-[a-zA-Z0-9]{10,}/,
  /AC[a-f0-9]{32}/i,
  /\+1\d{10}/,
  /@[a-z0-9.-]+\.(com|net|ai)/i,
  /smartdeskai\.cloud/i,
  /GOCSPX/i,
  /change-me/i,
];

type WorkflowSpec = {
  fileName: string;
  name: string;
  webhookPath: string;
  medflowWebhookPath: string;
  description: string;
  envKey: string;
  validationFields: string[];
  medflowBodyExpression: string;
  inboundNote: string;
  carrierCredentials: string[];
};

function nodeId(): string {
  return randomUUID();
}

const SAFETY_NOTE = `## TEMPLATE ONLY — no secrets in this file

**Do not** commit real API keys, tokens, phone numbers, or patient data.

Configure in n8n **Settings → Variables** (placeholders):
- \`MEDFLOW_API_BASE_URL\` — e.g. http://localhost:3000
- \`MEDFLOW_WEBHOOK_SECRET\` — match MedFlow WEBHOOK_SECRET
- \`MEDFLOW_TEST_MODE\` — default \`true\` (no live traffic)

Carrier credential **names** (create in n8n Credentials, then set IDs):
- \`TWILIO_CREDENTIAL_ID\`
- \`EMAIL_CREDENTIAL_ID\`
- \`VAPI_CREDENTIAL_ID\`
- \`OPENAI_CREDENTIAL_ID\`
- \`GOOGLE_CREDENTIAL_ID\`

Set \`MEDFLOW_TEST_MODE=false\` only after all credentials are configured manually. Until then, workflows return dry-run responses and **do not** place calls, SMS, or email.`;

const TEST_MODE_GATE_CODE = `
const body = $('Validate Payload').first().json.body ?? {};
const testMode = String($env.MEDFLOW_TEST_MODE ?? 'true').toLowerCase() !== 'false';
const medflowBase = ($env.MEDFLOW_API_BASE_URL ?? '').trim();
const medflowSecret = ($env.MEDFLOW_WEBHOOK_SECRET ?? '').trim();
const medflowReady = medflowBase.length > 0 && medflowSecret.length > 0;
const carrierIds = {
  twilio: ($env.TWILIO_CREDENTIAL_ID ?? '').trim(),
  email: ($env.EMAIL_CREDENTIAL_ID ?? '').trim(),
  vapi: ($env.VAPI_CREDENTIAL_ID ?? '').trim(),
  openai: ($env.OPENAI_CREDENTIAL_ID ?? '').trim(),
  google: ($env.GOOGLE_CREDENTIAL_ID ?? '').trim(),
};
const liveMode = !testMode && medflowReady;
const carriersConfigured = Object.values(carrierIds).some((v) => v.length > 0);
return [{
  json: {
    testMode,
    liveMode,
    medflowReady,
    carriersConfigured,
    carrierIds,
    note: testMode
      ? 'TEST MODE — no outbound calls/SMS/email; MedFlow HTTP skipped unless liveMode'
      : (liveMode ? 'LIVE MODE — configure carrier credentials before enabling sends' : 'Set MEDFLOW_API_BASE_URL and MEDFLOW_WEBHOOK_SECRET'),
  }
}];
`.trim();

function buildWorkflow(spec: WorkflowSpec) {
  const ids = {
    noteSafety: nodeId(),
    note: nodeId(),
    noteCarriers: nodeId(),
    webhook: nodeId(),
    validate: nodeId(),
    ifValid: nodeId(),
    testGate: nodeId(),
    ifLive: nodeId(),
    medflow: nodeId(),
    audit: nodeId(),
    respondOk: nodeId(),
    respondTest: nodeId(),
    respondErr: nodeId(),
    waitRetry: nodeId(),
    medflowRetry: nodeId(),
    noteError: nodeId(),
  };

  const medflowWebhookUrl = `${MEDFLOW_API_URL}/${spec.medflowWebhookPath}`;

  const validationCode = `
const required = ${JSON.stringify(spec.validationFields)};
const body = $input.first().json.body ?? $input.first().json;
const errors = [];
for (const field of required) {
  const v = body[field] ?? body.payload?.[field];
  if (v === undefined || v === null || v === '') errors.push('Missing: ' + field);
}
return [{
  json: {
    valid: errors.length === 0,
    errors,
    body,
    workflow: body.workflow ?? body.workflowName ?? '',
    validatedAt: new Date().toISOString(),
  }
}];
`.trim();

  const carrierList = spec.carrierCredentials.join(", ");

  const nodes = [
    {
      parameters: {
        content: SAFETY_NOTE,
        height: 420,
        width: 440,
        color: 4,
      },
      id: ids.noteSafety,
      name: "Safety — Template Only",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [-420, -320],
    },
    {
      parameters: {
        content: `## ${spec.name}\n\n${spec.description}\n\n**Webhook path:** \`${spec.webhookPath}\`\n**MedFlow env (outbound from MedFlow):** \`${spec.envKey}\`\n**Callback:** \`POST /api/webhooks/${spec.medflowWebhookPath}\`\n\n${spec.inboundNote}`,
        height: 280,
        width: 400,
        color: 5,
      },
      id: ids.note,
      name: "Workflow Notes",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [-400, 140],
    },
    {
      parameters: {
        content: `## Carrier nodes (add manually)\n\nThis template does **not** send real traffic.\n\nWhen \`MEDFLOW_TEST_MODE=false\`, wire carrier nodes using n8n credential IDs:\n\n**This workflow:** ${carrierList}\n\nPlaceholders: TWILIO_CREDENTIAL_ID, EMAIL_CREDENTIAL_ID, VAPI_CREDENTIAL_ID, OPENAI_CREDENTIAL_ID, GOOGLE_CREDENTIAL_ID`,
        height: 220,
        width: 360,
        color: 6,
      },
      id: ids.noteCarriers,
      name: "Carrier Placeholders",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [1480, 120],
    },
    {
      parameters: {
        httpMethod: "POST",
        path: spec.webhookPath,
        responseMode: "responseNode",
        options: {},
      },
      id: ids.webhook,
      name: "Webhook Trigger",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      webhookId: nodeId(),
    },
    {
      parameters: { jsCode: validationCode },
      id: ids.validate,
      name: "Validate Payload",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [260, 0],
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            {
              id: nodeId(),
              leftValue: "={{ $json.valid }}",
              rightValue: true,
              operator: { type: "boolean", operation: "equals" },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      id: ids.ifValid,
      name: "Validation OK?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [500, 0],
    },
    {
      parameters: { jsCode: TEST_MODE_GATE_CODE },
      id: ids.testGate,
      name: "Test Mode Gate",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [740, -40],
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            {
              id: nodeId(),
              leftValue: "={{ $json.liveMode }}",
              rightValue: true,
              operator: { type: "boolean", operation: "equals" },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      id: ids.ifLive,
      name: "Live Mode Enabled?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [980, -40],
    },
    {
      parameters: {
        method: "POST",
        url: medflowWebhookUrl,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "Content-Type", value: "application/json" },
            { name: "x-medflow-webhook-secret", value: SECRET_HEADER },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: spec.medflowBodyExpression,
        options: {
          timeout: 30000,
          response: { response: { fullResponse: true } },
          retry: { maxTries: 3, waitBetweenTries: 2000 },
        },
      },
      id: ids.medflow,
      name: "Call MedFlow API",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1220, -120],
      onError: "continueErrorOutput",
    },
    {
      parameters: {
        method: "POST",
        url: medflowWebhookUrl,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "Content-Type", value: "application/json" },
            { name: "x-medflow-webhook-secret", value: SECRET_HEADER },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({ event: 'n8n_template_audit', workflow: '${spec.fileName.replace(".json", "")}', source: 'n8n_template', executionId: $execution.id, statusCode: $json.statusCode ?? 200, payloadKeyCount: Object.keys($('Validate Payload').item.json.body || {}).length }) }}`,
        options: { timeout: 15000 },
      },
      id: ids.audit,
      name: "Audit Log (MedFlow)",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1460, -120],
      continueOnFail: true,
    },
    {
      parameters: {
        respondWith: "json",
        responseBody: `={{ JSON.stringify({ ok: true, mode: 'live', workflow: '${spec.name}', medflow: $('Call MedFlow API').item.json }) }}`,
        options: { responseCode: 200 },
      },
      id: ids.respondOk,
      name: "Respond Success",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [1700, -120],
    },
    {
      parameters: {
        respondWith: "json",
        responseBody: `={{ JSON.stringify({
  ok: true,
  mode: 'test',
  dryRun: true,
  workflow: '${spec.name}',
  message: 'TEST MODE — no carrier traffic. Set MEDFLOW_TEST_MODE=false and configure credential placeholders to go live.',
  gate: $('Test Mode Gate').item.json,
  validatedPayloadKeys: Object.keys($('Validate Payload').item.json.body || {}),
}) }}`,
        options: { responseCode: 200 },
      },
      id: ids.respondTest,
      name: "Respond Test Mode",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [1220, 80],
    },
    {
      parameters: {
        content:
          "## Errors\nCheck MEDFLOW_API_BASE_URL, MEDFLOW_WEBHOOK_SECRET, and required payload fields. Retries after 3s in live mode only.",
        height: 140,
        width: 300,
        color: 3,
      },
      id: ids.noteError,
      name: "Error Notes",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [500, 200],
    },
    {
      parameters: { amount: 3, unit: "seconds" },
      id: ids.waitRetry,
      name: "Wait Before Retry",
      type: "n8n-nodes-base.wait",
      typeVersion: 1.1,
      position: [1220, 240],
      webhookId: nodeId(),
    },
    {
      parameters: {
        method: "POST",
        url: medflowWebhookUrl,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "Content-Type", value: "application/json" },
            { name: "x-medflow-webhook-secret", value: SECRET_HEADER },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: spec.medflowBodyExpression,
        options: { timeout: 30000 },
      },
      id: ids.medflowRetry,
      name: "Retry MedFlow API",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1460, 240],
      continueOnFail: true,
    },
    {
      parameters: {
        respondWith: "json",
        responseBody:
          "={{ JSON.stringify({ ok: false, mode: $('Test Mode Gate').item.json.testMode ? 'test' : 'live', errors: $('Validate Payload').item.json.errors, gate: $('Test Mode Gate').item.json }) }}",
        options: { responseCode: 422 },
      },
      id: ids.respondErr,
      name: "Respond Error",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [740, 200],
    },
  ];

  const connections: Record<string, { main: unknown[][] }> = {
    "Webhook Trigger": {
      main: [[{ node: "Validate Payload", type: "main", index: 0 }]],
    },
    "Validate Payload": {
      main: [[{ node: "Validation OK?", type: "main", index: 0 }]],
    },
    "Validation OK?": {
      main: [
        [{ node: "Test Mode Gate", type: "main", index: 0 }],
        [{ node: "Respond Error", type: "main", index: 0 }],
      ],
    },
    "Test Mode Gate": {
      main: [[{ node: "Live Mode Enabled?", type: "main", index: 0 }]],
    },
    "Live Mode Enabled?": {
      main: [
        [{ node: "Call MedFlow API", type: "main", index: 0 }],
        [{ node: "Respond Test Mode", type: "main", index: 0 }],
      ],
    },
    "Call MedFlow API": {
      main: [
        [{ node: "Audit Log (MedFlow)", type: "main", index: 0 }],
        [{ node: "Wait Before Retry", type: "main", index: 0 }],
      ],
    },
    "Audit Log (MedFlow)": {
      main: [[{ node: "Respond Success", type: "main", index: 0 }]],
    },
    "Wait Before Retry": {
      main: [[{ node: "Retry MedFlow API", type: "main", index: 0 }]],
    },
    "Retry MedFlow API": {
      main: [[{ node: "Respond Error", type: "main", index: 0 }]],
    },
  };

  return {
    name: `${spec.name} (template)`,
    nodes,
    connections,
    pinData: {},
    settings: {
      executionOrder: "v1",
      saveManualExecutions: true,
      callerPolicy: "workflowsFromSameOwner",
    },
    staticData: null,
    tags: [
      { name: "MedFlow AI" },
      { name: "Phase 7" },
      { name: "template" },
      { name: "test-mode-default" },
    ],
    meta: {
      templateCredsSetupCompleted: false,
      instanceId: "medflow-ai-phase7-template",
    },
  };
}

const workflows: WorkflowSpec[] = [
  {
    fileName: "01-inbound-call-handler.json",
    name: "MedFlow — Inbound Call Handler",
    webhookPath: "medflow/inbound-call",
    medflowWebhookPath: "inbound-call",
    envKey: "N8N_WEBHOOK_INBOUND_CALL",
    carrierCredentials: ["TWILIO_CREDENTIAL_ID", "VAPI_CREDENTIAL_ID"],
    description: "Inbound call status → MedFlow CallLog (template).",
    validationFields: ["callLogId", "CallStatus"],
    medflowBodyExpression:
      "={{ JSON.stringify({ callLogId: $('Validate Payload').item.json.body.callLogId ?? $('Validate Payload').item.json.body.payload?.callLogId, CallSid: $('Validate Payload').item.json.body.CallSid, CallStatus: $('Validate Payload').item.json.body.CallStatus ?? $('Validate Payload').item.json.body.status, CallDuration: $('Validate Payload').item.json.body.CallDuration }) }}",
    inboundNote: "Wire Twilio/Vapi webhooks to this path after configuring credentials.",
  },
  {
    fileName: "02-outbound-call-handler.json",
    name: "MedFlow — Outbound Call Handler",
    webhookPath: "medflow/outbound-call",
    medflowWebhookPath: "outbound-call",
    envKey: "N8N_WEBHOOK_OUTBOUND_CALL",
    carrierCredentials: ["TWILIO_CREDENTIAL_ID", "VAPI_CREDENTIAL_ID"],
    description: "Outbound call status → MedFlow (template).",
    validationFields: ["callLogId", "CallStatus"],
    medflowBodyExpression:
      "={{ JSON.stringify({ callLogId: $('Validate Payload').item.json.body.callLogId ?? $('Validate Payload').item.json.body.payload?.callLogId, CallSid: $('Validate Payload').item.json.body.CallSid, CallStatus: $('Validate Payload').item.json.body.CallStatus ?? $('Validate Payload').item.json.body.status }) }}",
    inboundNote: "MedFlow `communication_call` / `outbound_call` triggers map here.",
  },
  {
    fileName: "03-reminder-48h-voice-sms-email.json",
    name: "MedFlow — 48h Reminder",
    webhookPath: "medflow/reminder-48h",
    medflowWebhookPath: "reminders",
    envKey: "N8N_WEBHOOK_REMINDER_48H",
    carrierCredentials: [
      "VAPI_CREDENTIAL_ID",
      "TWILIO_CREDENTIAL_ID",
      "EMAIL_CREDENTIAL_ID",
    ],
    description: "48h reminder orchestration template (voice + SMS + email placeholders).",
    validationFields: ["appointmentId"],
    medflowBodyExpression:
      "={{ JSON.stringify({ appointmentId: $('Validate Payload').item.json.body.appointmentId ?? $('Validate Payload').item.json.body.payload?.appointmentId, callLogId: $('Validate Payload').item.json.body.callLogId, reminderOffset: 'HOURS_48', CallStatus: $('Validate Payload').item.json.body.CallStatus ?? 'completed' }) }}",
    inboundNote: "MedFlow reminder engine owns rules; n8n coordinates carriers when live.",
  },
  {
    fileName: "04-reminder-24h-voice-sms-email.json",
    name: "MedFlow — 24h Reminder",
    webhookPath: "medflow/reminder-24h",
    medflowWebhookPath: "reminders",
    envKey: "N8N_WEBHOOK_REMINDER_24H",
    carrierCredentials: [
      "VAPI_CREDENTIAL_ID",
      "TWILIO_CREDENTIAL_ID",
      "EMAIL_CREDENTIAL_ID",
    ],
    description: "24h reminder template.",
    validationFields: ["appointmentId"],
    medflowBodyExpression:
      "={{ JSON.stringify({ appointmentId: $('Validate Payload').item.json.body.appointmentId, callLogId: $('Validate Payload').item.json.body.callLogId, reminderOffset: 'HOURS_24', CallStatus: 'completed' }) }}",
    inboundNote: "Sets reminderOffset HOURS_24 on MedFlow callback.",
  },
  {
    fileName: "05-reminder-2h-voice-sms-email.json",
    name: "MedFlow — 2h Reminder",
    webhookPath: "medflow/reminder-2h",
    medflowWebhookPath: "reminders",
    envKey: "N8N_WEBHOOK_REMINDER_2H",
    carrierCredentials: [
      "VAPI_CREDENTIAL_ID",
      "TWILIO_CREDENTIAL_ID",
      "EMAIL_CREDENTIAL_ID",
    ],
    description: "2h urgent reminder template.",
    validationFields: ["appointmentId"],
    medflowBodyExpression:
      "={{ JSON.stringify({ appointmentId: $('Validate Payload').item.json.body.appointmentId, callLogId: $('Validate Payload').item.json.body.callLogId, reminderOffset: 'HOURS_2', CallStatus: 'completed' }) }}",
    inboundNote: "Enable live mode only in staging with test numbers.",
  },
  {
    fileName: "06-reminder-30min-voice-sms-email.json",
    name: "MedFlow — 30min Reminder",
    webhookPath: "medflow/reminder-30min",
    medflowWebhookPath: "reminders",
    envKey: "N8N_WEBHOOK_REMINDER_30M",
    carrierCredentials: [
      "VAPI_CREDENTIAL_ID",
      "TWILIO_CREDENTIAL_ID",
      "EMAIL_CREDENTIAL_ID",
    ],
    description: "30-minute reminder template.",
    validationFields: ["appointmentId"],
    medflowBodyExpression:
      "={{ JSON.stringify({ appointmentId: $('Validate Payload').item.json.body.appointmentId, callLogId: $('Validate Payload').item.json.body.callLogId, reminderOffset: 'MINUTES_30', CallStatus: 'completed' }) }}",
    inboundNote: "Final pre-visit reminder tier.",
  },
  {
    fileName: "07-sms-reply-handler.json",
    name: "MedFlow — SMS Reply Handler",
    webhookPath: "medflow/sms-reply",
    medflowWebhookPath: "sms",
    envKey: "N8N_WEBHOOK_SMS",
    carrierCredentials: ["TWILIO_CREDENTIAL_ID"],
    description: "SMS delivery / reply → MedFlow SmsLog (template).",
    validationFields: ["smsLogId", "MessageStatus"],
    medflowBodyExpression:
      "={{ JSON.stringify({ smsLogId: $('Validate Payload').item.json.body.smsLogId ?? $('Validate Payload').item.json.body.payload?.smsLogId, MessageSid: $('Validate Payload').item.json.body.MessageSid, MessageStatus: $('Validate Payload').item.json.body.MessageStatus ?? $('Validate Payload').item.json.body.status }) }}",
    inboundNote: "Attach Twilio node using TWILIO_CREDENTIAL_ID when going live.",
  },
  {
    fileName: "08-email-reply-handler.json",
    name: "MedFlow — Email Reply Handler",
    webhookPath: "medflow/email-reply",
    medflowWebhookPath: "email",
    envKey: "N8N_WEBHOOK_EMAIL",
    carrierCredentials: ["EMAIL_CREDENTIAL_ID"],
    description: "Email events → MedFlow EmailLog (template).",
    validationFields: ["emailLogId", "status"],
    medflowBodyExpression:
      "={{ JSON.stringify({ emailLogId: $('Validate Payload').item.json.body.emailLogId ?? $('Validate Payload').item.json.body.payload?.emailLogId, status: $('Validate Payload').item.json.body.status ?? 'DELIVERED' }) }}",
    inboundNote: "Use EMAIL_CREDENTIAL_ID for SendGrid/Gmail nodes.",
  },
  {
    fileName: "09-walk-in-onboarding-handler.json",
    name: "MedFlow — Walk-In Onboarding",
    webhookPath: "medflow/walk-in-onboarding",
    medflowWebhookPath: "staff-intervention",
    envKey: "N8N_WEBHOOK_WALK_IN",
    carrierCredentials: [],
    description: "Walk-in status sync template (no carrier sends).",
    validationFields: ["interventionId", "status"],
    medflowBodyExpression:
      "={{ JSON.stringify({ interventionId: $('Validate Payload').item.json.body.interventionId, status: $('Validate Payload').item.json.body.status ?? 'WALK_IN' }) }}",
    inboundNote: "Create intervention in MedFlow first; pass interventionId only.",
  },
  {
    fileName: "10-physical-check-in-handler.json",
    name: "MedFlow — Physical Check-In",
    webhookPath: "medflow/physical-check-in",
    medflowWebhookPath: "appointment",
    envKey: "N8N_WEBHOOK_CHECK_IN",
    carrierCredentials: [],
    description: "Check-in → appointment status template.",
    validationFields: ["appointmentId", "status"],
    medflowBodyExpression:
      "={{ JSON.stringify({ appointmentId: $('Validate Payload').item.json.body.appointmentId, status: $('Validate Payload').item.json.body.status ?? 'CHECKED_IN' }) }}",
    inboundNote: "Kiosk/form → n8n → MedFlow appointment webhook.",
  },
  {
    fileName: "11-human-handoff-handler.json",
    name: "MedFlow — Human Handoff",
    webhookPath: "medflow/human-handoff",
    medflowWebhookPath: "staff-intervention",
    envKey: "N8N_WEBHOOK_STAFF_INTERVENTION",
    carrierCredentials: [],
    description: "Human takeover template.",
    validationFields: ["interventionId", "status"],
    medflowBodyExpression:
      "={{ JSON.stringify({ interventionId: $('Validate Payload').item.json.body.interventionId, status: $('Validate Payload').item.json.body.status ?? 'HUMAN_TAKEOVER' }) }}",
    inboundNote: "Escalation from voice AI or orchestrator.",
  },
  {
    fileName: "12-ai-coordination-handler.json",
    name: "MedFlow — AI Coordination",
    webhookPath: "medflow/ai-coordination",
    medflowWebhookPath: "appointment",
    envKey: "N8N_WEBHOOK_AI_COORDINATION",
    carrierCredentials: ["OPENAI_CREDENTIAL_ID"],
    description: "AI coordination / appointment sync template.",
    validationFields: ["appointmentId", "status"],
    medflowBodyExpression:
      "={{ JSON.stringify({ appointmentId: $('Validate Payload').item.json.body.appointmentId ?? $('Validate Payload').item.json.body.payload?.appointmentId, status: $('Validate Payload').item.json.body.status }) }}",
    inboundNote: "Prefer MedFlow /api/orchestrator/proposals for in-app AI.",
  },
];

function assertSafeOutput(json: string, fileName: string) {
  for (const pattern of FORBIDDEN_IN_OUTPUT) {
    if (pattern.test(json)) {
      throw new Error(
        `Safety check failed for ${fileName}: matched forbidden pattern ${pattern}`
      );
    }
  }
}

mkdirSync(OUT_DIR, { recursive: true });

for (const spec of workflows) {
  const workflow = buildWorkflow(spec);
  const outPath = path.join(OUT_DIR, spec.fileName);
  const json = JSON.stringify(workflow, null, 2);
  assertSafeOutput(json, spec.fileName);
  writeFileSync(outPath, json, "utf8");
  console.log(`Wrote ${outPath}`);
}

console.log(`\nGenerated ${workflows.length} template workflows in ${OUT_DIR}`);
