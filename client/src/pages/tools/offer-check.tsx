/**
 * Offer Letter Check — VerifyX evidence report (2026-11: replaced the trust-score dashboard).
 *
 * 2026-07 (Tony's founder brief): "Build the world's most intelligent
 * Employment Offer Letter Verification Tool. The AI should behave like an
 * experienced HR manager, immigration officer, labour inspector, and
 * document forensic analyst."
 *
 * Route: /tools/offer-check
 * Backend: POST /api/tools/offer-verify (v2 AI engine — see analyzer.ts)
 * Legacy PDF fallback: POST /api/tools/offer-check (v1 heuristic).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Button } from "@/components/ui/button";
import {
  Loader2, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  Info, ExternalLink, ChevronDown, ChevronUp, Camera, RefreshCw, Phone,
  Mail, Globe, Building2, DollarSign, Briefcase,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useToolPayment, TOOL_SCAN_PRICE_KES } from "@/hooks/use-tool-payment";
import { fetchCsrfToken } from "@/lib/queryClient";
import { pollToolScanResult, ToolScanError } from "@/lib/tool-scan-poll";
import { VerifyXReportView, type VxReport } from "@/components/verifyx-report";
import { VerifyXConsent } from "@/components/verifyx-consent";
import { pinFileInMemory } from "@/lib/pin-file";

export default function OfferCheckPage() {
  usePageSeo({
    title:       "Offer Letter Check (KES 100) — Evidence-Based Employer & Offer Screening | WorkAbroad Hub",
    description: "Upload an overseas job offer and get an evidence-based report: employer checks against official registers where available, sender-domain checks, fee and pressure warning signs, and how to confirm the offer with the employer yourself.",
    path:        "/tools/offer-check",
    keywords:    ["offer letter check kenya", "job offer scam warning signs", "check overseas employer", "employment letter check kenya"],
  });

  const { toast } = useToast();
  const pay = useToolPayment("offer_check");
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VxReport | null>(null);
  const [consent, setConsent] = useState(false);

  // 2026-10 (Tony's "customer paid twice because scan never fired" fix):
  // if payment confirms AFTER the file state was lost (tab backgrounded
  // for 6 min during STK polling, iPhone Safari evicting the tab, user
  // navigating away and back), the handleVerify re-run would silently
  // bail at `if (!file) return;`. User saw nothing happen, assumed
  // payment failed, and paid again.
  //
  // This state holds the unused scan credit so the UI can:
  //   (a) show a persistent banner "Payment confirmed - upload your
  //       offer letter to use your paid credit"
  //   (b) auto-fire handleVerify the moment they re-upload a file.
  //
  // Persisted to sessionStorage so a full page refresh survives too.
  const PAID_CREDIT_STORAGE_KEY = "offer_check_paid_credit";
  const [paidCreditReady, setPaidCreditReady] = useState<string | null>(() => {
    try { return sessionStorage.getItem(PAID_CREDIT_STORAGE_KEY) || null; }
    catch { return null; }
  });
  function stashPaidCredit(token: string) {
    setPaidCreditReady(token);
    try { sessionStorage.setItem(PAID_CREDIT_STORAGE_KEY, token); } catch {}
  }
  function clearPaidCredit() {
    setPaidCreditReady(null);
    try { sessionStorage.removeItem(PAID_CREDIT_STORAGE_KEY); } catch {}
  }

  // 2026-10 (Tony's customer-recovery flow): URL ?scanToken=XXX restores
  // a paid credit so admins can send a direct recovery link to any
  // customer whose scan silently failed. Mounts once; the banner picks
  // it up from paidCreditReady state the same way.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tokenFromUrl = params.get("scanToken")?.trim();
      if (tokenFromUrl && tokenFromUrl.length >= 16) {
        stashPaidCredit(tokenFromUrl);
        // Scrub the URL so a refresh / share doesn't leak the token.
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch { /* no window / no URL — SSR-safe */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2026-08 (Tony): accept PDF + Word docs too. Many offer letters arrive
  // as attachments — restricting to images made users take a screenshot
  // of the PDF first. Server (offer-check-endpoint.ts) already handles
  // PDF/DOC/DOCX via extractTextFromBuffer, so no server change needed.
  const ACCEPTED_MIMES = new Set<string>([
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ]);

  async function handleFile(picked: File | null) {
    if (!picked) return;
    // Copy into memory now so switching to the M-Pesa prompt can't revoke it.
    const f = await pinFileInMemory(picked);
    const isAccepted = ACCEPTED_MIMES.has(f.type) || /\.(pdf|docx?|jpe?g|png|webp)$/i.test(f.name);
    if (!isAccepted) {
      toast({ title: "Unsupported file type", description: "Upload a photo (JPG/PNG/WEBP) or the offer letter itself (PDF or Word).", variant: "destructive" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload something under 10 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setResult(null);
    // Only images render inline as a preview; PDF/Word show a document
    // card in the UI below (renders based on file.type).
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);

    // 2026-10 (Tony's "paid twice" fix): if a prior payment left a paid
    // credit waiting, auto-fire the scan now with that credit. The user
    // doesn't need to click Verify again — they already paid.
    if (paidCreditReady && consent) {
      // Pass the new file in directly: handleVerify from this render still
      // sees the OLD `file` state (null), which used to send the customer
      // round in a "re-upload your offer letter" loop.
      setTimeout(() => handleVerify(paidCreditReady, f), 0);
    }
  }

  async function handleVerify(freshToken?: string, fileOverride?: File) {
    const token: string = freshToken ?? pay.scanToken ?? paidCreditReady ?? "";
    const upload = fileOverride ?? file;

    // 2026-10 (Tony's "paid twice because scan never fired" fix): if we
    // DO have a paid credit but the file was lost (tab backgrounded, iOS
    // Safari tab eviction, full page refresh), stash the credit and
    // surface a clear banner so the user can re-upload. Previous
    // behaviour was `if (!file) return` which silently did nothing and
    // the user paid again, thinking the first charge had failed.
    if (!upload && token) {
      stashPaidCredit(token);
      toast({
        title: "Payment confirmed",
        description: "Re-upload your offer letter to run your paid scan. No extra charge.",
        duration: 12000,
      });
      return;
    }
    if (!upload) return;
    if (!consent) {
      toast({ title: "Please confirm", description: "Tick the consent box to run the check.", variant: "destructive" });
      return;
    }

    // 2026-09 (Tony's monetisation directive): KES 100 per scan. If no paid
    // credit is held, collect payment first — handleVerify re-runs
    // automatically the moment M-Pesa confirms. The retry gets the token
    // passed in directly (not re-read from pay.scanToken, which is frozen
    // at its pre-payment value inside this closure) so it can't loop back
    // into asking for payment again.
    if (!token) {
      pay.requestScan((t) => handleVerify(t, upload));
      return;
    }
    // We're about to actually fire the scan with this credit — clear the
    // stashed one so a success doesn't leave a stale banner around.
    if (paidCreditReady) clearPaidCredit();
    setLoading(true);
    setResult(null);
    // 2026-09 (Tony's screenshot: "Network issue — check your connection"
    // firing on a working network). Real cause almost always Render cold
    // start (~60-90s) or the AI provider taking longer than the client's
    // implicit timeout. Retry once with a 3s wait, log the underlying
    // reason to devtools so future failures are debuggable, and give the
    // user a specific message instead of a generic scare toast.
    async function postOnce(): Promise<Response> {
      const form = new FormData();
      form.append("file", upload!);
      const csrf = await fetchCsrfToken();
      return fetch("/api/tools/offer-verify", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf, "x-scan-token": token },
        body: form,
      });
    }
    let res: Response | null = null;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        console.warn(`[offer-verify] attempt ${attempt + 1} — last error:`, lastErr?.message ?? lastErr);
        await new Promise((r) => setTimeout(r, 3000));
      }
      try {
        res = await postOnce();
        break;
      } catch (err: any) {
        lastErr = err;
      }
    }
    if (!res) {
      console.error("[offer-verify] both attempts failed:", lastErr);
      // The upload never reached us, so the paid credit is unused. Keep it
      // visible (banner + sessionStorage) and say so plainly — the old
      // "Server is warming up" message made paid customers give up.
      stashPaidCredit(token);
      toast({
        title: "Upload didn't go through — your payment is saved",
        description: "Check your internet connection, then tap Verify again (or re-select the file). You won't be charged again.",
        variant: "destructive",
        duration: 15000,
      });
      setLoading(false);
      return;
    }
    try {
      if (res.status === 402) {
        // Credit missing/expired/used — server is the gate; re-collect payment.
        const data = await res.json().catch(() => ({}));
        setLoading(false);
        pay.handle402(data);
        return;
      }
      // The gate consumed the credit for this scan — one payment, one check.
      pay.consumeToken();
      // 2026-09: the server now runs the (slow) AI analysis in the
      // background and responds 202 immediately with a job id — see
      // client/src/lib/tool-scan-poll.ts for why (Render's ~30s proxy
      // timeout was silently eating already-paid-for results).
      try {
        const data = await pollToolScanResult<VxReport>(res);
        setResult(data);
      } catch (pollErr: any) {
        // The server returns the credit whenever the failure was on our side.
        if (pollErr instanceof ToolScanError && /no charge has been kept/i.test(pollErr.message)) pay.restoreToken(token);
        throw pollErr;
      }
    } catch (err: any) {
      if (err instanceof ToolScanError) {
        toast({ title: "Couldn't verify", description: err.message, variant: "destructive" });
      } else {
        console.error("[offer-verify] response was not JSON:", err, "status:", res.status);
        toast({
          title: "Verifier is busy",
          description: "The verifier took too long. Please try again in ~30 seconds, or screenshot the offer as a JPG and upload the image instead — image verification is usually faster than PDF.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-xs font-semibold">
            <Briefcase className="h-3.5 w-3.5" />
            VERIFYX · OFFER LETTER CHECK
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Check a job offer</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-lg mx-auto leading-relaxed">
            We read the letter, check the employer against official registers where we can (UK sponsor register, Kenya NEA agency register), check the sender's email domain, flag fee and pressure warning signs, and show you how to confirm the offer with the employer yourself.
          </p>
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">
            KES {TOOL_SCAN_PRICE_KES} per check · paid via M-Pesa · free re-check if we misread anything
          </p>
        </div>

        <pay.PayModal />

        {/* 2026-10 (Tony's "paid twice because the UI never ran the scan"
            fix): if we have a paid credit sitting but no file (payment
            confirmed after the file state was lost — e.g. tab backgrounded
            during STK polling), tell the user prominently so they re-upload
            instead of paying again. */}
        {paidCreditReady && !file && !result && (
          <div
            className="rounded-xl border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-700 p-4 flex items-start gap-3"
            data-testid="paid-credit-banner"
          >
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                Your payment was received.
              </p>
              <p className="text-emerald-800 dark:text-emerald-300 mt-0.5 leading-relaxed">
                Upload your offer letter below to run your paid scan. <strong>No extra charge</strong> — your credit is still here.
              </p>
            </div>
            <button
              type="button"
              onClick={clearPaidCredit}
              className="text-xs text-emerald-700 dark:text-emerald-300 hover:underline flex-shrink-0"
              data-testid="btn-dismiss-paid-credit"
            >
              Dismiss
            </button>
          </div>
        )}

        {!result && (
          <Card className="border-2 border-dashed border-teal-300 dark:border-teal-800">
            <CardContent className="pt-6 pb-6 space-y-4">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="hidden"
                data-testid="input-offer-file"
              />

              {!file ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-3 py-8 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 rounded-lg transition"
                  data-testid="button-pick-offer"
                >
                  <div className="h-16 w-16 rounded-full bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center">
                    <Camera className="h-8 w-8 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 dark:text-white">Upload the offer letter</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Photo (JPG/PNG/WEBP) or the file itself (PDF or Word) · up to 10 MB</p>
                  </div>
                </button>
              ) : (
                <div className="space-y-3">
                  {preview ? (
                    // Image preview
                    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 max-h-80">
                      <img src={preview} alt="Offer preview" className="w-full h-auto object-contain max-h-80" />
                    </div>
                  ) : (
                    // Document card (PDF / Word)
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3 bg-gray-50 dark:bg-gray-900/50" data-testid="offer-doc-card">
                      <div className="h-12 w-12 rounded-md bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-teal-700 dark:text-teal-300">
                          {/\.pdf$/i.test(file.name) ? "PDF" : "DOC"}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 dark:text-white truncate text-sm">{file.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {(file.size / 1024).toFixed(0)} KB · ready to verify
                        </p>
                      </div>
                    </div>
                  )}
                  <VerifyXConsent checked={consent} onChange={setConsent} />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleVerify()}
                      disabled={loading || !consent}
                      className="flex-1 h-12 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold"
                      data-testid="button-verify-offer"
                    >
                      {loading ? (
                        <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Checking (up to a minute)…</>
                      ) : (
                        <><ShieldCheck className="h-5 w-5 mr-2" /> Check this offer</>
                      )}
                    </Button>
                    <Button variant="outline" onClick={handleReset} disabled={loading} data-testid="button-change-offer">
                      Change
                    </Button>
                  </div>
                </div>
              )}

              <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-1.5 leading-relaxed pt-2 border-t border-gray-100 dark:border-gray-800">
                <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <span>We cannot confirm that an employer issued a letter. We show what can be checked, with evidence, and how to confirm the rest directly with the employer and official registers.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <VerifyXReportView report={result} onReportChange={setResult} onReset={handleReset} docNoun="offer letter" />
        )}
      </div>
    </div>
  );
}
