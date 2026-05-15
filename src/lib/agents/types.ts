import { AgentType } from "@prisma/client";

export type ProposedActionKey =
  | "SEND_SMS"
  | "SEND_EMAIL"
  | "PLACE_CALL"
  | "UPDATE_APPOINTMENT"
  | "UPDATE_CLIENT"
  | "CREATE_STAFF_TASK"
  | "CREATE_STAFF_INTERVENTION"
  | "LOG_NOTE"
  | "ESCALATE_TO_STAFF"
  | "REVIEW_PROPOSAL"
  | "ROUTE_PROPOSAL"
  | "HALT_AUTOMATION";

export type AgentDefinition = {
  type: AgentType;
  displayName: string;
  systemPrompt: string;
  allowedActions: ProposedActionKey[];
  forbiddenActions: ProposedActionKey[];
  escalationRules: string[];
  humanHandoffRules: string[];
};
