import { Badge } from "./Badge";
import {
  APPOINTMENT_STATUS_LABELS,
  INTERVENTION_STATUS_LABELS,
} from "@/lib/constants";

const appointmentVariant: Record<string, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  SCHEDULED: "info",
  CONFIRMED: "success",
  RESCHEDULE_REQUESTED: "warning",
  RESCHEDULED: "info",
  CANCELLED: "default",
  CHECKED_IN: "success",
  WAITING: "warning",
  WITH_PROVIDER: "purple",
  COMPLETED: "success",
  NO_SHOW: "danger",
  FOLLOW_UP_NEEDED: "warning",
};

const interventionVariant: Record<string, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  WALK_IN: "info",
  HUMAN_TAKEOVER: "purple",
  AI_ESCALATED: "warning",
  STAFF_REVIEW_REQUIRED: "warning",
  RESOLVED: "success",
  FOLLOW_UP_NEEDED: "warning",
  URGENT: "danger",
};

export function AppointmentStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={appointmentVariant[status] ?? "default"}>
      {APPOINTMENT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function InterventionStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={interventionVariant[status] ?? "default"}>
      {INTERVENTION_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
