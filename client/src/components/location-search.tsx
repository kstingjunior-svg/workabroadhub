/**
 * Place search box (2026-11). Suggestions come from Google Places
 * (through our server) — estates, streets, buildings, landmarks, towns,
 * counties — Kenya first. Big touch targets for phones.
 */
import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2, X } from "lucide-react";
import { suggestPlaces, placeDetails, newSessionToken, type GeoPlace, type Suggestion } from "@/lib/geo";

export function LocationSearch({
  onSelect, placeholder = "Estate, town, street or landmark — e.g. Kahawa Wendani", initial = "", near, className = "", inputClassName = "", autoFocus,
}: {
  onSelect: (p: GeoPlace) => void; placeholder?: string; initial?: string; near?: { lat: number; lng: number } | null;
  className?: string; inputClassName?: string; autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [list, setList] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const token = useRef(newSessionToken());
  const timer = useRef<any>(null);
  const lastQ = useRef("");
  useEffect(() => setText(initial), [initial]);

  function onType(v: string) {
    setText(v); setErr(null); setActive(-1);
    clearTimeout(timer.current);
    if (v.trim().length < 2) { setList([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      lastQ.current = v;
      setBusy(true);
      try {
        const s = await suggestPlaces(v, token.current, near);
        if (lastQ.current === v) { setList(s); setOpen(true); }
      } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
    }, 250);
  }
  async function pick(s: Suggestion) {
    setOpen(false); setText(s.main); setBusy(true); setErr(null);
    try {
      const p = await placeDetails(s.placeId, token.current);
      token.current = newSessionToken(); // a session ends with a details call
      setText(p.name || s.main);
      onSelect(p);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className={`relative ${className}`}>
      <div className={`flex items-center gap-2 bg-white dark:bg-slate-900 rounded-xl px-3 h-14 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 ${inputClassName}`}>
        <MapPin className="h-5 w-5 text-emerald-600 shrink-0" />
        <input
          value={text} autoFocus={autoFocus} onChange={(e) => onType(e.target.value)} onFocus={() => list.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onKeyDown={(e) => {
            if (!open || !list.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(list[active]); }
          }}
          placeholder={placeholder} className="w-full outline-none text-base bg-transparent" autoComplete="off" inputMode="search"
          aria-label="Search for a place" data-testid="location-search-input"
        />
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : text ? (
          <button type="button" onClick={() => { setText(""); setList([]); }} aria-label="Clear"><X className="h-4 w-4 text-slate-400" /></button>
        ) : null}
      </div>
      {open && list.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl" role="listbox">
          {list.map((s, i) => (
            <li key={s.placeId} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}
                className={`w-full text-left px-4 py-3 min-h-[52px] flex gap-3 items-start hover:bg-emerald-50 dark:hover:bg-emerald-950 ${i === active ? "bg-emerald-50 dark:bg-emerald-950" : ""}`}
                data-testid={`location-suggestion-${i}`}>
                <MapPin className="h-4 w-4 mt-1 text-slate-400 shrink-0" />
                <span className="min-w-0"><span className="block font-medium text-slate-900 dark:text-white truncate">{s.main}</span>
                  <span className="block text-xs text-slate-500 truncate">{s.secondary}</span></span>
              </button>
            </li>
          ))}
          {list[0]?.provider === "google" && <li className="px-4 py-1.5 text-[10px] text-slate-400 text-right">Powered by Google</li>}
        </ul>
      )}
      {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
    </div>
  );
}
