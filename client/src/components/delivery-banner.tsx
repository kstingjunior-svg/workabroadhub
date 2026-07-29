/**
 * DeliveryBanner — sticky, high-visibility "DON'T CLOSE" → "DOWNLOAD" banner.
 *
 * Founder (Tony) brief, 2026-07:
 *   "Clients pay, walk away before the doc finishes, then email me saying
 *   'I paid but nothing came'. I need a big RED sticky bar the moment they
 *   pay that says DO NOT CLOSE THIS SCREEN UNTIL YOU DOWNLOAD YOUR CV. When
 *   the doc is ready it should turn GREEN with PDF + WORD buttons right there
 *   so they can't miss it. Works for EVERY document, not just CV."
 *
 * Behaviour:
 *   1. State "processing" → red banner, pulses, sticky at top of viewport,
 *      copy: "DO NOT CLOSE THIS SCREEN — your {service} is being prepared".
 *      Adds a `beforeunload` handler so browsers prompt the user before
 *      closing/refreshing (modern browsers show a generic message but that
 *      "Wait!" prompt is what we need).
 *
 *   2. State "done" → banner morphs to green (same DOM node, just re-styled
 *      + new copy: "READY TO DOWNLOAD"), shows PDF + Word buttons inline
 *      right on the banner. `beforeunload` guard is REMOVED — user has
 *      earned the right to close, they just have to download first.
 *
 *   3. State "failed" → banner turns amber with reassurance: "Your payment
 *      is safe — we'll email you the moment it's ready" and lets them close.
 *
 *   4. State "idle" (before payment / on upload stage) → banner not rendered.
 *
 * Persistence:
 *   Once the user clicks a download button, we localStorage-mark the order
 *   as downloaded. On revisit, the banner shows a "Downloaded ✓" state that
 *   they can dismiss. This prevents the banner haunting them forever.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, CheckCircle2, X, Loader2 } from "lucide-react";

export type DeliveryBannerStage = "idle" | "processing" | "done" | "failed";

interface DeliveryBannerProps {
  stage: DeliveryBannerStage;
  orderId: string | null;
  serviceName: string;
  /** Optional error text shown in the failed state. */
  errorMessage?: string | null;
}

const DOWNLOADED_KEY_PREFIX = "wah_dl_done:"; // localStorage key per orderId

export function DeliveryBanner({ stage, orderId, serviceName, errorMessage }: DeliveryBannerProps) {
  const [downloadedPdf, setDownloadedPdf]   = useState(false);
  const [downloadedDocx, setDownloadedDocx] = useState(false);
  const [dismissed, setDismissed]           = useState(false);

  const downloadKey = orderId ? `${DOWNLOADED_KEY_PREFIX}${orderId}` : "";

  // Restore downloaded/dismissed state from localStorage (so a page refresh
  // after downloading doesn't shove the banner back in the user's face).
  useEffect(() => {
    if (!downloadKey) return;
    try {
      const raw = localStorage.getItem(downloadKey);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state?.pdf)       setDownloadedPdf(true);
      if (state?.docx)      setDownloadedDocx(true);
      if (state?.dismissed) setDismissed(true);
    } catch { /* corrupted localStorage — treat as never-downloaded */ }
  }, [downloadKey]);

  const persistState = (patch: Partial<{ pdf: boolean; docx: boolean; dismissed: boolean }>) => {
    if (!downloadKey) return;
    try {
      const raw   = localStorage.getItem(downloadKey);
      const prev  = raw ? JSON.parse(raw) : {};
      const merged = { ...prev, ...patch, at: Date.now() };
      localStorage.setItem(downloadKey, JSON.stringify(merged));
    } catch { /* private mode / quota — noop */ }
  };

  // ── beforeunload guard while the document is being prepared ────────────
  // Adds a native browser "Are you sure you want to leave?" prompt so the
  // user can't accidentally close/refresh mid-processing. Removed the moment
  // status flips to done (or failed — since payment is safe either way).
  useEffect(() => {
    if (stage !== "processing") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore custom messages and show a generic prompt, but
      // returnValue MUST be a non-empty string to trigger the prompt at all.
      e.returnValue = "Your document is being prepared. If you close now, you'll miss the download link.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [stage]);

  // Hide banner entirely for idle stage, or if user dismissed after downloading.
  if (stage === "idle") return null;
  if (dismissed) return null;

  const service = (serviceName || "document").toLowerCase();

  // ── Rendered banner ─────────────────────────────────────────────────────
  // Base positioning: sticky at the top of the viewport, above everything.
  const wrapperBase = "sticky top-0 left-0 right-0 z-[70] shadow-lg border-b-2 print:hidden";

  // Processing (red, pulsing)
  if (stage === "processing") {
    return (
      <div
        className={`${wrapperBase} bg-red-600 border-red-800 animate-pulse-slow`}
        role="alert"
        aria-live="assertive"
        data-testid="delivery-banner-processing"
      >
        <div className="max-w-3xl mx-auto px-3 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
          <div className="flex-shrink-0">
            <AlertTriangle className="h-6 w-6 sm:h-7 sm:w-7 text-white animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-extrabold text-[13px] sm:text-sm leading-tight uppercase tracking-wide">
              Do not close this screen
            </p>
            <p className="text-red-100 text-[11px] sm:text-xs leading-snug mt-0.5">
              Your {service} is being prepared. Wait here until the download appears — usually 1-2 minutes.
            </p>
          </div>
          <div className="flex-shrink-0 flex items-center gap-1 text-white text-[11px] sm:text-xs font-semibold">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="hidden sm:inline">Preparing…</span>
          </div>
        </div>
      </div>
    );
  }

  // Done (green, downloads inline)
  if (stage === "done" && orderId) {
    const bothDownloaded = downloadedPdf && downloadedDocx;
    return (
      <div
        className={`${wrapperBase} bg-emerald-600 border-emerald-800`}
        role="alert"
        aria-live="polite"
        data-testid="delivery-banner-done"
      >
        <div className="max-w-3xl mx-auto px-3 py-2.5 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <CheckCircle2 className="h-6 w-6 sm:h-7 sm:w-7 text-white flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-white font-extrabold text-[13px] sm:text-sm leading-tight uppercase tracking-wide">
                Ready to download
              </p>
              <p className="text-emerald-50 text-[11px] sm:text-xs leading-snug mt-0.5">
                Your {service} is ready — download now before you close this screen.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
            <a
              href={`/api/services/order/${orderId}/download/pdf`}
              onClick={() => { setDownloadedPdf(true); persistState({ pdf: true }); }}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md font-bold text-xs sm:text-sm transition ${
                downloadedPdf
                  ? "bg-white/20 text-emerald-50 hover:bg-white/30"
                  : "bg-white text-emerald-700 hover:bg-emerald-50 shadow-sm"
              }`}
              data-testid="banner-download-pdf"
            >
              <Download className="h-4 w-4" />
              {downloadedPdf ? "PDF ✓" : "PDF"}
            </a>
            <a
              href={`/api/services/order/${orderId}/download/docx`}
              onClick={() => { setDownloadedDocx(true); persistState({ docx: true }); }}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md font-bold text-xs sm:text-sm transition ${
                downloadedDocx
                  ? "bg-white/20 text-emerald-50 hover:bg-white/30"
                  : "bg-white text-emerald-700 hover:bg-emerald-50 shadow-sm"
              }`}
              data-testid="banner-download-docx"
            >
              <Download className="h-4 w-4" />
              {downloadedDocx ? "Word ✓" : "Word"}
            </a>
            {bothDownloaded && (
              <button
                type="button"
                onClick={() => { setDismissed(true); persistState({ dismissed: true }); }}
                className="p-1 rounded-md hover:bg-white/20 transition"
                aria-label="Close banner"
                data-testid="banner-dismiss"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Failed (amber, reassurance)
  if (stage === "failed") {
    return (
      <div
        className={`${wrapperBase} bg-amber-500 border-amber-700`}
        role="alert"
        aria-live="assertive"
        data-testid="delivery-banner-failed"
      >
        <div className="max-w-3xl mx-auto px-3 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
          <AlertTriangle className="h-6 w-6 sm:h-7 sm:w-7 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-extrabold text-[13px] sm:text-sm leading-tight uppercase tracking-wide">
              Your payment is safe
            </p>
            <p className="text-amber-50 text-[11px] sm:text-xs leading-snug mt-0.5">
              {errorMessage || `We hit a small delay preparing your ${service}. It'll arrive by email + WhatsApp within the hour.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setDismissed(true); persistState({ dismissed: true }); }}
            className="p-1 rounded-md hover:bg-white/20 transition flex-shrink-0"
            aria-label="Close banner"
            data-testid="banner-dismiss-failed"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
