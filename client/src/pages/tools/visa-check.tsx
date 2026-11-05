/**
 * Visa & work-permit check — VerifyX evidence report.
 *
 * 2026-11 (VerifyX): replaced the "trust score / consistent with genuine"
 * dashboard. The page now shows evidence-backed findings in six statuses,
 * never a genuine/fake verdict, and always points to the official check.
 *
 * Route: /tools/visa-check
 * Backend: POST /api/tools/visa-verify → async job → VerifyX report
 */
import { useRef, useState } from "react";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, Camera, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useToolPayment, TOOL_SCAN_PRICE_KES } from "@/hooks/use-tool-payment";
import { fetchCsrfToken } from "@/lib/queryClient";
import { pollToolScanResult, ToolScanError } from "@/lib/tool-scan-poll";
import { VerifyXReportView, type VxReport } from "@/components/verifyx-report";
import { VerifyXConsent } from "@/components/verifyx-consent";

export default function VisaCheckPage() {
  usePageSeo({
    title:       "Visa & Work-Permit Check (KES 100) — Evidence-Based Screening | WorkAbroad Hub",
    description: "Upload a visa or work permit and get an evidence-based report: date and machine-readable-zone checks, official sponsor-register lookups where available, and the exact official service to confirm the document yourself.",
    path:        "/tools/visa-check",
    keywords:    ["visa check kenya", "work permit check", "check visa validity", "visa document screening kenya"],
  });

  const { toast } = useToast();
  const pay = useToolPayment("visa_check");
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VxReport | null>(null);
  const [consent, setConsent] = useState(false);

  const ACCEPTED_MIMES = new Set<string>([
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ]);

  function handleFile(f: File | null) {
    if (!f) return;
    const isAccepted = ACCEPTED_MIMES.has(f.type) || /\.(pdf|docx?|jpe?g|png|webp)$/i.test(f.name);
    if (!isAccepted) {
      toast({ title: "Unsupported file type", description: "Upload a photo (JPG/PNG/WEBP) or the document itself (PDF or Word).", variant: "destructive" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload something under 10 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setResult(null);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  async function handleVerify(freshToken?: string) {
    if (!file || !consent) return;
    const token: string = freshToken ?? pay.scanToken ?? "";
    if (!token) {
      pay.requestScan((t) => handleVerify(t));
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/tools/visa-verify", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf, "x-scan-token": token },
        body: form,
      });
      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        setLoading(false);
        pay.handle402(data);
        return;
      }
      pay.consumeToken();
      try {
        const data = await pollToolScanResult<VxReport>(res);
        setResult(data);
      } catch (err: any) {
        // The server returns the credit whenever the failure was on our side.
        if (err instanceof ToolScanError && /no charge has been kept/i.test(err.message)) pay.restoreToken(token);
        throw err;
      }
    } catch (err: any) {
      if (err instanceof ToolScanError) {
        toast({ title: "Couldn't check this document", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Network issue", description: "Check your connection and try again.", variant: "destructive" });
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
            <ShieldCheck className="h-3.5 w-3.5" />
            VERIFYX · VISA &amp; WORK-PERMIT CHECK
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Check a visa or work permit</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-lg mx-auto leading-relaxed">
            We read the document, run checks we can prove (dates, machine-readable zone, official registers where available), show the evidence for every finding, and tell you exactly where to confirm it with the issuing authority.
          </p>
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">
            KES {TOOL_SCAN_PRICE_KES} per check · paid via M-Pesa · free re-check if we misread anything
          </p>
        </div>

        <pay.PayModal />

        {!result && (
          <Card className="border-2 border-dashed border-teal-300 dark:border-teal-800">
            <CardContent className="pt-6 pb-6 space-y-4">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="hidden"
                data-testid="input-visa-file"
              />

              {!file ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-3 py-8 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 rounded-lg transition"
                  data-testid="button-pick-visa"
                >
                  <div className="h-16 w-16 rounded-full bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center">
                    <Camera className="h-8 w-8 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 dark:text-white">Upload the visa or permit</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Photo (JPG/PNG/WEBP) or the file itself (PDF or Word) · up to 10 MB</p>
                  </div>
                </button>
              ) : (
                <div className="space-y-3">
                  {preview ? (
                    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 max-h-80">
                      <img src={preview} alt="Document preview" className="w-full h-auto object-contain max-h-80" />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3 bg-gray-50 dark:bg-gray-900/50" data-testid="visa-doc-card">
                      <div className="h-12 w-12 rounded-md bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-teal-700 dark:text-teal-300">{/\.pdf$/i.test(file.name) ? "PDF" : "DOC"}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 dark:text-white truncate text-sm">{file.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{(file.size / 1024).toFixed(0)} KB · ready</p>
                      </div>
                    </div>
                  )}
                  <VerifyXConsent checked={consent} onChange={setConsent} />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleVerify()}
                      disabled={loading || !consent}
                      className="flex-1 h-12 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold"
                      data-testid="button-verify"
                    >
                      {loading ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Checking (up to a minute)…</> : <><ShieldCheck className="h-5 w-5 mr-2" /> Check this document</>}
                    </Button>
                    <Button variant="outline" onClick={handleReset} disabled={loading} data-testid="button-change">Change</Button>
                  </div>
                </div>
              )}

              <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-1.5 leading-relaxed pt-2 border-t border-gray-100 dark:border-gray-800">
                <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <span>We do not have access to government immigration databases and cannot confirm a document is authentic. We show what can be checked, with evidence, and where to confirm the rest officially.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <VerifyXReportView report={result} onReportChange={setResult} onReset={handleReset} docNoun="document" />
        )}
      </div>
    </div>
  );
}
