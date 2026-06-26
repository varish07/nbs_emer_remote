import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, MoreVertical, Shield, Flag, Navigation2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

function initials(name) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
function resolveAvatar(av) {
  if (!av) return null;
  if (av.startsWith("http")) return av;
  return `${BACKEND_URL}${av}`;
}

export default function UserListItem({ user, subtitle, actionLabel, actionLoading, actionDone, actionAccepted, onAction, onCancel, onChat, secondaryAction, onBlocked }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reason, setReason] = useState("");
  const menuRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const block = async () => {
    setMenuOpen(false);
    try {
      await api.post("/block", { user_id: user.id });
      toast.success(`${user.name} blocked`);
      onBlocked && onBlocked(user.id);
    } catch { toast.error("Failed to block"); }
  };

  const submitReport = async () => {
    if (!reason.trim()) return toast.error("Pick a reason");
    setReporting(true);
    try {
      await api.post("/report", { user_id: user.id, reason });
      toast.success("Report submitted. Our team will review.");
      setShowReport(false);
      setReason("");
    } catch { toast.error("Failed to report"); }
    finally { setReporting(false); }
  };

  return (
    <div className="flex items-center gap-4 py-4 relative" data-testid={`user-item-${user.id}`}>
      <div className="relative shrink-0">
        {user.avatar ? (
          <img src={resolveAvatar(user.avatar)} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FFEBEE] to-[#E0F2F1] flex items-center justify-center font-display font-semibold text-[#222]">
            {initials(user.name)}
          </div>
        )}
        {user.is_active && (
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#31A24C] border-2 border-white online-dot" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-[#222] truncate">{user.name}</p>
        <p className="text-xs text-[#717171] truncate flex items-center gap-1">
          <MapPin size={11} /> {subtitle}
        </p>
        {user.going_to && (
          <span data-testid={`going-to-${user.id}`} className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-[#FFEBEE] text-[#FF385C] text-[10px] font-semibold max-w-full truncate">
            <Navigation2 size={10} /> Going to: {user.going_to}
          </span>
        )}
      </div>
      {actionLabel && (
        <div className="shrink-0 flex flex-col items-end gap-1">
          <button
            data-testid={`send-request-button-${user.id}`}
            onClick={onAction}
            disabled={actionLoading || actionDone}
            className={`text-xs font-semibold px-3.5 py-2 rounded-full active:scale-95 transition ${actionDone ? "bg-[#E8F5E9] text-[#1B7F2E] border border-[#1B7F2E]" : "border border-[#FF385C] text-[#FF385C] hover:bg-[#FFEBEE]"} disabled:opacity-100`}
          >
            {actionLoading ? <Loader2 size={14} className="animate-spin" /> : actionAccepted ? "✓ Accepted" : actionDone ? "✓ Sent" : actionLabel}
          </button>
          {actionDone && onCancel && (
            <button data-testid={`cancel-request-button-${user.id}`} onClick={onCancel} className="text-[10px] font-semibold text-[#717171] hover:text-[#C13515] underline">Cancel</button>
          )}
          {actionAccepted && onChat && (
            <button data-testid={`chat-now-button-${user.id}`} onClick={onChat} className="text-[10px] font-semibold text-[#1B7F2E] hover:underline">Chat →</button>
          )}
        </div>
      )}
      {secondaryAction}

      {/* Safety menu */}
      <div className="relative" ref={menuRef}>
        <button
          data-testid={`user-menu-${user.id}`}
          onClick={() => setMenuOpen((v) => !v)}
          className="w-8 h-8 rounded-full hover:bg-[#F3F4F6] flex items-center justify-center text-[#717171]"
          aria-label="More"
        >
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 z-40 bg-white border border-[#EBEBEB] rounded-xl shadow-lg w-44 py-1">
            <button data-testid={`block-user-${user.id}`} onClick={block} className="w-full text-left px-3 py-2 text-sm hover:bg-[#F7F7F9] flex items-center gap-2">
              <Shield size={14} /> Block user
            </button>
            <button data-testid={`report-user-${user.id}`} onClick={() => { setMenuOpen(false); setShowReport(true); }} className="w-full text-left px-3 py-2 text-sm hover:bg-[#F7F7F9] flex items-center gap-2 text-[#C13515]">
              <Flag size={14} /> Report user
            </button>
          </div>
        )}
      </div>

      {showReport && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowReport(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl font-semibold mb-1">Report {user.name}</h3>
            <p className="text-sm text-[#717171] mb-4">Help us keep NBS safe. Pick a reason:</p>
            <div className="space-y-2">
              {["Spam or scam", "Harassment", "Inappropriate content", "Fake profile", "Other"].map((r) => (
                <button
                  key={r}
                  data-testid={`report-reason-${r.replace(/\s+/g, "-").toLowerCase()}`}
                  onClick={() => setReason(r)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition ${reason === r ? "border-[#FF385C] bg-[#FFEBEE] text-[#FF385C]" : "border-[#EBEBEB] hover:bg-[#F7F7F9]"}`}
                >{r}</button>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowReport(false)} className="flex-1 py-3 rounded-xl border border-[#EBEBEB] font-semibold">Cancel</button>
              <button data-testid="report-submit" onClick={submitReport} disabled={reporting} className="flex-1 py-3 rounded-xl bg-[#FF385C] text-white font-semibold disabled:opacity-50">
                {reporting ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
