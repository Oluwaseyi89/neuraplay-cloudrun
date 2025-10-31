// App.tsx
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
    if (!token) {
      console.log("❌ No token available");
      return;
    }

    setLoadingAnalyses(true);
    try {
      const url = `${API_BASE}/api/analyses/recent/${analysisGameTab}/`;
      console.log("🔍 Making request to:", url);

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
      {/* Header - Fixed at top */}
      <header className="fixed top-0 left-0 right-0 bg-gray-800/90 backdrop-blur-lg border-b border-purple-500/20 shadow-lg z-50">
        <div className="w-full px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
            <div className="text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                NeuraPlay Coach
              </h1>
              <p className="text-gray-300 text-sm sm:text-base">Welcome back, {user.displayName}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-red-500/25 text-sm sm:text-base whitespace-nowrap"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main content area - Scrollable below fixed header */}
      <main className="h-full w-full pt-20"> {/* pt-20 to account for header height */}
        <div className="h-full w-full px-4 md:px-8 py-6 overflow-y-auto">
          {/* Tabs */}
          <div className="w-full mb-8">
            <div className="bg-gray-800/40 backdrop-blur-lg rounded-2xl p-2 border border-purple-500/20 shadow-xl w-full max-w-4xl mx-auto">
              <div className="flex justify-center space-x-2">
                <button
                  className={`flex-1 px-4 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-sm sm:text-lg transition-all duration-200 ${
                    activeTab === "voice"
                      ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
                      : "bg-gray-700/50 hover:bg-gray-700 text-gray-300 hover:text-white"
                  }`}
                  onClick={() => setActiveTab("voice")}
                >
                  🎤 Voice Analysis
                </button>
                <button
                  className={`flex-1 px-4 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-sm sm:text-lg transition-all duration-200 ${
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

          {/* Tab content */}
          <div className="w-full">
            {/* Voice tab */}
            {activeTab === "voice" && (
              <VoiceAnalysisTab
                token={token}
                fifaAnalysis={fifaAnalysis}
                lolAnalysis={lolAnalysis}
                onNewAnalysis={handleNewAnalysis}
              />
            )}

            {/* Recent analyses tab */}
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

// Voice Analysis Tab Component
const VoiceAnalysisTab: React.FC<{
  token: string;
  fifaAnalysis: any;
  lolAnalysis: any;
  onNewAnalysis: (data: any, game: GameType) => void;
}> = ({ token, fifaAnalysis, lolAnalysis, onNewAnalysis }) => (
  <div className="w-full space-y-8">
    <div className="text-center w-full">
      <h2 className="text-3xl sm:text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
        Voice Analysis
      </h2>
      <p className="text-gray-300 text-lg sm:text-xl max-w-3xl mx-auto leading-relaxed">
        Speak your game stats to get real-time AI analysis with voice responses.
      </p>
    </div>

    {/* Connection status */}
    <div className="w-full flex justify-center">
      <div className="bg-blue-900/30 rounded-2xl p-4 sm:p-6 border border-blue-500/40 text-center backdrop-blur-sm w-full max-w-3xl">
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded-full animate-pulse"></div>
          <span className="font-semibold text-sm sm:text-lg text-blue-200">Real-time WebSocket connection active</span>
        </div>
      </div>
    </div>

    {/* Two-column panels (FIFA & LoL) — full width */}
    <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-6 sm:gap-8">
      {/* FIFA panel */}
      <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-green-500/30 shadow-2xl w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🎮</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-green-400 mb-3">FIFA Analysis</h3>
          <p className="text-gray-300 text-sm sm:text-lg">Analyze your FIFA/EA FC gameplay and tactics</p>
        </div>

        <VoiceInput
          userToken={token}
          initialGame="fifa"
          onAnalysis={(data) => onNewAnalysis(data, "fifa")}
        />

        {fifaAnalysis && (
          <div className="mt-6">
            <AnalysisDisplay analysis={fifaAnalysis} game="FIFA" />
          </div>
        )}
      </div>

      {/* LoL panel */}
      <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-blue-500/30 shadow-2xl w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚔️</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-blue-400 mb-3">LoL Analysis</h3>
          <p className="text-gray-300 text-sm sm:text-lg">Analyze your League of Legends matches and strategy</p>
        </div>

        <VoiceInput
          userToken={token}
          initialGame="lol"
          onAnalysis={(data) => onNewAnalysis(data, "lol")}
        />

        {lolAnalysis && (
          <div className="mt-6">
            <AnalysisDisplay analysis={lolAnalysis} game="LoL" />
          </div>
        )}
      </div>
    </div>
  </div>
);

// Recent Analyses Tab Component
const RecentAnalysesTab: React.FC<{
  analysisGameTab: GameType;
  setAnalysisGameTab: (game: GameType) => void;
  currentAnalyses: AnalysisHistory[];
  loadingAnalyses: boolean;
  onRefresh: () => void;
}> = ({ analysisGameTab, setAnalysisGameTab, currentAnalyses, loadingAnalyses, onRefresh }) => (
  <div className="w-full space-y-8">
    <div className="text-center w-full">
      <h2 className="text-3xl sm:text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
        Recent Analyses
      </h2>
      <p className="text-gray-300 text-lg sm:text-xl max-w-3xl mx-auto">
        Review your previous game analyses and track your improvement journey
      </p>
    </div>

    <div className="flex flex-col lg:flex-row justify-between items-center gap-4 sm:gap-6 bg-gray-800/40 backdrop-blur-lg rounded-2xl p-4 sm:p-6 border border-purple-500/20">
      <div className="bg-gray-700/50 rounded-xl p-2">
        <div className="flex space-x-2">
          <button
            className={`px-4 sm:px-8 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-lg transition-all duration-200 ${
              analysisGameTab === "fifa"
                ? "bg-green-600 shadow-lg shadow-green-500/25 text-white"
                : "text-gray-300 hover:bg-gray-600 hover:text-white"
            }`}
            onClick={() => setAnalysisGameTab("fifa")}
          >
            🎮 FIFA
          </button>
          <button
            className={`px-4 sm:px-8 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-lg transition-all duration-200 ${
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

      <button
        onClick={onRefresh}
        className="px-4 sm:px-8 py-2 sm:py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all duration-200 font-semibold text-sm sm:text-lg shadow-lg w-full lg:w-auto"
        disabled={loadingAnalyses}
      >
        {loadingAnalyses ? "🔄 Refreshing..." : "🔄 Refresh Analyses"}
      </button>
    </div>

    {loadingAnalyses ? (
      <div className="text-center py-12 sm:py-16">
        <div className="animate-spin rounded-full h-12 w-12 sm:h-16 sm:w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
        <p className="text-gray-400 text-lg">Loading your analyses...</p>
      </div>
    ) : currentAnalyses.length === 0 ? (
      <div className="text-center py-12 sm:py-16 bg-gray-800/40 backdrop-blur-lg rounded-2xl border border-gray-600/30">
        <div className="text-6xl sm:text-8xl mb-6">📊</div>
        <h3 className="text-xl sm:text-2xl font-semibold text-gray-300 mb-4">No analyses found</h3>
        <p className="text-gray-400 text-base sm:text-lg max-w-md mx-auto">
          Use the Voice Analysis tab to create your first {analysisGameTab.toUpperCase()} analysis!
        </p>
      </div>
    ) : (
      <div className="grid gap-4 sm:gap-6">
        {currentAnalyses.map((analysis) => (
          <AnalysisHistoryItem key={analysis.id} analysis={analysis} game={analysisGameTab} />
        ))}
      </div>
    )}
  </div>
);

const AnalysisDisplay: React.FC<{ analysis: any; game: string }> = ({ analysis, game }) => {
  const summary = analysis.summary || analysis.explanation || "";
  const topTips = analysis.topTips || analysis.top_tips || [];
  const trainingDrills = analysis.trainingDrills || analysis.drills || [];
  const rating = analysis.rating;
  const confidence = analysis.confidence || analysis.estimated_score;
  const responseType = analysis.responseType || analysis.meta?.response_type || "detailed";

  return (
    <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-4 sm:p-6 border border-purple-500/40 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg sm:text-xl text-white">Latest {game} Analysis</h3>
        {rating && (
          <div className="bg-purple-600 px-3 sm:px-4 py-1 sm:py-2 rounded-full text-sm sm:text-lg font-bold shadow-lg">
            {rating}/10
          </div>
        )}
      </div>

      <div className="space-y-3 sm:space-y-4">
        <p className="text-gray-200 text-base sm:text-lg leading-relaxed">{summary}</p>

        {confidence && (
          <div className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg">
            <span className="text-gray-400">Confidence:</span>
            <span className="font-semibold text-green-400">{Math.round(confidence * 100)}%</span>
          </div>
        )}

        {topTips.length > 0 && (
          <div>
            <h4 className="font-semibold text-purple-300 text-base sm:text-lg mb-2 sm:mb-3">🎯 Top Tips</h4>
            <ul className="space-y-1 sm:space-y-2">
              {topTips.map((tip: string, index: number) => (
                <li key={index} className="flex items-start gap-2 sm:gap-3 text-sm sm:text-base text-gray-200">
                  <span className="text-purple-400 mt-1">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {trainingDrills.length > 0 && (
          <div>
            <h4 className="font-semibold text-blue-300 text-base sm:text-lg mb-2 sm:mb-3">🏋️ Training Drills</h4>
            <ul className="space-y-1 sm:space-y-2">
              {trainingDrills.map((drill: string, index: number) => (
                <li key={index} className="flex items-start gap-2 sm:gap-3 text-sm sm:text-base text-gray-200">
                  <span className="text-blue-400 mt-1">•</span>
                  <span>{drill}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-3 sm:pt-4 border-t border-gray-600/50">
          <span className="text-xs sm:text-sm text-gray-400 capitalize">Response Type: {responseType}</span>
        </div>
      </div>
    </div>
  );
};

const AnalysisHistoryItem: React.FC<{ analysis: AnalysisHistory; game: GameType }> = ({ analysis, game }) => {
  const createdAt = new Date(analysis.created_at).toLocaleString();

  return (
    <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-4 sm:p-6 border border-gray-600/30 hover:border-purple-500/40 transition-all duration-300 shadow-xl hover:shadow-2xl">
      <div className="flex flex-col lg:flex-row justify-between items-start gap-3 sm:gap-4 mb-3 sm:mb-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div
            className={`p-2 sm:p-3 rounded-xl ${
              game === "fifa" ? "bg-green-600/20 border border-green-500/30" : "bg-blue-600/20 border border-blue-500/30"
            }`}
          >
            <span className="text-xl sm:text-2xl">{game === "fifa" ? "🎮" : "⚔️"}</span>
          </div>
          <div>
            <h4 className="font-bold text-lg sm:text-xl text-white">{game.toUpperCase()} Analysis</h4>
            {analysis.user_text && (
              <p className="text-gray-300 text-sm sm:text-lg mt-1 sm:mt-2 line-clamp-2">"{analysis.user_text}"</p>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400 bg-gray-600/50 px-2 sm:px-3 py-1 sm:py-2 rounded-lg">{createdAt}</span>
      </div>

      <div className="space-y-3 sm:space-y-4">
        <p className="text-gray-200 text-sm sm:text-lg leading-relaxed">{analysis.summary}</p>

        <div className="flex flex-wrap gap-4 sm:gap-6 text-sm sm:text-lg">
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
            <h5 className="font-semibold text-purple-300 text-sm sm:text-lg mb-1 sm:mb-2">Key Tips</h5>
            <ul className="space-y-1 sm:space-y-2">
              {analysis.topTips.slice(0, 2).map((tip: string, index: number) => (
                <li key={index} className="flex items-start gap-2 sm:gap-3 text-xs sm:text-base text-gray-300">
                  <span className="text-purple-400 mt-1">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-3 sm:pt-4 border-t border-gray-600/50">
          <span className="text-xs text-gray-400 capitalize">Analysis Type: {analysis.responseType}</span>
        </div>
      </div>
    </div>
  );
};

export default App;














// // App.tsx
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

//   // choose correct current analyses list
//   const currentAnalyses = analysisGameTab === "fifa" ? recentFifaAnalyses : recentLolAnalyses;

//   return (
//     <div className="min-h-screen w-screen overflow-x-hidden bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white antialiased">
//       {/* Header */}
//       <div className="bg-gray-800/40 backdrop-blur-lg sticky top-0 z-50 border-b border-purple-500/20">
//         <div className="w-full px-6 py-4">
//           <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
//             <div className="text-center sm:text-left">
//               <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//                 NeuraPlay Coach
//               </h1>
//               <p className="text-gray-300">Welcome back, {user.displayName}</p>
//             </div>
//             <button
//               onClick={handleLogout}
//               className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-red-500/25"
//             >
//               Logout
//             </button>
//           </div>
//         </div>
//       </div>

//       {/* Main content area (full width) */}
//       <div className="w-full px-4 md:px-8 py-6">
//         {/* Tabs */}
//         <div className="w-full mb-8">
//           <div className="bg-gray-800/40 backdrop-blur-lg rounded-2xl p-2 border border-purple-500/20 shadow-xl w-full">
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

//         {/* Tab content */}
//         <div className="w-full">
//           {/* Voice tab */}
//           {activeTab === "voice" && (
//             <VoiceAnalysisTab
//               token={token}
//               fifaAnalysis={fifaAnalysis}
//               lolAnalysis={lolAnalysis}
//               onNewAnalysis={handleNewAnalysis}
//             />
//           )}

//           {/* Recent analyses tab */}
//           {activeTab === "analyses" && (
//             <RecentAnalysesTab
//               analysisGameTab={analysisGameTab}
//               setAnalysisGameTab={setAnalysisGameTab}
//               currentAnalyses={currentAnalyses}
//               loadingAnalyses={loadingAnalyses}
//               onRefresh={loadRecentAnalyses}
//             />
//           )}
//         </div>
//       </div>
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
//       <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//         Voice Analysis
//       </h2>
//       <p className="text-gray-300 text-xl max-w-3xl mx-auto leading-relaxed">
//         Speak your game stats to get real-time AI analysis with voice responses.
//       </p>
//     </div>

//     {/* Connection status */}
//     <div className="w-full flex justify-center">
//       <div className="bg-blue-900/30 rounded-2xl p-6 border border-blue-500/40 text-center backdrop-blur-sm w-full max-w-3xl">
//         <div className="flex items-center justify-center gap-4">
//           <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
//           <span className="font-semibold text-lg text-blue-200">Real-time WebSocket connection active</span>
//         </div>
//       </div>
//     </div>

//     {/* Two-column panels (FIFA & LoL) — full width */}
//     <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-8">
//       {/* FIFA panel */}
//       <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-8 border border-green-500/30 shadow-2xl w-full">
//         <div className="text-center mb-6">
//           <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
//             <span className="text-2xl">🎮</span>
//           </div>
//           <h3 className="text-2xl font-bold text-green-400 mb-3">FIFA Analysis</h3>
//           <p className="text-gray-300 text-lg">Analyze your FIFA/EA FC gameplay and tactics</p>
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
//       <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-8 border border-blue-500/30 shadow-2xl w-full">
//         <div className="text-center mb-6">
//           <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
//             <span className="text-2xl">⚔️</span>
//           </div>
//           <h3 className="text-2xl font-bold text-blue-400 mb-3">LoL Analysis</h3>
//           <p className="text-gray-300 text-lg">Analyze your League of Legends matches and strategy</p>
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
//       <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//         Recent Analyses
//       </h2>
//       <p className="text-gray-300 text-xl max-w-3xl mx-auto">
//         Review your previous game analyses and track your improvement journey
//       </p>
//     </div>

//     <div className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-gray-800/40 backdrop-blur-lg rounded-2xl p-6 border border-purple-500/20">
//       <div className="bg-gray-700/50 rounded-xl p-2">
//         <div className="flex space-x-2">
//           <button
//             className={`px-8 py-3 rounded-lg font-semibold text-lg transition-all duration-200 ${
//               analysisGameTab === "fifa"
//                 ? "bg-green-600 shadow-lg shadow-green-500/25 text-white"
//                 : "text-gray-300 hover:bg-gray-600 hover:text-white"
//             }`}
//             onClick={() => setAnalysisGameTab("fifa")}
//           >
//             🎮 FIFA
//           </button>
//           <button
//             className={`px-8 py-3 rounded-lg font-semibold text-lg transition-all duration-200 ${
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
//         className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all duration-200 font-semibold text-lg shadow-lg"
//         disabled={loadingAnalyses}
//       >
//         {loadingAnalyses ? "🔄 Refreshing..." : "🔄 Refresh Analyses"}
//       </button>
//     </div>

//     {loadingAnalyses ? (
//       <div className="text-center py-16">
//         <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
//         <p className="text-gray-400 text-lg">Loading your analyses...</p>
//       </div>
//     ) : currentAnalyses.length === 0 ? (
//       <div className="text-center py-16 bg-gray-800/40 backdrop-blur-lg rounded-2xl border border-gray-600/30">
//         <div className="text-8xl mb-6">📊</div>
//         <h3 className="text-2xl font-semibold text-gray-300 mb-4">No analyses found</h3>
//         <p className="text-gray-400 text-lg max-w-md mx-auto">
//           Use the Voice Analysis tab to create your first {analysisGameTab.toUpperCase()} analysis!
//         </p>
//       </div>
//     ) : (
//       <div className="grid gap-6">
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
//     <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-6 border border-purple-500/40 shadow-2xl">
//       <div className="flex items-center justify-between mb-4">
//         <h3 className="font-bold text-xl text-white">Latest {game} Analysis</h3>
//         {rating && (
//           <div className="bg-purple-600 px-4 py-2 rounded-full text-lg font-bold shadow-lg">
//             {rating}/10
//           </div>
//         )}
//       </div>

//       <div className="space-y-4">
//         <p className="text-gray-200 text-lg leading-relaxed">{summary}</p>

//         {confidence && (
//           <div className="flex items-center gap-3 text-lg">
//             <span className="text-gray-400">Confidence:</span>
//             <span className="font-semibold text-green-400">{Math.round(confidence * 100)}%</span>
//           </div>
//         )}

//         {topTips.length > 0 && (
//           <div>
//             <h4 className="font-semibold text-purple-300 text-lg mb-3">🎯 Top Tips</h4>
//             <ul className="space-y-2">
//               {topTips.map((tip: string, index: number) => (
//                 <li key={index} className="flex items-start gap-3 text-base text-gray-200">
//                   <span className="text-purple-400 mt-1">•</span>
//                   <span>{tip}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         {trainingDrills.length > 0 && (
//           <div>
//             <h4 className="font-semibold text-blue-300 text-lg mb-3">🏋️ Training Drills</h4>
//             <ul className="space-y-2">
//               {trainingDrills.map((drill: string, index: number) => (
//                 <li key={index} className="flex items-start gap-3 text-base text-gray-200">
//                   <span className="text-blue-400 mt-1">•</span>
//                   <span>{drill}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         <div className="pt-4 border-t border-gray-600/50">
//           <span className="text-sm text-gray-400 capitalize">Response Type: {responseType}</span>
//         </div>
//       </div>
//     </div>
//   );
// };

// const AnalysisHistoryItem: React.FC<{ analysis: AnalysisHistory; game: GameType }> = ({ analysis, game }) => {
//   const createdAt = new Date(analysis.created_at).toLocaleString();

//   return (
//     <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-6 border border-gray-600/30 hover:border-purple-500/40 transition-all duration-300 shadow-xl hover:shadow-2xl">
//       <div className="flex flex-col lg:flex-row justify-between items-start gap-4 mb-4">
//         <div className="flex items-center gap-4">
//           <div
//             className={`p-3 rounded-xl ${
//               game === "fifa" ? "bg-green-600/20 border border-green-500/30" : "bg-blue-600/20 border border-blue-500/30"
//             }`}
//           >
//             <span className="text-2xl">{game === "fifa" ? "🎮" : "⚔️"}</span>
//           </div>
//           <div>
//             <h4 className="font-bold text-xl text-white">{game.toUpperCase()} Analysis</h4>
//             {analysis.user_text && (
//               <p className="text-gray-300 text-lg mt-2 line-clamp-2">"{analysis.user_text}"</p>
//             )}
//           </div>
//         </div>
//         <span className="text-sm text-gray-400 bg-gray-600/50 px-3 py-2 rounded-lg">{createdAt}</span>
//       </div>

//       <div className="space-y-4">
//         <p className="text-gray-200 text-lg leading-relaxed">{analysis.summary}</p>

//         <div className="flex flex-wrap gap-6 text-lg">
//           {analysis.rating && (
//             <div className="flex items-center gap-2">
//               <span className="text-gray-400">Rating:</span>
//               <span className="font-bold text-yellow-400">{analysis.rating}/10</span>
//             </div>
//           )}
//           {analysis.confidence && (
//             <div className="flex items-center gap-2">
//               <span className="text-gray-400">Confidence:</span>
//               <span className="font-bold text-green-400">{Math.round(analysis.confidence * 100)}%</span>
//             </div>
//           )}
//         </div>

//         {analysis.topTips && analysis.topTips.length > 0 && (
//           <div>
//             <h5 className="font-semibold text-purple-300 text-lg mb-2">Key Tips</h5>
//             <ul className="space-y-2">
//               {analysis.topTips.slice(0, 2).map((tip: string, index: number) => (
//                 <li key={index} className="flex items-start gap-3 text-base text-gray-300">
//                   <span className="text-purple-400 mt-1">•</span>
//                   <span>{tip}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         <div className="pt-4 border-t border-gray-600/50">
//           <span className="text-sm text-gray-400 capitalize">Analysis Type: {analysis.responseType}</span>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default App;















// // App.tsx
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
//       <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
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
//     <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white">
//       {/* Full screen header */}
//       <div className="bg-gray-800/40 backdrop-blur-lg border-b border-purple-500/20">
//         <div className="w-full px-6 py-4">
//           <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
//             <div className="text-center sm:text-left">
//               <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//                 NeuraPlay Coach
//               </h1>
//               <p className="text-gray-300">Welcome back, {user.displayName}</p>
//             </div>
//             <button
//               onClick={handleLogout}
//               className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-red-500/25"
//             >
//               Logout
//             </button>
//           </div>
//         </div>
//       </div>

//       {/* Full width main content */}
//       <div className="w-full px-4 py-6">
//         {/* Main Tabs - Full width */}
//         <div className="w-full mb-8">
//           <div className="bg-gray-800/40 backdrop-blur-lg rounded-2xl p-2 border border-purple-500/20 shadow-xl max-w-2xl mx-auto">
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

//         {/* Tab Content - Full width */}
//         <div className="w-full">
//           {/* Voice Analysis Tab */}
//           {activeTab === "voice" && (
//             <VoiceAnalysisTab 
//               token={token}
//               fifaAnalysis={fifaAnalysis}
//               lolAnalysis={lolAnalysis}
//               onNewAnalysis={handleNewAnalysis}
//             />
//           )}

//           {/* Recent Analyses Tab */}
//           {activeTab === "analyses" && (
//             <RecentAnalysesTab
//               analysisGameTab={analysisGameTab}
//               setAnalysisGameTab={setAnalysisGameTab}
//               currentAnalyses={currentAnalyses}
//               loadingAnalyses={loadingAnalyses}
//               onRefresh={loadRecentAnalyses}
//             />
//           )}
//         </div>
//       </div>
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
//     <div className="text-center max-w-4xl mx-auto">
//       <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//         Voice Analysis
//       </h2>
//       <p className="text-gray-300 text-xl max-w-3xl mx-auto leading-relaxed">
//         Speak your game stats to get real-time AI analysis with voice responses. 
//         Describe your gameplay, issues, or ask for specific advice.
//       </p>
//     </div>

//     {/* Connection Status */}
//     <div className="max-w-2xl mx-auto">
//       <div className="bg-blue-900/30 rounded-2xl p-6 border border-blue-500/40 text-center backdrop-blur-sm">
//         <div className="flex items-center justify-center gap-4">
//           <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
//           <span className="font-semibold text-lg text-blue-200">Real-time WebSocket connection active</span>
//         </div>
//       </div>
//     </div>

//     {/* Game Analysis Sections */}
//     <div className="grid xl:grid-cols-2 gap-8 max-w-7xl mx-auto">
//       {/* FIFA Analysis */}
//       <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-8 border border-green-500/30 shadow-2xl">
//         <div className="text-center mb-6">
//           <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
//             <span className="text-2xl">🎮</span>
//           </div>
//           <h3 className="text-2xl font-bold text-green-400 mb-3">FIFA Analysis</h3>
//           <p className="text-gray-300 text-lg">Analyze your FIFA/EA FC gameplay and tactics</p>
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

//       {/* LoL Analysis */}
//       <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-8 border border-blue-500/30 shadow-2xl">
//         <div className="text-center mb-6">
//           <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
//             <span className="text-2xl">⚔️</span>
//           </div>
//           <h3 className="text-2xl font-bold text-blue-400 mb-3">LoL Analysis</h3>
//           <p className="text-gray-300 text-lg">Analyze your League of Legends matches and strategy</p>
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
//   <div className="w-full space-y-8 max-w-7xl mx-auto">
//     <div className="text-center">
//       <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//         Recent Analyses
//       </h2>
//       <p className="text-gray-300 text-xl max-w-3xl mx-auto">
//         Review your previous game analyses and track your improvement journey
//       </p>
//     </div>

//     {/* Controls */}
//     <div className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-gray-800/40 backdrop-blur-lg rounded-2xl p-6 border border-purple-500/20">
//       {/* Game Sub-tabs */}
//       <div className="bg-gray-700/50 rounded-xl p-2">
//         <div className="flex space-x-2">
//           <button
//             className={`px-8 py-3 rounded-lg font-semibold text-lg transition-all duration-200 ${
//               analysisGameTab === "fifa"
//                 ? "bg-green-600 shadow-lg shadow-green-500/25 text-white"
//                 : "text-gray-300 hover:bg-gray-600 hover:text-white"
//             }`}
//             onClick={() => setAnalysisGameTab("fifa")}
//           >
//             🎮 FIFA
//           </button>
//           <button
//             className={`px-8 py-3 rounded-lg font-semibold text-lg transition-all duration-200 ${
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
//         className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all duration-200 font-semibold text-lg shadow-lg hover:shadow-purple-500/25"
//         disabled={loadingAnalyses}
//       >
//         {loadingAnalyses ? "🔄 Refreshing..." : "🔄 Refresh Analyses"}
//       </button>
//     </div>

//     {/* Analyses List */}
//     {loadingAnalyses ? (
//       <div className="text-center py-16">
//         <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
//         <p className="text-gray-400 text-lg">Loading your analyses...</p>
//       </div>
//     ) : currentAnalyses.length === 0 ? (
//       <div className="text-center py-16 bg-gray-800/40 backdrop-blur-lg rounded-2xl border border-gray-600/30">
//         <div className="text-8xl mb-6">📊</div>
//         <h3 className="text-2xl font-semibold text-gray-300 mb-4">No analyses found</h3>
//         <p className="text-gray-400 text-lg max-w-md mx-auto">
//           Use the Voice Analysis tab to create your first {analysisGameTab.toUpperCase()} analysis!
//         </p>
//       </div>
//     ) : (
//       <div className="grid gap-6">
//         {currentAnalyses.map((analysis) => (
//           <AnalysisHistoryItem 
//             key={analysis.id} 
//             analysis={analysis} 
//             game={analysisGameTab}
//           />
//         ))}
//       </div>
//     )}
//   </div>
// );

// // Analysis Display Component
// const AnalysisDisplay: React.FC<{ analysis: any; game: string }> = ({ analysis, game }) => {
//   const summary = analysis.summary || analysis.explanation || '';
//   const topTips = analysis.topTips || analysis.top_tips || [];
//   const trainingDrills = analysis.trainingDrills || analysis.drills || [];
//   const rating = analysis.rating;
//   const confidence = analysis.confidence || analysis.estimated_score;
//   const responseType = analysis.responseType || analysis.meta?.response_type || 'detailed';

//   return (
//     <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-6 border border-purple-500/40 shadow-2xl">
//       <div className="flex items-center justify-between mb-4">
//         <h3 className="font-bold text-xl text-white">Latest {game} Analysis</h3>
//         {rating && (
//           <div className="bg-purple-600 px-4 py-2 rounded-full text-lg font-bold shadow-lg">
//             {rating}/10
//           </div>
//         )}
//       </div>
      
//       <div className="space-y-4">
//         <p className="text-gray-200 text-lg leading-relaxed">{summary}</p>
        
//         {confidence && (
//           <div className="flex items-center gap-3 text-lg">
//             <span className="text-gray-400">Confidence:</span>
//             <span className="font-semibold text-green-400">{Math.round(confidence * 100)}%</span>
//           </div>
//         )}

//         {topTips.length > 0 && (
//           <div>
//             <h4 className="font-semibold text-purple-300 text-lg mb-3">🎯 Top Tips</h4>
//             <ul className="space-y-2">
//               {topTips.map((tip: string, index: number) => (
//                 <li key={index} className="flex items-start gap-3 text-base text-gray-200">
//                   <span className="text-purple-400 mt-1">•</span>
//                   <span>{tip}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         {trainingDrills.length > 0 && (
//           <div>
//             <h4 className="font-semibold text-blue-300 text-lg mb-3">🏋️ Training Drills</h4>
//             <ul className="space-y-2">
//               {trainingDrills.map((drill: string, index: number) => (
//                 <li key={index} className="flex items-start gap-3 text-base text-gray-200">
//                   <span className="text-blue-400 mt-1">•</span>
//                   <span>{drill}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         <div className="pt-4 border-t border-gray-600/50">
//           <span className="text-sm text-gray-400 capitalize">Response Type: {responseType}</span>
//         </div>
//       </div>
//     </div>
//   );
// };

// // Analysis History Item Component
// const AnalysisHistoryItem: React.FC<{ analysis: AnalysisHistory; game: GameType }> = ({ analysis, game }) => {
//   const createdAt = new Date(analysis.created_at).toLocaleString();

//   return (
//     <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl p-6 border border-gray-600/30 hover:border-purple-500/40 transition-all duration-300 shadow-xl hover:shadow-2xl">
//       <div className="flex flex-col lg:flex-row justify-between items-start gap-4 mb-4">
//         <div className="flex items-center gap-4">
//           <div className={`p-3 rounded-xl ${
//             game === 'fifa' ? 'bg-green-600/20 border border-green-500/30' : 'bg-blue-600/20 border border-blue-500/30'
//           }`}>
//             <span className="text-2xl">{game === 'fifa' ? '🎮' : '⚔️'}</span>
//           </div>
//           <div>
//             <h4 className="font-bold text-xl text-white">{game.toUpperCase()} Analysis</h4>
//             {analysis.user_text && (
//               <p className="text-gray-300 text-lg mt-2 line-clamp-2">
//                 "{analysis.user_text}"
//               </p>
//             )}
//           </div>
//         </div>
//         <span className="text-sm text-gray-400 bg-gray-600/50 px-3 py-2 rounded-lg">
//           {createdAt}
//         </span>
//       </div>
      
//       <div className="space-y-4">
//         <p className="text-gray-200 text-lg leading-relaxed">{analysis.summary}</p>
        
//         <div className="flex flex-wrap gap-6 text-lg">
//           {analysis.rating && (
//             <div className="flex items-center gap-2">
//               <span className="text-gray-400">Rating:</span>
//               <span className="font-bold text-yellow-400">{analysis.rating}/10</span>
//             </div>
//           )}
//           {analysis.confidence && (
//             <div className="flex items-center gap-2">
//               <span className="text-gray-400">Confidence:</span>
//               <span className="font-bold text-green-400">{Math.round(analysis.confidence * 100)}%</span>
//             </div>
//           )}
//         </div>
        
//         {analysis.topTips && analysis.topTips.length > 0 && (
//           <div>
//             <h5 className="font-semibold text-purple-300 text-lg mb-2">Key Tips</h5>
//             <ul className="space-y-2">
//               {analysis.topTips.slice(0, 2).map((tip: string, index: number) => (
//                 <li key={index} className="flex items-start gap-3 text-base text-gray-300">
//                   <span className="text-purple-400 mt-1">•</span>
//                   <span>{tip}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}
        
//         <div className="pt-4 border-t border-gray-600/50">
//           <span className="text-sm text-gray-400 capitalize">Analysis Type: {analysis.responseType}</span>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default App;













// // App.tsx
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
//       <div className="min-h-screen bg-gradient-to-br from-gray-900 to-purple-900 flex flex-col items-center justify-center p-4">
//         <div className="text-center max-w-md w-full">
//           <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/20 shadow-2xl">
//             <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-2">
//               NeuraPlay
//             </h1>
//             <p className="text-gray-300 mb-6">AI Game Analysis Coach</p>
//             <LoginButton />
//           </div>
//         </div>
//       </div>
//     );
//   }

//   const currentAnalyses = analysisGameTab === "fifa" ? recentFifaAnalyses : recentLolAnalyses;

//   return (
//     <div className="min-h-screen bg-gradient-to-br w-full from-gray-900 to-purple-900 text-white">
//       <div className="container mx-auto px-4 py-6 max-w-4xl">
//         {/* Header */}
//         <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-purple-500/20 shadow-xl">
//           <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
//             <div className="text-center sm:text-left">
//               <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//                 NeuraPlay Coach
//               </h1>
//               <p className="text-gray-300">Welcome back, {user.displayName}</p>
//               <p className="text-sm text-gray-400">{user.email}</p>
//             </div>
//             <button
//               onClick={handleLogout}
//               className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 font-medium shadow-lg"
//             >
//               Logout
//             </button>
//           </div>
//         </div>

//         {/* Main Tabs */}
//         <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-2 mb-6 border border-purple-500/20 shadow-xl">
//           <div className="flex justify-center space-x-2">
//             <button
//               className={`flex-1 max-w-xs px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
//                 activeTab === "voice"
//                   ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
//                   : "bg-gray-700/50 hover:bg-gray-700 text-gray-300"
//               }`}
//               onClick={() => setActiveTab("voice")}
//             >
//               🎤 Voice Analysis
//             </button>
//             <button
//               className={`flex-1 max-w-xs px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
//                 activeTab === "analyses"
//                   ? "bg-purple-600 shadow-lg shadow-purple-500/25 text-white"
//                   : "bg-gray-700/50 hover:bg-gray-700 text-gray-300"
//               }`}
//               onClick={() => setActiveTab("analyses")}
//             >
//               📊 Recent Analyses
//             </button>
//           </div>
//         </div>

//         {/* Tab Content */}
//         <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/20 shadow-xl">
//           {/* Voice Analysis Tab */}
//           {activeTab === "voice" && (
//             <VoiceAnalysisTab 
//               token={token}
//               fifaAnalysis={fifaAnalysis}
//               lolAnalysis={lolAnalysis}
//               onNewAnalysis={handleNewAnalysis}
//             />
//           )}

//           {/* Recent Analyses Tab */}
//           {activeTab === "analyses" && (
//             <RecentAnalysesTab
//               analysisGameTab={analysisGameTab}
//               setAnalysisGameTab={setAnalysisGameTab}
//               currentAnalyses={currentAnalyses}
//               loadingAnalyses={loadingAnalyses}
//               onRefresh={loadRecentAnalyses}
//             />
//           )}
//         </div>
//       </div>
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
//   <div className="space-y-8">
//     <div className="text-center">
//       <h2 className="text-2xl font-bold mb-3 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//         Voice Analysis
//       </h2>
//       <p className="text-gray-300 max-w-2xl mx-auto">
//         Speak your game stats to get real-time AI analysis with voice responses. 
//         Describe your gameplay, issues, or ask for specific advice.
//       </p>
//     </div>

//     {/* Connection Status */}
//     <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-500/30 text-center">
//       <div className="flex items-center justify-center gap-3">
//         <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
//         <span className="font-medium">Real-time WebSocket connection active</span>
//       </div>
//     </div>

//     {/* Game Analysis Sections */}
//     <div className="grid md:grid-cols-2 gap-6">
//       {/* FIFA Analysis */}
//       <div className="bg-gray-700/30 rounded-xl p-6 border border-green-500/20">
//         <div className="text-center mb-4">
//           <h3 className="text-xl font-bold text-green-400 mb-2">🎮 FIFA Analysis</h3>
//           <p className="text-gray-300 text-sm">Analyze your FIFA/EA FC gameplay</p>
//         </div>
//         <VoiceInput
//           userToken={token}
//           initialGame="fifa"
//           onAnalysis={(data) => onNewAnalysis(data, "fifa")}
//         />
//         {fifaAnalysis && (
//           <div className="mt-4">
//             <AnalysisDisplay analysis={fifaAnalysis} game="FIFA" />
//           </div>
//         )}
//       </div>

//       {/* LoL Analysis */}
//       <div className="bg-gray-700/30 rounded-xl p-6 border border-blue-500/20">
//         <div className="text-center mb-4">
//           <h3 className="text-xl font-bold text-blue-400 mb-2">⚔️ LoL Analysis</h3>
//           <p className="text-gray-300 text-sm">Analyze your League of Legends matches</p>
//         </div>
//         <VoiceInput
//           userToken={token}
//           initialGame="lol"
//           onAnalysis={(data) => onNewAnalysis(data, "lol")}
//         />
//         {lolAnalysis && (
//           <div className="mt-4">
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
//   <div className="space-y-6">
//     <div className="text-center">
//       <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
//         Recent Analyses
//       </h2>
//       <p className="text-gray-300">Review your previous game analyses and improvement tips</p>
//     </div>

//     {/* Controls */}
//     <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
//       {/* Game Sub-tabs */}
//       <div className="bg-gray-700/50 rounded-xl p-1">
//         <div className="flex space-x-1">
//           <button
//             className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
//               analysisGameTab === "fifa"
//                 ? "bg-green-600 shadow-lg text-white"
//                 : "text-gray-300 hover:bg-gray-600"
//             }`}
//             onClick={() => setAnalysisGameTab("fifa")}
//           >
//             🎮 FIFA
//           </button>
//           <button
//             className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
//               analysisGameTab === "lol"
//                 ? "bg-blue-600 shadow-lg text-white"
//                 : "text-gray-300 hover:bg-gray-600"
//             }`}
//             onClick={() => setAnalysisGameTab("lol")}
//           >
//             ⚔️ LoL
//           </button>
//         </div>
//       </div>

//       <button
//         onClick={onRefresh}
//         className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-200 font-medium shadow-lg"
//         disabled={loadingAnalyses}
//       >
//         {loadingAnalyses ? "🔄 Refreshing..." : "🔄 Refresh"}
//       </button>
//     </div>

//     {/* Analyses List */}
//     {loadingAnalyses ? (
//       <div className="text-center py-12">
//         <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
//         <p className="text-gray-400">Loading your analyses...</p>
//       </div>
//     ) : currentAnalyses.length === 0 ? (
//       <div className="text-center py-12 bg-gray-700/30 rounded-2xl border border-gray-600/30">
//         <div className="text-6xl mb-4">📊</div>
//         <h3 className="text-xl font-semibold text-gray-300 mb-2">No analyses found</h3>
//         <p className="text-gray-400 max-w-md mx-auto">
//           Use the Voice Analysis tab to create your first {analysisGameTab.toUpperCase()} analysis!
//         </p>
//       </div>
//     ) : (
//       <div className="grid gap-4">
//         {currentAnalyses.map((analysis) => (
//           <AnalysisHistoryItem 
//             key={analysis.id} 
//             analysis={analysis} 
//             game={analysisGameTab}
//           />
//         ))}
//       </div>
//     )}
//   </div>
// );

// // Analysis Display Component
// const AnalysisDisplay: React.FC<{ analysis: any; game: string }> = ({ analysis, game }) => {
//   const summary = analysis.summary || analysis.explanation || '';
//   const topTips = analysis.topTips || analysis.top_tips || [];
//   const trainingDrills = analysis.trainingDrills || analysis.drills || [];
//   const rating = analysis.rating;
//   const confidence = analysis.confidence || analysis.estimated_score;
//   const responseType = analysis.responseType || analysis.meta?.response_type || 'detailed';

//   return (
//     <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl p-5 border border-purple-500/30 shadow-lg">
//       <div className="flex items-center justify-between mb-3">
//         <h3 className="font-bold text-lg text-white">Latest {game} Analysis</h3>
//         {rating && (
//           <div className="bg-purple-600 px-3 py-1 rounded-full text-sm font-bold">
//             {rating}/10
//           </div>
//         )}
//       </div>
      
//       <div className="space-y-3">
//         <p className="text-gray-200 leading-relaxed">{summary}</p>
        
//         {confidence && (
//           <div className="flex items-center gap-2 text-sm">
//             <span className="text-gray-400">Confidence:</span>
//             <span className="font-semibold text-green-400">{Math.round(confidence * 100)}%</span>
//           </div>
//         )}

//         {topTips.length > 0 && (
//           <div>
//             <h4 className="font-semibold text-purple-300 mb-2">🎯 Top Tips</h4>
//             <ul className="space-y-1">
//               {topTips.map((tip: string, index: number) => (
//                 <li key={index} className="flex items-start gap-2 text-sm text-gray-200">
//                   <span className="text-purple-400 mt-1">•</span>
//                   <span>{tip}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         {trainingDrills.length > 0 && (
//           <div>
//             <h4 className="font-semibold text-blue-300 mb-2">🏋️ Training Drills</h4>
//             <ul className="space-y-1">
//               {trainingDrills.map((drill: string, index: number) => (
//                 <li key={index} className="flex items-start gap-2 text-sm text-gray-200">
//                   <span className="text-blue-400 mt-1">•</span>
//                   <span>{drill}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}

//         <div className="pt-2 border-t border-gray-600/50">
//           <span className="text-xs text-gray-400 capitalize">Response: {responseType}</span>
//         </div>
//       </div>
//     </div>
//   );
// };

// // Analysis History Item Component
// const AnalysisHistoryItem: React.FC<{ analysis: AnalysisHistory; game: GameType }> = ({ analysis, game }) => {
//   const createdAt = new Date(analysis.created_at).toLocaleString();

//   return (
//     <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl p-5 border border-gray-600/30 hover:border-purple-500/30 transition-all duration-200 shadow-lg">
//       <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-3">
//         <div className="flex items-center gap-3">
//           <div className={`p-2 rounded-lg ${
//             game === 'fifa' ? 'bg-green-600/20' : 'bg-blue-600/20'
//           }`}>
//             {game === 'fifa' ? '🎮' : '⚔️'}
//           </div>
//           <div>
//             <h4 className="font-semibold text-white">{game.toUpperCase()} Analysis</h4>
//             {analysis.user_text && (
//               <p className="text-sm text-gray-300 mt-1 line-clamp-1">
//                 "{analysis.user_text}"
//               </p>
//             )}
//           </div>
//         </div>
//         <span className="text-xs text-gray-400 bg-gray-600/50 px-2 py-1 rounded">
//           {createdAt}
//         </span>
//       </div>
      
//       <div className="space-y-3">
//         <p className="text-gray-200 text-sm leading-relaxed">{analysis.summary}</p>
        
//         <div className="flex flex-wrap gap-4 text-sm">
//           {analysis.rating && (
//             <div className="flex items-center gap-1">
//               <span className="text-gray-400">Rating:</span>
//               <span className="font-semibold text-yellow-400">{analysis.rating}/10</span>
//             </div>
//           )}
//           {analysis.confidence && (
//             <div className="flex items-center gap-1">
//               <span className="text-gray-400">Confidence:</span>
//               <span className="font-semibold text-green-400">{Math.round(analysis.confidence * 100)}%</span>
//             </div>
//           )}
//         </div>
        
//         {analysis.topTips && analysis.topTips.length > 0 && (
//           <div>
//             <h5 className="font-medium text-purple-300 text-sm mb-1">Key Tips</h5>
//             <ul className="space-y-1">
//               {analysis.topTips.slice(0, 2).map((tip: string, index: number) => (
//                 <li key={index} className="flex items-start gap-2 text-xs text-gray-300">
//                   <span className="text-purple-400 mt-1">•</span>
//                   <span>{tip}</span>
//                 </li>
//               ))}
//             </ul>
//           </div>
//         )}
        
//         <div className="pt-2 border-t border-gray-600/50">
//           <span className="text-xs text-gray-400 capitalize">Type: {analysis.responseType}</span>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default App;
















// // App.tsx
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
//   // Analysis data at top level
//   summary: string;
//   topTips: string[];
//   trainingDrills: string[];
//   rating: number | null;
//   confidence: number | null;
//   responseType: string;
//   // Optional nested analysis for backward compatibility
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

//   // Load recent analyses when analyses tab is active
//   useEffect(() => {
//     if (activeTab === "analyses" && token) {
//       loadRecentAnalyses();
//     }
//   }, [activeTab, analysisGameTab, token]);

//   // const loadRecentAnalyses = async () => {
//   //   if (!token) return;
    
//   //   setLoadingAnalyses(true);
//   //   try {
//   //     const response = await axios.get(
//   //       `${API_BASE}/api/analyses/recent/${analysisGameTab}/`,
//   //       {
//   //         headers: {
//   //           Authorization: `Bearer ${token}`,
//   //         },
//   //       }
//   //     );

//   //     console.log("📊 Recent analyses response:", response.data); // Debug log

//   //     if (analysisGameTab === "fifa") {
//   //       setRecentFifaAnalyses(response.data.analyses || []);
//   //     } else {
//   //       setRecentLolAnalyses(response.data.analyses || []);
//   //     }
//   //   } catch (error) {
//   //     console.error("Failed to load recent analyses:", error);
//   //   } finally {
//   //     setLoadingAnalyses(false);
//   //   }
//   // };

//   const loadRecentAnalyses = async () => {
//     if (!token) {
//       console.log("❌ No token available");
//       return;
//     }
    
//     setLoadingAnalyses(true);
//     try {
//       const url = `${API_BASE}/api/analyses/recent/${analysisGameTab}/`;
//       console.log("🔍 Making request to:", url);
//       console.log("🔍 Using token:", token.substring(0, 20) + "...");
      
//       const response = await axios.get(url, {
//         headers: {
//           Authorization: `Bearer ${token}`,
//         },
//       });
  
//       console.log("📊 Full API response:", response);
//       console.log("📊 Response status:", response.status);
//       console.log("📊 Response data:", response.data);
//       console.log("📊 Analyses array:", response.data.analyses);
  
//       if (analysisGameTab === "fifa") {
//         setRecentFifaAnalyses(response.data.analyses || []);
//       } else {
//         setRecentLolAnalyses(response.data.analyses || []);
//       }
//     } catch (error: any) {
//       console.error("❌ Failed to load recent analyses:", error);
//       console.error("❌ Error response:", error.response?.data);
//       console.error("❌ Error status:", error.response?.status);
      
//       // Set empty arrays on error
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
//     // Refresh analyses list if we're on that tab
//     if (activeTab === "analyses") {
//       loadRecentAnalyses();
//     }
//   };

//   if (!token || !user) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
//         <LoginButton />
//       </div>
//     );
//   }

//   const currentAnalyses = analysisGameTab === "fifa" ? recentFifaAnalyses : recentLolAnalyses;

//   return (
//     <div  className="p-6 max-w-4xl mx-auto">
//       {/* Header */}
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h1 className="text-xl font-bold">Welcome, {user.displayName}</h1>
//           <p className="text-sm text-gray-500">{user.email}</p>
//         </div>
//         <button
//           onClick={handleLogout}
//           className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
//         >
//           Logout
//         </button>
//       </div>

//       {/* Main Tabs */}
//       <div className="mb-6">
//         <div className="flex border-b border-gray-700">
//           <button
//             className={`px-4 py-2 font-medium ${
//               activeTab === "voice"
//                 ? "border-b-2 border-purple-500 text-purple-500"
//                 : "text-gray-500 hover:text-gray-300"
//             }`}
//             onClick={() => setActiveTab("voice")}
//           >
//             🎤 Voice Analysis
//           </button>
//           <button
//             className={`px-4 py-2 font-medium ${
//               activeTab === "analyses"
//                 ? "border-b-2 border-purple-500 text-purple-500"
//                 : "text-gray-500 hover:text-gray-300"
//             }`}
//             onClick={() => setActiveTab("analyses")}
//           >
//             📊 Recent Analyses
//           </button>
//         </div>
//       </div>

//       {/* Voice Analysis Tab */}
//       {activeTab === "voice" && (
//         <VoiceAnalysisTab 
//           token={token}
//           fifaAnalysis={fifaAnalysis}
//           lolAnalysis={lolAnalysis}
//           onNewAnalysis={handleNewAnalysis}
//         />
//       )}

//       {/* Recent Analyses Tab */}
//       {activeTab === "analyses" && (
//         <RecentAnalysesTab
//           analysisGameTab={analysisGameTab}
//           setAnalysisGameTab={setAnalysisGameTab}
//           currentAnalyses={currentAnalyses}
//           loadingAnalyses={loadingAnalyses}
//           onRefresh={loadRecentAnalyses}
//         />
//       )}
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
//   <div>
//     <p className="mb-4">Speak your game stats to get real-time analysis with voice responses.</p>

//     {/* Connection Status */}
//     <div className="mb-4 p-3 bg-blue-900/20 rounded-lg border border-blue-700/30">
//       <div className="flex items-center gap-2 text-sm">
//         <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
//         <span>Using real-time WebSocket connection for voice analysis</span>
//       </div>
//     </div>

//     {/* FIFA Voice Input */}
//     <div className="mb-6">
//       <h2 className="text-lg font-semibold mb-2">FIFA Analysis</h2>
//       <VoiceInput
//         userToken={token}
//         initialGame="fifa"
//         onAnalysis={(data) => onNewAnalysis(data, "fifa")}
//       />
//       {fifaAnalysis && <AnalysisDisplay analysis={fifaAnalysis} game="FIFA" />}
//     </div>

//     {/* LoL Voice Input */}
//     <div className="mb-6">
//       <h2 className="text-lg font-semibold mb-2">LoL Analysis</h2>
//       <VoiceInput
//         userToken={token}
//         initialGame="lol"
//         onAnalysis={(data) => onNewAnalysis(data, "lol")}
//       />
//       {lolAnalysis && <AnalysisDisplay analysis={lolAnalysis} game="LoL" />}
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
//   <div>
//     <div className="flex justify-between items-center mb-4">
//       <h2 className="text-lg font-semibold">Recent Analyses</h2>
//       <button
//         onClick={onRefresh}
//         className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
//         disabled={loadingAnalyses}
//       >
//         {loadingAnalyses ? "Refreshing..." : "Refresh"}
//       </button>
//     </div>

//     {/* Game Sub-tabs */}
//     <div className="flex border-b border-gray-700 mb-4">
//       <button
//         className={`px-4 py-2 text-sm font-medium ${
//           analysisGameTab === "fifa"
//             ? "border-b-2 border-green-500 text-green-500"
//             : "text-gray-500 hover:text-gray-300"
//         }`}
//         onClick={() => setAnalysisGameTab("fifa")}
//       >
//         🎮 FIFA
//       </button>
//       <button
//         className={`px-4 py-2 text-sm font-medium ${
//           analysisGameTab === "lol"
//             ? "border-b-2 border-blue-500 text-blue-500"
//             : "text-gray-500 hover:text-gray-300"
//         }`}
//         onClick={() => setAnalysisGameTab("lol")}
//       >
//         ⚔️ LoL
//       </button>
//     </div>

//     {loadingAnalyses ? (
//       <div className="text-center py-8">
//         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
//         <p className="mt-2 text-gray-500">Loading analyses...</p>
//       </div>
//     ) : currentAnalyses.length === 0 ? (
//       <div className="text-center py-8 bg-gray-800 rounded-lg">
//         <p className="text-gray-400">No {analysisGameTab.toUpperCase()} analyses found.</p>
//         <p className="text-sm text-gray-500 mt-1">Use the Voice Analysis tab to create your first analysis!</p>
//       </div>
//     ) : (
//       <div className="space-y-4">
//         {currentAnalyses.map((analysis) => (
//           <AnalysisHistoryItem 
//             key={analysis.id} 
//             analysis={analysis} 
//             game={analysisGameTab}
//           />
//         ))}
//       </div>
//     )}
//   </div>
// );

// // Analysis Display Component (for latest analysis in voice tab)
// const AnalysisDisplay: React.FC<{ analysis: any; game: string }> = ({ analysis, game }) => {
//   // Handle both data structures for display
//   const summary = analysis.summary || analysis.explanation || '';
//   const topTips = analysis.topTips || analysis.top_tips || [];
//   const trainingDrills = analysis.trainingDrills || analysis.drills || [];
//   const rating = analysis.rating;
//   const confidence = analysis.confidence || analysis.estimated_score;
//   const responseType = analysis.responseType || analysis.meta?.response_type || 'detailed';

//   return (
//     <div className="bg-gray-800 text-white p-4 rounded mt-3">
//       <h3 className="font-bold mb-2">Latest {game} Analysis:</h3>
//       <div className="text-sm">
//         <p><strong>Summary:</strong> {summary}</p>
//         {rating && <p><strong>Rating:</strong> {rating}/10</p>}
//         {confidence && <p><strong>Confidence:</strong> {Math.round(confidence * 100)}%</p>}
//         {topTips.length > 0 && (
//           <div className="mt-2">
//             <strong>Top Tips:</strong>
//             <ul className="list-disc ml-4">
//               {topTips.map((tip: string, index: number) => (
//                 <li key={index}>{tip}</li>
//               ))}
//             </ul>
//           </div>
//         )}
//         {trainingDrills.length > 0 && (
//           <div className="mt-2">
//             <strong>Training Drills:</strong>
//             <ul className="list-disc ml-4">
//               {trainingDrills.map((drill: string, index: number) => (
//                 <li key={index}>{drill}</li>
//               ))}
//             </ul>
//           </div>
//         )}
//         <p className="mt-2 text-xs text-gray-400">
//           Response Type: {responseType}
//         </p>
//       </div>
//     </div>
//   );
// };

// // Analysis History Item Component (for recent analyses list)
// const AnalysisHistoryItem: React.FC<{ analysis: AnalysisHistory; game: GameType }> = ({ analysis, game }) => {
//   const createdAt = new Date(analysis.created_at).toLocaleString();

//   return (
//     <div className="bg-gray-800 text-white p-4 rounded-lg border border-gray-700">
//       <div className="flex justify-between items-start mb-2">
//         <h4 className="font-semibold text-purple-400">
//           {game.toUpperCase()} Analysis
//         </h4>
//         <span className="text-xs text-gray-400">{createdAt}</span>
//       </div>
      
//       {analysis.user_text && (
//         <p className="text-sm text-gray-300 mb-3">
//           <strong>You said:</strong> "{analysis.user_text}"
//         </p>
//       )}

//       <div className="text-sm">
//         <p><strong>Summary:</strong> {analysis.summary}</p>
//         {analysis.rating && <p><strong>Rating:</strong> {analysis.rating}/10</p>}
//         {analysis.confidence && (
//           <p><strong>Confidence:</strong> {Math.round(analysis.confidence * 100)}%</p>
//         )}
        
//         {analysis.topTips && analysis.topTips.length > 0 && (
//           <div className="mt-2">
//             <strong>Top Tips:</strong>
//             <ul className="list-disc ml-4">
//               {analysis.topTips.slice(0, 3).map((tip: string, index: number) => (
//                 <li key={index}>{tip}</li>
//               ))}
//             </ul>
//           </div>
//         )}
        
//         {analysis.trainingDrills && analysis.trainingDrills.length > 0 && (
//           <div className="mt-2">
//             <strong>Training Drills:</strong>
//             <ul className="list-disc ml-4">
//               {analysis.trainingDrills.slice(0, 2).map((drill: string, index: number) => (
//                 <li key={index}>{drill}</li>
//               ))}
//             </ul>
//           </div>
//         )}
        
//         <p className="mt-2 text-xs text-gray-400">
//           Response Type: {analysis.responseType}
//         </p>
//       </div>
//     </div>
//   );
// };

// export default App;














// // App.tsx
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
//   analysis: any;
//   created_at: string;
//   game: string;
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

//   // Load recent analyses when analyses tab is active
//   useEffect(() => {
//     if (activeTab === "analyses" && token) {
//       loadRecentAnalyses();
//     }
//   }, [activeTab, analysisGameTab, token]);

//   const loadRecentAnalyses = async () => {
//     if (!token) return;
    
//     setLoadingAnalyses(true);
//     try {
//       const response = await axios.get(
//         `${API_BASE}/api/analyses/recent/${analysisGameTab}/`,
//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//           },
//         }
//       );

//       if (analysisGameTab === "fifa") {
//         setRecentFifaAnalyses(response.data.analyses || []);
//       } else {
//         setRecentLolAnalyses(response.data.analyses || []);
//       }
//     } catch (error) {
//       console.error("Failed to load recent analyses:", error);
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
//     // Refresh analyses list if we're on that tab
//     if (activeTab === "analyses") {
//       loadRecentAnalyses();
//     }
//   };

//   if (!token || !user) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
//         <LoginButton />
//       </div>
//     );
//   }

//   const currentAnalyses = analysisGameTab === "fifa" ? recentFifaAnalyses : recentLolAnalyses;

//   return (
//     <div className="p-6 max-w-4xl mx-auto">
//       {/* Header */}
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h1 className="text-xl font-bold">Welcome, {user.displayName}</h1>
//           <p className="text-sm text-gray-500">{user.email}</p>
//         </div>
//         <button
//           onClick={handleLogout}
//           className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
//         >
//           Logout
//         </button>
//       </div>

//       {/* Main Tabs */}
//       <div className="mb-6">
//         <div className="flex border-b border-gray-700">
//           <button
//             className={`px-4 py-2 font-medium ${
//               activeTab === "voice"
//                 ? "border-b-2 border-purple-500 text-purple-500"
//                 : "text-gray-500 hover:text-gray-300"
//             }`}
//             onClick={() => setActiveTab("voice")}
//           >
//             🎤 Voice Analysis
//           </button>
//           <button
//             className={`px-4 py-2 font-medium ${
//               activeTab === "analyses"
//                 ? "border-b-2 border-purple-500 text-purple-500"
//                 : "text-gray-500 hover:text-gray-300"
//             }`}
//             onClick={() => setActiveTab("analyses")}
//           >
//             📊 Recent Analyses
//           </button>
//         </div>
//       </div>

//       {/* Voice Analysis Tab */}
//       {activeTab === "voice" && (
//         <VoiceAnalysisTab 
//           token={token}
//           fifaAnalysis={fifaAnalysis}
//           lolAnalysis={lolAnalysis}
//           onNewAnalysis={handleNewAnalysis}
//         />
//       )}

//       {/* Recent Analyses Tab */}
//       {activeTab === "analyses" && (
//         <RecentAnalysesTab
//           analysisGameTab={analysisGameTab}
//           setAnalysisGameTab={setAnalysisGameTab}
//           currentAnalyses={currentAnalyses}
//           loadingAnalyses={loadingAnalyses}
//           onRefresh={loadRecentAnalyses}
//         />
//       )}
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
//   <div>
//     <p className="mb-4">Speak your game stats to get real-time analysis with voice responses.</p>

//     {/* Connection Status */}
//     <div className="mb-4 p-3 bg-blue-900/20 rounded-lg border border-blue-700/30">
//       <div className="flex items-center gap-2 text-sm">
//         <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
//         <span>Using real-time WebSocket connection for voice analysis</span>
//       </div>
//     </div>

//     {/* FIFA Voice Input */}
//     <div className="mb-6">
//       <h2 className="text-lg font-semibold mb-2">FIFA Analysis</h2>
//       <VoiceInput
//         userToken={token}
//         initialGame="fifa"
//         onAnalysis={(data) => onNewAnalysis(data, "fifa")}
//       />
//       {fifaAnalysis && <AnalysisDisplay analysis={fifaAnalysis} game="FIFA" />}
//     </div>

//     {/* LoL Voice Input */}
//     <div className="mb-6">
//       <h2 className="text-lg font-semibold mb-2">LoL Analysis</h2>
//       <VoiceInput
//         userToken={token}
//         initialGame="lol"
//         onAnalysis={(data) => onNewAnalysis(data, "lol")}
//       />
//       {lolAnalysis && <AnalysisDisplay analysis={lolAnalysis} game="LoL" />}
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
//   <div>
//     <div className="flex justify-between items-center mb-4">
//       <h2 className="text-lg font-semibold">Recent Analyses</h2>
//       <button
//         onClick={onRefresh}
//         className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
//         disabled={loadingAnalyses}
//       >
//         {loadingAnalyses ? "Refreshing..." : "Refresh"}
//       </button>
//     </div>

//     {/* Game Sub-tabs */}
//     <div className="flex border-b border-gray-700 mb-4">
//       <button
//         className={`px-4 py-2 text-sm font-medium ${
//           analysisGameTab === "fifa"
//             ? "border-b-2 border-green-500 text-green-500"
//             : "text-gray-500 hover:text-gray-300"
//         }`}
//         onClick={() => setAnalysisGameTab("fifa")}
//       >
//         🎮 FIFA
//       </button>
//       <button
//         className={`px-4 py-2 text-sm font-medium ${
//           analysisGameTab === "lol"
//             ? "border-b-2 border-blue-500 text-blue-500"
//             : "text-gray-500 hover:text-gray-300"
//         }`}
//         onClick={() => setAnalysisGameTab("lol")}
//       >
//         ⚔️ LoL
//       </button>
//     </div>

//     {loadingAnalyses ? (
//       <div className="text-center py-8">
//         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
//         <p className="mt-2 text-gray-500">Loading analyses...</p>
//       </div>
//     ) : currentAnalyses.length === 0 ? (
//       <div className="text-center py-8 bg-gray-800 rounded-lg">
//         <p className="text-gray-400">No {analysisGameTab.toUpperCase()} analyses found.</p>
//         <p className="text-sm text-gray-500 mt-1">Use the Voice Analysis tab to create your first analysis!</p>
//       </div>
//     ) : (
//       <div className="space-y-4">
//         {currentAnalyses.map((analysis) => (
//           <AnalysisHistoryItem 
//             key={analysis.id} 
//             analysis={analysis} 
//             game={analysisGameTab}
//           />
//         ))}
//       </div>
//     )}
//   </div>
// );

// // Analysis Display Component (for latest analysis in voice tab)
// const AnalysisDisplay: React.FC<{ analysis: any; game: string }> = ({ analysis, game }) => (
//   <div className="bg-gray-800 text-white p-4 rounded mt-3">
//     <h3 className="font-bold mb-2">Latest {game} Analysis:</h3>
//     <div className="text-sm">
//       <p><strong>Summary:</strong> {analysis.summary || analysis.explanation}</p>
//       {analysis.rating && <p><strong>Rating:</strong> {analysis.rating}/10</p>}
//       {analysis.estimated_score && <p><strong>Confidence:</strong> {Math.round(analysis.estimated_score * 100)}%</p>}
//       {analysis.topTips && analysis.topTips.length > 0 && (
//         <div className="mt-2">
//           <strong>Top Tips:</strong>
//           <ul className="list-disc ml-4">
//             {analysis.topTips.map((tip: string, index: number) => (
//               <li key={index}>{tip}</li>
//             ))}
//           </ul>
//         </div>
//       )}
//       {analysis.drills && analysis.drills.length > 0 && (
//         <div className="mt-2">
//           <strong>Training Drills:</strong>
//           <ul className="list-disc ml-4">
//             {analysis.drills.map((drill: string, index: number) => (
//               <li key={index}>{drill}</li>
//             ))}
//           </ul>
//         </div>
//       )}
//       <p className="mt-2 text-xs text-gray-400">
//         Response Type: {analysis.responseType || analysis.meta?.response_type || 'detailed'}
//       </p>
//     </div>
//   </div>
// );

// // Analysis History Item Component (for recent analyses list)
// const AnalysisHistoryItem: React.FC<{ analysis: AnalysisHistory; game: GameType }> = ({ analysis, game }) => {
//   const analysisData = analysis.analysis;
//   const createdAt = new Date(analysis.created_at).toLocaleString();

//   return (
//     <div className="bg-gray-800 text-white p-4 rounded-lg border border-gray-700">
//       <div className="flex justify-between items-start mb-2">
//         <h4 className="font-semibold text-purple-400">
//           {game.toUpperCase()} Analysis
//         </h4>
//         <span className="text-xs text-gray-400">{createdAt}</span>
//       </div>
      
//       {analysis.user_text && (
//         <p className="text-sm text-gray-300 mb-3">
//           <strong>You said:</strong> "{analysis.user_text}"
//         </p>
//       )}

//       <div className="text-sm">
//         <p><strong>Summary:</strong> {analysisData.summary || analysisData.explanation}</p>
//         {analysisData.rating && <p><strong>Rating:</strong> {analysisData.rating}/10</p>}
//         {analysisData.estimated_score && (
//           <p><strong>Confidence:</strong> {Math.round(analysisData.estimated_score * 100)}%</p>
//         )}
        
//         {analysisData.topTips && analysisData.topTips.length > 0 && (
//           <div className="mt-2">
//             <strong>Top Tips:</strong>
//             <ul className="list-disc ml-4">
//               {analysisData.topTips.slice(0, 2).map((tip: string, index: number) => (
//                 <li key={index}>{tip}</li>
//               ))}
//             </ul>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export default App;













// // App.tsx
// import React, { useEffect, useState } from "react";
// import LoginButton from "./components/LoginButton";
// import VoiceInput from "./components/VoiceInput";
// import { useAuthStore } from "./store/auth-store";
// import { auth } from "./firebase/firebaseClient";
// import { signOut, onAuthStateChanged } from "firebase/auth";

// const App: React.FC = () => {
//   const { user, token, login, logout } = useAuthStore();

//   const [fifaAnalysis, setFifaAnalysis] = useState<any>(null);
//   const [lolAnalysis, setLolAnalysis] = useState<any>(null);

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

//   const handleLogout = async () => {
//     await signOut(auth);
//     logout();
//   };

//   if (!token || !user) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
//         <LoginButton />
//       </div>
//     );
//   }

//   return (
//     <div className="p-6">
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h1 className="text-xl font-bold">Welcome, {user.displayName}</h1>
//           <p className="text-sm text-gray-500">{user.email}</p>
//         </div>

//         <button
//           onClick={handleLogout}
//           className="px-3 py-1 bg-red-600 text-white rounded"
//         >
//           Logout
//         </button>
//       </div>

//       <p className="mb-4">Speak your game stats to get real-time analysis with voice responses.</p>

//       {/* Connection Status */}
//       <div className="mb-4 p-3 bg-blue-900/20 rounded-lg border border-blue-700/30">
//         <div className="flex items-center gap-2 text-sm">
//           <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
//           <span>Using real-time WebSocket connection for voice analysis</span>
//         </div>
//       </div>

//       {/* ✅ FIFA Voice Input */}
//       <div className="mb-6">
//         <h2 className="text-lg font-semibold mb-2">FIFA Analysis</h2>
//         <VoiceInput
//           userToken={token}
//           initialGame="fifa"
//           onAnalysis={(data) => {
//             console.log("📊 FIFA Analysis:", data);
//             setFifaAnalysis(data);
//           }}
//         />

//         {fifaAnalysis && (
//           <div className="bg-gray-800 text-white p-4 rounded mt-3">
//             <h3 className="font-bold mb-2">Latest FIFA Analysis:</h3>
//             <div className="text-sm">
//               <p><strong>Summary:</strong> {fifaAnalysis.summary}</p>
//               {fifaAnalysis.rating && <p><strong>Rating:</strong> {fifaAnalysis.rating}/10</p>}
//               {fifaAnalysis.confidence && <p><strong>Confidence:</strong> {fifaAnalysis.confidence}%</p>}
//               {fifaAnalysis.topTips && fifaAnalysis.topTips.length > 0 && (
//                 <div className="mt-2">
//                   <strong>Top Tips:</strong>
//                   <ul className="list-disc ml-4">
//                     {fifaAnalysis.topTips.map((tip: string, index: number) => (
//                       <li key={index}>{tip}</li>
//                     ))}
//                   </ul>
//                 </div>
//               )}
//               {fifaAnalysis.trainingDrills && fifaAnalysis.trainingDrills.length > 0 && (
//                 <div className="mt-2">
//                   <strong>Training Drills:</strong>
//                   <ul className="list-disc ml-4">
//                     {fifaAnalysis.trainingDrills.map((drill: string, index: number) => (
//                       <li key={index}>{drill}</li>
//                     ))}
//                   </ul>
//                 </div>
//               )}
//               <p className="mt-2 text-xs text-gray-400">
//                 Response Type: {fifaAnalysis.responseType || 'detailed'}
//               </p>
//             </div>
//           </div>
//         )}
//       </div>

//       {/* ✅ LoL Voice Input */}
//       <div className="mb-6">
//         <h2 className="text-lg font-semibold mb-2">LoL Analysis</h2>
//         <VoiceInput
//           userToken={token}
//           initialGame="lol"
//           onAnalysis={(data) => {
//             console.log("🔥 LoL Analysis:", data);
//             setLolAnalysis(data);
//           }}
//         />

//         {lolAnalysis && (
//           <div className="bg-gray-800 text-white p-4 rounded mt-3">
//             <h3 className="font-bold mb-2">Latest LoL Analysis:</h3>
//             <div className="text-sm">
//               <p><strong>Summary:</strong> {lolAnalysis.summary}</p>
//               {lolAnalysis.rating && <p><strong>Rating:</strong> {lolAnalysis.rating}/10</p>}
//               {lolAnalysis.confidence && <p><strong>Confidence:</strong> {lolAnalysis.confidence}%</p>}
//               {lolAnalysis.topTips && lolAnalysis.topTips.length > 0 && (
//                 <div className="mt-2">
//                   <strong>Top Tips:</strong>
//                   <ul className="list-disc ml-4">
//                     {lolAnalysis.topTips.map((tip: string, index: number) => (
//                       <li key={index}>{tip}</li>
//                     ))}
//                   </ul>
//                 </div>
//               )}
//               {lolAnalysis.trainingDrills && lolAnalysis.trainingDrills.length > 0 && (
//                 <div className="mt-2">
//                   <strong>Training Drills:</strong>
//                   <ul className="list-disc ml-4">
//                     {lolAnalysis.trainingDrills.map((drill: string, index: number) => (
//                       <li key={index}>{drill}</li>
//                     ))}
//                   </ul>
//                 </div>
//               )}
//               <p className="mt-2 text-xs text-gray-400">
//                 Response Type: {lolAnalysis.responseType || 'detailed'}
//               </p>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export default App;










// // App.tsx
// import React, { useEffect, useState } from "react";
// import LoginButton from "./components/LoginButton";
// import VoiceInput from "./components/VoiceInput";
// import { useAuthStore } from "./store/auth-store";
// import { auth } from "./firebase/firebaseClient";
// import { signOut, onAuthStateChanged } from "firebase/auth";

// const App: React.FC = () => {
//   const { user, token, login, logout } = useAuthStore();

//   const [fifaAnalysis, setFifaAnalysis] = useState<any>(null);
//   const [lolAnalysis, setLolAnalysis] = useState<any>(null);

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

//   const handleLogout = async () => {
//     await signOut(auth);
//     logout();
//   };

//   if (!token || !user) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
//         <LoginButton />
//       </div>
//     );
//   }

//   return (
//     <div className="p-6">
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h1 className="text-xl font-bold">Welcome, {user.displayName}</h1>
//           <p className="text-sm text-gray-500">{user.email}</p>
//         </div>

//         <button
//           onClick={handleLogout}
//           className="px-3 py-1 bg-red-600 text-white rounded"
//         >
//           Logout
//         </button>
//       </div>

//       <p className="mb-4">Speak your game stats to get real-time analysis.</p>

//       {/* ✅ FIFA Voice Input */}
//       <div className="mb-6">
//         <h2 className="text-lg font-semibold mb-2">FIFA Analysis</h2>
//         <VoiceInput
//           userToken={token}
//           initialGame="fifa"
//           onAnalysis={(data) => {
//             console.log("📊 FIFA:", data);
//             setFifaAnalysis(data);
//           }}
//         />

//         {fifaAnalysis && (
//           <div className="bg-gray-800 text-white p-3 rounded mt-3">
//             <h3 className="font-bold">Latest FIFA Analysis:</h3>
//             <pre className="whitespace-pre-wrap text-xs">
//               {JSON.stringify(fifaAnalysis, null, 2)}
//             </pre>
//           </div>
//         )}
//       </div>

//       {/* ✅ LoL Voice Input */}
//       <div className="mb-6">
//         <h2 className="text-lg font-semibold mb-2">LoL Analysis</h2>
//         <VoiceInput
//           userToken={token}
//           initialGame="lol"
//           onAnalysis={(data) => {
//             console.log("🔥 LoL:", data);
//             setLolAnalysis(data);
//           }}
//         />

//         {lolAnalysis && (
//           <div className="bg-gray-800 text-white p-3 rounded mt-3">
//             <h3 className="font-bold">Latest LoL Analysis:</h3>
//             <pre className="whitespace-pre-wrap text-xs">
//               {JSON.stringify(lolAnalysis, null, 2)}
//             </pre>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export default App;














// // App.tsx
// import React, { useEffect } from "react";
// import LoginButton from "./components/LoginButton";
// import VoiceInput from "./components/VoiceInput";
// import { useAuthStore } from "./store/auth-store";
// import { auth } from "./firebase/firebaseClient";
// import { signOut, onAuthStateChanged } from "firebase/auth";

// const App: React.FC = () => {
//   const { user, token, login, logout } = useAuthStore();

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

//   const handleLogout = async () => {
//     await signOut(auth);
//     logout();
//   };

//   if (!token || !user) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
//         <LoginButton />
//       </div>
//     );
//   }

//   return (
//     <div className="p-6">
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h1 className="text-xl font-bold">Welcome, {user.displayName}</h1>
//           <p className="text-sm text-gray-500">{user.email}</p>
//         </div>

//         <button
//           onClick={handleLogout}
//           className="px-3 py-1 bg-red-600 text-white rounded"
//         >
//           Logout
//         </button>
//       </div>

//       <p className="mb-4">Speak your game stats to get real-time analysis.</p>

//       <div className="mb-6">
//         <h2 className="text-lg font-semibold mb-2">FIFA Analysis</h2>
//         <VoiceInput userToken={token} initialGame="fifa" />
//       </div>

//       <div>
//         <h2 className="text-lg font-semibold mb-2">LoL Analysis</h2>
//         <VoiceInput userToken={token} initialGame="lol" />
//       </div>
//     </div>
//   );
// };

// export default App;












// // App.tsx
// import React, { useEffect, useState } from "react";
// import LoginButton from "./components/LoginButton";
// import VoiceInput from "./components/VoiceInput";
// import { handleRedirectLogin, auth } from "./firebase/firebaseClient";
// import { signOut } from "firebase/auth";

// const App: React.FC = () => {
//   const [userToken, setUserToken] = useState<string | null>(null);
//   const [userName, setUserName] = useState<string | null>(null);
//   const [userEmail, setUserEmail] = useState<string | null>(null);

//   const handleLogin = (
//     token: string,
//     displayName: string | null,
//     email: string | null
//   ) => {
//     setUserToken(token);
//     setUserName(displayName);
//     setUserEmail(email);
//   };

//   // ✅ Handle redirect login on first load
//   useEffect(() => {
//     const checkRedirect = async () => {
//       const result = await handleRedirectLogin();
//       if (result) {
//         handleLogin(
//           result.token,
//           result.user.displayName,
//           result.user.email
//         );
//       }
//     };
//     checkRedirect();
//   }, []);

//   const handleLogout = async () => {
//     await signOut(auth);
//     setUserToken(null);
//     setUserName(null);
//     setUserEmail(null);
//   };

//   if (!userToken) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
//         <LoginButton onLogin={handleLogin} />
//       </div>
//     );
//   }

//   return (
//     <div className="p-6">
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h1 className="text-xl font-bold">Welcome, {userName}</h1>
//           <p className="text-sm text-gray-500">{userEmail}</p>
//         </div>
//         <button
//           onClick={handleLogout}
//           className="px-3 py-1 bg-red-600 text-white rounded"
//         >
//           Logout
//         </button>
//       </div>

//       <p className="mb-4">Speak your game stats to get real-time analysis.</p>

//       <div className="mb-6">
//         <h2 className="text-lg font-semibold mb-2">FIFA Analysis</h2>
//         <VoiceInput userToken={userToken} game="fifa" />
//       </div>

//       <div>
//         <h2 className="text-lg font-semibold mb-2">LoL Analysis</h2>
//         <VoiceInput userToken={userToken} game="lol" />
//       </div>
//     </div>
//   );
// };

// export default App;















// // App.tsx
// import React, { useState } from "react";
// import LoginButton from "./components/LoginButton";
// import VoiceInput from "./components/VoiceInput";


// const App: React.FC = () => {
//   const [userToken, setUserToken] = useState<string | null>(null);
//   const [userName, setUserName] = useState<string | null>(null);

//   const handleLogin = (token: string, displayName: string | null) => {
//     setUserToken(token);
//     setUserName(displayName);
//   };

//   if (!userToken) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen">
//         <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
//         <LoginButton onLogin={handleLogin} />
//       </div>
//     );
//   }

//   return (
//     <div className="p-4">
//       <h1 className="text-xl font-bold mb-2">Welcome, {userName}</h1>
//       <p className="mb-4">Speak your game stats to get real-time analysis.</p>

//       <div className="mb-6">
//         <h2 className="text-lg font-semibold">FIFA Analysis</h2>
//         <VoiceInput userToken={userToken} game="fifa" />
//       </div>

//       <div>
//         <h2 className="text-lg font-semibold">LoL Analysis</h2>
//         <VoiceInput userToken={userToken} game="lol" />
//       </div>
//     </div>
//   );
// };

// export default App;
