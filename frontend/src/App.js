import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import "leaflet/dist/leaflet.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import ActiveUsers from "@/pages/ActiveUsers";
import MapView from "@/pages/MapView";
import Requests from "@/pages/Requests";
import Friends from "@/pages/Friends";
import Chat from "@/pages/Chat";
import Profile from "@/pages/Profile";
import Support from "@/pages/Support";
import Admin from "@/pages/Admin";
import MobileShell from "@/components/MobileShell";

function Protected({ children }) {
  const { token, loading } = useAuth();
  if (loading) return null;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function Shell({ children }) {
  return (
    <Protected>
      <MobileShell>{children}</MobileShell>
    </Protected>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Shell><Home /></Shell>} />
      <Route path="/active" element={<Shell><ActiveUsers /></Shell>} />
      <Route path="/map" element={<Shell><MapView /></Shell>} />
      <Route path="/requests" element={<Shell><Requests /></Shell>} />
      <Route path="/friends" element={<Shell><Friends /></Shell>} />
      <Route path="/chat/:userId" element={<Protected><Chat /></Protected>} />
      <Route path="/profile" element={<Shell><Profile /></Shell>} />
      <Route path="/support" element={<Shell><Support /></Shell>} />
      <Route path="/admin" element={<Shell><Admin /></Shell>} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}
