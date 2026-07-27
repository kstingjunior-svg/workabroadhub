/**
 * Referral tracking — client-side.
 *
 * Flow:
 *   1. Someone shares a card. The link is `/share/<orderId>` (also aliased
 *      as `/?ref=<orderId>` for links that appear inline).
 *   2. A visitor lands with `?ref=X` (or on `/share/X`) → we call
 *      `captureRef(X)` which stashes it in localStorage with a 30-day TTL.
 *   3. When the visitor eventually pays for a service, the checkout code
 *      calls `getStoredRef()` and includes the ref in the order-init POST.
 *   4. Server attributes the paid conversion to the referring order.
 *
 * We deliberately DON'T track anonymous visits — only paid conversions
 * count as an attributed referral, so there's nothing to reward until
 * money changes hands.
 */

const STORAGE_KEY = "wah_ref_v1";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredRef {
  token: string;
  capturedAt: number;
}

/** Save a referral token — called on landing pages / URL param capture. */
export function captureRef(token: string): void {
  if (!token || typeof token !== "string") return;
  const safe = token.trim().slice(0, 128); // paranoia — orderIds are ~36 chars
  if (!safe) return;
  try {
    const payload: StoredRef = { token: safe, capturedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private-mode / quota — silently ignore */
  }
}

/** Retrieve a still-valid referral token, or null if expired / missing. */
export function getStoredRef(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRef;
    if (!parsed?.token) return null;
    if (Date.now() - (parsed.capturedAt || 0) > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

/** Clear after successful attribution (so a subsequent visit doesn't re-attribute). */
export function clearStoredRef(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

/**
 * Look at the current URL for a ?ref= or /share/:token path segment and
 * capture it. Safe to call from useEffect on every page mount — noop if
 * no ref present.
 */
export function captureRefFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("ref");
    if (q) { captureRef(q); return; }
    const match = url.pathname.match(/^\/share\/([A-Za-z0-9_-]{6,64})/);
    if (match && match[1]) captureRef(match[1]);
  } catch {
    /* URL parse failure — ignore */
  }
}

/**
 * Build the shareable URL that goes on WhatsApp Status / message text.
 * Uses the order ID as the token — server can look it up directly for
 * attribution AND for rendering the correct card on /share/:token.
 */
export function buildShareUrl(orderId: string): string {
  if (typeof window === "undefined") {
    return `https://workabroadhub.tech/share/${encodeURIComponent(orderId)}`;
  }
  const origin = window.location.origin;
  return `${origin}/share/${encodeURIComponent(orderId)}`;
}

/**
 * Convert an SVG string to a PNG Blob using an in-browser <canvas>.
 * Used to build the file we hand to navigator.share() or download.
 */
export async function svgToPngBlob(svgString: string, size = 1080): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas 2D context unavailable"));
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob returned null"))),
        "image/png",
        0.95,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG failed to load into <img>"));
    };
    img.src = url;
  });
}
