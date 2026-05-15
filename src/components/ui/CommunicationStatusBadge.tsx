import { COMMUNICATION_STATUS_LABELS } from "@/lib/constants";
import { Badge } from "./Badge";

const variantMap: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info" | "purple"
> = {
  PENDING: "default",
  SENT: "info",
  DELIVERED: "success",
  ANSWERED: "success",
  FAILED: "danger",
  NO_ANSWER: "warning",
  BOUNCED: "danger",
  RESPONDED: "purple",
  ESCALATED: "warning",
};

export function CommunicationStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={variantMap[status] ?? "default"}>
      {COMMUNICATION_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
