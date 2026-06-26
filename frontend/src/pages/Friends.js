import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Users, Loader2, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import UserListItem from "@/components/UserListItem";

export default function Friends() {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/requests/friends");
        setFriends(data.friends || []);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="page-in">
      <div className="px-5 pt-7 pb-3">
        <p className="text-xs uppercase tracking-[0.22em] font-bold text-[#717171]">Your network</p>
        <h1 className="font-display text-3xl font-bold text-[#222]">Friends</h1>
        <p className="text-sm text-[#717171] mt-1">People you&apos;ve connected with. Tap to chat.</p>
      </div>

      <div className="px-5">
        {loading && <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#FF385C]" /></div>}
        {!loading && friends.length === 0 && (
          <div className="rounded-2xl border border-[#EBEBEB] p-8 text-center bg-[#FAFAFA] mt-4" data-testid="empty-friends">
            <Users className="mx-auto text-[#717171]" />
            <p className="text-sm text-[#717171] mt-2">No friends yet. Send a request from Discover&#33;</p>
          </div>
        )}
        <div className="divide-y divide-[#EBEBEB]">
          {friends.map((f) => (
            <UserListItem
              key={f.id}
              user={f}
              subtitle={f.bio || "Tap to chat"}
              secondaryAction={
                <button
                  data-testid={`open-chat-${f.id}`}
                  onClick={() => nav(`/chat/${f.id}`)}
                  className="w-10 h-10 rounded-full bg-[#FF385C] text-white flex items-center justify-center active:scale-95"
                >
                  <MessageCircle size={16} />
                </button>
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
