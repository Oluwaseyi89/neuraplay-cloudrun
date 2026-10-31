import React from "react";
import { TABS } from "../../types/navigation";
import type { TabType } from "../../types/navigation";

interface Props {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  /** Compact labels for small screens */
  compact?: boolean;
}

const TabSwitcher: React.FC<Props> = ({ activeTab, onTabChange, compact = false }) => (
  <div className="bg-gray-800/40 backdrop-blur-lg rounded-2xl p-2 border border-purple-500/20 shadow-xl">
    <div className="flex justify-center space-x-2">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`flex-1 rounded-xl font-semibold transition-all duration-200 ${
            compact ? "px-4 py-3 text-sm" : "px-6 py-3 text-lg"
          } ${
            activeTab === tab.id
              ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
              : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white"
          }`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.icon} {compact ? tab.shortLabel : tab.label}
        </button>
      ))}
    </div>
  </div>
);

export default TabSwitcher;
