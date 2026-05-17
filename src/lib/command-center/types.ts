export type CommandCenterTone =
  | "red"
  | "orange"
  | "yellow"
  | "blue"
  | "green"
  | "purple"
  | "gray";

export type CommandCenterItem = {
  id: string;
  label: string;
  detail?: string;
  time?: string;
};

export type CommandCenterSection = {
  id: string;
  title: string;
  count: number;
  tone: CommandCenterTone;
  recommendedNextAction: string;
  href: string;
  items: CommandCenterItem[];
  hidden?: boolean;
  priority?: number;
};

export type ExecutiveKpiItem = {
  key: string;
  label: string;
  value: string;
  tone: CommandCenterTone;
  href: string;
};

export type ExecutiveActionAlert = {
  id: string;
  title: string;
  severity: CommandCenterTone;
  patientSummary?: string;
  assignedOwner: string;
  timeWaiting: string;
  recommendedNextAction: string;
  escalationStatus: string;
  href: string;
};

export type ActivityFeedEntry = {
  id: string;
  message: string;
  category: string;
  tone: CommandCenterTone;
  time: string;
};

export type CommandCenterSnapshot = {
  role: string;
  mockMode: boolean;
  systemHealth: "healthy" | "degraded" | "critical";
  generatedAt: string;
  kpis: ExecutiveKpiItem[];
  criticalActions: ExecutiveActionAlert[];
  activityFeed: ActivityFeedEntry[];
  sections: CommandCenterSection[];
};
