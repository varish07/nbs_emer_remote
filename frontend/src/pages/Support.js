import { useState } from "react";
import { api } from "@/lib/api";
import { Lightbulb, LifeBuoy, Mail, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const TYPES = [
  { id: "support", label: "Support", icon: LifeBuoy, hint: "Got an issue? We will help." },
  { id: "contact", label: "Contact", icon: Mail, hint: "Reach our team." },
  { id: "idea", label: "Idea", icon: Lightbulb, hint: "Suggest a feature." },
];

export default function Support() {
  const { user } = useAuth();
  const [type, setType] = useState("support");
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!message.trim()) return toast.error("Please add a message");
    setSending(true);
    try {
      await api.post("/support", { type, name, email, message });
      toast.success("Submitted! We'll get back soon.");
      setMessage("");
    } catch { toast.error("Failed to send"); }
    finally { setSending(false); }
  };

  return (
    <div className="page-in">
      <div className="px-5 pt-7 pb-3">
        <p className="text-xs uppercase tracking-[0.22em] font-bold text-[#717171]">We are listening</p>
        <h1 className="font-display text-3xl font-bold text-[#222]">Help & Ideas</h1>
        <p className="text-sm text-[#717171] mt-1">Reach out for support, send a message, or share a brilliant idea.</p>
      </div>

      <div className="px-5 mt-2 space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map(({ id, label, icon: Icon, hint }) => {
            const active = type === id;
            return (
              <button
                key={id}
                data-testid={`support-type-${id}`}
                onClick={() => setType(id)}
                className={`p-3 rounded-2xl border text-left transition active:scale-95 ${active ? "border-[#FF385C] bg-[#FFEBEE]" : "border-[#EBEBEB] bg-white hover:bg-[#F7F7F9]"}`}
              >
                <Icon size={18} className={active ? "text-[#FF385C]" : "text-[#717171]"} />
                <p className={`mt-2 text-sm font-semibold ${active ? "text-[#FF385C]" : "text-[#222]"}`}>{label}</p>
                <p className="text-[10px] text-[#717171] mt-0.5">{hint}</p>
              </button>
            );
          })}
        </div>

        <input
          data-testid="support-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full px-4 py-3 rounded-xl border border-[#EBEBEB] focus:border-[#FF385C] outline-none"
        />
        <input
          data-testid="support-email-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optional)"
          type="email"
          className="w-full px-4 py-3 rounded-xl border border-[#EBEBEB] focus:border-[#FF385C] outline-none"
        />
        <textarea
          data-testid="support-message-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="Type your message…"
          className="w-full px-4 py-3 rounded-xl border border-[#EBEBEB] focus:border-[#FF385C] outline-none resize-none"
        />

        <button
          data-testid="support-submit-button"
          onClick={submit}
          disabled={sending}
          className="w-full bg-[#FF385C] hover:bg-[#E31C5F] text-white rounded-xl py-4 font-semibold flex items-center justify-center gap-2 shadow-lg shadow-[#FF385C]/20 active:scale-[0.98] transition disabled:opacity-50"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <><Send size={16} /> Submit</>}
        </button>

        <div className="rounded-2xl bg-[#F7F7F9] p-4 text-xs text-[#717171] text-center">
          NBS · Nearby Social · Stay safe — only share what you are comfortable with.
        </div>
      </div>
    </div>
  );
}
