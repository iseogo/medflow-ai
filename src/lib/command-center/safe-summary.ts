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

/** Queue/room label for live wall displays — no names. */
export function safeQueueLabel(input: {
  queuePosition?: number | null;
  location?: string | null;
}) {
  const parts: string[] = [];
  if (input.queuePosition != null) parts.push(`Queue #${input.queuePosition}`);
  if (input.location?.trim()) parts.push(`Room ${input.location.trim()}`);
  return parts.length > 0 ? parts.join(" · ") : "Queue —";
}

/** Live wall patient tag: MRN tail or case id only (never legal name). */
export function safeLivePatientTag(input: { mrn?: string | null; clientId?: string }) {
  if (input.mrn && input.mrn.length >= 2) {
    return `Pt ${input.mrn.slice(0, 2).toUpperCase()}••${input.mrn.slice(-4)}`;
  }
  return safeClientRef(input);
}
