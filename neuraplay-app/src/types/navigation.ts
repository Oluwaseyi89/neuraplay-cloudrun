export type TabType = "voice" | "analyses";

export interface TabDefinition {
  id: TabType;
  icon: string;
  label: string;
  shortLabel: string;
}

export const TABS: TabDefinition[] = [
  { id: "voice", icon: "🎤", label: "Voice Analysis", shortLabel: "Voice" },
  { id: "analyses", icon: "📊", label: "Recent Analyses", shortLabel: "Analyses" },
];
