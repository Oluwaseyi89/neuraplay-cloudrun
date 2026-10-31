import React from "react";
import type { AuthUser } from "../../types/auth";
import type { TabType } from "../../types/navigation";
import TabSwitcher from "./TabSwitcher";
import MobileMenu from "./MobileMenu";
import MenuToggleButton from "./MenuToggleButton";

interface Props {
  user: AuthUser;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onLogout: () => void;
  isMobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
}

const brandText = "font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent";

const AppHeader: React.FC<Props> = ({
  user,
  activeTab,
  onTabChange,
  onLogout,
  isMobileMenuOpen,
  onToggleMobileMenu,
}) => (
  <header className="fixed top-0 left-0 right-0 bg-gray-800/95 backdrop-blur-lg border-b border-purple-500/20 shadow-lg z-50">
    {/* Mobile header */}
    <div className="sm:hidden w-full px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MenuToggleButton open={isMobileMenuOpen} onClick={onToggleMobileMenu} />
          <div>
            <h1 className={`text-xl ${brandText}`}>NeuraPlay</h1>
            <p className="text-gray-300 text-xs">Hi, {user.first_name || user.username}</p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all duration-200 font-medium text-xs"
        >
          Logout
        </button>
      </div>

      {isMobileMenuOpen && <MobileMenu activeTab={activeTab} onTabChange={onTabChange} />}
    </div>

    {/* Desktop header */}
    <div className="hidden sm:block w-full px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className={`text-3xl ${brandText}`}>NeuraPlay Coach</h1>
          <p className="text-gray-300 text-lg">Welcome back, {user.display_name || user.username}</p>
        </div>

        <div className="flex-1 max-w-2xl mx-8">
          <TabSwitcher activeTab={activeTab} onTabChange={onTabChange} />
        </div>

        <button
          onClick={onLogout}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-red-500/25 text-lg whitespace-nowrap"
        >
          Logout
        </button>
      </div>
    </div>
  </header>
);

export default AppHeader;
