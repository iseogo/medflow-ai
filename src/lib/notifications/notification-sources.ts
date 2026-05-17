import {
  NotificationCategory,
  NotificationPriority,
  NotificationSource,
  RoleType,
} from "@prisma/client";

export type SourceDefaults = {
  category: NotificationCategory;
  priority: NotificationPriority;
  roles: RoleType[];
  recommendedNextAction: string;
  patientFacingTimeline?: boolean;
};

/** Default routing for each notification source (in-app only; no external send). */
export const NOTIFICATION_SOURCE_DEFAULTS: Record<NotificationSource, SourceDefaults> = {
  INBOUND_CALL_HUMAN_REVIEW: {
    category: "ACTION_REQUIRED",
    priority: "HIGH",
    roles: ["FRONT_DESK_STAFF", "MANAGER"],
    recommendedNextAction: "Review inbound call and assist caller",
  },
  OUTBOUND_CALL_FAILED: {
    category: "WARNING",
    priority: "MEDIUM",
    roles: ["FRONT_DESK_STAFF"],
    recommendedNextAction: "Retry call or assign callback task",
  },
  REMINDER_FAILED: {
    category: "WARNING",
    priority: "HIGH",
    roles: ["FRONT_DESK_STAFF", "MANAGER"],
    recommendedNextAction: "Review reminder log and contact patient",
  },
  PATIENT_CONFIRMED_APPOINTMENT: {
    category: "SUCCESS",
    priority: "LOW",
    roles: ["FRONT_DESK_STAFF"],
    recommendedNextAction: "Confirm schedule updated",
    patientFacingTimeline: true,
  },
  PATIENT_CANCELLED_APPOINTMENT: {
    category: "ACTION_REQUIRED",
    priority: "HIGH",
    roles: ["FRONT_DESK_STAFF"],
    recommendedNextAction: "Release slot and offer reschedule",
    patientFacingTimeline: true,
  },
  PATIENT_RESCHEDULE_REQUESTED: {
    category: "ACTION_REQUIRED",
    priority: "HIGH",
    roles: ["FRONT_DESK_STAFF"],
    recommendedNextAction: "Offer available appointment times",
    patientFacingTimeline: true,
  },
  PATIENT_NO_RESPONSE: {
    category: "WARNING",
    priority: "MEDIUM",
    roles: ["FRONT_DESK_STAFF"],
    recommendedNextAction: "Follow up with patient",
  },
  WALK_IN_ARRIVED: {
    category: "ACTION_REQUIRED",
    priority: "HIGH",
    roles: ["FRONT_DESK_STAFF"],
    recommendedNextAction: "Complete walk-in onboarding",
  },
  CHECK_IN_COMPLETED: {
    category: "INFO",
    priority: "MEDIUM",
    roles: ["FRONT_DESK_STAFF", "CLINICAL_STAFF"],
    recommendedNextAction: "Monitor waiting room queue",
  },
  WAITING_ROOM_DELAY: {
    category: "WARNING",
    priority: "HIGH",
    roles: ["FRONT_DESK_STAFF", "CLINICAL_STAFF"],
    recommendedNextAction: "Check wait times and notify provider",
  },
  PATIENT_WITH_PROVIDER: {
    category: "INFO",
    priority: "LOW",
    roles: ["CLINICAL_STAFF"],
    recommendedNextAction: "Monitor visit progress",
  },
  APPOINTMENT_COMPLETED: {
    category: "SUCCESS",
    priority: "LOW",
    roles: ["FRONT_DESK_STAFF", "CLINICAL_STAFF"],
    recommendedNextAction: "Complete checkout if needed",
    patientFacingTimeline: true,
  },
  PATIENT_NO_SHOW: {
    category: "WARNING",
    priority: "MEDIUM",
    roles: ["FRONT_DESK_STAFF"],
    recommendedNextAction: "Document no-show and follow up",
    patientFacingTimeline: true,
  },
  STAFF_INTERVENTION_REQUIRED: {
    category: "URGENT",
    priority: "HIGH",
    roles: ["MANAGER", "FRONT_DESK_STAFF"],
    recommendedNextAction: "Open staff intervention queue",
  },
  AI_LOW_CONFIDENCE: {
    category: "AI_REVIEW",
    priority: "HIGH",
    roles: ["MANAGER"],
    recommendedNextAction: "Review AI proposal in orchestrator",
  },
  EMERGENCY_RISK_DETECTED: {
    category: "EMERGENCY",
    priority: "CRITICAL",
    roles: ["CLINICAL_STAFF", "MANAGER", "FRONT_DESK_STAFF"],
    recommendedNextAction: "Immediate staff response — verify 911 guidance if applicable",
  },
  INSURANCE_PAYMENT_ISSUE: {
    category: "ACTION_REQUIRED",
    priority: "HIGH",
    roles: ["BILLING_STAFF"],
    recommendedNextAction: "Review billing/insurance placeholder",
  },
  MEDICAL_RECORDS_REQUEST: {
    category: "ACTION_REQUIRED",
    priority: "MEDIUM",
    roles: ["MEDICAL_RECORDS_STAFF"],
    recommendedNextAction: "Process records request",
  },
  WEBHOOK_FAILURE: {
    category: "SYSTEM",
    priority: "HIGH",
    roles: ["ADMIN", "MANAGER"],
    recommendedNextAction: "Check webhook logs and integration status",
  },
  INTEGRATION_FAILURE: {
    category: "SYSTEM",
    priority: "HIGH",
    roles: ["ADMIN", "MANAGER"],
    recommendedNextAction: "Verify MOCK_MODE and provider credentials",
  },
  SUPERVISOR_WARNING: {
    category: "AI_REVIEW",
    priority: "HIGH",
    roles: ["MANAGER", "ADMIN"],
    recommendedNextAction: "Review supervisor dashboard",
  },
  DUPLICATE_ACTION_PREVENTED: {
    category: "SYSTEM",
    priority: "LOW",
    roles: ["MANAGER"],
    recommendedNextAction: "No action — duplicate prevented",
  },
  STAFF_OVERRIDE_ACTIVATED: {
    category: "STAFF_OVERRIDE",
    priority: "HIGH",
    roles: ["MANAGER"],
    recommendedNextAction: "Automation paused — staff in control",
  },
  WORKFLOW_STUCK: {
    category: "WARNING",
    priority: "HIGH",
    roles: ["MANAGER"],
    recommendedNextAction: "Review pending orchestrator proposals",
  },
  AUDIT_SECURITY_WARNING: {
    category: "SECURITY",
    priority: "CRITICAL",
    roles: ["ADMIN", "MANAGER"],
    recommendedNextAction: "Review audit logs and access",
  },
  MANUAL_STAFF: {
    category: "INFO",
    priority: "MEDIUM",
    roles: ["FRONT_DESK_STAFF"],
    recommendedNextAction: "Review notification details",
  },
  ORCHESTRATOR_ESCALATION: {
    category: "AI_REVIEW",
    priority: "HIGH",
    roles: ["MANAGER"],
    recommendedNextAction: "Review escalated agent proposal",
  },
};
