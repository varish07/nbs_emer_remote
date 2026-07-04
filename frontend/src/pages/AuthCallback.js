import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const nav = useNavigate();
  const loc = useLocation();
  const { login, refreshUser, token } = useAuth();
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
    // If user was already signed in and clicked "Link Google", we called with ?link=1
    const isLinking = new URLSearchParams(loc.search).get("link") === "1" && !!token;

    (async () => {
      try {
        if (isLinking) {
          await api.post("/users/me/link-google", { session_id: sessionId });
          toast.success("Google account linked ✓");
          await refreshUser();
          nav("/profile", { replace: true });
        } else {
          const { data } = await api.post("/auth/google/exchange", { session_id: sessionId });
          login(data.token, data.user);
          toast.success(`Welcome, ${data.user?.name || "friend"}!`);
          nav("/", { replace: true });
        }
      } catch (e) {
        toast.error(e.response?.data?.detail || (isLinking ? "Link failed" : "Google sign-in failed"));
        nav(isLinking ? "/profile" : "/login", { replace: true });
      }
    })();
  }, [login, nav, loc.search, refreshUser, token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7f9]">
      <div className="flex flex-col items-center gap-3" data-testid="auth-callback-loading">
        <Loader2 className="animate-spin text-[#FF385C]" size={28} />
        <p className="text-sm text-[#717171]">Signing you in with Google…</p>
      </div>
    </div>
  );
}
