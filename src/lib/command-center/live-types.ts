import type { CommandCenterTone } from "./types";

export type LiveDisplayMode = "executive" | "clinical" | "front_desk" | "manager";

export type LiveSectionKey =
  | "criticalAlerts"
  | "waitingRoom"
  | "todayAppointments"
  | "walkIns"
  | "checkIns"
  | "staffTasks"
  | "providerCapacity"
  | "reminderFailures"
  | "aiSupervisor"
  | "workflowBottlenecks"
  | "integrationHealth"
  | "liveActivityFeed";

export type LiveBoardItem = {
  id: string;
  headline: string;
  subline?: string;
  tone: CommandCenterTone;
  pinned?: boolean;
};

export type LiveBoardSection = {
  key: LiveSectionKey;
  title: string;
  count: number;
  tone: CommandCenterTone;
  items: LiveBoardItem[];
};

export type LiveActivityItem = {
  id: string;
  message: string;
  category: string;
  tone: CommandCenterTone;
  time: string;
};

export type LiveBoardSnapshot = {
  role: string;
  displayMode: LiveDisplayMode;
  mockMode: boolean;
  refreshIntervalMs: number;
  generatedAt: string;
  pinnedAlerts: LiveBoardItem[];
  sections: LiveBoardSection[];
  activityFeed: LiveActivityItem[];
  kpis?: { label: string; value: string; tone: CommandCenterTone }[];
};

export const LIVE_REFRESH_MS = 20_000;
