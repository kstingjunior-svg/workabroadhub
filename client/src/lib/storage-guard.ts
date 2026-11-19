/**
 * 2026-11 (overnight sweep): some in-app browsers and strict privacy modes
 * block web storage, and simply *reading* `window.localStorage` then throws
 * "Access is denied for this document". Hundreds of call sites read it
 * directly, so those visitors got the error page on the landing page.
 *
 * Imported first in main.tsx: if storage is blocked, swap in an in-memory
 * Storage so the app works (nothing persists across reloads for them, which
 * is what their browser asked for anyway).
 */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(String(k)) ? (m.get(String(k)) as string) : null),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => { m.delete(String(k)); },
    setItem: (k: string, v: string) => { m.set(String(k), String(v)); },
  } as Storage;
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  let ok = false;
  try {
    const s = (window as any)[name] as Storage | null;
    if (s) {
      const probe = "__wah_probe__";
      s.setItem(probe, "1");
      s.removeItem(probe);
      ok = true;
    }
  } catch { ok = false; }
  if (!ok) {
    try {
      Object.defineProperty(window, name, { value: memoryStorage(), configurable: true, writable: false });
    } catch { /* can't patch — nothing more we can do */ }
  }
}

export {};
