import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Users, Loader2, Search, Sparkles } from "lucide-react";
import UserListItem from "@/components/UserListItem";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

function fmt(m) {
  if (m == null) return "Location unknown";
  if (m < 1000) return `${Math.round(m)} m away`;
  return `${(m / 1000).toFixed(2)} km away`;
}

export default function ActiveUsers() {
  const [users, setUsers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState({});
  const [sent, setSent] = useState({});
  const [q, setQ] = useState("");
  const nav = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, m] = await Promise.allSettled([
        api.get("/users/active"),
        api.get("/users/matches"),
      ]);
      setUsers(a.status === "fulfilled" ? (a.value.data.users || []) : []);
      setMatches(m.status === "fulfilled" ? (m.value.data.matches || []) : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sendReq = async (id) => {
    setSending((s) => ({ ...s, [id]: true }));
    try {
      const { data } = await api.post("/requests/send", { to_user_id: id });
      if (data.status === "accepted") { toast.success("Connected!"); nav(`/chat/${id}`); }
      else { setSent((s) => ({ ...s, [id]: true })); toast.success("Request sent — waiting for response"); }
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setSending((s) => ({ ...s, [id]: false })); }
  };

  const cancelReq = async (id) => {
    try {
      await api.post("/requests/cancel", { to_user_id: id });
      setSent((s) => { const c = { ...s }; delete c[id]; return c; });
      toast.success("Request cancelled");
    } catch { toast.error("Failed to cancel"); }
  };

  const filtered = users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page-in">
      <div className="px-5 pt-7 pb-3">
        <p className="text-xs uppercase tracking-[0.22em] font-bold text-[#717171]">Activated now</p>
        <h1 className="font-display text-3xl font-bold text-[#222]">All active users</h1>
        <p className="text-sm text-[#717171] mt-1">Everyone live on NBS right now — no radius limit.</p>
      </div>

      <div className="px-5 mt-2">
        <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full px-4 py-3">
          <Search size={16} className="text-[#717171]" />
          <input
            data-testid="active-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search active users…"
            className="bg-transparent flex-1 outline-none text-sm"
          />
        </div>

        {loading && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF385C]" /></div>}

        {!loading && matches.length > 0 && (
          <div className="mt-4" data-testid="matches-section">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-[#FF385C]" />
              <p className="text-xs uppercase tracking-[0.18em] font-bold text-[#FF385C]">Suggested matches</p>
            </div>
            <p className="text-xs text-[#717171] mb-2">People with similar &ldquo;going to&rdquo; right now</p>
            <div className="divide-y divide-[#EBEBEB] rounded-2xl border border-[#FFDDE3] bg-[#FFF8F9] px-3">
              {matches.slice(0, 5).map((u) => (
                <UserListItem
                  key={`m-${u.id}`}
                  user={u}
                  subtitle={`Matched on: ${(u.matched_on || []).join(", ")}${u.distance_m != null ? ` · ${Math.round(u.distance_m)}m` : ""}`}
                  actionLabel="Send Request"
                  actionLoading={!!sending[u.id]}
                  actionDone={!!sent[u.id]}
                  onAction={() => sendReq(u.id)}
                  onCancel={() => cancelReq(u.id)}
                />
              ))}
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-2xl border border-[#EBEBEB] p-8 text-center bg-[#FAFAFA] mt-4" data-testid="empty-active">
            <Users className="mx-auto text-[#717171]" />
            <p className="text-sm text-[#717171] mt-2">No active users right now.</p>
          </div>
        )}

        <div className="divide-y divide-[#EBEBEB] mt-2" data-testid="active-list">
          {filtered.map((u) => (
            <UserListItem
              key={u.id}
              user={u}
              subtitle={fmt(u.distance_m)}
              actionLabel="Send Request"
              actionLoading={!!sending[u.id]}
              actionDone={!!sent[u.id]}
              onAction={() => sendReq(u.id)}
              onCancel={() => cancelReq(u.id)}
            />
          ))}
        </div>

        {users.length > 0 && (
          <p className="text-center text-xs text-[#717171] mt-6">{users.length} active {users.length === 1 ? "person" : "people"} right now</p>
        )}
      </div>
    </div>
  );
}
