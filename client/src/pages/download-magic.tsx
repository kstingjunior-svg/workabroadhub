/**
 * /download/:token — magic-link download page (anonymous, no auth required).
 *
 * 2026-08 (Tony's anonymous-checkout directive): guests who bought a career
 * service (CV Revamp, Cover Letter, SOP, etc.) without signing up receive an
 * email with `workabroadhub.tech/download/TOKEN`. This page:
 *   1. Uses the token to poll /api/services/order/:id/status?token=xxx (but
 *      we don't know the orderId — so we hit a small lookup endpoint that
 *      resolves token → orderId + status in one call)
 *   2. If completed → shows big PDF + Word download buttons
 *   3. If still processing → shows a progress spinner and auto-polls
 *   4. If token expired or link used up → shows "Contact support"
 *
 * The page is intentionally minimal and mobile-first — most Kenyan users
 * will land here from an email on their phone.
 */
import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, CheckCircle2, AlertCircle, Home, Sparkles } from "lucide-react";
import { triggerDownload } from "@/components/delivery-banner";

type Stage = "resolving" | "processing" | "ready" | "expired" | "error";

interface ResolvedOrder {
  orderId: string;
  serviceName: string;
  status: string;
  downloadAvailable: boolean;
}

export default function DownloadMagic() {
  const [, params] = useRoute("/download/:token");
  const token = params?.token ?? "";
  const [stage, setStage] = useState<Stage>("resolving");
  const [order, setOrder] = useState<ResolvedOrder | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");
  const [downloadBusy, setDownloadBusy] = useState<"pdf" | "docx" | null>(null);
  const [downloadErr, setDownloadErr] = useState<string>("");

  // Resolve token → orderId + status. We reuse the resolve-by-token endpoint.
  // (Server does: SELECT id, status, service_name FROM service_orders WHERE
  //  download_token = $1 AND download_expires_at > NOW())
  useEffect(() => {
    if (!token) {
      setStage("error");
      setErrMsg("Missing download token.");
      return;
    }
    let cancelled = false;
    let pollHandle: number | null = null;

    async function resolveAndPoll() {
      try {
        const res = await fetch(`/api/services/order/by-token/${encodeURIComponent(token)}`);
        if (!res.ok) {
          if (cancelled) return;
          if (res.status === 404 || res.status === 410) {
            setStage("expired");
            setErrMsg(
              res.status === 410
                ? "This download link has expired (30 days). Please contact support."
                : "We couldn't find that download link. It may have been mistyped.",
            );
            return;
          }
          setStage("error");
          setErrMsg("Something went wrong. Please try again shortly.");
          return;
        }
        const data: ResolvedOrder = await res.json();
        if (cancelled) return;
        setOrder(data);
        if (data.status === "completed" && data.downloadAvailable) {
          setStage("ready");
        } else if (data.status === "failed") {
          setStage("error");
          setErrMsg("Sorry — this order failed. Please contact support at info@workabroadhub.tech and we'll sort it out.");
        } else {
          setStage("processing");
          // Poll every 3s until completed
          pollHandle = window.setInterval(async () => {
            try {
              const r = await fetch(`/api/services/order/by-token/${encodeURIComponent(token)}`);
              if (!r.ok) return;
              const d: ResolvedOrder = await r.json();
              if (cancelled) return;
              setOrder(d);
              if (d.status === "completed" && d.downloadAvailable) {
                setStage("ready");
                if (pollHandle) window.clearInterval(pollHandle);
              } else if (d.status === "failed") {
                setStage("error");
                setErrMsg("Sorry — this order failed. Please contact support.");
                if (pollHandle) window.clearInterval(pollHandle);
              }
            } catch { /* transient — keep polling */ }
          }, 3000);
        }
      } catch (e: any) {
        if (cancelled) return;
        setStage("error");
        setErrMsg(e?.message || "Could not reach the server.");
      }
    }
    resolveAndPoll();

    return () => {
      cancelled = true;
      if (pollHandle) window.clearInterval(pollHandle);
    };
  }, [token]);

  async function handleDownload(format: "pdf" | "docx") {
    if (!order) return;
    setDownloadErr("");
    setDownloadBusy(format);
    try {
      const slug = (order.serviceName || "document").toLowerCase().replace(/\s+/g, "-");
      const url = `/api/services/order/${order.orderId}/download/${format}?token=${encodeURIComponent(token)}`;
      await triggerDownload(url, `workabroadhub-${slug}.${format}`);
    } catch (e: any) {
      setDownloadErr(e?.message || "Download failed. Please try again.");
    } finally {
      setDownloadBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <Home className="h-4 w-4" /> WorkAbroadHub
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Your document
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stage === "resolving" && (
              <div className="text-center py-8 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">Loading your document…</p>
              </div>
            )}

            {stage === "processing" && (
              <div className="text-center py-8 space-y-3" data-testid="stage-processing">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm font-medium">Almost there — your {order?.serviceName ?? "document"} is being prepared.</p>
                <p className="text-xs text-muted-foreground">
                  This page will refresh automatically the moment it's ready. You can safely close this tab and come back — we'll email you the link again when it's done.
                </p>
              </div>
            )}

            {stage === "ready" && order && (
              <div className="space-y-4" data-testid="stage-ready">
                <div className="text-center space-y-2">
                  <div className="flex justify-center">
                    <div className="h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                      <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                    </div>
                  </div>
                  <h2 className="text-xl font-bold">Your {order.serviceName} is ready 🎉</h2>
                  <p className="text-sm text-muted-foreground">Download it in the format you need.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={downloadBusy !== null}
                    onClick={() => handleDownload("pdf")}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-70 disabled:cursor-wait text-white font-semibold text-sm"
                    data-testid="button-download-pdf"
                  >
                    {downloadBusy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    PDF
                  </button>
                  <button
                    type="button"
                    disabled={downloadBusy !== null}
                    onClick={() => handleDownload("docx")}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-wait text-white font-semibold text-sm"
                    data-testid="button-download-docx"
                  >
                    {downloadBusy === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Word
                  </button>
                </div>

                {downloadErr && (
                  <div className="rounded-md border border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100 dark:border-red-800 text-xs p-3 flex gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{downloadErr}</span>
                  </div>
                )}

                <p className="text-xs text-muted-foreground text-center pt-2">
                  This download link works for 30 days. Save it now, or come back later using the link from your email.
                </p>
              </div>
            )}

            {(stage === "expired" || stage === "error") && (
              <div className="text-center py-6 space-y-3" data-testid="stage-error">
                <div className="flex justify-center">
                  <AlertCircle className="h-10 w-10 text-amber-500" />
                </div>
                <p className="text-sm font-medium">{errMsg}</p>
                <p className="text-xs text-muted-foreground">
                  Need help? Email <a href="mailto:info@workabroadhub.tech" className="text-primary font-medium">info@workabroadhub.tech</a> — we'll respond within 24 hours.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
