/** PHI-safe labels for command center — no names, email, or phone. */

export function safeClientRef(input: { mrn?: string | null; clientId?: string }) {
  if (input.mrn && input.mrn.length >= 4) {
    return `Patient ••${input.mrn.slice(-4)}`;
  }
  if (input.clientId) {
    return `Case …${input.clientId.slice(-6)}`;
  }
  return "Patient (redacted)";
}

export function safeTimeLabel(date: Date) {
  return date.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

export function safeStatusLabel(status: string) {
  return status.replace(/_/g, " ").toLowerCase();
}
