/**
 * Maps for job discovery (2026-11).
 *   <JobsMap>      job markers with clustering, tap → preview + "View job",
 *                  optional "you are here" marker and search-radius circle.
 *   <PinPickerMap> one draggable pin (tap the map to move it) for publishers.
 * Uses Google Maps when VITE_GOOGLE_MAPS_BROWSER_KEY is set (with Google's
 * own logo/attribution), otherwise OpenStreetMap via Leaflet.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useGoogle, loadGoogleMaps, loadLeaflet, KENYA_CENTER } from "@/lib/geo";

export interface MapPoint {
  id: string; lat: number; lng: number; title: string; employer?: string | null; place?: string | null;
  vacancies?: number | null; distance?: string | null; href: string; radiusKm?: number | null;
}
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const popupHtml = (p: MapPoint) => `<div style="min-width:190px;max-width:240px;font-family:inherit">
  <div style="font-weight:700;font-size:14px;line-height:1.3;margin-bottom:2px">${esc(p.title)}</div>
  ${p.employer ? `<div style="font-size:12px;color:#475569">${esc(p.employer)}</div>` : ""}
  ${p.place ? `<div style="font-size:12px;color:#475569">📍 ${esc(p.place)}</div>` : ""}
  <div style="font-size:12px;color:#475569">${p.vacancies ? `${p.vacancies} vacanc${p.vacancies === 1 ? "y" : "ies"}` : ""}${p.distance ? ` · ${esc(p.distance)}` : ""}</div>
  <a href="${esc(p.href)}" style="display:inline-block;margin-top:8px;background:#059669;color:#fff;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:600;text-decoration:none">View job</a>
</div>`;

/** Groups points that would overlap on screen (grid in pixel space). */
function cluster(points: MapPoint[], project: (p: MapPoint) => { x: number; y: number } | null, cell = 56) {
  const groups = new Map<string, MapPoint[]>();
  for (const p of points) {
    const px = project(p); if (!px) continue;
    const k = `${Math.floor(px.x / cell)}:${Math.floor(px.y / cell)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
  }
  return [...groups.values()];
}
const clusterSvg = (n: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><circle cx="22" cy="22" r="20" fill="#059669" fill-opacity="0.9" stroke="#fff" stroke-width="3"/></svg>`)}`;

export function JobsMap({ points, user, radiusKm, height = 460 }: {
  points: MapPoint[]; user?: { lat: number; lng: number } | null; radiusKm?: number | null; height?: number | string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const st = useRef<any>({});
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const G = useGoogle();

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        if (G) {
          const google = await loadGoogleMaps(); if (dead || !el.current) return;
          const map = new google.maps.Map(el.current, { center: KENYA_CENTER, zoom: 6, gestureHandling: "greedy", streetViewControl: false, mapTypeControl: false, fullscreenControl: true, clickableIcons: false });
          const ov = new google.maps.OverlayView(); ov.onAdd = () => {}; ov.draw = () => {}; ov.onRemove = () => {}; ov.setMap(map);
          st.current = { google, map, ov, info: new google.maps.InfoWindow(), markers: [] };
          map.addListener("idle", () => st.current.redraw?.());
        } else {
          const L = await loadLeaflet(); if (dead || !el.current) return;
          const map = L.map(el.current, { center: [KENYA_CENTER.lat, KENYA_CENTER.lng], zoom: 6, tap: true });
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
          st.current = { L, map, layer: L.layerGroup().addTo(map) };
          map.on("moveend zoomend", () => st.current.redraw?.());
          setTimeout(() => map.invalidateSize(), 150);
        }
        if (!dead) setReady(true);
      } catch (e: any) { setErr(e.message); }
    })();
    return () => { dead = true; try { st.current.map?.remove?.(); } catch {} };
  }, [G]);

  // draw markers + clusters
  useEffect(() => {
    if (!ready) return;
    const s = st.current;
    const redraw = () => {
      if (G) {
        const { google, map, ov, info } = s;
        s.markers?.forEach((m: any) => m.setMap(null)); s.markers = [];
        const proj = ov.getProjection(); if (!proj) return;
        const groups = cluster(points, (p) => proj.fromLatLngToContainerPixel(new google.maps.LatLng(p.lat, p.lng)));
        for (const g of groups) {
          if (g.length === 1) {
            const p = g[0];
            const m = new google.maps.Marker({ map, position: { lat: p.lat, lng: p.lng }, title: p.title });
            m.addListener("click", () => { info.setContent(popupHtml(p)); info.open({ map, anchor: m }); });
            s.markers.push(m);
          } else {
            const lat = g.reduce((a, p) => a + p.lat, 0) / g.length, lng = g.reduce((a, p) => a + p.lng, 0) / g.length;
            const m = new google.maps.Marker({ map, position: { lat, lng }, icon: { url: clusterSvg(g.length), scaledSize: new google.maps.Size(44, 44), anchor: new google.maps.Point(22, 22) }, label: { text: String(g.length), color: "#fff", fontWeight: "700" }, zIndex: 999 });
            m.addListener("click", () => { const b = new google.maps.LatLngBounds(); g.forEach((p) => b.extend({ lat: p.lat, lng: p.lng })); map.fitBounds(b, 60); if (map.getZoom() > 17) map.setZoom(17); });
            s.markers.push(m);
          }
        }
      } else {
        const { L, map, layer } = s;
        layer.clearLayers();
        const groups = cluster(points, (p) => map.latLngToContainerPoint([p.lat, p.lng]));
        for (const g of groups) {
          if (g.length === 1) {
            const p = g[0];
            L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#059669;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] }) })
              .bindPopup(popupHtml(p)).addTo(layer);
          } else {
            const lat = g.reduce((a, p) => a + p.lat, 0) / g.length, lng = g.reduce((a, p) => a + p.lng, 0) / g.length;
            L.marker([lat, lng], { icon: L.divIcon({ className: "", html: `<div style="width:44px;height:44px;border-radius:50%;background:#059669e6;border:3px solid #fff;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)">${g.length}</div>`, iconSize: [44, 44], iconAnchor: [22, 22] }) })
              .on("click", () => map.fitBounds(L.latLngBounds(g.map((p) => [p.lat, p.lng])), { padding: [60, 60], maxZoom: 17 })).addTo(layer);
          }
        }
        if (user) {
          L.circleMarker([user.lat, user.lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).bindTooltip("You").addTo(layer);
          if (radiusKm) L.circle([user.lat, user.lng], { radius: radiusKm * 1000, color: "#2563eb", weight: 1, fillOpacity: 0.06 }).addTo(layer);
        }
      }
    };
    s.redraw = redraw;
    // user marker + radius (Google) and fit bounds
    if (G) {
      s.userMk?.setMap(null); s.circle?.setMap(null);
      if (user) {
        s.userMk = new s.google.maps.Marker({ map: s.map, position: user, title: "You", zIndex: 1000, icon: { path: s.google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#2563eb", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 } });
        if (radiusKm) s.circle = new s.google.maps.Circle({ map: s.map, center: user, radius: radiusKm * 1000, strokeColor: "#2563eb", strokeWeight: 1, fillColor: "#2563eb", fillOpacity: 0.06, clickable: false });
      }
      const b = new s.google.maps.LatLngBounds(); let n = 0;
      points.forEach((p) => { b.extend({ lat: p.lat, lng: p.lng }); n++; }); if (user) { b.extend(user); n++; }
      if (user && radiusKm && radiusKm <= 50 && s.circle) s.map.fitBounds(s.circle.getBounds(), 30);
      else if (n > 1) s.map.fitBounds(b, 50); else if (n === 1) { s.map.setCenter(user ?? points[0]); s.map.setZoom(14); }
      redraw();
    } else {
      const { L, map } = s;
      const pts: any[] = points.map((p) => [p.lat, p.lng]); if (user) pts.push([user.lat, user.lng]);
      if (user && radiusKm && radiusKm <= 50) map.fitBounds(L.latLng(user.lat, user.lng).toBounds(radiusKm * 2000), { padding: [20, 20] });
      else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
      else if (pts.length === 1) map.setView(pts[0], 14);
      redraw();
    }
  }, [ready, points, user?.lat, user?.lng, radiusKm, G]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800" style={{ height }}>
      <div ref={el} className="absolute inset-0" data-testid="jobs-map" />
      {!ready && !err && <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-900"><Loader2 className="h-6 w-6 animate-spin" /></div>}
      {err && <div className="absolute inset-0 flex items-center justify-center text-sm text-rose-600 p-4 text-center">Map couldn't load ({err}). The list view still works.</div>}
    </div>
  );
}

export function PinPickerMap({ value, onMove, radiusKm, height = 300 }: {
  value: { lat: number; lng: number } | null; onMove: (lat: number, lng: number) => void; radiusKm?: number | null; height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const st = useRef<any>({});
  const [ready, setReady] = useState(false);
  const G = useGoogle();
  const moveRef = useRef(onMove); moveRef.current = onMove;

  useEffect(() => {
    let dead = false;
    (async () => {
      const start = value ?? KENYA_CENTER;
      if (G) {
        const google = await loadGoogleMaps(); if (dead || !el.current) return;
        const map = new google.maps.Map(el.current, { center: start, zoom: value ? 16 : 6, gestureHandling: "greedy", streetViewControl: false, mapTypeControl: false, clickableIcons: false });
        const mk = new google.maps.Marker({ map, position: start, draggable: true, title: "Drag to the exact workplace" });
        mk.addListener("dragend", () => { const p = mk.getPosition(); moveRef.current(p.lat(), p.lng()); });
        map.addListener("click", (e: any) => { mk.setPosition(e.latLng); moveRef.current(e.latLng.lat(), e.latLng.lng()); });
        st.current = { google, map, mk };
      } else {
        const L = await loadLeaflet(); if (dead || !el.current) return;
        const map = L.map(el.current, { center: [start.lat, start.lng], zoom: value ? 16 : 6 });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
        const icon = L.divIcon({ className: "", html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#dc2626;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`, iconSize: [34, 34], iconAnchor: [17, 34] });
        const mk = L.marker([start.lat, start.lng], { draggable: true, icon }).addTo(map);
        mk.on("dragend", () => { const p = mk.getLatLng(); moveRef.current(p.lat, p.lng); });
        map.on("click", (e: any) => { mk.setLatLng(e.latlng); moveRef.current(e.latlng.lat, e.latlng.lng); });
        st.current = { L, map, mk };
        setTimeout(() => map.invalidateSize(), 150);
      }
      if (!dead) setReady(true);
    })();
    return () => { dead = true; try { st.current.map?.remove?.(); } catch {} };
  }, [G]);

  useEffect(() => {
    if (!ready || !value) return;
    const s = st.current;
    if (G) {
      s.mk.setPosition(value); s.map.panTo(value); if (s.map.getZoom() < 15) s.map.setZoom(16);
      s.circle?.setMap(null);
      if (radiusKm) { s.circle = new s.google.maps.Circle({ map: s.map, center: value, radius: radiusKm * 1000, strokeColor: "#dc2626", strokeWeight: 1, fillOpacity: 0.08, fillColor: "#dc2626", clickable: false }); s.map.fitBounds(s.circle.getBounds(), 20); }
    } else {
      s.mk.setLatLng([value.lat, value.lng]);
      s.circle && s.map.removeLayer(s.circle); s.circle = null;
      if (radiusKm) { s.circle = s.L.circle([value.lat, value.lng], { radius: radiusKm * 1000, color: "#dc2626", weight: 1, fillOpacity: 0.08 }).addTo(s.map); s.map.fitBounds(s.circle.getBounds()); }
      else if (s.map.getZoom() < 15) s.map.setView([value.lat, value.lng], 16); else s.map.panTo([value.lat, value.lng]);
    }
  }, [ready, value?.lat, value?.lng, radiusKm, G]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700" style={{ height }}>
      <div ref={el} className="absolute inset-0" data-testid="pin-picker-map" />
      {!ready && <div className="absolute inset-0 flex items-center justify-center bg-slate-100"><Loader2 className="h-5 w-5 animate-spin" /></div>}
    </div>
  );
}
