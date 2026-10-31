import React from "react";
import { TABS } from "../../types/navigation";
import type { TabType } from "../../types/navigation";

interface Props {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const MobileMenu: React.FC<Props> = ({ activeTab, onTabChange }) => (
  <div className="absolute top-full left-0 right-0 bg-gray-800/95 backdrop-blur-lg border-b border-purple-500/20 shadow-xl">
    <div className="p-4 space-y-3">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`w-full text-left px-4 py-3 rounded-xl font-semibold transition-all duration-200 ${
            activeTab === tab.id
              ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
              : "bg-gray-700/50 hover:bg-gray-700 text-gray-300"
          }`}
        >
          {tab.icon} {tab.label}
        </button>
      ))}
    </div>
  </div>
);

export default MobileMenu;
