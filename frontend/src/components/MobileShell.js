import { NavLink, useLocation } from "react-router-dom";
import { Compass, Users, Inbox, User, LifeBuoy } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const nav = [
  { to: "/", label: "Discover", icon: Compass, testid: "nav-discover" },
  { to: "/active", label: "Active", icon: Users, testid: "nav-active" },
  { to: "/requests", label: "Requests", icon: Inbox, testid: "nav-requests", badge: "requests" },
  { to: "/profile", label: "Profile", icon: User, testid: "nav-profile" },
];

export default function MobileShell({ children }) {
  const loc = useLocation();
  const { subscribe } = useAuth();
  const [requestsCount, setRequestsCount] = useState(0);

  const loadBadge = async () => {
    try {
      const { data } = await api.get("/requests/incoming");
      setRequestsCount(data.requests?.length || 0);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadBadge(); }, [loc.pathname]);

  useEffect(() => subscribe((d) => {
    if (d?.type === "new_request") loadBadge();
  }), [subscribe]);

  return (
    <div className="min-h-screen bg-[#f7f7f9]">
      <div className="max-w-md mx-auto min-h-screen bg-white relative shadow-sm">
        <div className="pb-24">{children}</div>
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/95 backdrop-blur-xl border-t border-[#EBEBEB] z-30">
          <ul className="flex items-center pt-2 pb-3 px-2 gap-1">
            {nav.map(({ to, label, icon: Icon, testid, badge }) => {
              const active = loc.pathname === to;
              return (
                <li key={to} className="flex-1 min-w-0">
                  <NavLink to={to} data-testid={testid} className="relative flex flex-col items-center gap-0.5 px-1 py-1 transition-transform active:scale-95">
                    <div className="relative">
                      <Icon size={22} strokeWidth={2} color={active ? "#FF385C" : "#717171"} />
                      {badge === "requests" && requestsCount > 0 && (
                        <span data-testid="requests-badge" className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#FF385C] text-white text-[10px] font-bold flex items-center justify-center">
                          {requestsCount > 9 ? "9+" : requestsCount}
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] font-medium ${active ? "text-[#FF385C]" : "text-[#717171]"}`}>{label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
