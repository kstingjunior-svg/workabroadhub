import type { Service } from "@shared/schema";

const LS_KEY     = "services";
const LS_TS_KEY  = "services_updated";

export async function loadServices(): Promise<Service[]> {
  const res = await fetch("/api/services", {
    credentials: "include",
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });

  if (!res.ok) throw new Error(`Failed to load services: ${res.status}`);

  const data = await res.json();
  console.log("[Services] API response:", data);

  const raw: Service[] = Array.isArray(data) ? data : (data.services ?? []);

  // Strip any rows that are missing required display fields (e.g. null-code rows in production DB)
  const valid = raw.filter(
    (s) => s != null && s.code != null && s.name != null && s.category != null
  );

  // Deduplicate by code — keeps the last occurrence so DB-level duplicates never reach the UI
  const services: Service[] = Object.values(
    valid.reduce<Record<string, Service>>((acc, s) => {
      acc[s.code] = s;
      return acc;
    }, {})
  );

  console.log(`[Services] Loaded ${services.length} unique service(s) (raw=${raw.length}, valid=${valid.length})`);

  try {
    localStorage.setItem(LS_KEY,    JSON.stringify(services));
    localStorage.setItem(LS_TS_KEY, data.last_updated ?? new Date().toISOString());
  } catch {
    /* storage full or private-browsing — ignore */
  }

  return services;
}

export function getCachedServices(): Service[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Service[];
    // Reject caches that contain bad/null-code entries so they don't pollute the UI
    if (!Array.isArray(parsed) || parsed.some((s) => !s?.code || !s?.name || !s?.category)) {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_TS_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getCachedServicesTimestamp(): string | null {
  try {
    return localStorage.getItem(LS_TS_KEY);
  } catch {
    return null;
  }
}

export function clearServicesCache(): void {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_TS_KEY);
  } catch {
    /* private-browsing or storage unavailable — ignore */
  }
}

const POLL_INTERVAL_MS = 10_000;

export function startServicesPriceWatcher(): () => void {
  const id = setInterval(async () => {
    try {
      const res = await fetch("/api/services", {
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!res.ok) return;
      const data = await res.json();

      const last = localStorage.getItem(LS_TS_KEY);

      if (last !== null && last !== data.last_updated) {
        console.log("🔥 PRICE UPDATE DETECTED — REFRESHING UI");

        try {
          const svcs = (data.services ?? []).filter(
            (s: any) => s?.code && s?.name && s?.category
          );
          localStorage.setItem(LS_KEY,    JSON.stringify(svcs));
          localStorage.setItem(LS_TS_KEY, data.last_updated);
        } catch { /* ignore */ }

        window.location.reload();
      } else if (last === null) {
        try {
          const svcs = (data.services ?? []).filter(
            (s: any) => s?.code && s?.name && s?.category
          );
          localStorage.setItem(LS_KEY,    JSON.stringify(svcs));
          localStorage.setItem(LS_TS_KEY, data.last_updated ?? new Date().toISOString());
        } catch { /* ignore */ }
      }
    } catch {
      /* network hiccup — skip this tick, try again next interval */
    }
  }, POLL_INTERVAL_MS);

  return () => clearInterval(id);
}
