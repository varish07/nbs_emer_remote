import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { api, wsUrl } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("nbs_token"));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);
  const listenersRef = useRef(new Set());

  const fetchMe = useCallback(async () => {
    if (!token) return;
    try {
      const { data } = await api.get("/users/me");
      setUser(data);
    } catch (e) {
      localStorage.removeItem("nbs_token");
      setToken(null);
      setUser(null);
    }
  }, [token]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (token) await fetchMe();
      setLoading(false);
    })();
  }, [token, fetchMe]);

  // WebSocket
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl(token));
        wsRef.current = ws;
        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            listenersRef.current.forEach((cb) => cb(data));
          } catch (err) { void err; }
        };
        ws.onclose = () => {
          if (alive) setTimeout(connect, 2500);
        };
      } catch (err) { void err; }
    };
    connect();
    return () => {
      alive = false;
      try { wsRef.current?.close(); } catch (err) { void err; }
    };
  }, [token]);

  const subscribe = useCallback((cb) => {
    listenersRef.current.add(cb);
    return () => listenersRef.current.delete(cb);
  }, []);

  const login = (newToken, u) => {
    localStorage.setItem("nbs_token", newToken);
    setToken(newToken);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem("nbs_token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, setUser, loading, login, logout, refreshUser: fetchMe, subscribe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
