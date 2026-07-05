import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { MapPin, Radar, Loader2, Send, Crosshair, CheckCircle2, AlertCircle, Map as MapIcon } from "lucide-react";
import UserListItem from "@/components/UserListItem";

function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m away`;
  return `${(m / 1000).toFixed(2)} km away`;
}

function formatRadius(m) {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export default function Home() {
  const { user, refreshUser, subscribe } = useAuth();
  const nav = useNavigate();
  const [radius, setRadius] = useState(user?.radius || 100);
  const [isActive, setIsActive] = useState(user?.is_active || false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locStatus, setLocStatus] = useState("idle"); // idle | requesting | ok | error
  const [coords, setCoords] = useState(user?.location || null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [sending, setSending] = useState({});
  const [sent, setSent] = useState({});
  const [accepted, setAccepted] = useState({});
  const [goingTo, setGoingTo] = useState(user?.going_to || "");

  const saveGoingTo = async () => {
    try {
      await api.put("/users/me", { going_to: goingTo });
      toast.success("Saved");
      await refreshUser();
    } catch { toast.error("Failed to save"); }
  };

  useEffect(() => {
    setRadius(user?.radius || 100);
    setIsActive(user?.is_active || false);
    setCoords(user?.location || null);
    setGoingTo(user?.going_to || "");
  }, [user]);

  const fetchNearby = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users/nearby");
      setUsers(data.users || []);
    } catch (e) {
      console.error("Failed to load nearby users:", e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (isActive && coords) fetchNearby();
  }, [isActive, coords, radius, fetchNearby]);

  // Listen to incoming ws events to refresh
  useEffect(() => {
    return subscribe((data) => {
      if (data?.type === "request_response" && data.status === "accepted") {
        setAccepted((s) => ({ ...s, [data.from_user_id]: true }));
        toast.success("Your request was accepted!");
      }
    });
  }, [subscribe]);

  const requestLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    setLocStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        try {
          await api.post("/users/me/location", { lat: latitude, lng: longitude });
          setLocStatus("ok");
          toast.success("Location updated");
          await refreshUser();
        } catch {
          setLocStatus("error");
        }
      },
      (err) => {
        setLocStatus("error");
        toast.error("Couldn't get location. Try manual entry.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const submitManual = async () => {
    const lat = parseFloat(manualLat), lng = parseFloat(manualLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return toast.error("Enter valid coordinates");
    try {
      await api.post("/users/me/location", { lat, lng });
      setCoords({ lat, lng });
      setLocStatus("ok");
      setManualOpen(false);
      toast.success("Location set");
      await refreshUser();
    } catch {
      toast.error("Failed to save location");
    }
  };

  const toggleActive = async () => {
    if (!coords && !isActive) {
      toast.error("Set your location first");
      return;
    }
    const next = !isActive;
    setIsActive(next);
    try {
      await api.post("/users/me/active", { is_active: next, radius });
      toast.success(next ? "You're now visible nearby" : "Going invisible");
      if (next) fetchNearby();
    } catch {
      setIsActive(!next);
      toast.error("Failed to update");
    }
  };

  const onRadiusCommit = async (val) => {
    const r = Array.isArray(val) ? val[0] : val;
    setRadius(r);
    try {
      await api.post("/users/me/active", { is_active: isActive, radius: r });
      if (isActive) fetchNearby();
    } catch (err) { void err; }
  };

  const sendRequest = async (toId) => {
    setSending((s) => ({ ...s, [toId]: true }));
    try {
      const { data } = await api.post("/requests/send", { to_user_id: toId });
      if (data.status === "accepted") {
        toast.success("Connected! You can chat now.");
        nav(`/chat/${toId}`);
      } else {
        setSent((s) => ({ ...s, [toId]: true }));
        toast.success("Request sent — waiting for response");
      }
      fetchNearby();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to send");
    } finally {
      setSending((s) => ({ ...s, [toId]: false }));
    }
  };

  const cancelRequest = async (toId) => {
    try {
      await api.post("/requests/cancel", { to_user_id: toId });
      setSent((s) => { const c = { ...s }; delete c[toId]; return c; });
      toast.success("Request cancelled");
    } catch { toast.error("Failed to cancel"); }
  };

  return (
    <div className="page-in">
      {/* Header */}
      <div className="px-5 pt-7 pb-3">
        <p className="text-xs uppercase tracking-[0.22em] font-bold text-[#717171]">Welcome back</p>
        <h1 className="font-display text-3xl font-bold text-[#222]">Hi, {user?.name || "there"}</h1>
        <p className="text-sm text-[#717171] mt-1">Discover who&apos;s around you right now.</p>
      </div>

      {/* Availability card */}
      <div className="mx-5 mt-2 rounded-3xl border border-[#EBEBEB] p-5 bg-white">
        {/* Location */}
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#717171] font-bold mb-2">Location</p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <MapPin size={16} className="text-[#717171]" />
              <span className="text-[#222] font-medium">
                {coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : "No location set"}
              </span>
            </div>
            <button
              data-testid="use-current-location-button"
              onClick={requestLocation}
              className="text-xs font-semibold text-[#FF385C] hover:text-[#E31C5F] flex items-center gap-1 px-2 py-1"
            >
              {locStatus === "requesting" ? <Loader2 className="animate-spin" size={14} /> : <Crosshair size={14} />}
              Use current
            </button>
          </div>
          <button
            data-testid="toggle-manual-location"
            onClick={() => setManualOpen((v) => !v)}
            className="text-xs text-[#717171] hover:text-[#222] underline mt-2"
          >
            {manualOpen ? "Hide manual entry" : "Enter coordinates manually"}
          </button>
          {manualOpen && (
            <div className="mt-3 flex items-center gap-2">
              <input
                data-testid="manual-lat-input"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="Lat"
                className="flex-1 border border-[#EBEBEB] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF385C]"
              />
              <input
                data-testid="manual-lng-input"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                placeholder="Lng"
                className="flex-1 border border-[#EBEBEB] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF385C]"
              />
              <button
                data-testid="save-manual-location"
                onClick={submitManual}
                className="bg-[#222] text-white text-sm rounded-lg px-3 py-2"
              >Set</button>
            </div>
          )}
        </div>

        <div className="flex items-start justify-between gap-4 mt-5 pt-4 border-t border-[#EBEBEB]">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#717171] font-bold">Visibility</p>
            <p className="font-display text-xl font-semibold mt-1 text-[#222]">{isActive ? "You're live" : "You're offline"}</p>
            <p className="text-sm text-[#717171] mt-1 max-w-[200px]">{isActive ? "People in your radius can find you." : "Turn on to start discovering people."}</p>
          </div>
          <button
            data-testid="availability-toggle"
            onClick={toggleActive}
            aria-pressed={isActive}
            className={`relative shrink-0 w-16 h-9 rounded-full transition-all duration-300 ${isActive ? "bg-[#FF385C] shadow-lg shadow-[#FF385C]/30" : "bg-[#F3F4F6]"}`}
          >
            <span className={`absolute top-1 ${isActive ? "left-8" : "left-1"} w-7 h-7 bg-white rounded-full shadow transition-all duration-300 flex items-center justify-center`}>
              <Radar size={14} color={isActive ? "#FF385C" : "#717171"} />
            </span>
          </button>
        </div>

        {/* Radius slider */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-[0.18em] font-bold text-[#717171]">Search radius</span>
            <span data-testid="radius-value" className="text-sm font-semibold text-[#FF385C]">{formatRadius(radius)}</span>
          </div>
          <Slider
            data-testid="radius-slider"
            value={[radius]}
            min={10}
            max={10000}
            step={10}
            onValueChange={(v) => setRadius(v[0])}
            onValueCommit={onRadiusCommit}
            className="my-3"
          />
          <div className="flex items-center justify-between text-[10px] text-[#9CA3AF]">
            <span>10 m</span><span>1 km</span><span>5 km</span><span>10 km</span>
          </div>
        </div>

        {/* Where are you headed */}
        <div className="mt-5 pt-4 border-t border-[#EBEBEB]">
          <label className="text-xs uppercase tracking-[0.18em] font-bold text-[#717171]">Where are you headed?</label>
          <div className="mt-2 flex items-center gap-2">
            <input
              data-testid="home-going-to-input"
              value={goingTo}
              onChange={(e) => setGoingTo(e.target.value)}
              placeholder="e.g. Coffee at MG Road"
              className="flex-1 px-4 py-2.5 rounded-xl border border-[#EBEBEB] focus:border-[#FF385C] outline-none text-sm"
            />
            <button
              data-testid="save-going-to-button"
              onClick={saveGoingTo}
              className="text-xs font-semibold bg-[#222] text-white rounded-xl px-4 py-2.5"
            >Save</button>
          </div>
          <p className="text-[10px] text-[#717171] mt-1.5">Visible to active users in your area.</p>
        </div>
      </div>

      {/* Nearby list */}
      <div className="px-5 mt-7">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-semibold text-[#222]">Nearby people</h2>
          <button onClick={fetchNearby} className="text-xs font-semibold text-[#FF385C]" data-testid="refresh-nearby">
            Refresh
          </button>
        </div>

        <button
          data-testid="open-map-button"
          onClick={() => nav("/map")}
          className="w-full mb-3 rounded-2xl border border-[#EBEBEB] bg-gradient-to-r from-[#FFEBEE] to-[#E0F2F1] py-3 flex items-center justify-center gap-2 text-sm font-semibold text-[#222] active:scale-[0.98] transition"
        >
          <MapIcon size={16} /> View on Map
        </button>

        {!isActive && (
          <div className="rounded-2xl border border-[#EBEBEB] p-5 text-center bg-[#FAFAFA]" data-testid="inactive-banner">
            <AlertCircle className="mx-auto text-[#FFB400]" size={22} />
            <p className="text-sm text-[#717171] mt-2">Turn on visibility to start discovering people around you.</p>
          </div>
        )}

        {isActive && loading && (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#FF385C]" /></div>
        )}

        {isActive && !loading && users.length === 0 && (
          <div className="rounded-2xl border border-[#EBEBEB] p-6 text-center bg-[#FAFAFA]" data-testid="empty-nearby">
            <Radar className="mx-auto text-[#717171]" />
            <p className="text-sm text-[#717171] mt-2">No active people in {formatRadius(radius)}. Try widening your radius.</p>
          </div>
        )}

        <div className="divide-y divide-[#EBEBEB]" data-testid="nearby-list">
          {users.map((u) => (
            <UserListItem
              key={u.id}
              user={u}
              subtitle={`${formatDistance(u.distance_m)}${u.bio ? ` · ${u.bio}` : ""}`}
              actionLabel="Send Request"
              actionLoading={!!sending[u.id]}
              actionDone={!!sent[u.id]}
              actionAccepted={!!accepted[u.id]}
              onAction={() => sendRequest(u.id)}
              onCancel={() => cancelRequest(u.id)}
              onChat={() => nav(`/chat/${u.id}`)}
            />
          ))}
        </div>

        {users.length > 0 && (
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[#717171]">
            <CheckCircle2 size={14} className="text-[#31A24C]" />
            Found {users.length} active {users.length === 1 ? "person" : "people"} in {formatRadius(radius)}
          </div>
        )}
      </div>
    </div>
  );
}
