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
  // Analysis data at top level
  summary: string;
  topTips: string[];
  trainingDrills: string[];
  rating: number | null;
  confidence: number | null;
  responseType: string;
  // Optional nested analysis for backward compatibility
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

  // Load recent analyses when analyses tab is active
  useEffect(() => {
    if (activeTab === "analyses" && token) {
      loadRecentAnalyses();
    }
  }, [activeTab, analysisGameTab, token]);

  // const loadRecentAnalyses = async () => {
  //   if (!token) return;
    
  //   setLoadingAnalyses(true);
  //   try {
  //     const response = await axios.get(
  //       `${API_BASE}/api/analyses/recent/${analysisGameTab}/`,
  //       {
  //         headers: {
  //           Authorization: `Bearer ${token}`,
  //         },
  //       }
  //     );

  //     console.log("📊 Recent analyses response:", response.data); // Debug log

  //     if (analysisGameTab === "fifa") {
  //       setRecentFifaAnalyses(response.data.analyses || []);
  //     } else {
  //       setRecentLolAnalyses(response.data.analyses || []);
  //     }
  //   } catch (error) {
  //     console.error("Failed to load recent analyses:", error);
  //   } finally {
  //     setLoadingAnalyses(false);
  //   }
  // };

  const loadRecentAnalyses = async () => {
    if (!token) {
      console.log("❌ No token available");
      return;
    }
    
    setLoadingAnalyses(true);
    try {
      const url = `${API_BASE}/api/analyses/recent/${analysisGameTab}/`;
      console.log("🔍 Making request to:", url);
      console.log("🔍 Using token:", token.substring(0, 20) + "...");
      
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
  
      console.log("📊 Full API response:", response);
      console.log("📊 Response status:", response.status);
      console.log("📊 Response data:", response.data);
      console.log("📊 Analyses array:", response.data.analyses);
  
      if (analysisGameTab === "fifa") {
        setRecentFifaAnalyses(response.data.analyses || []);
      } else {
        setRecentLolAnalyses(response.data.analyses || []);
      }
    } catch (error: any) {
      console.error("❌ Failed to load recent analyses:", error);
      console.error("❌ Error response:", error.response?.data);
      console.error("❌ Error status:", error.response?.status);
      
      // Set empty arrays on error
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
    // Refresh analyses list if we're on that tab
    if (activeTab === "analyses") {
      loadRecentAnalyses();
    }
  };

  if (!token || !user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-2xl font-bold mb-4">NeuraPlay Analysis</h1>
        <LoginButton />
      </div>
    );
  }

  const currentAnalyses = analysisGameTab === "fifa" ? recentFifaAnalyses : recentLolAnalyses;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold">Welcome, {user.displayName}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Logout
        </button>
      </div>

      {/* Main Tabs */}
      <div className="mb-6">
        <div className="flex border-b border-gray-700">
          <button
            className={`px-4 py-2 font-medium ${
              activeTab === "voice"
                ? "border-b-2 border-purple-500 text-purple-500"
                : "text-gray-500 hover:text-gray-300"
            }`}
            onClick={() => setActiveTab("voice")}
          >
            🎤 Voice Analysis
          </button>
          <button
            className={`px-4 py-2 font-medium ${
              activeTab === "analyses"
                ? "border-b-2 border-purple-500 text-purple-500"
                : "text-gray-500 hover:text-gray-300"
            }`}
            onClick={() => setActiveTab("analyses")}
          >
            📊 Recent Analyses
          </button>
        </div>
      </div>

      {/* Voice Analysis Tab */}
      {activeTab === "voice" && (
        <VoiceAnalysisTab 
          token={token}
          fifaAnalysis={fifaAnalysis}
          lolAnalysis={lolAnalysis}
          onNewAnalysis={handleNewAnalysis}
        />
      )}

      {/* Recent Analyses Tab */}
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
  );
};

// Voice Analysis Tab Component
const VoiceAnalysisTab: React.FC<{
  token: string;
  fifaAnalysis: any;
  lolAnalysis: any;
  onNewAnalysis: (data: any, game: GameType) => void;
}> = ({ token, fifaAnalysis, lolAnalysis, onNewAnalysis }) => (
  <div>
    <p className="mb-4">Speak your game stats to get real-time analysis with voice responses.</p>

    {/* Connection Status */}
    <div className="mb-4 p-3 bg-blue-900/20 rounded-lg border border-blue-700/30">
      <div className="flex items-center gap-2 text-sm">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span>Using real-time WebSocket connection for voice analysis</span>
      </div>
    </div>

    {/* FIFA Voice Input */}
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-2">FIFA Analysis</h2>
      <VoiceInput
        userToken={token}
        initialGame="fifa"
        onAnalysis={(data) => onNewAnalysis(data, "fifa")}
      />
      {fifaAnalysis && <AnalysisDisplay analysis={fifaAnalysis} game="FIFA" />}
    </div>

    {/* LoL Voice Input */}
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-2">LoL Analysis</h2>
      <VoiceInput
        userToken={token}
        initialGame="lol"
        onAnalysis={(data) => onNewAnalysis(data, "lol")}
      />
      {lolAnalysis && <AnalysisDisplay analysis={lolAnalysis} game="LoL" />}
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
  <div>
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-lg font-semibold">Recent Analyses</h2>
      <button
        onClick={onRefresh}
        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        disabled={loadingAnalyses}
      >
        {loadingAnalyses ? "Refreshing..." : "Refresh"}
      </button>
    </div>

    {/* Game Sub-tabs */}
    <div className="flex border-b border-gray-700 mb-4">
      <button
        className={`px-4 py-2 text-sm font-medium ${
          analysisGameTab === "fifa"
            ? "border-b-2 border-green-500 text-green-500"
            : "text-gray-500 hover:text-gray-300"
        }`}
        onClick={() => setAnalysisGameTab("fifa")}
      >
        🎮 FIFA
      </button>
      <button
        className={`px-4 py-2 text-sm font-medium ${
          analysisGameTab === "lol"
            ? "border-b-2 border-blue-500 text-blue-500"
            : "text-gray-500 hover:text-gray-300"
        }`}
        onClick={() => setAnalysisGameTab("lol")}
      >
        ⚔️ LoL
      </button>
    </div>

    {loadingAnalyses ? (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
        <p className="mt-2 text-gray-500">Loading analyses...</p>
      </div>
    ) : currentAnalyses.length === 0 ? (
      <div className="text-center py-8 bg-gray-800 rounded-lg">
        <p className="text-gray-400">No {analysisGameTab.toUpperCase()} analyses found.</p>
        <p className="text-sm text-gray-500 mt-1">Use the Voice Analysis tab to create your first analysis!</p>
      </div>
    ) : (
      <div className="space-y-4">
        {currentAnalyses.map((analysis) => (
          <AnalysisHistoryItem 
            key={analysis.id} 
            analysis={analysis} 
            game={analysisGameTab}
          />
        ))}
      </div>
    )}
  </div>
);

// Analysis Display Component (for latest analysis in voice tab)
const AnalysisDisplay: React.FC<{ analysis: any; game: string }> = ({ analysis, game }) => {
  // Handle both data structures for display
  const summary = analysis.summary || analysis.explanation || '';
  const topTips = analysis.topTips || analysis.top_tips || [];
  const trainingDrills = analysis.trainingDrills || analysis.drills || [];
  const rating = analysis.rating;
  const confidence = analysis.confidence || analysis.estimated_score;
  const responseType = analysis.responseType || analysis.meta?.response_type || 'detailed';

  return (
    <div className="bg-gray-800 text-white p-4 rounded mt-3">
      <h3 className="font-bold mb-2">Latest {game} Analysis:</h3>
      <div className="text-sm">
        <p><strong>Summary:</strong> {summary}</p>
        {rating && <p><strong>Rating:</strong> {rating}/10</p>}
        {confidence && <p><strong>Confidence:</strong> {Math.round(confidence * 100)}%</p>}
        {topTips.length > 0 && (
          <div className="mt-2">
            <strong>Top Tips:</strong>
            <ul className="list-disc ml-4">
              {topTips.map((tip: string, index: number) => (
                <li key={index}>{tip}</li>
              ))}
            </ul>
          </div>
        )}
        {trainingDrills.length > 0 && (
          <div className="mt-2">
            <strong>Training Drills:</strong>
            <ul className="list-disc ml-4">
              {trainingDrills.map((drill: string, index: number) => (
                <li key={index}>{drill}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Response Type: {responseType}
        </p>
      </div>
    </div>
  );
};

// Analysis History Item Component (for recent analyses list)
const AnalysisHistoryItem: React.FC<{ analysis: AnalysisHistory; game: GameType }> = ({ analysis, game }) => {
  const createdAt = new Date(analysis.created_at).toLocaleString();

  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg border border-gray-700">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-purple-400">
          {game.toUpperCase()} Analysis
        </h4>
        <span className="text-xs text-gray-400">{createdAt}</span>
      </div>
      
      {analysis.user_text && (
        <p className="text-sm text-gray-300 mb-3">
          <strong>You said:</strong> "{analysis.user_text}"
        </p>
      )}

      <div className="text-sm">
        <p><strong>Summary:</strong> {analysis.summary}</p>
        {analysis.rating && <p><strong>Rating:</strong> {analysis.rating}/10</p>}
        {analysis.confidence && (
          <p><strong>Confidence:</strong> {Math.round(analysis.confidence * 100)}%</p>
        )}
        
        {analysis.topTips && analysis.topTips.length > 0 && (
          <div className="mt-2">
            <strong>Top Tips:</strong>
            <ul className="list-disc ml-4">
              {analysis.topTips.slice(0, 3).map((tip: string, index: number) => (
                <li key={index}>{tip}</li>
              ))}
            </ul>
          </div>
        )}
        
        {analysis.trainingDrills && analysis.trainingDrills.length > 0 && (
          <div className="mt-2">
            <strong>Training Drills:</strong>
            <ul className="list-disc ml-4">
              {analysis.trainingDrills.slice(0, 2).map((drill: string, index: number) => (
                <li key={index}>{drill}</li>
              ))}
            </ul>
          </div>
        )}
        
        <p className="mt-2 text-xs text-gray-400">
          Response Type: {analysis.responseType}
        </p>
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
