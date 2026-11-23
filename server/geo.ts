/**
 * Location service (2026-11) — Google Maps Platform through the server.
 *
 *   POST /api/geo/autocomplete  { input, sessionToken?, near? }  → suggestions
 *   GET  /api/geo/place/:id     ?sessionToken=                   → place details
 *   POST /api/geo/reverse       { lat, lng }                     → readable address
 *   GET  /api/geo/config                                         → which provider is on
 *
 * The Google SERVER key (GOOGLE_MAPS_SERVER_KEY) never leaves the server:
 * Places API (New) autocomplete + details and the Geocoding API are called
 * from here. When the key is missing, a built-in Kenyan gazetteer answers
 * instead (towns, estates, county centres) so search keeps working.
 *
 * Privacy: coordinates arrive in request bodies (never URLs, so they are not
 * written to access logs) and are never stored.
 */
import type { Express, Request, Response } from "express";
import { KENYA_PLACES, COUNTY_CENTRES, findPlace, distanceKm } from "../shared/kenya-places";

const KEY = () => (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
export const googleEnabled = () => KEY().length > 20;

export const KENYA_BOUNDS = { minLat: -5.2, maxLat: 5.5, minLng: 33.5, maxLng: 42.2 };
export function inKenya(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= KENYA_BOUNDS.minLat && lat <= KENYA_BOUNDS.maxLat && lng >= KENYA_BOUNDS.minLng && lng <= KENYA_BOUNDS.maxLng;
}

export interface GeoPlace {
  placeId: string; name: string; formattedAddress: string; lat: number; lng: number;
  county: string | null; town: string | null; estate: string | null; street: string | null;
  types: string[]; provider: "google" | "builtin";
}
export interface Suggestion { placeId: string; main: string; secondary: string; provider: "google" | "builtin" }

// ── tiny TTL cache + per-IP rate limit ──────────────────────────────────────
const cache = new Map<string, { at: number; v: any }>();
function cached<T>(k: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.v);
  return fn().then((v) => { if (cache.size > 5000) cache.clear(); cache.set(k, { at: Date.now(), v }); return v; });
}
const hits = new Map<string, number[]>();
function allow(req: Request, perMin: number) {
  const ip = String(req.ip ?? "x"); const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= perMin) return false;
  arr.push(now); hits.set(ip, arr); return true;
}

// ── Kenyan county name normalisation (Google returns "Nairobi County") ───────
const COUNTY_NAMES = Object.keys(COUNTY_CENTRES);
export function normCounty(s: string | null | undefined): string | null {
  if (!s) return null;
  const c = s.replace(/\s+county$/i, "").replace(/['’]/g, "'").trim().toLowerCase();
  return COUNTY_NAMES.find((n) => n.toLowerCase() === c || n.toLowerCase().replace(/'/g, "") === c.replace(/'/g, "")) ?? null;
}

// ── Built-in provider ───────────────────────────────────────────────────────
function builtinPlace(name: string): GeoPlace | null {
  if (name.trim().toLowerCase() === "kenya") {
    return { placeId: "kp:Kenya", name: "Kenya", formattedAddress: "Kenya", lat: 0.0236, lng: 37.9062, county: null, town: null, estate: null, street: null, types: ["country"], provider: "builtin" };
  }
  const p = findPlace(name);
  if (!p) return null;
  const isCounty = !KENYA_PLACES.some((k) => k.name === p.name);
  return {
    placeId: `kp:${p.name}`, name: p.name, formattedAddress: isCounty ? `${p.county} County, Kenya` : `${p.name}, ${p.county}, Kenya`,
    lat: p.lat, lng: p.lng, county: p.county, town: isCounty ? null : p.name, estate: null, street: null,
    types: [isCounty ? "administrative_area_level_1" : "locality"], provider: "builtin",
  };
}
function builtinSuggest(input: string): Suggestion[] {
  const q = input.toLowerCase().trim();
  if (!q) return [];
  const out: Suggestion[] = [];
  for (const p of KENYA_PLACES) {
    const names = [p.name, ...(p.aliases ?? [])].map((n) => n.toLowerCase());
    if (names.some((n) => n.startsWith(q) || n.includes(` ${q}`) || (q.length >= 3 && n.includes(q)))) out.push({ placeId: `kp:${p.name}`, main: p.name, secondary: `${p.county}, Kenya`, provider: "builtin" });
  }
  for (const c of COUNTY_NAMES) if (c.toLowerCase().startsWith(q)) out.push({ placeId: `kp:${c}`, main: `${c} County`, secondary: "Kenya", provider: "builtin" });
  if ("kenya".startsWith(q)) out.push({ placeId: "kp:Kenya", main: "Kenya", secondary: "Anywhere in Kenya", provider: "builtin" });
  return out.slice(0, 8);
}
function nearestBuiltin(lat: number, lng: number): GeoPlace {
  let best = KENYA_PLACES[0], bd = Infinity;
  for (const p of KENYA_PLACES) { const d = distanceKm({ lat, lng }, p); if (d < bd) { bd = d; best = p; } }
  return {
    placeId: `kp:${best.name}`, name: best.name, formattedAddress: bd < 8 ? `Near ${best.name}, ${best.county}` : `${best.county} County (≈${Math.round(bd)} km from ${best.name})`,
    lat, lng, county: best.county, town: best.name, estate: null, street: null, types: ["approximate"], provider: "builtin",
  };
}

// ── Google provider ─────────────────────────────────────────────────────────
async function gFetch(url: string, init: RequestInit = {}, ms = 6000): Promise<any> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ac.signal });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b?.error?.message || `Google ${r.status}`);
    return b;
  } finally { clearTimeout(t); }
}
function componentsToFields(comps: Array<{ types: string[]; longText?: string; long_name?: string }>) {
  const get = (...types: string[]) => comps.find((c) => types.some((t) => c.types.includes(t)));
  const txt = (c: any) => (c ? c.longText ?? c.long_name ?? null : null);
  const county = normCounty(txt(get("administrative_area_level_1")));
  const town = txt(get("locality")) ?? txt(get("administrative_area_level_2")) ?? txt(get("postal_town"));
  const estate = txt(get("neighborhood")) ?? txt(get("sublocality_level_1", "sublocality"));
  const route = txt(get("route")); const num = txt(get("street_number"));
  const street = route ? `${num ? num + " " : ""}${route}` : txt(get("premise", "point_of_interest", "establishment"));
  return { county, town, estate, street };
}
async function googleSuggest(input: string, sessionToken?: string, near?: { lat: number; lng: number }): Promise<Suggestion[]> {
  const body: any = { input, includedRegionCodes: ["ke"], languageCode: "en", regionCode: "ke" };
  if (sessionToken) body.sessionToken = sessionToken;
  if (near && inKenya(near.lat, near.lng)) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 } };
  const b = await gFetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY() }, body: JSON.stringify(body),
  });
  return (b.suggestions ?? []).filter((s: any) => s.placePrediction).slice(0, 8).map((s: any) => ({
    placeId: s.placePrediction.placeId,
    main: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text?.text ?? "",
    secondary: s.placePrediction.structuredFormat?.secondaryText?.text ?? "",
    provider: "google" as const,
  }));
}
async function googlePlace(placeId: string, sessionToken?: string): Promise<GeoPlace | null> {
  const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  const b = await gFetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${qs}`, {
    headers: { "X-Goog-Api-Key": KEY(), "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents,types" },
  });
  if (!b?.location) return null;
  const f = componentsToFields(b.addressComponents ?? []);
  return { placeId: b.id, name: b.displayName?.text ?? b.formattedAddress, formattedAddress: b.formattedAddress, lat: b.location.latitude, lng: b.location.longitude, ...f, types: b.types ?? [], provider: "google" };
}
async function googleReverse(lat: number, lng: number): Promise<GeoPlace | null> {
  const b = await gFetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=en&region=ke&key=${KEY()}`);
  const r = (b.results ?? [])[0];
  if (!r) return null;
  const f = componentsToFields(r.address_components ?? []);
  return { placeId: r.place_id, name: f.estate ?? f.town ?? r.formatted_address, formattedAddress: r.formatted_address, lat, lng, ...f, types: r.types ?? [], provider: "google" };
}

// ── Public helpers used by job routes ───────────────────────────────────────
export async function resolvePlace(placeId: string, sessionToken?: string): Promise<GeoPlace | null> {
  if (placeId.startsWith("kp:")) return builtinPlace(placeId.slice(3));
  if (!googleEnabled()) return null;
  return cached(`p:${placeId}`, 7 * 86400_000, () => googlePlace(placeId, sessionToken)).catch(() => null);
}
export async function reverse(lat: number, lng: number): Promise<GeoPlace> {
  if (!inKenya(lat, lng)) throw new Error("Location is outside Kenya.");
  const k = `r:${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (googleEnabled()) {
    const g = await cached(k, 86400_000, () => googleReverse(lat, lng)).catch(() => null);
    if (g) return g;
  }
  return nearestBuiltin(lat, lng);
}

/**
 * Validates a publisher-submitted location. Never trusts the browser's
 * coordinates blindly: they must be inside Kenya and, when a Google place
 * was picked, within 3 km of that place (the pin may be dragged a little).
 */
export async function validatePublisherLocation(loc: any): Promise<{ ok: boolean; v?: any; message?: string }> {
  if (!loc || typeof loc !== "object") return { ok: false, message: "Pick the workplace location on the map." };
  const mode = loc.mode === "service_area" ? "service_area" : "workplace";
  const lat = Number(loc.lat), lng = Number(loc.lng);
  if (!inKenya(lat, lng)) return { ok: false, message: "The map pin must be inside Kenya." };
  let placeId: string | null = loc.placeId ? String(loc.placeId).slice(0, 300) : null;
  if (placeId && !/^(kp:[\w '’\-.]{2,60}|[A-Za-z0-9_\-]{10,300})$/.test(placeId)) placeId = null;
  let checked: GeoPlace | null = null;
  if (placeId) {
    checked = await resolvePlace(placeId);
    if (checked && distanceKm({ lat, lng }, checked) > (mode === "service_area" ? 30 : 3)) {
      return { ok: false, message: `The pin is ${Math.round(distanceKm({ lat, lng }, checked))} km from "${checked.name}". Move the pin to the actual workplace or pick the place again.` };
    }
  }
  // Fill missing county/town from reverse geocoding so filters always work.
  let rev: GeoPlace | null = null;
  if (!loc.county || !loc.town) rev = await reverse(lat, lng).catch(() => null);
  const county = normCounty(loc.county) ?? checked?.county ?? rev?.county ?? null;
  if (!county) return { ok: false, message: "Couldn't tell which county this is — pick a nearby place from the suggestions." };
  const s = (x: any, n: number) => (x == null ? null : String(x).trim().slice(0, n) || null);
  const radius = mode === "service_area" ? Math.min(200, Math.max(1, Number(loc.serviceRadiusKm) || 10)) : null;
  return { ok: true, v: {
    mode, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, placeId,
    formattedAddress: s(loc.formattedAddress, 400) ?? checked?.formattedAddress ?? rev?.formattedAddress ?? null,
    county, town: s(loc.town, 120) ?? checked?.town ?? rev?.town ?? null, estate: s(loc.estate, 120) ?? checked?.estate ?? rev?.estate ?? null,
    street: s(loc.street, 200) ?? checked?.street ?? rev?.street ?? null, serviceRadiusKm: radius,
    precision: placeId && !placeId.startsWith("kp:") ? "exact" : "approximate",
  } };
}

/** Turns a search origin (placeId or lat/lng from a body) into coordinates. */
export async function originFromBody(b: any): Promise<{ lat: number; lng: number; label: string } | null> {
  const o = b?.origin;
  if (!o) return null;
  if (o.lat != null && o.lng != null) {
    const lat = Number(o.lat), lng = Number(o.lng);
    if (!inKenya(lat, lng)) return null;
    return { lat, lng, label: String(o.label ?? "your location").slice(0, 120) };
  }
  if (o.placeId) { const p = await resolvePlace(String(o.placeId)); return p ? { lat: p.lat, lng: p.lng, label: p.name } : null; }
  if (o.text) { const p = findPlace(String(o.text)); return p ? { lat: p.lat, lng: p.lng, label: p.name } : null; }
  return null;
}

export function registerGeoRoutes(app: Express): void {
  app.get("/api/geo/config", (_req, res) => {
    res.json({ provider: googleEnabled() ? "google" : "builtin", browserMaps: !!process.env.VITE_GOOGLE_MAPS_BROWSER_KEY });
  });

  app.post("/api/geo/autocomplete", async (req: Request, res: Response) => {
    if (!allow(req, 90)) return res.status(429).json({ message: "Too many searches — slow down a little." });
    const input = String(req.body?.input ?? "").trim().slice(0, 100);
    if (input.length < 2) return res.json({ suggestions: [] });
    const near = req.body?.near ? { lat: Number(req.body.near.lat), lng: Number(req.body.near.lng) } : undefined;
    try {
      let suggestions: Suggestion[] = [];
      if (googleEnabled()) {
        suggestions = await cached(`a:${input.toLowerCase()}`, 3600_000, () => googleSuggest(input, String(req.body?.sessionToken ?? "") || undefined, near)).catch((e) => { console.warn("[geo] google autocomplete:", e?.message); return []; });
      }
      if (!suggestions.length) suggestions = builtinSuggest(input);
      res.json({ suggestions, provider: suggestions[0]?.provider ?? (googleEnabled() ? "google" : "builtin") });
    } catch { res.json({ suggestions: builtinSuggest(input), provider: "builtin" }); }
  });

  app.get("/api/geo/place/:id", async (req, res) => {
    if (!allow(req, 90)) return res.status(429).json({ message: "Too many requests." });
    const p = await resolvePlace(String(req.params.id), String(req.query.sessionToken ?? "") || undefined);
    if (!p) return res.status(404).json({ message: "Place not found." });
    if (!inKenya(p.lat, p.lng)) return res.status(422).json({ message: "That place is outside Kenya." });
    res.json({ place: p });
  });

  app.post("/api/geo/reverse", async (req, res) => {
    if (!allow(req, 30)) return res.status(429).json({ message: "Too many requests." });
    const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
    if (!inKenya(lat, lng)) return res.status(422).json({ message: "Your location looks like it's outside Kenya. Type your area instead." });
    try { res.json({ place: await reverse(lat, lng) }); }
    catch (e: any) { res.status(500).json({ message: "Could not read your location." }); }
  });
}
