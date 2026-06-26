import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Check, X, Inbox, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import UserListItem from "@/components/UserListItem";
import { useNavigate } from "react-router-dom";

export default function Requests() {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState({});
  const { subscribe } = useAuth();
  const nav = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/requests/incoming");
      setReqs(data.requests || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => subscribe((data) => {
    if (data?.type === "new_request") load();
  }), [subscribe, load]);

  const respond = async (request_id, accept, fromUser) => {
    setActing((s) => ({ ...s, [request_id]: true }));
    try {
      await api.post("/requests/respond", { request_id, accept });
      toast.success(accept ? "Request accepted" : "Request declined");
      setReqs((r) => r.filter((x) => x.request_id !== request_id));
      if (accept) nav(`/chat/${fromUser.id}`);
    } catch {
      toast.error("Failed");
    } finally {
      setActing((s) => ({ ...s, [request_id]: false }));
    }
  };

  return (
    <div className="page-in">
      <div className="px-5 pt-7 pb-3">
        <p className="text-xs uppercase tracking-[0.22em] font-bold text-[#717171]">Inbox</p>
        <h1 className="font-display text-3xl font-bold text-[#222]">Requests</h1>
        <p className="text-sm text-[#717171] mt-1">Accept to start a chat conversation.</p>
      </div>

      <div className="px-5">
        {loading && <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#FF385C]" /></div>}

        {!loading && reqs.length === 0 && (
          <div className="rounded-2xl border border-[#EBEBEB] p-8 text-center bg-[#FAFAFA] mt-4" data-testid="empty-requests">
            <Inbox className="mx-auto text-[#717171]" />
            <p className="text-sm text-[#717171] mt-2">No pending requests yet.</p>
          </div>
        )}

        <div className="divide-y divide-[#EBEBEB]">
          {reqs.map((r) => (
            <UserListItem
              key={r.request_id}
              user={r.from}
              subtitle="Wants to connect"
              secondaryAction={
                <div className="flex items-center gap-2">
                  <button
                    data-testid={`accept-request-${r.request_id}`}
                    onClick={() => respond(r.request_id, true, r.from)}
                    disabled={acting[r.request_id]}
                    className="w-9 h-9 rounded-full bg-[#FF385C] text-white flex items-center justify-center active:scale-95 transition disabled:opacity-50"
                  >
                    {acting[r.request_id] ? <Loader2 size={14} className="animate-spin" /> : <Check size={16} />}
                  </button>
                  <button
                    data-testid={`reject-request-${r.request_id}`}
                    onClick={() => respond(r.request_id, false, r.from)}
                    disabled={acting[r.request_id]}
                    className="w-9 h-9 rounded-full bg-[#F3F4F6] text-[#717171] flex items-center justify-center active:scale-95 transition disabled:opacity-50"
                  >
                    <X size={16} />
                  </button>
                </div>
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
