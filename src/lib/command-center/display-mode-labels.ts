import type { LiveDisplayMode } from "./live-types";

export function displayModeLabel(mode: LiveDisplayMode): string {
  const labels: Record<LiveDisplayMode, string> = {
    executive: "Executive View",
    clinical: "Nurse / Clinical View",
    front_desk: "Front Desk View",
    manager: "Manager View",
  };
  return labels[mode];
}
