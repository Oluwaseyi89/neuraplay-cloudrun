import React, { useEffect, useState } from "react";
import LoginButton from "./components/LoginButton";
import VoiceInput from "./components/VoiceInput";
import { useAuthStore } from "./store/auth-store";
import { auth } from "./firebase/firebaseClient";
import { signOut, onAuthStateChanged } from "firebase/auth";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

type TabType = "voice" | "analyses";
type GameType = "fifa" | "lol";

interface AnalysisHistory {
  id: string;
  user_id: string;
  user_text: string;
  created_at: string;
  game: string;
  summary: string;
  topTips: string[];
  trainingDrills: string[];
  rating: number | null;
  confidence: number | null;
  responseType: string;
  analysis?: any;
}

const App: React.FC = () => {
  const { user, token, login, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>("voice");
  const [analysisGameTab, setAnalysisGameTab] = useState<GameType>("fifa");
  const [fifaAnalysis, setFifaAnalysis] = useState<any>(null);
  const [lolAnalysis, setLolAnalysis] = useState<any>(null);
  const [recentFifaAnalyses, setRecentFifaAnalyses] = useState<AnalysisHistory[]>([]);
  const [recentLolAnalyses, setRecentLolAnalyses] = useState<AnalysisHistory[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        logout();
        return;
      }
      const idToken = await firebaseUser.getIdToken();
      login(firebaseUser, idToken);
    });

    return () => unsub();
  }, [login, logout]);

  useEffect(() => {
    if (activeTab === "analyses" && token) {
      loadRecentAnalyses();
    }
  }, [activeTab, analysisGameTab, token]);

  const loadRecentAnalyses = async () => {
    if (!token) return;

    setLoadingAnalyses(true);
    try {
      const url = `${API_BASE}/api/analyses/recent/${analysisGameTab}/`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (analysisGameTab === "fifa") {
        setRecentFifaAnalyses(response.data.analyses || []);
      } else {
        setRecentLolAnalyses(response.data.analyses || []);
      }
    } catch (error: any) {
      console.error("❌ Failed to load recent analyses:", error);
      if (analysisGameTab === "fifa") {
        setRecentFifaAnalyses([]);
      } else {
        setRecentLolAnalyses([]);
      }
    } finally {
      setLoadingAnalyses(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    logout();
    setIsMobileMenuOpen(false);
  };

  const handleNewAnalysis = (data: any, game: GameType) => {
    if (game === "fifa") {
      setFifaAnalysis(data);
    } else {
      setLolAnalysis(data);
    }
    if (activeTab === "analyses") {
      loadRecentAnalyses();
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  if (!token || !user) {
    return (
      <div className="min-h-screen w-screen overflow-x-hidden bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-800/70 backdrop-blur-lg rounded-2xl p-8 border border-purple-500/30 shadow-2xl">
            <div className="text-center">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-3">
                NeuraPlay
              </h1>
              <p className="text-gray-300 text-lg mb-8">AI Game Analysis Coach</p>
              <LoginButton />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentAnalyses = analysisGameTab === "fifa" ? recentFifaAnalyses : recentLolAnalyses;

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white antialiased">
      {/* Header - Different for mobile vs desktop */}
      <header className="fixed top-0 left-0 right-0 bg-gray-800/95 backdrop-blur-lg border-b border-purple-500/20 shadow-lg z-50">
        
        {/* Mobile Header - Only shows on small screens */}
        <div className="sm:hidden w-full px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Mobile Menu Button and App Name */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600 transition-colors"
              >
                <div className="w-5 h-5 flex flex-col justify-between">
                  <div className={`h-0.5 bg-white transition-all ${isMobileMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`}></div>
                  <div className={`h-0.5 bg-white transition-all ${isMobileMenuOpen ? 'opacity-0' : ''}`}></div>
                  <div className={`h-0.5 bg-white transition-all ${isMobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`}></div>
                </div>
              </button>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  NeuraPlay
                </h1>
                <p className="text-gray-300 text-xs">Hi, {user.displayName?.split(' ')[0]}</p>
              </div>
            </div>

            {/* Mobile Logout Button */}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all duration-200 font-medium text-xs"
            >
              Logout
            </button>
          </div>

          {/* Mobile Menu Dropdown */}
          {isMobileMenuOpen && (
            <div className="absolute top-full left-0 right-0 bg-gray-800/95 backdrop-blur-lg border-b border-purple-500/20 shadow-xl">
              <div className="p-4 space-y-3">
                <button
                  onClick={() => handleTabChange("voice")}
                  className={`w-full text-left px-4 py-3 rounded-xl font-semibold transition-all duration-200 ${
                    activeTab === "voice"
                      ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
                      : "bg-gray-700/50 hover:bg-gray-700 text-gray-300"
                  }`}
                >
                  🎤 Voice Analysis
                </button>
                <button
                  onClick={() => handleTabChange("analyses")}
                  className={`w-full text-left px-4 py-3 rounded-xl font-semibold transition-all duration-200 ${
                    activeTab === "analyses"
                      ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
                      : "bg-gray-700/50 hover:bg-gray-700 text-gray-300"
                  }`}
                >
                  📊 Recent Analyses
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Desktop Header - Only shows on medium screens and up */}
        <div className="hidden sm:block w-full px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left: App Name and Welcome */}
            <div className="flex items-center gap-6">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                NeuraPlay Coach
              </h1>
              <p className="text-gray-300 text-lg">Welcome back, {user.displayName}</p>
            </div>

            {/* Center: Desktop Tabs */}
            <div className="flex-1 max-w-2xl mx-8">
              <div className="bg-gray-800/40 backdrop-blur-lg rounded-2xl p-2 border border-purple-500/20 shadow-xl">
                <div className="flex justify-center space-x-2">
                  <button
                    className={`flex-1 px-6 py-3 rounded-xl font-semibold text-lg transition-all duration-200 ${
                      activeTab === "voice"
                        ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
                        : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white"
                    }`}
                    onClick={() => setActiveTab("voice")}
                  >
                    🎤 Voice Analysis
                  </button>
                  <button
                    className={`flex-1 px-6 py-3 rounded-xl font-semibold text-lg transition-all duration-200 ${
                      activeTab === "analyses"
                        ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
                        : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white"
                    }`}
                    onClick={() => setActiveTab("analyses")}
                  >
                    📊 Recent Analyses
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Logout Button */}
            <button
              onClick={handleLogout}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-red-500/25 text-lg whitespace-nowrap"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="h-full w-full pt-16 sm:pt-24"> {/* Different padding for mobile vs desktop */}
        <div className="h-full w-full px-4 sm:px-8 py-4 sm:py-6 overflow-y-auto">
          
          {/* Mobile Tabs - Only show when menu is closed and on mobile */}
          {!isMobileMenuOpen && (
            <div className="sm:hidden w-full mb-6">
              <div className="bg-gray-800/40 backdrop-blur-lg rounded-2xl p-2 border border-purple-500/20 shadow-xl">
                <div className="flex justify-center space-x-2">
                  <button
                    className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
                      activeTab === "voice"
                        ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
                        : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white"
                    }`}
                    onClick={() => setActiveTab("voice")}
                  >
                    🎤 Voice
                  </button>
                  <button
                    className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
                      activeTab === "analyses"
                        ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
                        : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white"
                    }`}
                    onClick={() => setActiveTab("analyses")}
                  >
                    📊 Analyses
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content */}
          <div className="w-full">
            {activeTab === "voice" && (
              <VoiceAnalysisTab
                token={token}
                fifaAnalysis={fifaAnalysis}
                lolAnalysis={lolAnalysis}
                onNewAnalysis={handleNewAnalysis}
              />
            )}

            {activeTab === "analyses" && (
              <RecentAnalysesTab
                analysisGameTab={analysisGameTab}
                setAnalysisGameTab={setAnalysisGameTab}
                currentAnalyses={currentAnalyses}
                loadingAnalyses={loadingAnalyses}
                onRefresh={loadRecentAnalyses}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

// Voice Analysis Tab Component (same as before)
const VoiceAnalysisTab: React.FC<{
  token: string;
  fifaAnalysis: any;
  lolAnalysis: any;
  onNewAnalysis: (data: any, game: GameType) => void;
}> = ({ token, fifaAnalysis, lolAnalysis, onNewAnalysis }) => (
  <div className="w-full space-y-6 sm:space-y-8">
    <div className="text-center w-full">
      <h2 className="text-2xl sm:text-4xl font-bold mb-3 sm:mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
        Voice Analysis
      </h2>
      <p className="text-gray-300 text-base sm:text-xl max-w-3xl mx-auto leading-relaxed px-2">
        Speak your game stats to get real-time AI analysis with voice responses.
      </p>
    </div>

    {/* Connection status */}
    <div className="w-full flex justify-center">
      <div className="bg-blue-900/30 rounded-2xl p-3 sm:p-6 border border-blue-500/40 text-center backdrop-blur-sm w-full max-w-3xl">
        <div className="flex items-center justify-center gap-2 sm:gap-4">
          <div className="w-2 h-2 sm:w-4 sm:h-4 bg-green-500 rounded-full animate-pulse"></div>
          <span className="font-semibold text-xs sm:text-lg text-blue-200">Real-time connection active</span>
        </div>
      </div>
    </div>

    {/* Game panels - Stack on mobile, side-by-side on desktop */}
    <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-8">
      {/* FIFA panel */}
      <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-4 sm:p-8 border border-green-500/30 shadow-2xl w-full">
        <div className="text-center mb-4 sm:mb-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <span className="text-xl sm:text-2xl">🎮</span>
          </div>
          <h3 className="text-lg sm:text-2xl font-bold text-green-400 mb-2 sm:mb-3">FIFA Analysis</h3>
          <p className="text-gray-300 text-xs sm:text-lg">Analyze your FIFA/EA FC gameplay</p>
        </div>

        <VoiceInput
          userToken={token}
          initialGame="fifa"
          onAnalysis={(data) => onNewAnalysis(data, "fifa")}
        />

        {fifaAnalysis && (
          <div className="mt-4 sm:mt-6">
            <AnalysisDisplay analysis={fifaAnalysis} game="FIFA" />
          </div>
        )}
      </div>

      {/* LoL panel */}
      <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-4 sm:p-8 border border-blue-500/30 shadow-2xl w-full">
        <div className="text-center mb-4 sm:mb-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <span className="text-xl sm:text-2xl">⚔️</span>
          </div>
          <h3 className="text-lg sm:text-2xl font-bold text-blue-400 mb-2 sm:mb-3">LoL Analysis</h3>
          <p className="text-gray-300 text-xs sm:text-lg">Analyze your League matches</p>
        </div>

        <VoiceInput
          userToken={token}
          initialGame="lol"
          onAnalysis={(data) => onNewAnalysis(data, "lol")}
        />

        {lolAnalysis && (
          <div className="mt-4 sm:mt-6">
            <AnalysisDisplay analysis={lolAnalysis} game="LoL" />
          </div>
        )}
      </div>
    </div>
  </div>
);

// Recent Analyses Tab Component (same as before)
const RecentAnalysesTab: React.FC<{
  analysisGameTab: GameType;
  setAnalysisGameTab: (game: GameType) => void;
  currentAnalyses: AnalysisHistory[];
  loadingAnalyses: boolean;
  onRefresh: () => void;
}> = ({ analysisGameTab, setAnalysisGameTab, currentAnalyses, loadingAnalyses, onRefresh }) => (
  <div className="w-full space-y-6 sm:space-y-8">
    <div className="text-center w-full">
      <h2 className="text-2xl sm:text-4xl font-bold mb-3 sm:mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
        Recent Analyses
      </h2>
      <p className="text-gray-300 text-base sm:text-xl max-w-3xl mx-auto px-2">
        Review your previous game analyses
      </p>
    </div>

    {/* Game selection and refresh */}
    <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-6 bg-gray-800/40 backdrop-blur-lg rounded-2xl p-3 sm:p-6 border border-purple-500/20">
      <div className="w-full sm:w-auto">
        <div className="bg-gray-700/50 rounded-xl p-1 sm:p-2 w-full sm:w-auto">
          <div className="flex space-x-1 sm:space-x-2 justify-center sm:justify-start">
            <button
              className={`flex-1 sm:flex-none px-3 sm:px-8 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-lg transition-all duration-200 ${
                analysisGameTab === "fifa"
                  ? "bg-green-600 shadow-lg shadow-green-500/25 text-white"
                  : "text-gray-300 hover:bg-gray-600 hover:text-white"
              }`}
              onClick={() => setAnalysisGameTab("fifa")}
            >
              🎮 FIFA
            </button>
            <button
              className={`flex-1 sm:flex-none px-3 sm:px-8 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-lg transition-all duration-200 ${
                analysisGameTab === "lol"
                  ? "bg-blue-600 shadow-lg shadow-blue-500/25 text-white"
                  : "text-gray-300 hover:bg-gray-600 hover:text-white"
              }`}
              onClick={() => setAnalysisGameTab("lol")}
            >
              ⚔️ LoL
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={onRefresh}
        className="w-full sm:w-auto px-4 sm:px-8 py-2 sm:py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all duration-200 font-semibold text-sm sm:text-lg shadow-lg"
        disabled={loadingAnalyses}
      >
        {loadingAnalyses ? "🔄 Refreshing..." : "🔄 Refresh"}
      </button>
    </div>

    {loadingAnalyses ? (
      <div className="text-center py-8 sm:py-16">
        <div className="animate-spin rounded-full h-8 w-8 sm:h-16 sm:w-16 border-b-2 border-purple-500 mx-auto mb-3 sm:mb-4"></div>
        <p className="text-gray-400 text-sm sm:text-lg">Loading your analyses...</p>
      </div>
    ) : currentAnalyses.length === 0 ? (
      <div className="text-center py-8 sm:py-16 bg-gray-800/40 backdrop-blur-lg rounded-2xl border border-gray-600/30">
        <div className="text-4xl sm:text-8xl mb-4 sm:mb-6">📊</div>
        <h3 className="text-lg sm:text-2xl font-semibold text-gray-300 mb-2 sm:mb-4">No analyses found</h3>
        <p className="text-gray-400 text-sm sm:text-lg max-w-md mx-auto px-4">
          Use Voice Analysis to create your first {analysisGameTab.toUpperCase()} analysis!
        </p>
      </div>
    ) : (
      <div className="grid gap-3 sm:gap-6">
        {currentAnalyses.map((analysis) => (
          <AnalysisHistoryItem key={analysis.id} analysis={analysis} game={analysisGameTab} />
        ))}
      </div>
    )}
  </div>
);

// Analysis Display Component (same as before)
const AnalysisDisplay: React.FC<{ analysis: any; game: string }> = ({ analysis, game }) => {
  const summary = analysis.summary || analysis.explanation || "";
  const topTips = analysis.topTips || analysis.top_tips || [];
  const trainingDrills = analysis.trainingDrills || analysis.drills || [];
  const rating = analysis.rating;
  const confidence = analysis.confidence || analysis.estimated_score;
  const responseType = analysis.responseType || analysis.meta?.response_type || "detailed";

  return (
    <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-3 sm:p-6 border border-purple-500/40 shadow-2xl">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="font-bold text-base sm:text-xl text-white">Latest {game} Analysis</h3>
        {rating && (
          <div className="bg-purple-600 px-2 sm:px-4 py-1 sm:py-2 rounded-full text-xs sm:text-lg font-bold shadow-lg">
            {rating}/10
          </div>
        )}
      </div>

      <div className="space-y-2 sm:space-y-4">
        <p className="text-gray-200 text-sm sm:text-lg leading-relaxed">{summary}</p>

        {confidence && (
          <div className="flex items-center gap-1 sm:gap-3 text-sm sm:text-lg">
            <span className="text-gray-400">Confidence:</span>
            <span className="font-semibold text-green-400">{Math.round(confidence * 100)}%</span>
          </div>
        )}

        {topTips.length > 0 && (
          <div>
            <h4 className="font-semibold text-purple-300 text-sm sm:text-lg mb-1 sm:mb-3">🎯 Top Tips</h4>
            <ul className="space-y-1 sm:space-y-2">
              {topTips.map((tip: string, index: number) => (
                <li key={index} className="flex items-start gap-1 sm:gap-3 text-xs sm:text-base text-gray-200">
                  <span className="text-purple-400 mt-0.5 sm:mt-1 text-xs">•</span>
                  <span className="flex-1">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {trainingDrills.length > 0 && (
          <div>
            <h4 className="font-semibold text-blue-300 text-sm sm:text-lg mb-1 sm:mb-3">🏋️ Training Drills</h4>
            <ul className="space-y-1 sm:space-y-2">
              {trainingDrills.map((drill: string, index: number) => (
                <li key={index} className="flex items-start gap-1 sm:gap-3 text-xs sm:text-base text-gray-200">
                  <span className="text-blue-400 mt-0.5 sm:mt-1 text-xs">•</span>
                  <span className="flex-1">{drill}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-2 sm:pt-4 border-t border-gray-600/50">
          <span className="text-xs text-gray-400 capitalize">Response Type: {responseType}</span>
        </div>
      </div>
    </div>
  );
};

// Analysis History Item Component (same as before)
const AnalysisHistoryItem: React.FC<{ analysis: AnalysisHistory; game: GameType }> = ({ analysis, game }) => {
  const createdAt = new Date(analysis.created_at).toLocaleString();

  return (
    <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-3 sm:p-6 border border-gray-600/30 hover:border-purple-500/40 transition-all duration-300 shadow-xl hover:shadow-2xl">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-4 mb-2 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <div
            className={`p-2 sm:p-3 rounded-xl flex-shrink-0 ${
              game === "fifa" ? "bg-green-600/20 border border-green-500/30" : "bg-blue-600/20 border border-blue-500/30"
            }`}
          >
            <span className="text-lg sm:text-2xl">{game === "fifa" ? "🎮" : "⚔️"}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-base sm:text-xl text-white truncate">{game.toUpperCase()} Analysis</h4>
            {analysis.user_text && (
              <p className="text-gray-300 text-xs sm:text-lg mt-1 line-clamp-2 break-words">"{analysis.user_text}"</p>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400 bg-gray-600/50 px-2 sm:px-3 py-1 sm:py-2 rounded-lg flex-shrink-0 self-start sm:self-auto">
          {createdAt}
        </span>
      </div>

      <div className="space-y-2 sm:space-y-4">
        <p className="text-gray-200 text-xs sm:text-lg leading-relaxed break-words">{analysis.summary}</p>

        <div className="flex flex-wrap gap-2 sm:gap-6 text-xs sm:text-lg">
          {analysis.rating && (
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="text-gray-400">Rating:</span>
              <span className="font-bold text-yellow-400">{analysis.rating}/10</span>
            </div>
          )}
          {analysis.confidence && (
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="text-gray-400">Confidence:</span>
              <span className="font-bold text-green-400">{Math.round(analysis.confidence * 100)}%</span>
            </div>
          )}
        </div>

        {analysis.topTips && analysis.topTips.length > 0 && (
          <div>
            <h5 className="font-semibold text-purple-300 text-xs sm:text-lg mb-1 sm:mb-2">Key Tips</h5>
            <ul className="space-y-1 sm:space-y-2">
              {analysis.topTips.slice(0, 2).map((tip: string, index: number) => (
                <li key={index} className="flex items-start gap-1 sm:gap-3 text-xs sm:text-base text-gray-300 break-words">
                  <span className="text-purple-400 mt-0.5 sm:mt-1 flex-shrink-0">•</span>
                  <span className="flex-1">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-2 sm:pt-4 border-t border-gray-600/50">
          <span className="text-xs text-gray-400 capitalize">Analysis Type: {analysis.responseType}</span>
        </div>
      </div>
    </div>
  );
};

export default App;














// import React, { useEffect, useState } from "react";
// import LoginButton from "./components/LoginButton";
// import VoiceInput from "./components/VoiceInput";
// import { useAuthStore } from "./store/auth-store";
// import { auth } from "./firebase/firebaseClient";
// import { signOut, onAuthStateChanged } from "firebase/auth";
// import axios from "axios";

// const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// type TabType = "voice" | "analyses";
// type GameType = "fifa" | "lol";

// interface AnalysisHistory {
//   id: string;
//   user_id: string;
//   user_text: string;
//   created_at: string;
//   game: string;
//   summary: string;
//   topTips: string[];
//   trainingDrills: string[];
//   rating: number | null;
//   confidence: number | null;
//   responseType: string;
//   analysis?: any;
// }

// const App: React.FC = () => {
//   const { user, token, login, logout } = useAuthStore();
//   const [activeTab, setActiveTab] = useState<TabType>("voice");
//   const [analysisGameTab, setAnalysisGameTab] = useState<GameType>("fifa");
//   const [fifaAnalysis, setFifaAnalysis] = useState<any>(null);
//   const [lolAnalysis, setLolAnalysis] = useState<any>(null);
//   const [recentFifaAnalyses, setRecentFifaAnalyses] = useState<AnalysisHistory[]>([]);
//   const [recentLolAnalyses, setRecentLolAnalyses] = useState<AnalysisHistory[]>([]);
//   const [loadingAnalyses, setLoadingAnalyses] = useState(false);
//   const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

//   useEffect(() => {
//     const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
//       if (!firebaseUser) {
//         logout();
//         return;
//       }
//       const idToken = await firebaseUser.getIdToken();
//       login(firebaseUser, idToken);
//     });

//     return () => unsub();
//   }, [login, logout]);

//   useEffect(() => {
//     if (activeTab === "analyses" && token) {
//       loadRecentAnalyses();
//     }
//   }, [activeTab, analysisGameTab, token]);

//   const loadRecentAnalyses = async () => {
//     if (!token) return;

//     setLoadingAnalyses(true);
//     try {
//       const url = `${API_BASE}/api/analyses/recent/${analysisGameTab}/`;
//       const response = await axios.get(url, {
//         headers: { Authorization: `Bearer ${token}` },
//       });

//       if (analysisGameTab === "fifa") {
//         setRecentFifaAnalyses(response.data.analyses || []);
//       } else {
//         setRecentLolAnalyses(response.data.analyses || []);
//       }
//     } catch (error: any) {
//       console.error("❌ Failed to load recent analyses:", error);
//       if (analysisGameTab === "fifa") {
//         setRecentFifaAnalyses([]);
//       } else {
//         setRecentLolAnalyses([]);
//       }
//     } finally {
//       setLoadingAnalyses(false);
//     }
//   };

//   const handleLogout = async () => {
//     await signOut(auth);
//     logout();
//     setIsMobileMenuOpen(false);
//   };

//   const handleNewAnalysis = (data: any, game: GameType) => {
//     if (game === "fifa") {
//       setFifaAnalysis(data);
//     } else {
//       setLolAnalysis(data);
//     }
//     if (activeTab === "analyses") {
//       loadRecentAnalyses();
//     }
//   };

//   const handleTabChange = (tab: TabType) => {
//     setActiveTab(tab);
//     setIsMobileMenuOpen(false);
//   };

//   if (!token || !user) {
//     return (
//       <div className="min-h-screen w-screen overflow-x-hidden bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
//         <div className="w-full max-w-md">
//           <div className="bg-gray-800/70 backdrop-blur-lg rounded-2xl p-8 border border-purple-500/30 shadow-2xl">
//             <div className="text-center">
//               <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-3">
//                 NeuraPlay
//               </h1>
//               <p className="text-gray-300 text-lg mb-8">AI Game Analysis Coach</p>
//               <LoginButton />
//             </div>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   const currentAnalyses = analysisGameTab === "fifa" ? recentFifaAnalyses : recentLolAnalyses;

//   return (
//     <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white antialiased">
//       {/* Mobile Header */}
//       <header className="fixed top-0 left-0 right-0 bg-gray-800/95 backdrop-blur-lg border-b border-purple-500/20 shadow-lg z-50">
//         <div className="w-full px-4 py-3">
//           <div className="flex items-center justify-between">
//             {/* Mobile Menu Button and App Name */}
//             <div className="flex items-center gap-3">
//               <button
//                 onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
//                 className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600 transition-colors"
//               >
//                 <div className="w-5 h-5 flex flex-col justify-between">
//                   <div className={`h-0.5 bg-white transition-all ${isMobileMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`}></div>
//                   <div className={`h-0.5 bg-white transition-all ${isMobileMenuOpen ? 'opacity-0' : ''}`}></div>
//                   <div className={`h-0.5 bg-white transition-all ${isMobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`}></div>
//                 </div>
//               </button>
//               <div>
//                 <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//                   NeuraPlay
//                 </h1>
//                 <p className="text-gray-300 text-xs">Hi, {user.displayName?.split(' ')[0]}</p>
//               </div>
//             </div>

//             {/* Logout Button - Hidden on mobile, shown in menu */}
//             <button
//               onClick={handleLogout}
//               className="hidden sm:block px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all duration-200 font-medium text-sm"
//             >
//               Logout
//             </button>
//           </div>

//           {/* Mobile Menu Dropdown */}
//           {isMobileMenuOpen && (
//             <div className="absolute top-full left-0 right-0 bg-gray-800/95 backdrop-blur-lg border-b border-purple-500/20 shadow-xl">
//               <div className="p-4 space-y-3">
//                 <button
//                   onClick={() => handleTabChange("voice")}
//                   className={`w-full text-left px-4 py-3 rounded-xl font-semibold transition-all duration-200 ${
//                     activeTab === "voice"
//                       ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
//                       : "bg-gray-700/50 hover:bg-gray-700 text-gray-300"
//                   }`}
//                 >
//                   🎤 Voice Analysis
//                 </button>
//                 <button
//                   onClick={() => handleTabChange("analyses")}
//                   className={`w-full text-left px-4 py-3 rounded-xl font-semibold transition-all duration-200 ${
//                     activeTab === "analyses"
//                       ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
//                       : "bg-gray-700/50 hover:bg-gray-700 text-gray-300"
//                   }`}
//                 >
//                   📊 Recent Analyses
//                 </button>
//                 <button
//                   onClick={handleLogout}
//                   className="w-full text-left px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all duration-200 font-semibold"
//                 >
//                   🚪 Logout
//                 </button>
//               </div>
//             </div>
//           )}
//         </div>
//       </header>

//       {/* Desktop Tabs - Hidden on mobile */}
//       <div className="hidden sm:block fixed top-0 left-0 right-0 bg-gray-800/90 backdrop-blur-lg border-b border-purple-500/20 shadow-lg z-40 pt-16">
//         <div className="w-full px-6 py-4">
//           <div className="bg-gray-800/40 backdrop-blur-lg rounded-2xl p-2 border border-purple-500/20 shadow-xl w-full max-w-4xl mx-auto">
//             <div className="flex justify-center space-x-2">
//               <button
//                 className={`flex-1 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
//                   activeTab === "voice"
//                     ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
//                     : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white"
//                 }`}
//                 onClick={() => setActiveTab("voice")}
//               >
//                 🎤 Voice Analysis
//               </button>
//               <button
//                 className={`flex-1 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
//                   activeTab === "analyses"
//                     ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
//                     : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white"
//                 }`}
//                 onClick={() => setActiveTab("analyses")}
//               >
//                 📊 Recent Analyses
//               </button>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Main Content */}
//       <main className="h-full w-full pt-16 sm:pt-32"> {/* Adjust padding for mobile header + desktop tabs */}
//         <div className="h-full w-full px-4 sm:px-8 py-4 sm:py-6 overflow-y-auto">
          
//           {/* Mobile Tabs - Only show when menu is closed */}
//           {!isMobileMenuOpen && (
//             <div className="sm:hidden w-full mb-6">
//               <div className="bg-gray-800/40 backdrop-blur-lg rounded-2xl p-2 border border-purple-500/20 shadow-xl">
//                 <div className="flex justify-center space-x-2">
//                   <button
//                     className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
//                       activeTab === "voice"
//                         ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
//                         : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white"
//                     }`}
//                     onClick={() => setActiveTab("voice")}
//                   >
//                     🎤 Voice
//                   </button>
//                   <button
//                     className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
//                       activeTab === "analyses"
//                         ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
//                         : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white"
//                     }`}
//                     onClick={() => setActiveTab("analyses")}
//                   >
//                     📊 Analyses
//                   </button>
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* Tab Content */}
//           <div className="w-full">
//             {activeTab === "voice" && (
//               <VoiceAnalysisTab
//                 token={token}
//                 fifaAnalysis={fifaAnalysis}
//                 lolAnalysis={lolAnalysis}
//                 onNewAnalysis={handleNewAnalysis}
//               />
//             )}

//             {activeTab === "analyses" && (
//               <RecentAnalysesTab
//                 analysisGameTab={analysisGameTab}
//                 setAnalysisGameTab={setAnalysisGameTab}
//                 currentAnalyses={currentAnalyses}
//                 loadingAnalyses={loadingAnalyses}
//                 onRefresh={loadRecentAnalyses}
//               />
//             )}
//           </div>
//         </div>
//       </main>
//     </div>
//   );
// };

// // Voice Analysis Tab Component
// const VoiceAnalysisTab: React.FC<{
//   token: string;
//   fifaAnalysis: any;
//   lolAnalysis: any;
//   onNewAnalysis: (data: any, game: GameType) => void;
// }> = ({ token, fifaAnalysis, lolAnalysis, onNewAnalysis }) => (
//   <div className="w-full space-y-6 sm:space-y-8">
//     <div className="text-center w-full">
//       <h2 className="text-2xl sm:text-4xl font-bold mb-3 sm:mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//         Voice Analysis
//       </h2>
//       <p className="text-gray-300 text-base sm:text-xl max-w-3xl mx-auto leading-relaxed px-2">
//         Speak your game stats to get real-time AI analysis with voice responses.
//       </p>
//     </div>

//     {/* Connection status */}
//     <div className="w-full flex justify-center">
//       <div className="bg-blue-900/30 rounded-2xl p-3 sm:p-6 border border-blue-500/40 text-center backdrop-blur-sm w-full max-w-3xl">
//         <div className="flex items-center justify-center gap-2 sm:gap-4">
//           <div className="w-2 h-2 sm:w-4 sm:h-4 bg-green-500 rounded-full animate-pulse"></div>
//           <span className="font-semibold text-xs sm:text-lg text-blue-200">Real-time connection active</span>
//         </div>
//       </div>
//     </div>

//     {/* Game panels - Stack on mobile, side-by-side on desktop */}
//     <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-8">
//       {/* FIFA panel */}
//       <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-4 sm:p-8 border border-green-500/30 shadow-2xl w-full">
//         <div className="text-center mb-4 sm:mb-6">
//           <div className="w-12 h-12 sm:w-16 sm:h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
//             <span className="text-xl sm:text-2xl">🎮</span>
//           </div>
//           <h3 className="text-lg sm:text-2xl font-bold text-green-400 mb-2 sm:mb-3">FIFA Analysis</h3>
//           <p className="text-gray-300 text-xs sm:text-lg">Analyze your FIFA/EA FC gameplay</p>
//         </div>

//         <VoiceInput
//           userToken={token}
//           initialGame="fifa"
//           onAnalysis={(data) => onNewAnalysis(data, "fifa")}
//         />

//         {fifaAnalysis && (
//           <div className="mt-4 sm:mt-6">
//             <AnalysisDisplay analysis={fifaAnalysis} game="FIFA" />
//           </div>
//         )}
//       </div>

//       {/* LoL panel */}
//       <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-4 sm:p-8 border border-blue-500/30 shadow-2xl w-full">
//         <div className="text-center mb-4 sm:mb-6">
//           <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
//             <span className="text-xl sm:text-2xl">⚔️</span>
//           </div>
//           <h3 className="text-lg sm:text-2xl font-bold text-blue-400 mb-2 sm:mb-3">LoL Analysis</h3>
//           <p className="text-gray-300 text-xs sm:text-lg">Analyze your League matches</p>
//         </div>

//         <VoiceInput
//           userToken={token}
//           initialGame="lol"
//           onAnalysis={(data) => onNewAnalysis(data, "lol")}
//         />

//         {lolAnalysis && (
//           <div className="mt-4 sm:mt-6">
//             <AnalysisDisplay analysis={lolAnalysis} game="LoL" />
//           </div>
//         )}
//       </div>
//     </div>
//   </div>
// );

// // Recent Analyses Tab Component
// const RecentAnalysesTab: React.FC<{
//   analysisGameTab: GameType;
//   setAnalysisGameTab: (game: GameType) => void;
//   currentAnalyses: AnalysisHistory[];
//   loadingAnalyses: boolean;
//   onRefresh: () => void;
// }> = ({ analysisGameTab, setAnalysisGameTab, currentAnalyses, loadingAnalyses, onRefresh }) => (
//   <div className="w-full space-y-6 sm:space-y-8">
//     <div className="text-center w-full">
//       <h2 className="text-2xl sm:text-4xl font-bold mb-3 sm:mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//         Recent Analyses
//       </h2>
//       <p className="text-gray-300 text-base sm:text-xl max-w-3xl mx-auto px-2">
//         Review your previous game analyses
//       </p>
//     </div>

//     {/* Game selection and refresh */}
//     <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-6 bg-gray-800/40 backdrop-blur-lg rounded-2xl p-3 sm:p-6 border border-purple-500/20">
//       <div className="w-full sm:w-auto">
//         <div className="bg-gray-700/50 rounded-xl p-1 sm:p-2 w-full sm:w-auto">
//           <div className="flex space-x-1 sm:space-x-2 justify-center sm:justify-start">
//             <button
//               className={`flex-1 sm:flex-none px-3 sm:px-8 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-lg transition-all duration-200 ${
//                 analysisGameTab === "fifa"
//                   ? "bg-green-600 shadow-lg shadow-green-500/25 text-white"
//                   : "text-gray-300 hover:bg-gray-600 hover:text-white"
//               }`}
//               onClick={() => setAnalysisGameTab("fifa")}
//             >
//               🎮 FIFA
//             </button>
//             <button
//               className={`flex-1 sm:flex-none px-3 sm:px-8 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-lg transition-all duration-200 ${
//                 analysisGameTab === "lol"
//                   ? "bg-blue-600 shadow-lg shadow-blue-500/25 text-white"
//                   : "text-gray-300 hover:bg-gray-600 hover:text-white"
//               }`}
//               onClick={() => setAnalysisGameTab("lol")}
//             >
//               ⚔️ LoL
//             </button>
//           </div>
//         </div>
//       </div>

//       <button
//         onClick={onRefresh}
//         className="w-full sm:w-auto px-4 sm:px-8 py-2 sm:py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all duration-200 font-semibold text-sm sm:text-lg shadow-lg"
//         disabled={loadingAnalyses}
//       >
//         {loadingAnalyses ? "🔄 Refreshing..." : "🔄 Refresh"}
//       </button>
//     </div>

//     {loadingAnalyses ? (
//       <div className="text-center py-8 sm:py-16">
//         <div className="animate-spin rounded-full h-8 w-8 sm:h-16 sm:w-16 border-b-2 border-purple-500 mx-auto mb-3 sm:mb-4"></div>
//         <p className="text-gray-400 text-sm sm:text-lg">Loading your analyses...</p>
//       </div>
//     ) : currentAnalyses.length === 0 ? (
//       <div className="text-center py-8 sm:py-16 bg-gray-800/40 backdrop-blur-lg rounded-2xl border border-gray-600/30">
//         <div className="text-4xl sm:text-8xl mb-4 sm:mb-6">📊</div>
//         <h3 className="text-lg sm:text-2xl font-semibold text-gray-300 mb-2 sm:mb-4">No analyses found</h3>
//         <p className="text-gray-400 text-sm sm:text-lg max-w-md mx-auto px-4">
//           Use Voice Analysis to create your first {analysisGameTab.toUpperCase()} analysis!
//         </p>
//       </div>
//     ) : (
//       <div className="grid gap-3 sm:gap-6">
//         {currentAnalyses.map((analysis) => (
//           <AnalysisHistoryItem key={analysis.id} analysis={analysis} game={analysisGameTab} />
//         ))}
//       </div>
//     )}
//   </div>
// );

// // Analysis Display Component
// const AnalysisDisplay: React.FC<{ analysis: any; game: string }> = ({ analysis, game }) => {
//   const summary = analysis.summary || analysis.explanation || "";
//   const topTips = analysis.topTips || analysis.top_tips || [];
//   const trainingDrills = analysis.trainingDrills || analysis.drills || [];
//   const rating = analysis.rating;
//   const confidence = analysis.confidence || analysis.estimated_score;
//   const responseType = analysis.responseType || analysis.meta?.response_type || "detailed";

//   return (
//     <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-3 sm:p-6 border border-purple-500/40 shadow-2xl">
//       <div className="flex items-center justify-between mb-3 sm:mb-4">
//         <h3 className="font-bold text-base sm:text-xl text-white">Latest {game} Analysis</h3>
//         {rating && (
//           <div className="bg-purple-600 px-2 sm:px-4 py-1 sm:py-2 rounded-full text-xs sm:text-lg font-bold shadow-lg">
//             {rating}/10
//           </div>
//         )}
//       </div>

//       <div className="space-y-2 sm:space-y-4">
//         <p className="text-gray-200 text-sm sm:text-lg leading-relaxed">{summary}</p>

//         {confidence && (
//           <div className="flex items-center gap-1 sm:gap-3 text-sm sm:text-lg">
//             <span className="text-gray-400">Confidence:</span>
//             <span className="font-semibold text-green-400">{Math.round(confidence * 100)}%</span>
//           </div>
//         )}

//         {topTips.length > 0 && (
//           <div>
//             <h4 className="font-semibold text-purple-300 text-sm sm:text-lg mb-1 sm:mb-3">🎯 Top Tips</h4>
//             <ul className="space-y-1 sm:space-y-2">
//               {topTips.map((tip: string, index: number) => (
//                 <li key={index} className="flex items-start gap-1 sm:gap-3 text-xs sm:text-base text-gray-200">
//                   <span className="text-purple-400 mt-0.5 sm:mt-1 text-xs">•</span>
//                   <span className="flex-1">{tip}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         {trainingDrills.length > 0 && (
//           <div>
//             <h4 className="font-semibold text-blue-300 text-sm sm:text-lg mb-1 sm:mb-3">🏋️ Training Drills</h4>
//             <ul className="space-y-1 sm:space-y-2">
//               {trainingDrills.map((drill: string, index: number) => (
//                 <li key={index} className="flex items-start gap-1 sm:gap-3 text-xs sm:text-base text-gray-200">
//                   <span className="text-blue-400 mt-0.5 sm:mt-1 text-xs">•</span>
//                   <span className="flex-1">{drill}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         <div className="pt-2 sm:pt-4 border-t border-gray-600/50">
//           <span className="text-xs text-gray-400 capitalize">Response Type: {responseType}</span>
//         </div>
//       </div>
//     </div>
//   );
// };

// // Analysis History Item Component
// const AnalysisHistoryItem: React.FC<{ analysis: AnalysisHistory; game: GameType }> = ({ analysis, game }) => {
//   const createdAt = new Date(analysis.created_at).toLocaleString();

//   return (
//     <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-3 sm:p-6 border border-gray-600/30 hover:border-purple-500/40 transition-all duration-300 shadow-xl hover:shadow-2xl">
//       <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-4 mb-2 sm:mb-4">
//         <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
//           <div
//             className={`p-2 sm:p-3 rounded-xl flex-shrink-0 ${
//               game === "fifa" ? "bg-green-600/20 border border-green-500/30" : "bg-blue-600/20 border border-blue-500/30"
//             }`}
//           >
//             <span className="text-lg sm:text-2xl">{game === "fifa" ? "🎮" : "⚔️"}</span>
//           </div>
//           <div className="flex-1 min-w-0">
//             <h4 className="font-bold text-base sm:text-xl text-white truncate">{game.toUpperCase()} Analysis</h4>
//             {analysis.user_text && (
//               <p className="text-gray-300 text-xs sm:text-lg mt-1 line-clamp-2 break-words">"{analysis.user_text}"</p>
//             )}
//           </div>
//         </div>
//         <span className="text-xs text-gray-400 bg-gray-600/50 px-2 sm:px-3 py-1 sm:py-2 rounded-lg flex-shrink-0 self-start sm:self-auto">
//           {createdAt}
//         </span>
//       </div>

//       <div className="space-y-2 sm:space-y-4">
//         <p className="text-gray-200 text-xs sm:text-lg leading-relaxed break-words">{analysis.summary}</p>

//         <div className="flex flex-wrap gap-2 sm:gap-6 text-xs sm:text-lg">
//           {analysis.rating && (
//             <div className="flex items-center gap-1 sm:gap-2">
//               <span className="text-gray-400">Rating:</span>
//               <span className="font-bold text-yellow-400">{analysis.rating}/10</span>
//             </div>
//           )}
//           {analysis.confidence && (
//             <div className="flex items-center gap-1 sm:gap-2">
//               <span className="text-gray-400">Confidence:</span>
//               <span className="font-bold text-green-400">{Math.round(analysis.confidence * 100)}%</span>
//             </div>
//           )}
//         </div>

//         {analysis.topTips && analysis.topTips.length > 0 && (
//           <div>
//             <h5 className="font-semibold text-purple-300 text-xs sm:text-lg mb-1 sm:mb-2">Key Tips</h5>
//             <ul className="space-y-1 sm:space-y-2">
//               {analysis.topTips.slice(0, 2).map((tip: string, index: number) => (
//                 <li key={index} className="flex items-start gap-1 sm:gap-3 text-xs sm:text-base text-gray-300 break-words">
//                   <span className="text-purple-400 mt-0.5 sm:mt-1 flex-shrink-0">•</span>
//                   <span className="flex-1">{tip}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         <div className="pt-2 sm:pt-4 border-t border-gray-600/50">
//           <span className="text-xs text-gray-400 capitalize">Analysis Type: {analysis.responseType}</span>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default App;


















// import React, { useEffect, useState } from "react";
// import LoginButton from "./components/LoginButton";
// import VoiceInput from "./components/VoiceInput";
// import { useAuthStore } from "./store/auth-store";
// import { auth } from "./firebase/firebaseClient";
// import { signOut, onAuthStateChanged } from "firebase/auth";
// import axios from "axios";

// const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// type TabType = "voice" | "analyses";
// type GameType = "fifa" | "lol";

// interface AnalysisHistory {
//   id: string;
//   user_id: string;
//   user_text: string;
//   created_at: string;
//   game: string;
//   summary: string;
//   topTips: string[];
//   trainingDrills: string[];
//   rating: number | null;
//   confidence: number | null;
//   responseType: string;
//   analysis?: any;
// }

// const App: React.FC = () => {
//   const { user, token, login, logout } = useAuthStore();
//   const [activeTab, setActiveTab] = useState<TabType>("voice");
//   const [analysisGameTab, setAnalysisGameTab] = useState<GameType>("fifa");
//   const [fifaAnalysis, setFifaAnalysis] = useState<any>(null);
//   const [lolAnalysis, setLolAnalysis] = useState<any>(null);
//   const [recentFifaAnalyses, setRecentFifaAnalyses] = useState<AnalysisHistory[]>([]);
//   const [recentLolAnalyses, setRecentLolAnalyses] = useState<AnalysisHistory[]>([]);
//   const [loadingAnalyses, setLoadingAnalyses] = useState(false);

//   useEffect(() => {
//     const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
//       if (!firebaseUser) {
//         logout();
//         return;
//       }
//       const idToken = await firebaseUser.getIdToken();
//       login(firebaseUser, idToken);
//     });

//     return () => unsub();
//   }, [login, logout]);

//   useEffect(() => {
//     if (activeTab === "analyses" && token) {
//       loadRecentAnalyses();
//     }
//   }, [activeTab, analysisGameTab, token]);

//   const loadRecentAnalyses = async () => {
//     if (!token) {
//       console.log("❌ No token available");
//       return;
//     }

//     setLoadingAnalyses(true);
//     try {
//       const url = `${API_BASE}/api/analyses/recent/${analysisGameTab}/`;
//       console.log("🔍 Making request to:", url);

//       const response = await axios.get(url, {
//         headers: {
//           Authorization: `Bearer ${token}`,
//         },
//       });

//       if (analysisGameTab === "fifa") {
//         setRecentFifaAnalyses(response.data.analyses || []);
//       } else {
//         setRecentLolAnalyses(response.data.analyses || []);
//       }
//     } catch (error: any) {
//       console.error("❌ Failed to load recent analyses:", error);
//       if (analysisGameTab === "fifa") {
//         setRecentFifaAnalyses([]);
//       } else {
//         setRecentLolAnalyses([]);
//       }
//     } finally {
//       setLoadingAnalyses(false);
//     }
//   };

//   const handleLogout = async () => {
//     await signOut(auth);
//     logout();
//   };

//   const handleNewAnalysis = (data: any, game: GameType) => {
//     if (game === "fifa") {
//       setFifaAnalysis(data);
//     } else {
//       setLolAnalysis(data);
//     }
//     if (activeTab === "analyses") {
//       loadRecentAnalyses();
//     }
//   };

//   if (!token || !user) {
//     return (
//       <div className="min-h-screen w-screen overflow-x-hidden bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
//         <div className="w-full max-w-md">
//           <div className="bg-gray-800/70 backdrop-blur-lg rounded-2xl p-8 border border-purple-500/30 shadow-2xl">
//             <div className="text-center">
//               <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-3">
//                 NeuraPlay
//               </h1>
//               <p className="text-gray-300 text-lg mb-8">AI Game Analysis Coach</p>
//               <LoginButton />
//             </div>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   const currentAnalyses = analysisGameTab === "fifa" ? recentFifaAnalyses : recentLolAnalyses;

//   return (
//     <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white antialiased">
//       {/* Header - Fixed at top */}
//       <header className="fixed top-0 left-0 right-0 bg-gray-800/90 backdrop-blur-lg border-b border-purple-500/20 shadow-lg z-50">
//         <div className="w-full px-4 sm:px-6 py-4">
//           <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
//             <div className="text-center sm:text-left">
//               <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//                 NeuraPlay Coach
//               </h1>
//               <p className="text-gray-300 text-sm sm:text-base">Welcome back, {user.displayName}</p>
//             </div>
//             <button
//               onClick={handleLogout}
//               className="px-4 sm:px-6 py-2 sm:py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-red-500/25 text-sm sm:text-base whitespace-nowrap"
//             >
//               Logout
//             </button>
//           </div>
//         </div>
//       </header>

//       {/* Main content area - Scrollable below fixed header */}
//       <main className="h-full w-full pt-20"> {/* pt-20 to account for header height */}
//         <div className="h-full w-full px-4 md:px-8 py-6 overflow-y-auto">
//           {/* Tabs */}
//           <div className="w-full mb-8">
//             <div className="bg-gray-800/40 backdrop-blur-lg rounded-2xl p-2 border border-purple-500/20 shadow-xl w-full max-w-4xl mx-auto">
//               <div className="flex justify-center space-x-2">
//                 <button
//                   className={`flex-1 px-4 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-sm sm:text-lg transition-all duration-200 ${
//                     activeTab === "voice"
//                       ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
//                       : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white"
//                   }`}
//                   onClick={() => setActiveTab("voice")}
//                 >
//                   🎤 Voice Analysis
//                 </button>
//                 <button
//                   className={`flex-1 px-4 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-sm sm:text-lg transition-all duration-200 ${
//                     activeTab === "analyses"
//                       ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
//                       : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white"
//                   }`}
//                   onClick={() => setActiveTab("analyses")}
//                 >
//                   📊 Recent Analyses
//                 </button>
//               </div>
//             </div>
//           </div>

//           {/* Tab content */}
//           <div className="w-full">
//             {/* Voice tab */}
//             {activeTab === "voice" && (
//               <VoiceAnalysisTab
//                 token={token}
//                 fifaAnalysis={fifaAnalysis}
//                 lolAnalysis={lolAnalysis}
//                 onNewAnalysis={handleNewAnalysis}
//               />
//             )}

//             {/* Recent analyses tab */}
//             {activeTab === "analyses" && (
//               <RecentAnalysesTab
//                 analysisGameTab={analysisGameTab}
//                 setAnalysisGameTab={setAnalysisGameTab}
//                 currentAnalyses={currentAnalyses}
//                 loadingAnalyses={loadingAnalyses}
//                 onRefresh={loadRecentAnalyses}
//               />
//             )}
//           </div>
//         </div>
//       </main>
//     </div>
//   );
// };

// // Voice Analysis Tab Component
// const VoiceAnalysisTab: React.FC<{
//   token: string;
//   fifaAnalysis: any;
//   lolAnalysis: any;
//   onNewAnalysis: (data: any, game: GameType) => void;
// }> = ({ token, fifaAnalysis, lolAnalysis, onNewAnalysis }) => (
//   <div className="w-full space-y-8">
//     <div className="text-center w-full">
//       <h2 className="text-3xl sm:text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//         Voice Analysis
//       </h2>
//       <p className="text-gray-300 text-lg sm:text-xl max-w-3xl mx-auto leading-relaxed">
//         Speak your game stats to get real-time AI analysis with voice responses.
//       </p>
//     </div>

//     {/* Connection status */}
//     <div className="w-full flex justify-center">
//       <div className="bg-blue-900/30 rounded-2xl p-4 sm:p-6 border border-blue-500/40 text-center backdrop-blur-sm w-full max-w-3xl">
//         <div className="flex items-center justify-center gap-3 sm:gap-4">
//           <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded-full animate-pulse"></div>
//           <span className="font-semibold text-sm sm:text-lg text-blue-200">Real-time WebSocket connection active</span>
//         </div>
//       </div>
//     </div>

//     {/* Two-column panels (FIFA & LoL) — full width */}
//     <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-6 sm:gap-8">
//       {/* FIFA panel */}
//       <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-green-500/30 shadow-2xl w-full">
//         <div className="text-center mb-6">
//           <div className="w-14 h-14 sm:w-16 sm:h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
//             <span className="text-2xl">🎮</span>
//           </div>
//           <h3 className="text-xl sm:text-2xl font-bold text-green-400 mb-3">FIFA Analysis</h3>
//           <p className="text-gray-300 text-sm sm:text-lg">Analyze your FIFA/EA FC gameplay and tactics</p>
//         </div>

//         <VoiceInput
//           userToken={token}
//           initialGame="fifa"
//           onAnalysis={(data) => onNewAnalysis(data, "fifa")}
//         />

//         {fifaAnalysis && (
//           <div className="mt-6">
//             <AnalysisDisplay analysis={fifaAnalysis} game="FIFA" />
//           </div>
//         )}
//       </div>

//       {/* LoL panel */}
//       <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-blue-500/30 shadow-2xl w-full">
//         <div className="text-center mb-6">
//           <div className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
//             <span className="text-2xl">⚔️</span>
//           </div>
//           <h3 className="text-xl sm:text-2xl font-bold text-blue-400 mb-3">LoL Analysis</h3>
//           <p className="text-gray-300 text-sm sm:text-lg">Analyze your League of Legends matches and strategy</p>
//         </div>

//         <VoiceInput
//           userToken={token}
//           initialGame="lol"
//           onAnalysis={(data) => onNewAnalysis(data, "lol")}
//         />

//         {lolAnalysis && (
//           <div className="mt-6">
//             <AnalysisDisplay analysis={lolAnalysis} game="LoL" />
//           </div>
//         )}
//       </div>
//     </div>
//   </div>
// );

// // Recent Analyses Tab Component
// const RecentAnalysesTab: React.FC<{
//   analysisGameTab: GameType;
//   setAnalysisGameTab: (game: GameType) => void;
//   currentAnalyses: AnalysisHistory[];
//   loadingAnalyses: boolean;
//   onRefresh: () => void;
// }> = ({ analysisGameTab, setAnalysisGameTab, currentAnalyses, loadingAnalyses, onRefresh }) => (
//   <div className="w-full space-y-8">
//     <div className="text-center w-full">
//       <h2 className="text-3xl sm:text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//         Recent Analyses
//       </h2>
//       <p className="text-gray-300 text-lg sm:text-xl max-w-3xl mx-auto">
//         Review your previous game analyses and track your improvement journey
//       </p>
//     </div>

//     <div className="flex flex-col lg:flex-row justify-between items-center gap-4 sm:gap-6 bg-gray-800/40 backdrop-blur-lg rounded-2xl p-4 sm:p-6 border border-purple-500/20">
//       <div className="bg-gray-700/50 rounded-xl p-2">
//         <div className="flex space-x-2">
//           <button
//             className={`px-4 sm:px-8 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-lg transition-all duration-200 ${
//               analysisGameTab === "fifa"
//                 ? "bg-green-600 shadow-lg shadow-green-500/25 text-white"
//                 : "text-gray-300 hover:bg-gray-600 hover:text-white"
//             }`}
//             onClick={() => setAnalysisGameTab("fifa")}
//           >
//             🎮 FIFA
//           </button>
//           <button
//             className={`px-4 sm:px-8 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-lg transition-all duration-200 ${
//               analysisGameTab === "lol"
//                 ? "bg-blue-600 shadow-lg shadow-blue-500/25 text-white"
//                 : "text-gray-300 hover:bg-gray-600 hover:text-white"
//             }`}
//             onClick={() => setAnalysisGameTab("lol")}
//           >
//             ⚔️ LoL
//           </button>
//         </div>
//       </div>

//       <button
//         onClick={onRefresh}
//         className="px-4 sm:px-8 py-2 sm:py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all duration-200 font-semibold text-sm sm:text-lg shadow-lg w-full lg:w-auto"
//         disabled={loadingAnalyses}
//       >
//         {loadingAnalyses ? "🔄 Refreshing..." : "🔄 Refresh Analyses"}
//       </button>
//     </div>

//     {loadingAnalyses ? (
//       <div className="text-center py-12 sm:py-16">
//         <div className="animate-spin rounded-full h-12 w-12 sm:h-16 sm:w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
//         <p className="text-gray-400 text-lg">Loading your analyses...</p>
//       </div>
//     ) : currentAnalyses.length === 0 ? (
//       <div className="text-center py-12 sm:py-16 bg-gray-800/40 backdrop-blur-lg rounded-2xl border border-gray-600/30">
//         <div className="text-6xl sm:text-8xl mb-6">📊</div>
//         <h3 className="text-xl sm:text-2xl font-semibold text-gray-300 mb-4">No analyses found</h3>
//         <p className="text-gray-400 text-base sm:text-lg max-w-md mx-auto">
//           Use the Voice Analysis tab to create your first {analysisGameTab.toUpperCase()} analysis!
//         </p>
//       </div>
//     ) : (
//       <div className="grid gap-4 sm:gap-6">
//         {currentAnalyses.map((analysis) => (
//           <AnalysisHistoryItem key={analysis.id} analysis={analysis} game={analysisGameTab} />
//         ))}
//       </div>
//     )}
//   </div>
// );

// const AnalysisDisplay: React.FC<{ analysis: any; game: string }> = ({ analysis, game }) => {
//   const summary = analysis.summary || analysis.explanation || "";
//   const topTips = analysis.topTips || analysis.top_tips || [];
//   const trainingDrills = analysis.trainingDrills || analysis.drills || [];
//   const rating = analysis.rating;
//   const confidence = analysis.confidence || analysis.estimated_score;
//   const responseType = analysis.responseType || analysis.meta?.response_type || "detailed";

//   return (
//     <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-4 sm:p-6 border border-purple-500/40 shadow-2xl">
//       <div className="flex items-center justify-between mb-4">
//         <h3 className="font-bold text-lg sm:text-xl text-white">Latest {game} Analysis</h3>
//         {rating && (
//           <div className="bg-purple-600 px-3 sm:px-4 py-1 sm:py-2 rounded-full text-sm sm:text-lg font-bold shadow-lg">
//             {rating}/10
//           </div>
//         )}
//       </div>

//       <div className="space-y-3 sm:space-y-4">
//         <p className="text-gray-200 text-base sm:text-lg leading-relaxed">{summary}</p>

//         {confidence && (
//           <div className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg">
//             <span className="text-gray-400">Confidence:</span>
//             <span className="font-semibold text-green-400">{Math.round(confidence * 100)}%</span>
//           </div>
//         )}

//         {topTips.length > 0 && (
//           <div>
//             <h4 className="font-semibold text-purple-300 text-base sm:text-lg mb-2 sm:mb-3">🎯 Top Tips</h4>
//             <ul className="space-y-1 sm:space-y-2">
//               {topTips.map((tip: string, index: number) => (
//                 <li key={index} className="flex items-start gap-2 sm:gap-3 text-sm sm:text-base text-gray-200">
//                   <span className="text-purple-400 mt-1">•</span>
//                   <span>{tip}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         {trainingDrills.length > 0 && (
//           <div>
//             <h4 className="font-semibold text-blue-300 text-base sm:text-lg mb-2 sm:mb-3">🏋️ Training Drills</h4>
//             <ul className="space-y-1 sm:space-y-2">
//               {trainingDrills.map((drill: string, index: number) => (
//                 <li key={index} className="flex items-start gap-2 sm:gap-3 text-sm sm:text-base text-gray-200">
//                   <span className="text-blue-400 mt-1">•</span>
//                   <span>{drill}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         <div className="pt-3 sm:pt-4 border-t border-gray-600/50">
//           <span className="text-xs sm:text-sm text-gray-400 capitalize">Response Type: {responseType}</span>
//         </div>
//       </div>
//     </div>
//   );
// };

// const AnalysisHistoryItem: React.FC<{ analysis: AnalysisHistory; game: GameType }> = ({ analysis, game }) => {
//   const createdAt = new Date(analysis.created_at).toLocaleString();

//   return (
//     <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-4 sm:p-6 border border-gray-600/30 hover:border-purple-500/40 transition-all duration-300 shadow-xl hover:shadow-2xl">
//       <div className="flex flex-col lg:flex-row justify-between items-start gap-3 sm:gap-4 mb-3 sm:mb-4">
//         <div className="flex items-center gap-3 sm:gap-4">
//           <div
//             className={`p-2 sm:p-3 rounded-xl ${
//               game === "fifa" ? "bg-green-600/20 border border-green-500/30" : "bg-blue-600/20 border border-blue-500/30"
//             }`}
//           >
//             <span className="text-xl sm:text-2xl">{game === "fifa" ? "🎮" : "⚔️"}</span>
//           </div>
//           <div>
//             <h4 className="font-bold text-lg sm:text-xl text-white">{game.toUpperCase()} Analysis</h4>
//             {analysis.user_text && (
//               <p className="text-gray-300 text-sm sm:text-lg mt-1 sm:mt-2 line-clamp-2">"{analysis.user_text}"</p>
//             )}
//           </div>
//         </div>
//         <span className="text-xs text-gray-400 bg-gray-600/50 px-2 sm:px-3 py-1 sm:py-2 rounded-lg">{createdAt}</span>
//       </div>

//       <div className="space-y-3 sm:space-y-4">
//         <p className="text-gray-200 text-sm sm:text-lg leading-relaxed">{analysis.summary}</p>

//         <div className="flex flex-wrap gap-4 sm:gap-6 text-sm sm:text-lg">
//           {analysis.rating && (
//             <div className="flex items-center gap-1 sm:gap-2">
//               <span className="text-gray-400">Rating:</span>
//               <span className="font-bold text-yellow-400">{analysis.rating}/10</span>
//             </div>
//           )}
//           {analysis.confidence && (
//             <div className="flex items-center gap-1 sm:gap-2">
//               <span className="text-gray-400">Confidence:</span>
//               <span className="font-bold text-green-400">{Math.round(analysis.confidence * 100)}%</span>
//             </div>
//           )}
//         </div>

//         {analysis.topTips && analysis.topTips.length > 0 && (
//           <div>
//             <h5 className="font-semibold text-purple-300 text-sm sm:text-lg mb-1 sm:mb-2">Key Tips</h5>
//             <ul className="space-y-1 sm:space-y-2">
//               {analysis.topTips.slice(0, 2).map((tip: string, index: number) => (
//                 <li key={index} className="flex items-start gap-2 sm:gap-3 text-xs sm:text-base text-gray-300">
//                   <span className="text-purple-400 mt-1">•</span>
//                   <span>{tip}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         <div className="pt-3 sm:pt-4 border-t border-gray-600/50">
//           <span className="text-xs text-gray-400 capitalize">Analysis Type: {analysis.responseType}</span>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default App;
