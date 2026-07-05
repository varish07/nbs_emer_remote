import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2, LogOut, Save, Camera, ShieldOff, Users, Download, Trash2, Link as LinkIcon, Smartphone } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
function resolveAvatar(av) {
  if (!av) return null;
  if (av.startsWith("http")) return av;
  return `${BACKEND_URL}${av}`;
}

export default function Profile() {
  const { user, refreshUser, logout } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", bio: "", avatar: "", going_to: "", home_location: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [blocked, setBlocked] = useState([]);
  const fileRef = useRef(null);

  useEffect(() => {
    if (user) setForm({
      name: user.name || "",
      email: user.email || "",
      bio: user.bio || "",
      avatar: user.avatar || "",
      going_to: user.going_to || "",
      home_location: user.home_location || "",
    });
  }, [user]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/block/list");
        setBlocked(data.blocked || []);
      } catch (err) { console.error("Failed to load blocked users:", err); }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/users/me", form);
      toast.success("Profile saved");
      await refreshUser();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error("Max 5MB");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/users/me/avatar", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((s) => ({ ...s, avatar: data.avatar }));
      toast.success("Photo updated");
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const unblock = async (id) => {
    try {
      await api.post("/unblock", { user_id: id });
      setBlocked((b) => b.filter((u) => u.id !== id));
      toast.success("Unblocked");
    } catch { toast.error("Failed"); }
  };

  const exportData = async () => {
    try {
      const { data } = await api.get("/users/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nbs-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Data exported");
    } catch { toast.error("Export failed"); }
  };

  const deleteAccount = async () => {
    const confirmText = window.prompt('This will PERMANENTLY delete your account and all data (messages, friends, blocks). This cannot be undone.\n\nType DELETE to confirm:');
    if (confirmText !== "DELETE") { toast.info("Cancelled"); return; }
    try {
      await api.delete("/users/me");
      toast.success("Account deleted. Goodbye 💔");
      setTimeout(() => logout(), 800);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  // ── Link phone (for users who signed up via Google) ──
  const [linkPhoneOpen, setLinkPhoneOpen] = useState(false);
  const [linkPhone, setLinkPhone] = useState("");
  const [linkOtpStep, setLinkOtpStep] = useState(false);
  const [linkOtp, setLinkOtp] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);

  const sendLinkOtp = async () => {
    const digits = linkPhone.replace(/\D/g, "");
    if (digits.length < 6) return toast.error("Enter a valid mobile number");
    setLinkBusy(true);
    try {
      await api.post("/users/me/link-phone/send-otp", { phone: `+${digits}` });
      setLinkOtpStep(true);
      toast.success("OTP sent");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setLinkBusy(false); }
  };

  const verifyLinkOtp = async () => {
    const digits = linkPhone.replace(/\D/g, "");
    setLinkBusy(true);
    try {
      const { data } = await api.post("/users/me/link-phone/verify", { phone: `+${digits}`, otp: linkOtp });
      toast.success("Mobile linked ✓");
      setLinkPhoneOpen(false); setLinkOtpStep(false); setLinkPhone(""); setLinkOtp("");
      await refreshUser();
    } catch (e) { toast.error(e.response?.data?.detail || "Verification failed"); }
    finally { setLinkBusy(false); }
  };

  // ── Link Google (for users who signed up via SMS OTP) ──
  const linkGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/auth/callback?link=1";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const fld = (k) => ({
    value: form[k],
    onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  const avatarSrc = resolveAvatar(form.avatar);

  return (
    <div className="page-in">
      <div className="px-5 pt-7 pb-3">
        <p className="text-xs uppercase tracking-[0.22em] font-bold text-[#717171]">Your account</p>
        <h1 className="font-display text-3xl font-bold text-[#222]">Profile</h1>
      </div>

      <div className="px-5 space-y-5 mt-2">
        <div className="flex items-center gap-4">
          <div className="relative">
            {avatarSrc ? (
              <img src={avatarSrc} alt="avatar" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FFEBEE] to-[#E0F2F1] flex items-center justify-center font-display font-bold text-2xl text-[#222]">
                {(form.name?.[0] || "U").toUpperCase()}
              </div>
            )}
            <button
              data-testid="upload-avatar-button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#FF385C] text-white flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-50"
              aria-label="Upload photo"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            </button>
            <input
              ref={fileRef}
              data-testid="avatar-file-input"
              type="file"
              accept="image/*"
              onChange={onPick}
              className="hidden"
            />
          </div>
          <div>
            <p className="font-display text-xl font-semibold text-[#222]">{form.name || "Your name"}</p>
            <p className="text-sm text-[#717171]">{user?.phone}</p>
            {form.home_location && (
              <p className="text-xs text-[#717171] mt-0.5" data-testid="profile-home-location-display">📍 {form.home_location}</p>
            )}
          </div>
        </div>

        <Field label="Display name">
          <input data-testid="profile-name-input" {...fld("name")} className="w-full px-4 py-3 rounded-xl border border-[#EBEBEB] focus:border-[#FF385C] outline-none" />
        </Field>
        <Field label="Email">
          <input data-testid="profile-email-input" {...fld("email")} type="email" className="w-full px-4 py-3 rounded-xl border border-[#EBEBEB] focus:border-[#FF385C] outline-none" />
        </Field>
        <Field label="Home location (optional, where you stay)">
          <input data-testid="profile-home-location-input" {...fld("home_location")} placeholder="e.g. Bengaluru, India" className="w-full px-4 py-3 rounded-xl border border-[#EBEBEB] focus:border-[#FF385C] outline-none" />
        </Field>
        <Field label="Short bio">
          <textarea data-testid="profile-bio-input" {...fld("bio")} rows={3} className="w-full px-4 py-3 rounded-xl border border-[#EBEBEB] focus:border-[#FF385C] outline-none resize-none" />
        </Field>

        <button
          data-testid="profile-save-button"
          onClick={save}
          disabled={saving}
          className="w-full bg-[#FF385C] hover:bg-[#E31C5F] text-white rounded-xl py-4 font-semibold flex items-center justify-center gap-2 shadow-lg shadow-[#FF385C]/20 active:scale-[0.98] transition disabled:opacity-50"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <><Save size={16} /> Save changes</>}
        </button>

        {blocked.length > 0 && (
          <div className="pt-4 border-t border-[#EBEBEB]">
            <p className="text-xs uppercase tracking-[0.18em] font-bold text-[#717171] mb-2">Blocked users</p>
            <div className="divide-y divide-[#EBEBEB]" data-testid="blocked-list">
              {blocked.map((u) => (
                <div key={u.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#F3F4F6] flex items-center justify-center">
                      <ShieldOff size={16} className="text-[#717171]" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{u.name}</p>
                      <p className="text-xs text-[#717171]">{u.phone}</p>
                    </div>
                  </div>
                  <button data-testid={`unblock-${u.id}`} onClick={() => unblock(u.id)} className="text-xs font-semibold text-[#FF385C] hover:underline">Unblock</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {user?.is_admin && (
          <button
            data-testid="open-admin-button"
            onClick={() => window.location.assign("/admin")}
            className="w-full bg-[#222] hover:bg-black text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2"
          >
            <Users size={16} /> Admin Dashboard
          </button>
        )}

        <button
          data-testid="open-support-button"
          onClick={() => window.location.assign("/support")}
          className="w-full border border-[#EBEBEB] hover:bg-[#F7F7F9] text-[#222] rounded-xl py-3 font-semibold flex items-center justify-center gap-2"
        >
          Support, Contact & Ideas
        </button>

        <div className="pt-4 border-t border-[#EBEBEB] space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] font-bold text-[#717171]">Sign-in methods</p>
          <div className="flex items-center gap-3 py-2">
            <div className="w-9 h-9 rounded-full bg-[#F3F4F6] flex items-center justify-center">
              <Smartphone size={16} className="text-[#717171]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#222]">Mobile OTP</p>
              <p className="text-xs text-[#717171]">{user?.phone || "Not linked"}</p>
            </div>
            {!user?.phone && (
              <button
                data-testid="link-phone-button"
                onClick={() => setLinkPhoneOpen(true)}
                className="text-xs font-semibold text-[#FF385C] hover:text-[#E31C5F] flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#FCA5A5]"
              >
                <LinkIcon size={12} /> Link
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 py-2">
            <div className="w-9 h-9 rounded-full bg-[#F3F4F6] flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.09-1.92 3.28-4.74 3.28-8.07z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#222]">Google</p>
              <p className="text-xs text-[#717171] truncate">{user?.email || "Not linked"}</p>
            </div>
            {!user?.email && (
              <button
                data-testid="link-google-button"
                onClick={linkGoogle}
                className="text-xs font-semibold text-[#FF385C] hover:text-[#E31C5F] flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#FCA5A5]"
              >
                <LinkIcon size={12} /> Link
              </button>
            )}
          </div>

          {linkPhoneOpen && (
            <div className="rounded-2xl border border-[#EBEBEB] p-4 space-y-3 bg-[#FAFAFA]" data-testid="link-phone-panel">
              {!linkOtpStep ? (
                <>
                  <div>
                    <label className="text-xs uppercase tracking-wide font-bold text-[#717171]">Mobile to link</label>
                    <div className="mt-2 flex items-center border-b-2 border-[#EBEBEB] focus-within:border-[#FF385C]">
                      <span className="text-lg font-medium text-[#222] select-none">+</span>
                      <input
                        data-testid="link-phone-input"
                        value={linkPhone}
                        onChange={(e) => setLinkPhone(e.target.value.replace(/\D/g, ""))}
                        inputMode="tel"
                        placeholder="91 98765 43210"
                        className="flex-1 py-2 pl-2 text-lg outline-none bg-transparent"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      data-testid="link-phone-send-button"
                      onClick={sendLinkOtp}
                      disabled={linkBusy}
                      className="flex-1 bg-[#FF385C] text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-60"
                    >
                      {linkBusy ? <Loader2 className="animate-spin inline" size={14} /> : "Send OTP"}
                    </button>
                    <button onClick={() => setLinkPhoneOpen(false)} className="px-3 rounded-xl border border-[#EBEBEB] text-sm">Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-[#717171]">Enter the code sent to <strong className="text-[#222]">+{linkPhone}</strong></p>
                  <input
                    data-testid="link-phone-otp-input"
                    value={linkOtp}
                    onChange={(e) => setLinkOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••••"
                    className="w-full text-center text-2xl tracking-[0.4em] py-3 border-b-2 border-[#EBEBEB] focus:border-[#FF385C] outline-none bg-transparent"
                  />
                  <div className="flex gap-2">
                    <button
                      data-testid="link-phone-verify-button"
                      onClick={verifyLinkOtp}
                      disabled={linkBusy}
                      className="flex-1 bg-[#FF385C] text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-60"
                    >
                      {linkBusy ? <Loader2 className="animate-spin inline" size={14} /> : "Verify & Link"}
                    </button>
                    <button onClick={() => { setLinkOtpStep(false); setLinkOtp(""); }} className="px-3 rounded-xl border border-[#EBEBEB] text-sm">Back</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <button
          data-testid="logout-button"
          onClick={logout}
          className="w-full border border-[#EBEBEB] hover:bg-[#F7F7F9] text-[#222] rounded-xl py-3 font-semibold flex items-center justify-center gap-2"
        >
          <LogOut size={16} /> Log out
        </button>

        <div className="pt-4 border-t border-[#EBEBEB] space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] font-bold text-[#717171]">Your data</p>
          <button
            data-testid="export-my-data-button"
            onClick={exportData}
            className="w-full border border-[#EBEBEB] hover:bg-[#F7F7F9] text-[#222] rounded-xl py-3 font-semibold flex items-center justify-center gap-2"
          >
            <Download size={16} /> Download my data (.json)
          </button>
          <button
            data-testid="delete-account-button"
            onClick={deleteAccount}
            className="w-full border border-[#FCA5A5] hover:bg-[#FEF2F2] text-[#B91C1C] rounded-xl py-3 font-semibold flex items-center justify-center gap-2"
          >
            <Trash2 size={16} /> Delete my account
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-[0.18em] font-bold text-[#717171]">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
