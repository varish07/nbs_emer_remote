import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, Flag, Users, MessageCircle, Ban, CheckCircle2, AlertTriangle, X, ArrowLeft, Trash2, Download, ShieldOff, LifeBuoy, Database, RefreshCw } from "lucide-react";

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-[#EBEBEB] p-4 bg-white">
      <Icon size={16} className="text-[#FF385C]" />
      <p className="text-2xl font-display font-bold mt-2">{value}</p>
      <p className="text-xs text-[#717171]">{label}</p>
    </div>
  );
}

function initials(n) { return (n || "U")[0].toUpperCase(); }
function fmtTime(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso; } }

export default function Admin() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("reports");
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [reportStatus, setReportStatus] = useState("open"); // open | all
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [openChat, setOpenChat] = useState(null); // { chat_key, users, messages }
  const [blocks, setBlocks] = useState([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  // "loaded" set tracks which tabs have been fetched — prevents refetch on tab switch
  const [loaded, setLoaded] = useState(() => new Set());
  const markLoaded = (t) => setLoaded((s) => new Set(s).add(t));

  useEffect(() => {
    if (loading) return;
    if (!user) nav("/login");
    else if (!user.is_admin) { toast.error("Admin only"); nav("/"); }
  }, [user, loading, nav]);

  const refreshTop = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/users", { params: q ? { q } : {} }),
      ]);
      setStats(s.data);
      setUsers(u.data.users || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load");
    }
  }, [q]);

  const refreshReports = useCallback(async () => {
    try {
      const params = reportStatus === "all" ? {} : { status: reportStatus };
      const r = await api.get("/admin/reports", { params });
      setReports(r.data.reports || []);
      markLoaded("reports");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load reports");
    }
  }, [reportStatus]);

  const refreshChats = useCallback(async () => {
    setChatsLoading(true);
    try {
      const c = await api.get("/admin/chats");
      setChats(c.data.chats || []);
      markLoaded("messages");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load chats");
    } finally { setChatsLoading(false); }
  }, []);

  const refreshBlocks = useCallback(async () => {
    setBlocksLoading(true);
    try {
      const { data } = await api.get("/admin/blocks");
      setBlocks(data.blocks || []);
      markLoaded("blocks");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load blocks");
    } finally { setBlocksLoading(false); }
  }, []);

  const refreshTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const { data } = await api.get("/admin/support");
      setTickets(data.tickets || []);
      markLoaded("support");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load tickets");
    } finally { setTicketsLoading(false); }
  }, []);

  useEffect(() => { if (user?.is_admin) refreshTop(); }, [user, refreshTop]);
  useEffect(() => { if (user?.is_admin && tab === "reports" && !loaded.has("reports")) refreshReports(); }, [user, tab, refreshReports, loaded]);
  useEffect(() => { if (user?.is_admin && tab === "messages" && !loaded.has("messages")) refreshChats(); }, [user, tab, refreshChats, loaded]);
  useEffect(() => { if (user?.is_admin && tab === "blocks" && !loaded.has("blocks")) refreshBlocks(); }, [user, tab, refreshBlocks, loaded]);
  useEffect(() => { if (user?.is_admin && tab === "support" && !loaded.has("support")) refreshTickets(); }, [user, tab, refreshTickets, loaded]);
  // When user changes the report filter, force a re-fetch
  useEffect(() => { if (user?.is_admin && loaded.has("reports")) refreshReports(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reportStatus]);

  const refreshCurrentTab = () => {
    if (tab === "reports") refreshReports();
    else if (tab === "messages") refreshChats();
    else if (tab === "blocks") refreshBlocks();
    else if (tab === "support") refreshTickets();
    else refreshTop();
  };

  const openChatDetail = async (chat_key) => {
    try {
      const { data } = await api.get(`/admin/chats/${encodeURIComponent(chat_key)}/messages`);
      setOpenChat({ chat_key, users: data.users || {}, messages: data.messages || [] });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load messages");
    }
  };

  const deleteMessage = async (messageId) => {
    if (!openChat) return;
    if (!window.confirm("Delete this message permanently?")) return;
    try {
      await api.delete(`/admin/messages/${messageId}`);
      setOpenChat((c) => c && { ...c, messages: c.messages.filter((m) => m.id !== messageId) });
      toast.success("Message deleted");
      refreshTop();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to delete");
    }
  };

  const exportChatCsv = async () => {
    if (!openChat) return;
    try {
      const res = await api.get(`/admin/chats/${encodeURIComponent(openChat.chat_key)}/export`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-${openChat.chat_key.replace(/\|/g, "_")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch { toast.error("Export failed"); }
  };

  const [backupBusy, setBackupBusy] = useState(false);
  const downloadFullBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await api.get("/admin/backup", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/zip" }));
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nbs-backup-${ts}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    } catch (e) { toast.error(e.response?.data?.detail || "Backup failed"); }
    finally { setBackupBusy(false); }
  };

  const resolve = async (id, action) => {
    setBusy(true);
    try {
      await api.post(`/admin/reports/${id}/resolve`, null, { params: { action } });
      toast.success("Report resolved");
      await Promise.all([refreshReports(), refreshTop()]);
    } catch { toast.error("Failed"); }
    finally { setBusy(false); }
  };

  const banToggle = async (uid, banned) => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${uid}/ban`, null, { params: { banned } });
      toast.success(banned ? "User banned" : "User unbanned");
      await refreshTop();
    } catch { toast.error("Failed"); }
    finally { setBusy(false); }
  };

  if (loading || !user?.is_admin) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[#FF385C]" /></div>;

  const TABS = [
    { id: "reports", label: "Reports" },
    { id: "users", label: "Users" },
    { id: "messages", label: "Messages" },
    { id: "blocks", label: "Blocks" },
    { id: "support", label: "Support" },
  ];

  return (
    <div className="page-in">
      <div className="px-5 pt-7 pb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] font-bold text-[#FF385C]">Admin</p>
          <h1 className="font-display text-3xl font-bold text-[#222]">Moderation</h1>
          <p className="text-sm text-[#717171] mt-1">Review reports, manage users, browse chats.</p>
        </div>
        <button data-testid="admin-back-button" onClick={() => nav("/")} className="p-2 rounded-full hover:bg-[#F3F4F6]" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-2 px-5 mt-2">
          <Stat label="Users total" value={stats.users_total} icon={Users} />
          <Stat label="Active now" value={stats.users_active} icon={CheckCircle2} />
          <Stat label="Open reports" value={stats.reports_open} icon={AlertTriangle} />
          <Stat label="Messages" value={stats.messages} icon={MessageCircle} />
        </div>
      )}

      <div className="px-5 mt-3">
        <button
          data-testid="admin-download-backup"
          onClick={downloadFullBackup}
          disabled={backupBusy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[#EBEBEB] hover:bg-[#F7F7F9] text-sm font-semibold text-[#222] disabled:opacity-60"
        >
          {backupBusy ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
          Download full DB backup (.zip)
        </button>
      </div>

      <div className="px-5 mt-5 flex gap-2 border-b border-[#EBEBEB] overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            data-testid={`admin-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`pb-2 px-3 text-sm font-semibold whitespace-nowrap ${tab === t.id ? "text-[#FF385C] border-b-2 border-[#FF385C]" : "text-[#717171]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "reports" && (
        <div className="px-5 mt-4 space-y-3" data-testid="admin-reports-list">
          <div className="flex items-center gap-2 mb-1">
            {["open", "all"].map((s) => (
              <button
                key={s}
                data-testid={`admin-reports-filter-${s}`}
                onClick={() => setReportStatus(s)}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold ${reportStatus === s ? "bg-[#FF385C] text-white" : "bg-[#F3F4F6] text-[#717171]"}`}
              >
                {s === "open" ? "Open" : "All"}
              </button>
            ))}
          </div>
          {reports.length === 0 && <p className="text-sm text-[#717171] text-center py-8">No reports.</p>}
          {reports.map((r) => (
            <div key={r.id} className="rounded-2xl border border-[#EBEBEB] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-xs text-[#717171]">{fmtTime(r.created_at)} · <span className="uppercase">{r.status}</span></div>
                  <p className="font-semibold text-sm mt-1">
                    <Flag size={12} className="inline mr-1 text-[#C13515]" />
                    {r.reporter?.name || "?"} → <span className="text-[#C13515]">{r.reported?.name || "?"}</span>
                  </p>
                  <p className="text-sm mt-1"><strong>Reason:</strong> {r.reason}</p>
                  {r.details && <p className="text-xs text-[#717171] mt-1">{r.details}</p>}
                </div>
                {r.status === "open" && (
                  <div className="flex flex-col gap-1">
                    <button data-testid={`resolve-${r.id}`} onClick={() => resolve(r.id, "dismissed")} disabled={busy} className="text-xs px-3 py-1.5 rounded-full bg-[#F3F4F6] hover:bg-[#EBEBEB]">Dismiss</button>
                    {r.reported && (
                      <button data-testid={`ban-from-report-${r.id}`} onClick={() => { banToggle(r.reported.id, true); resolve(r.id, "actioned"); }} disabled={busy} className="text-xs px-3 py-1.5 rounded-full bg-[#FF385C] text-white">Ban user</button>
                    )}
                  </div>
                )}
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
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFEBEE] to-[#E0F2F1] flex items-center justify-center font-display font-semibold text-sm">{initials(u.name)}</div>
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
            {users.length === 0 && <p className="text-sm text-[#717171] text-center py-8">No users.</p>}
          </div>
        </div>
      )}

      {tab === "messages" && (
        <div className="px-5 mt-4" data-testid="admin-chats-list">
          {chatsLoading && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF385C]" /></div>}
          {!chatsLoading && chats.length === 0 && <p className="text-sm text-[#717171] text-center py-8">No conversations yet.</p>}
          <div className="divide-y divide-[#EBEBEB]">
            {chats.map((c) => {
              const [a, b] = c.participants || [];
              return (
                <button
                  key={c.chat_key}
                  data-testid={`open-admin-chat-${c.chat_key}`}
                  onClick={() => openChatDetail(c.chat_key)}
                  className="w-full py-3 flex items-center gap-3 text-left hover:bg-[#F7F7F9] rounded-lg px-2 transition"
                >
                  <div className="flex -space-x-2">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FFEBEE] to-[#E0F2F1] flex items-center justify-center font-display font-semibold text-sm border-2 border-white">{initials(a?.name)}</div>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#E0F2F1] to-[#FFEBEE] flex items-center justify-center font-display font-semibold text-sm border-2 border-white">{initials(b?.name)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{a?.name || "?"} · {b?.name || "?"}</p>
                    <p className="text-xs text-[#717171] truncate">{c.last_message}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-[#717171]">{fmtTime(c.last_at).split(",")[0]}</p>
                    <p className="text-[10px] font-semibold text-[#FF385C]">{c.count} msg{c.count === 1 ? "" : "s"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === "blocks" && (
        <div className="px-5 mt-4" data-testid="admin-blocks-list">
          {blocksLoading && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF385C]" /></div>}
          {!blocksLoading && blocks.length === 0 && <p className="text-sm text-[#717171] text-center py-8">No block records.</p>}
          <div className="divide-y divide-[#EBEBEB]">
            {blocks.map((b) => (
              <div key={b.id} className="py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#FEE2E2] flex items-center justify-center"><ShieldOff size={14} className="text-[#C13515]" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold">{b.blocker?.name}</span>
                    <span className="text-[#717171] mx-1">blocked</span>
                    <span className="font-semibold text-[#C13515]">{b.blocked?.name}</span>
                  </p>
                  <p className="text-xs text-[#717171]">{b.blocker?.phone} → {b.blocked?.phone} · {fmtTime(b.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "support" && (
        <div className="px-5 mt-4 space-y-3" data-testid="admin-support-list">
          {ticketsLoading && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF385C]" /></div>}
          {!ticketsLoading && tickets.length === 0 && <p className="text-sm text-[#717171] text-center py-8">No support tickets.</p>}
          {tickets.map((t) => (
            <div key={t.id} className="rounded-2xl border border-[#EBEBEB] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-[#717171]">
                    <LifeBuoy size={12} />
                    <span className="uppercase tracking-wide">{t.type || "general"}</span>
                    <span>·</span>
                    <span>{fmtTime(t.created_at)}</span>
                  </div>
                  <p className="font-semibold text-sm mt-1">
                    {t.name || t.author?.name || "Anonymous"}
                    {t.email && <span className="text-[#717171] font-normal ml-2 text-xs">{t.email}</span>}
                  </p>
                  {t.author?.phone && <p className="text-xs text-[#717171]">{t.author.phone}</p>}
                  <p className="text-sm mt-2 whitespace-pre-wrap break-words">{t.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chat detail modal */}
      {openChat && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpenChat(null)}>
          <div
            className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            data-testid="admin-chat-detail"
          >
            <div className="flex items-center justify-between p-4 border-b border-[#EBEBEB]">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] font-bold text-[#717171]">Conversation</p>
                <p className="text-sm font-semibold text-[#222] truncate">
                  {Object.values(openChat.users).map((u) => u?.name || "?").join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button data-testid="export-admin-chat" onClick={exportChatCsv} className="p-2 rounded-full hover:bg-[#F3F4F6] text-[#222]" aria-label="Export CSV" title="Export CSV">
                  <Download size={18} />
                </button>
                <button data-testid="close-admin-chat" onClick={() => setOpenChat(null)} className="p-2 rounded-full hover:bg-[#F3F4F6]"><X size={18} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#FAFAFA]">
              {openChat.messages.map((m) => {
                const sender = openChat.users[m.from_user_id];
                return (
                  <div key={m.id} className="rounded-2xl bg-white border border-[#EBEBEB] p-3 group">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#FFEBEE] to-[#E0F2F1] flex items-center justify-center text-[10px] font-semibold">{initials(sender?.name)}</div>
                      <p className="text-xs font-semibold text-[#222]">{sender?.name || "?"}</p>
                      <p className="text-[10px] text-[#717171] ml-auto">{fmtTime(m.created_at)}</p>
                      <button
                        data-testid={`delete-admin-msg-${m.id}`}
                        onClick={() => deleteMessage(m.id)}
                        className="p-1 rounded-full text-[#C13515] hover:bg-[#FEE2E2]"
                        aria-label="Delete message"
                        title="Delete message"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="text-sm text-[#222] whitespace-pre-wrap break-words">{m.text}</p>
                  </div>
                );
              })}
              {openChat.messages.length === 0 && <p className="text-sm text-[#717171] text-center py-6">No messages.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
