import React, { useState } from "react";
import AppHeader from "../components/layout/AppHeader";
import TabSwitcher from "../components/layout/TabSwitcher";
import VoiceAnalysisPage from "./VoiceAnalysisPage";
import RecentAnalysesPage from "./RecentAnalysesPage";
import type { AuthUser } from "../types/auth";
import type { Analysis } from "../types/analysis";
import type { GameType } from "../types/game";
import type { TabType } from "../types/navigation";

interface Props {
  user: AuthUser;
  token: string;
  onLogout: () => void;
}

const DashboardPage: React.FC<Props> = ({ user, token, onLogout }) => {
  const [activeTab, setActiveTab] = useState<TabType>("voice");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [latestAnalyses, setLatestAnalyses] = useState<Record<GameType, Analysis | null>>({ fifa: null, lol: null });

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = () => {
    setIsMobileMenuOpen(false);
    onLogout();
  };

  const handleAnalysis = (game: GameType, analysis: Analysis) => {
    setLatestAnalyses((prev) => ({ ...prev, [game]: analysis }));
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white antialiased">
      <AppHeader
        user={user}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogout={handleLogout}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen((open) => !open)}
      />

      <main className="h-full w-full pt-16 sm:pt-24">
        <div className="h-full w-full px-4 sm:px-8 py-4 sm:py-6 overflow-y-auto">
          {!isMobileMenuOpen && (
            <div className="sm:hidden w-full mb-6">
              <TabSwitcher activeTab={activeTab} onTabChange={handleTabChange} compact />
            </div>
          )}

          <div className="w-full">
            {activeTab === "voice" ? (
              <VoiceAnalysisPage token={token} latestAnalyses={latestAnalyses} onAnalysis={handleAnalysis} />
            ) : (
              <RecentAnalysesPage />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
