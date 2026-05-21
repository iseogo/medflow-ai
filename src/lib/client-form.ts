import type { Client } from "@prisma/client";

export type ClientFormAddress = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

export function clientStatusFromActive(isActive: boolean): "ACTIVE" | "INACTIVE" {
  return isActive ? "ACTIVE" : "INACTIVE";
}

export function clientIsActiveFromStatus(status: string): boolean {
  return status !== "INACTIVE" && status !== "ARCHIVED";
}

export function formatClientAddress(client: Pick<
  Client,
  "addressLine1" | "addressLine2" | "city" | "state" | "postalCode"
>): string {
  const parts = [
    client.addressLine1,
    client.addressLine2,
    [client.city, client.state].filter(Boolean).join(", "),
    client.postalCode,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}
