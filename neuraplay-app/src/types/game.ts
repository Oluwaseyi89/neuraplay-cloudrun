export type GameType = "fifa" | "lol";

interface GameMeta {
  label: string;
  title: string;
  description: string;
  icon: string;
  // Full Tailwind class strings so the compiler can find them
  panelBorder: string;
  iconBackground: string;
  titleText: string;
  activeTab: string;
  historyBadge: string;
}

export const GAMES: Record<GameType, GameMeta> = {
  fifa: {
    label: "FIFA",
    title: "FIFA Analysis",
    description: "Analyze your FIFA/EA FC gameplay",
    icon: "🎮",
    panelBorder: "border-green-500/30",
    iconBackground: "bg-green-500/20",
    titleText: "text-green-400",
    activeTab: "bg-green-600 shadow-lg shadow-green-500/25 text-white",
    historyBadge: "bg-green-600/20 border border-green-500/30",
  },
  lol: {
    label: "LoL",
    title: "LoL Analysis",
    description: "Analyze your League matches",
    icon: "⚔️",
    panelBorder: "border-blue-500/30",
    iconBackground: "bg-blue-500/20",
    titleText: "text-blue-400",
    activeTab: "bg-blue-600 shadow-lg shadow-blue-500/25 text-white",
    historyBadge: "bg-blue-600/20 border border-blue-500/30",
  },
};

export const GAME_TYPES: GameType[] = ["fifa", "lol"];
