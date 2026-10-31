import React from "react";
import { useAuthSession } from "./hooks/useAuthSession";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";

const App: React.FC = () => {
  const { user, token, isAuthenticated, logout } = useAuthSession();

  if (!isAuthenticated || !user || !token) {
    return <AuthPage />;
  }

  return <DashboardPage user={user} token={token} onLogout={logout} />;
};

export default App;
