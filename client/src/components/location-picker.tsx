/**
 * Workplace location picker for publishers (2026-11).
 * 1. search a place  2. it shows on the map  3. drag the pin / tap the map
 * to refine  4. confirm. Or choose "Several places / service area" with a
 * radius. Returns a PickedLocation the server validates again.
 */
import { useState } from "react";
import { CheckCircle2, Crosshair, Loader2, MapPin } from "lucide-react";
import { LocationSearch } from "@/components/location-search";
import { PinPickerMap } from "@/components/jobs-map";
import { reverseGeocode, getCurrentPosition, distanceKm, type GeoPlace, type PickedLocation } from "@/lib/geo";

export function LocationPicker({ value, onChange, required = true }: {
  value: PickedLocation | null; onChange: (v: PickedLocation | null) => void; required?: boolean;
}) {
  const [draft, setDraft] = useState<PickedLocation | null>(value);
  const [anchor, setAnchor] = useState<{ lat: number; lng: number; placeId: string | null } | null>(value ? { lat: value.lat, lng: value.lng, placeId: value.placeId } : null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const confirmed = !!value && !!draft && value.lat === draft.lat && value.lng === draft.lng && value.mode === draft.mode && value.serviceRadiusKm === draft.serviceRadiusKm;

  const fromPlace = (p: GeoPlace, mode = draft?.mode ?? "workplace"): PickedLocation => ({
    mode, lat: p.lat, lng: p.lng, placeId: p.placeId, formattedAddress: p.formattedAddress,
    county: p.county, town: p.town, estate: p.estate, street: p.street, serviceRadiusKm: mode === "service_area" ? (draft?.serviceRadiusKm ?? 10) : null,
  });
  function pick(p: GeoPlace) { setMsg(null); setAnchor({ lat: p.lat, lng: p.lng, placeId: p.placeId }); setDraft(fromPlace(p)); onChange(null); }
  async function move(lat: number, lng: number) {
    setBusy(true); setMsg(null);
    try {
      const r = await reverseGeocode(lat, lng);
      // Dragged far from the searched place → it's a different place now.
      const keepPlace = anchor?.placeId && distanceKm(anchor, { lat, lng }) <= 2.5;
      setDraft((d) => ({
        mode: d?.mode ?? "workplace", lat, lng, placeId: keepPlace ? anchor!.placeId : r.placeId,
        formattedAddress: r.formattedAddress, county: r.county ?? d?.county ?? null, town: r.town ?? d?.town ?? null,
        estate: r.estate ?? d?.estate ?? null, street: r.street ?? d?.street ?? null, serviceRadiusKm: d?.serviceRadiusKm ?? null,
      }));
      if (!keepPlace) setAnchor({ lat, lng, placeId: r.placeId });
      onChange(null);
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function here() {
    setBusy(true); setMsg(null);
    try { const p = await getCurrentPosition(); await move(p.lat, p.lng); }
    catch (e: any) { setMsg(e.message); setBusy(false); }
  }
  const setMode = (mode: "workplace" | "service_area") => { if (!draft) return; setDraft({ ...draft, mode, serviceRadiusKm: mode === "service_area" ? draft.serviceRadiusKm ?? 10 : null }); onChange(null); };

  return (
    <div className="space-y-2" data-testid="location-picker">
      <div className="flex flex-col sm:flex-row gap-2">
        <LocationSearch onSelect={pick} className="flex-1" placeholder="Search the workplace: building, street, estate, landmark" initial={value?.formattedAddress ?? ""} />
        <button type="button" onClick={here} className="h-14 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm inline-flex items-center gap-1.5 shrink-0"><Crosshair className="h-4 w-4" />I'm at the workplace</button>
      </div>
      {draft && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <label className="inline-flex items-center gap-1.5"><input type="radio" checked={draft.mode === "workplace"} onChange={() => setMode("workplace")} />One workplace (exact pin)</label>
            <label className="inline-flex items-center gap-1.5"><input type="radio" checked={draft.mode === "service_area"} onChange={() => setMode("service_area")} />Several places / mobile work — service area</label>
            {draft.mode === "service_area" && (
              <select value={draft.serviceRadiusKm ?? 10} onChange={(e) => { setDraft({ ...draft, serviceRadiusKm: Number(e.target.value) }); onChange(null); }} className="rounded border px-2 py-1">
                {[3, 5, 10, 15, 25, 50].map((k) => <option key={k} value={k}>within {k} km</option>)}
              </select>
            )}
          </div>
          <PinPickerMap value={draft} onMove={move} radiusKm={draft.mode === "service_area" ? draft.serviceRadiusKm : null} />
          <div className="text-xs text-slate-500 flex items-start gap-1"><MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{busy ? "Reading address…" : draft.formattedAddress ?? `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}`} · {[draft.estate, draft.town, draft.county].filter(Boolean).join(", ")}<br />
              Drag the red pin or tap the map to put it exactly on the workplace.</span></div>
          <button type="button" disabled={busy || !draft.county} onClick={() => onChange(draft)}
            className={`h-11 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 ${confirmed ? "bg-emerald-100 text-emerald-800" : "bg-emerald-600 text-white hover:bg-emerald-700"}`} data-testid="location-confirm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{confirmed ? "Location confirmed" : "Confirm this location"}
          </button>
        </>
      )}
      {!draft && required && <p className="text-xs text-slate-500">Required: search for the workplace, then confirm the pin.</p>}
      {msg && <p className="text-xs text-rose-600">{msg}</p>}
    </div>
  );
}
