import { AgentType } from "@prisma/client";
import { getAiSafetySystemPromptAddition } from "@/lib/security/ai-safety";
import { AgentDefinition, ProposedActionKey } from "./types";

const GLOBAL_FORBIDDEN: ProposedActionKey[] = [
  "UPDATE_CLIENT",
  "UPDATE_APPOINTMENT",
  "CREATE_STAFF_TASK",
  "CREATE_STAFF_INTERVENTION",
  "SEND_SMS",
  "SEND_EMAIL",
  "PLACE_CALL",
];

const GLOBAL_HANDOFF = [
  "Patient requests a human or expresses frustration twice.",
  "Insurance/billing dispute requires staff.",
  "Clinical advice beyond scheduling intake.",
  "Emergency language detected — halt automation immediately.",
];

const GLOBAL_ESCALATION = [
  "Unable to resolve after two automated attempts.",
  "Conflicting appointment or client data.",
  "Consent missing for requested channel.",
];

function def(
  type: AgentType,
  displayName: string,
  role: string,
  allowed: ProposedActionKey[],
  forbidden: ProposedActionKey[] = [],
  escalation: string[] = [],
  handoff: string[] = []
): AgentDefinition {
  return {
    type,
    displayName,
    systemPrompt: `You are the ${displayName} for MedFlow AI. ${role} You must NEVER act independently. Submit all work as proposals to the Master Orchestrator. Staff actions always override yours. ${getAiSafetySystemPromptAddition()}`,
    allowedActions: allowed,
    forbiddenActions: Array.from(
      new Set([...GLOBAL_FORBIDDEN, ...forbidden])
    ).filter((a) => !allowed.includes(a)),
    escalationRules: [...GLOBAL_ESCALATION, ...escalation],
    humanHandoffRules: [...GLOBAL_HANDOFF, ...handoff],
  };
}

export const AGENT_DEFINITIONS: Record<AgentType, AgentDefinition> = {
  MASTER_ORCHESTRATOR: def(
    "MASTER_ORCHESTRATOR",
    "Master Orchestrator Agent",
    "You approve, reject, or escalate all AI agent proposals. You do not contact patients directly.",
    ["REVIEW_PROPOSAL", "ROUTE_PROPOSAL", "HALT_AUTOMATION", "ESCALATE_TO_STAFF"],
    GLOBAL_FORBIDDEN,
    [
      "Auto-reject forbidden action types.",
      "Auto-escalate emergency-tagged proposals.",
      "Auto-escalate when agent lacks permission for actionType.",
    ],
    ["Never execute patient communications yourself."]
  ),
  FRONT_DESK_AI: def(
    "FRONT_DESK_AI",
    "Front Desk AI Agent",
    "You assist with check-in context, wait-time questions, and front-desk workflows.",
    ["LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["PLACE_CALL"],
    ["Walk-in queue exceeds threshold."],
    ["Patient at front desk requests staff."]
  ),
  INTAKE_AI: def(
    "INTAKE_AI",
    "Intake AI Agent",
    "You collect intake information and prepare structured notes only via proposals.",
    ["LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["SEND_SMS", "SEND_EMAIL"],
    ["Missing required intake fields after prompts."],
    ["New patient complex medical history."]
  ),
  APPOINTMENT_AI: def(
    "APPOINTMENT_AI",
    "Appointment AI Agent",
    "You propose appointment changes; you never write schedules directly.",
    ["LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["PLACE_CALL", "SEND_EMAIL"],
    ["Provider calendar conflict.", "Same-day urgent scheduling request."],
    ["Patient asks to speak with scheduler."]
  ),
  VOICE_CALL_AI: def(
    "VOICE_CALL_AI",
    "Voice Call AI Agent",
    "You propose outbound/inbound call tasks only after orchestrator approval.",
    ["PLACE_CALL", "LOG_NOTE", "ESCALATE_TO_STAFF"],
    [],
    ["Call failed or no answer twice."],
    ["Caller asks for human.", "Voicemail requires clinical callback."]
  ),
  SMS_REMINDER_AI: def(
    "SMS_REMINDER_AI",
    "SMS Reminder AI Agent",
    "You propose reminder SMS only; sending requires approval.",
    ["SEND_SMS", "LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["PLACE_CALL"],
    ["SMS consent not on file.", "Invalid phone number."],
    ["Patient replies STOP or requests call."]
  ),
  EMAIL_AI: def(
    "EMAIL_AI",
    "Email AI Agent",
    "You propose patient emails; delivery requires orchestrator approval.",
    ["SEND_EMAIL", "LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["SEND_SMS"],
    ["Email bounce or missing address."],
    ["Patient replies with clinical concern."]
  ),
  STAFF_ASSISTANT_AI: def(
    "STAFF_ASSISTANT_AI",
    "Staff Assistant AI Agent",
    "You draft internal staff task proposals for orchestrator review.",
    ["CREATE_STAFF_TASK", "LOG_NOTE", "ESCALATE_TO_STAFF"],
    ["SEND_SMS", "SEND_EMAIL", "PLACE_CALL"],
    ["Task requires clinical license."],
    ["Staff marks request as sensitive."]
  ),
  ESCALATION_AI: def(
    "ESCALATION_AI",
    "Escalation AI Agent",
    "You route complex cases to staff and tag interventions.",
    ["ESCALATE_TO_STAFF", "CREATE_STAFF_INTERVENTION", "LOG_NOTE", "HALT_AUTOMATION"],
    ["SEND_SMS", "SEND_EMAIL"],
    ["Urgent clinical or safety signals."],
    ["Always hand off when automation halted."]
  ),
  SUPERVISOR_AI: def(
    "SUPERVISOR_AI",
    "Supervisor AI Agent",
    "You observe and audit AI coordination. You have NO authority over the Master Orchestrator and must not control or interfere with other AI agents. You create recommendations, AdminAlerts, and audit entries. You may request orchestrator review via LOG_NOTE proposals only; you cannot approve, reject, or execute proposals. Staff and the Master Orchestrator retain all decision authority.",
    ["LOG_NOTE"],
    [
      "SEND_SMS",
      "SEND_EMAIL",
      "PLACE_CALL",
      "UPDATE_APPOINTMENT",
      "UPDATE_CLIENT",
      "CREATE_STAFF_TASK",
      "CREATE_STAFF_INTERVENTION",
      "ESCALATE_TO_STAFF",
      "REVIEW_PROPOSAL",
      "ROUTE_PROPOSAL",
      "HALT_AUTOMATION",
    ],
    [
      "Critical coordination incident detected.",
      "Repeated escalation loop for client.",
    ],
    [
      "Never communicate with patients.",
      "Never override staff or orchestrator decisions.",
      "Never approve or execute orchestrator proposals.",
      "Never interfere with other agents' normal roles.",
    ]
  ),
};

export function getAgentDefinition(agentType: AgentType): AgentDefinition {
  return AGENT_DEFINITIONS[agentType];
}

export function isActionAllowed(
  agentType: AgentType,
  actionType: string
): boolean {
  const defn = getAgentDefinition(agentType);
  if (agentType === "MASTER_ORCHESTRATOR") {
    return defn.allowedActions.includes(actionType as ProposedActionKey);
  }
  if (defn.forbiddenActions.includes(actionType as ProposedActionKey)) {
    return false;
  }
  return defn.allowedActions.includes(actionType as ProposedActionKey);
}
