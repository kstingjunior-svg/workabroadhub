/**
 * Client location helpers (2026-11).
 * Place search / details / reverse geocoding go through OUR server
 * (/api/geo/*), which holds the Google server key. The browser key
 * (VITE_GOOGLE_MAPS_BROWSER_KEY) is only used to draw Google maps and must be
 * restricted to workabroadhub.tech + the Maps JavaScript API. Without it,
 * maps are drawn with OpenStreetMap (Leaflet).
 */
export interface GeoPlace {
  placeId: string; name: string; formattedAddress: string; lat: number; lng: number;
  county: string | null; town: string | null; estate: string | null; street: string | null; types?: string[];
}
export interface Suggestion { placeId: string; main: string; secondary: string; provider?: "google" | "builtin" }
export interface PickedLocation {
  mode: "workplace" | "service_area"; lat: number; lng: number; placeId: string | null; formattedAddress: string | null;
  county: string | null; town: string | null; estate: string | null; street: string | null; serviceRadiusKm: number | null;
}

export const MAPS_BROWSER_KEY: string = (import.meta as any).env?.VITE_GOOGLE_MAPS_BROWSER_KEY ?? "";
export const KENYA_CENTER = { lat: 0.0236, lng: 37.9062 };

export const newSessionToken = () => (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function post<T>(url: string, body: any): Promise<T> {
  const r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.message || b?.error || `Request failed (${r.status})`);
  return b as T;
}
export async function suggestPlaces(input: string, sessionToken: string, near?: { lat: number; lng: number } | null): Promise<Suggestion[]> {
  if (input.trim().length < 2) return [];
  return (await post<{ suggestions: Suggestion[] }>("/api/geo/autocomplete", { input, sessionToken, near: near ?? undefined })).suggestions;
}
export async function placeDetails(placeId: string, sessionToken?: string): Promise<GeoPlace> {
  const r = await fetch(`/api/geo/place/${encodeURIComponent(placeId)}${sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ""}`, { credentials: "include" });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.message || "Couldn't load that place.");
  return b.place;
}
export async function reverseGeocode(lat: number, lng: number): Promise<GeoPlace> {
  return (await post<{ place: GeoPlace }>("/api/geo/reverse", { lat, lng })).place;
}

/** One-shot GPS read (no background tracking). */
export function getCurrentPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(Object.assign(new Error("Your browser can't share location."), { code: "UNSUPPORTED" }));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(Object.assign(new Error(e.code === 1 ? "Location permission was declined." : "Couldn't get your location."), { code: e.code === 1 ? "DENIED" : "FAILED" })),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 120_000 },
    );
  });
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, t = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(t(b.lat - a.lat) / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(t(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ── Map engine loading ──────────────────────────────────────────────────────
let gPromise: Promise<any> | null = null;
export function loadGoogleMaps(): Promise<any> {
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (!gPromise) {
    gPromise = new Promise((resolve, reject) => {
      const cb = `__wahGmaps${Date.now()}`;
      (window as any)[cb] = () => resolve((window as any).google);
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_BROWSER_KEY)}&v=weekly&region=KE&language=en&callback=${cb}&loading=async`;
      s.async = true; s.onerror = () => { gPromise = null; reject(new Error("Google Maps failed to load")); };
      document.head.appendChild(s);
    });
  }
  return gPromise;
}
export async function loadLeaflet(): Promise<any> {
  const L = (await import("leaflet")).default;
  await import("leaflet/dist/leaflet.css");
  return L;
}
export const useGoogle = () => MAPS_BROWSER_KEY.length > 20;

export function formatKm(km: number | null | undefined) {
  if (km == null) return null;
  return km < 1 ? `${Math.max(50, Math.round(km * 1000 / 50) * 50)} m away` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}
