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
};

export type CommandCenterSnapshot = {
  role: string;
  mockMode: boolean;
  systemHealth: "healthy" | "degraded" | "critical";
  generatedAt: string;
  sections: CommandCenterSection[];
};
