import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const nav = useNavigate();
  const { login } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const fragment = window.location.hash || "";
    const match = fragment.match(/session_id=([^&]+)/);
    if (!match) {
      toast.error("Missing Google session. Please try again.");
      nav("/login", { replace: true });
      return;
    }
    const sessionId = decodeURIComponent(match[1]);

    (async () => {
      try {
        const { data } = await api.post("/auth/google/exchange", { session_id: sessionId });
        login(data.token, data.user);
        toast.success(`Welcome, ${data.user?.name || "friend"}!`);
        nav("/", { replace: true });
      } catch (e) {
        toast.error(e.response?.data?.detail || "Google sign-in failed");
        nav("/login", { replace: true });
      }
    })();
  }, [login, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7f9]">
      <div className="flex flex-col items-center gap-3" data-testid="auth-callback-loading">
        <Loader2 className="animate-spin text-[#FF385C]" size={28} />
        <p className="text-sm text-[#717171]">Signing you in with Google…</p>
      </div>
    </div>
  );
}
