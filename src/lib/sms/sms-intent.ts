/**
 * Rule-based intent classification for inbound patient SMS.
 *
 * Deterministic and conservative by design: it powers template auto-replies
 * that the Master Orchestrator auto-approves, so anything ambiguous must fall
 * through to QUESTION/UNKNOWN (which requires staff review or escalation).
 * Emergency language is detected separately via detectEmergencyLanguage and
 * always takes precedence over these intents.
 */

export type SmsIntent =
  | "CONFIRM"
  | "RESCHEDULE"
  | "CANCEL"
  | "STOP"
  | "HUMAN_REQUEST"
  | "QUESTION"
  | "UNKNOWN";

export type SmsIntentResult = {
  intent: SmsIntent;
  matchedTerm?: string;
};

const STOP_EXACT = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "end",
  "quit",
  "optout",
  "opt out",
]);

const HUMAN_REQUEST_PATTERNS = [
  /\b(speak|talk)\s+(to|with)\s+(a\s+)?(human|person|someone|staff|nurse|doctor|receptionist)\b/i,
  /\b(real|live)\s+(person|human|agent)\b/i,
  /\brepresentative\b/i,
  /\bcall\s+me(\s+back)?\b/i,
  /\bstop\s+texting\s+me\s+and\s+call\b/i,
  /\bis\s+this\s+a\s+(bot|robot|machine)\b/i,
  /\bno\s+more\s+(bots?|robots?)\b/i,
];

const CANCEL_PATTERNS = [
  /\bcancel(l?ing|l?ed)?\b/i,
  /\bcall\s+off\b/i,
  /\bwon'?t\s+be\s+(coming|able)\b/i,
  /\bnot\s+coming\b/i,
];

const RESCHEDULE_PATTERNS = [
  /\bre-?schedul/i,
  /\b(change|move|switch)\b.*\b(appointment|appt|time|date)\b/i,
  /\b(another|different|later|earlier|new)\s+(time|date|day|slot)\b/i,
  /\bcan'?t\s+make\s+(it|the)\b/i,
  /\bcannot\s+make\s+(it|the)\b/i,
  /\brunning\s+late\b/i,
  /\bpush\s+(it\s+)?back\b/i,
];

const CONFIRM_EXACT = new Set(["y", "yes", "c", "ok", "okay", "confirm", "confirmed", "yep", "yeah", "sure", "👍"]);

const CONFIRM_PATTERNS = [
  /\bconfirm(ed|ing)?\b/i,
  /\bsee\s+you\s+(there|then|soon)\b/i,
  /\bi('?| wi)ll\s+be\s+there\b/i,
  /\bworks\s+for\s+me\b/i,
  /\bsounds\s+good\b/i,
];

const QUESTION_PATTERNS = [
  /\?/,
  /^\s*(what|when|where|who|how|do|does|did|is|are|can|could|should|will)\b/i,
];

function normalize(body: string): string {
  return body.trim().toLowerCase().replace(/[!.]+$/g, "").trim();
}

export function classifySmsIntent(body: string): SmsIntentResult {
  const normalized = normalize(body);
  if (!normalized) return { intent: "UNKNOWN" };

  if (STOP_EXACT.has(normalized)) {
    return { intent: "STOP", matchedTerm: normalized };
  }

  for (const pattern of HUMAN_REQUEST_PATTERNS) {
    const match = body.match(pattern);
    if (match) return { intent: "HUMAN_REQUEST", matchedTerm: match[0] };
  }

  // Reschedule before cancel: "cancel and rebook"-style texts usually mean
  // reschedule, and a staff task is created either way.
  for (const pattern of RESCHEDULE_PATTERNS) {
    const match = body.match(pattern);
    if (match) return { intent: "RESCHEDULE", matchedTerm: match[0] };
  }

  for (const pattern of CANCEL_PATTERNS) {
    const match = body.match(pattern);
    if (match) return { intent: "CANCEL", matchedTerm: match[0] };
  }

  if (CONFIRM_EXACT.has(normalized)) {
    return { intent: "CONFIRM", matchedTerm: normalized };
  }
  for (const pattern of CONFIRM_PATTERNS) {
    const match = body.match(pattern);
    if (match) return { intent: "CONFIRM", matchedTerm: match[0] };
  }

  for (const pattern of QUESTION_PATTERNS) {
    const match = body.match(pattern);
    if (match) return { intent: "QUESTION", matchedTerm: match[0] };
  }

  return { intent: "UNKNOWN" };
}

/** Purposes for SMS Assistant template replies — auto-approved by the orchestrator. */
export const SMS_TEMPLATE_REPLY_PURPOSES = {
  CONFIRM: "sms_auto_reply_confirm",
  RESCHEDULE: "sms_auto_reply_reschedule",
  CANCEL: "sms_auto_reply_cancel",
  HUMAN_REQUEST: "sms_auto_reply_handoff",
  FALLBACK: "sms_auto_reply_fallback",
  EMERGENCY: "sms_auto_reply_emergency",
} as const;

/** Purpose for LLM-drafted replies — always held for staff approval. */
export const SMS_DRAFTED_REPLY_PURPOSE = "sms_ai_drafted_reply";

export const SMS_STAFF_TASK_PURPOSES = {
  RESCHEDULE: "sms_reschedule_request",
  CANCEL: "sms_cancel_request",
  FOLLOW_UP: "sms_follow_up",
} as const;

export const INBOUND_SMS_PURPOSE = "inbound_sms";
export const SMS_HUMAN_HANDOFF_PURPOSE = "sms_human_handoff";

export type AutoReplyContext = {
  firstName?: string | null;
  appointmentLabel?: string | null;
};

/**
 * Fixed reply templates. These are the only messages the SMS Assistant can
 * send without human review, so keep them free of clinical content.
 */
export function buildAutoReply(
  kind: keyof typeof SMS_TEMPLATE_REPLY_PURPOSES,
  ctx: AutoReplyContext = {}
): string {
  const name = ctx.firstName ? ` ${ctx.firstName}` : "";
  switch (kind) {
    case "CONFIRM":
      return ctx.appointmentLabel
        ? `Thanks${name}! Your appointment on ${ctx.appointmentLabel} is confirmed. Reply RESCHEDULE if anything changes.`
        : `Thanks${name}! We've noted your confirmation. Reply RESCHEDULE if anything changes.`;
    case "RESCHEDULE":
      return `No problem${name} — our team has been notified and will text you shortly with new time options.`;
    case "CANCEL":
      return `We've noted your cancellation request${name}. Our staff will confirm shortly. If you'd like to rebook, just reply here.`;
    case "HUMAN_REQUEST":
      return `Of course${name} — a member of our staff has been notified and will reach out to you shortly.`;
    case "EMERGENCY":
      return "If this is a medical emergency, please call 911 or go to the nearest emergency room immediately. Our staff has been alerted to your message.";
    case "FALLBACK":
    default:
      return `Thanks for your message${name}! Our staff will review it and get back to you shortly.`;
  }
}
