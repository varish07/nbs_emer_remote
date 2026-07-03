import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2, LogOut, Save, Camera, ShieldOff, Users } from "lucide-react";
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
      } catch { /* ignore */ }
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

        <button
          data-testid="logout-button"
          onClick={logout}
          className="w-full border border-[#EBEBEB] hover:bg-[#F7F7F9] text-[#222] rounded-xl py-3 font-semibold flex items-center justify-center gap-2"
        >
          <LogOut size={16} /> Log out
        </button>
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
