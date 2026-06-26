import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2, MapPin, Flame } from "lucide-react";

// Fix Leaflet's default icon path issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const meIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#FF385C;border:3px solid white;box-shadow:0 0 0 3px rgba(255,56,92,.25)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const userIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#31A24C;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.2)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function HeatLayer({ points, enabled }) {
  const map = useMap();
  const layerRef = useRef(null);
  useEffect(() => {
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    if (enabled && points.length > 0) {
      layerRef.current = L.heatLayer(points, { radius: 30, blur: 22, maxZoom: 17, gradient: { 0.2: "#FFEBEE", 0.5: "#FF385C", 0.9: "#C13515" } }).addTo(map);
    }
    return () => { if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; } };
  }, [points, enabled, map]);
  return null;
}

export default function MapView() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [heat, setHeat] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/users/active");
        setUsers((data.users || []).filter((u) => u.location));
      } finally { setLoading(false); }
    })();
  }, []);

  const center = user?.location ? [user.location.lat, user.location.lng] : [12.9716, 77.5946];
  const radius = (user?.radius || 100);

  return (
    <div className="page-in">
      <div className="px-5 pt-7 pb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] font-bold text-[#717171]">Live map</p>
          <h1 className="font-display text-3xl font-bold text-[#222]">Map view</h1>
          <p className="text-sm text-[#717171] mt-1">See active users around you on the map.</p>
        </div>
        <button
          data-testid="toggle-heatmap"
          onClick={() => setHeat((v) => !v)}
          className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-full flex items-center gap-1.5 transition ${heat ? "bg-[#FF385C] text-white" : "bg-[#F3F4F6] text-[#222]"}`}
        >
          <Flame size={14} /> Heatmap
        </button>
      </div>

      <div className="mx-5 rounded-3xl overflow-hidden border border-[#EBEBEB] relative" data-testid="map-container" style={{ height: 480 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-[500]">
            <Loader2 className="animate-spin text-[#FF385C]" />
          </div>
        )}
        <MapContainer center={center} zoom={user?.location ? 15 : 11} scrollWheelZoom={true} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {user?.location && (
            <>
              <Marker position={center} icon={meIcon}>
                <Popup>You are here</Popup>
              </Marker>
              <Circle center={center} radius={radius} pathOptions={{ color: "#FF385C", fillColor: "#FF385C", fillOpacity: 0.08, weight: 2 }} />
            </>
          )}
          {users.map((u) => (
            <Marker key={u.id} position={[u.location.lat, u.location.lng]} icon={userIcon}>
              <Popup>
                <div className="font-semibold">{u.name}</div>
                {u.distance_m != null && <div className="text-xs text-gray-500">{Math.round(u.distance_m)} m away</div>}
              </Popup>
            </Marker>
          ))}
          <HeatLayer points={users.map((u) => [u.location.lat, u.location.lng, 0.6])} enabled={heat} />
        </MapContainer>
      </div>

      {!user?.location && (
        <div className="mx-5 mt-4 rounded-2xl bg-[#FFEBEE] p-4 text-sm text-[#C13515] flex items-center gap-2">
          <MapPin size={16} /> Set your location on Discover to see yourself & radius on the map.
        </div>
      )}

      <div className="px-5 mt-4 text-xs text-[#717171] flex items-center gap-4">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#FF385C] border-2 border-white" /> You</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#31A24C] border-2 border-white" /> Active user</span>
        <span className="ml-auto">{users.length} on map</span>
      </div>
    </div>
  );
}
