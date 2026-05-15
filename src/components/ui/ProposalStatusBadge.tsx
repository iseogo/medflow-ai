import { PROPOSAL_STATUS_LABELS } from "@/lib/constants";
import { Badge } from "./Badge";

const variantMap: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info" | "purple"
> = {
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "default",
  ESCALATED: "danger",
  EXECUTED: "info",
};

export function ProposalStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={variantMap[status] ?? "default"}>
      {PROPOSAL_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
