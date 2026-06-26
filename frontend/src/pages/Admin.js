import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, Shield, Flag, Users, MessageCircle, Ban, CheckCircle2, AlertTriangle } from "lucide-react";

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-[#EBEBEB] p-4 bg-white">
      <Icon size={16} className="text-[#FF385C]" />
      <p className="text-2xl font-display font-bold mt-2">{value}</p>
      <p className="text-xs text-[#717171]">{label}</p>
    </div>
  );
}

export default function Admin() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("reports");
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) nav("/login");
    else if (!user.is_admin) { toast.error("Admin only"); nav("/"); }
  }, [user, loading, nav]);

  const refresh = useCallback(async () => {
    try {
      const [s, r, u] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/reports", { params: { status: "open" } }),
        api.get("/admin/users", { params: q ? { q } : {} }),
      ]);
      setStats(s.data);
      setReports(r.data.reports || []);
      setUsers(u.data.users || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load");
    }
  }, [q]);

  useEffect(() => { if (user?.is_admin) refresh(); }, [user, refresh]);

  const resolve = async (id, action) => {
    setBusy(true);
    try {
      await api.post(`/admin/reports/${id}/resolve`, null, { params: { action } });
      toast.success("Report resolved");
      await refresh();
    } catch { toast.error("Failed"); }
    finally { setBusy(false); }
  };

  const banToggle = async (uid, banned) => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${uid}/ban`, null, { params: { banned } });
      toast.success(banned ? "User banned" : "User unbanned");
      await refresh();
    } catch { toast.error("Failed"); }
    finally { setBusy(false); }
  };

  if (loading || !user?.is_admin) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[#FF385C]" /></div>;

  return (
    <div className="page-in">
      <div className="px-5 pt-7 pb-3">
        <p className="text-xs uppercase tracking-[0.22em] font-bold text-[#FF385C]">Admin</p>
        <h1 className="font-display text-3xl font-bold text-[#222]">Moderation</h1>
        <p className="text-sm text-[#717171] mt-1">Review reports, manage users, monitor the platform.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-2 px-5 mt-2">
          <Stat label="Users total" value={stats.users_total} icon={Users} />
          <Stat label="Active now" value={stats.users_active} icon={CheckCircle2} />
          <Stat label="Open reports" value={stats.reports_open} icon={AlertTriangle} />
        </div>
      )}

      <div className="px-5 mt-5 flex gap-2 border-b border-[#EBEBEB]">
        {["reports", "users"].map((t) => (
          <button key={t} data-testid={`admin-tab-${t}`} onClick={() => setTab(t)} className={`pb-2 px-3 text-sm font-semibold capitalize ${tab === t ? "text-[#FF385C] border-b-2 border-[#FF385C]" : "text-[#717171]"}`}>{t}</button>
        ))}
      </div>

      {tab === "reports" && (
        <div className="px-5 mt-4 space-y-3" data-testid="admin-reports-list">
          {reports.length === 0 && <p className="text-sm text-[#717171] text-center py-8">No open reports 🎉</p>}
          {reports.map((r) => (
            <div key={r.id} className="rounded-2xl border border-[#EBEBEB] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-xs text-[#717171]">{new Date(r.created_at).toLocaleString()}</div>
                  <p className="font-semibold text-sm mt-1">
                    <Flag size={12} className="inline mr-1 text-[#C13515]" />
                    {r.reporter?.name || "?"} → <span className="text-[#C13515]">{r.reported?.name || "?"}</span>
                  </p>
                  <p className="text-sm mt-1"><strong>Reason:</strong> {r.reason}</p>
                  {r.details && <p className="text-xs text-[#717171] mt-1">{r.details}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <button data-testid={`resolve-${r.id}`} onClick={() => resolve(r.id, "dismissed")} disabled={busy} className="text-xs px-3 py-1.5 rounded-full bg-[#F3F4F6] hover:bg-[#EBEBEB]">Dismiss</button>
                  {r.reported && (
                    <button data-testid={`ban-from-report-${r.id}`} onClick={() => { banToggle(r.reported.id, true); resolve(r.id, "actioned"); }} disabled={busy} className="text-xs px-3 py-1.5 rounded-full bg-[#FF385C] text-white">Ban user</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "users" && (
        <div className="px-5 mt-4">
          <input data-testid="admin-user-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone…" className="w-full px-4 py-3 rounded-xl border border-[#EBEBEB] focus:border-[#FF385C] outline-none text-sm mb-3" />
          <div className="divide-y divide-[#EBEBEB]" data-testid="admin-users-list">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFEBEE] to-[#E0F2F1] flex items-center justify-center font-display font-semibold text-sm">{(u.name || "U")[0]}</div>
                  <div>
                    <p className="text-sm font-semibold">{u.name} {u.is_banned && <span className="text-[10px] text-[#C13515] ml-1">BANNED</span>}</p>
                    <p className="text-xs text-[#717171]">{u.phone} · {u.is_active ? "active" : "offline"}</p>
                  </div>
                </div>
                <button data-testid={`toggle-ban-${u.id}`} onClick={() => banToggle(u.id, !u.is_banned)} disabled={busy} className={`text-xs px-3 py-1.5 rounded-full ${u.is_banned ? "bg-[#F3F4F6]" : "bg-[#FF385C] text-white"}`}>
                  <Ban size={12} className="inline mr-1" /> {u.is_banned ? "Unban" : "Ban"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
