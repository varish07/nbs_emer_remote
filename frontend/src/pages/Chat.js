import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ChevronLeft, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Chat() {
  const { userId } = useParams();
  const { user, subscribe } = useAuth();
  const nav = useNavigate();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [other, setOther] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [msgsRes, friendsRes] = await Promise.all([
        api.get(`/chat/${userId}/messages`),
        api.get(`/requests/friends`),
      ]);
      setMessages(msgsRes.data.messages || []);
      const found = (friendsRes.data.friends || []).find((f) => f.id === userId);
      setOther(found || { id: userId, name: "User" });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Cannot open chat");
      nav("/friends");
    } finally { setLoading(false); }
  }, [userId, nav]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => subscribe((data) => {
    if (data?.type === "new_message" && data.message) {
      const m = data.message;
      if (m.from_user_id === userId || m.to_user_id === userId) {
        setMessages((prev) => [...prev, m]);
      }
    }
  }), [subscribe, userId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const { data } = await api.post(`/chat/send`, { to_user_id: userId, text });
      setMessages((m) => [...m, data.message]);
      setText("");
    } catch (e) {
      toast.error("Send failed");
    } finally { setSending(false); }
  };

  return (
    <div className="min-h-screen bg-[#f7f7f9] flex items-stretch justify-center">
      <div className="w-full max-w-md bg-white min-h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#EBEBEB] sticky top-0 bg-white/95 backdrop-blur-xl z-10">
          <button data-testid="chat-back-button" onClick={() => nav(-1)} className="p-1.5 rounded-full hover:bg-[#F3F4F6]">
            <ChevronLeft size={20} />
          </button>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFEBEE] to-[#E0F2F1] flex items-center justify-center font-display font-semibold">
            {other?.name?.[0] || "U"}
          </div>
          <div className="flex-1">
            <p className="font-display text-base font-semibold text-[#222]">{other?.name || "User"}</p>
            <p className="text-xs text-[#717171]">{other?.is_active ? "Active now" : "Connected"}</p>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scroll-clean" data-testid="chat-messages">
          {loading && <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#FF385C]" /></div>}
          {!loading && messages.length === 0 && (
            <p className="text-center text-sm text-[#717171] mt-8">Say hello to start the conversation 👋</p>
          )}
          {messages.map((m) => {
            const mine = m.from_user_id === user?.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] px-4 py-2.5 ${mine ? "bubble-me" : "bubble-them"} text-sm`}>
                  {m.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div className="sticky bottom-0 bg-white border-t border-[#EBEBEB] p-3 flex items-center gap-2">
          <input
            data-testid="chat-input-field"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Write a message…"
            className="flex-1 px-4 py-3 rounded-full bg-[#F3F4F6] outline-none focus:bg-white focus:ring-2 focus:ring-[#FF385C] text-sm"
          />
          <button
            data-testid="chat-send-button"
            onClick={send}
            disabled={sending || !text.trim()}
            className="w-11 h-11 shrink-0 rounded-full bg-[#FF385C] text-white flex items-center justify-center active:scale-95 disabled:opacity-50"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
