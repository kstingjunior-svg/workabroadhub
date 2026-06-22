/**
 * Kenya Careers — Apply sheet (Phase 2).
 *
 * 2026-06: tier-gated application flow. Opened from the Apply button on
 * /kenya-careers/job/:id. Behaviour depends on the user's tier:
 *
 *   • Anonymous       → "Sign in to apply" → routes to /login?redirect=…
 *   • Free / no plan  → upgrade modal pointing to /pricing
 *   • Paid (trial+)   → application form (name/phone/email pre-filled +
 *                       optional cover note + CV upload) submitting to
 *                       POST /api/local-jobs/jobs/:id/apply
 *
 * The CV upload is OPTIONAL — if the employer doesn't ask for one, the user
 * can submit without it. Most retail/hospitality/cleaning jobs care more
 * about phone contact than a polished CV.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Upload, Loader2, X, Sparkles, BadgeCheck, AlertCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ApplyStatus {
  canApply:    boolean;
  reason:      "signin" | "upgrade" | "daily_limit" | "ok";
  tier:        string | null;
  appsToday:   number;
  dailyLimit:  number;
  message:     string | null;
}

interface ApplySheetProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
  companyName: string;
  companyVerified: boolean;
}

export function KenyaCareersApplySheet({
  open, onClose, jobId, jobTitle, companyName, companyVerified,
}: ApplySheetProps) {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<ApplyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ message: string; appsToday: number; dailyLimit: number } | null>(null);
  const [coverNote, setCoverNote] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch tier status whenever the sheet opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSubmitted(null);
    (async () => {
      try {
        const res = await fetch("/api/local-jobs/me/apply-status", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) throw new Error("Bad response");
        const data: ApplyStatus = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setError("Could not check your application status. Refresh and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  async function submitApplication() {
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      if (cvFile) fd.append("cv", cvFile);
      if (coverNote.trim()) fd.append("coverNote", coverNote.trim());
      const res = await fetch(`/api/local-jobs/jobs/${jobId}/apply`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const ct = res.headers.get("content-type") || "";
      const body = ct.includes("application/json") ? await res.json() : null;
      if (!res.ok) {
        // 402 = upgrade needed, 429 = daily limit, 400 = incomplete profile, 401 = signin
        if (body?.reason === "upgrade") {
          navigate("/pricing");
          return;
        }
        if (body?.reason === "signin") {
          navigate(`/login?redirect=${encodeURIComponent(`/kenya-careers/job/${jobId}`)}`);
          return;
        }
        if (body?.reason === "incomplete_profile") {
          setError(body.message);
          return;
        }
        setError(body?.message || `Application failed (${res.status}).`);
        return;
      }
      setSubmitted({
        message:    body.message || "Application sent!",
        appsToday:  body.appsToday ?? 0,
        dailyLimit: body.dailyLimit ?? 0,
      });
    } catch (err: any) {
      setError(err?.message || "Could not submit. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="apply-sheet-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-background w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="apply-sheet"
      >
        <button
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted text-muted-foreground"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-5 sm:p-6">
          {/* Header */}
          <div className="mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Apply for</p>
            <h2 id="apply-sheet-title" className="font-bold text-lg leading-tight">{jobTitle}</h2>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
              <span>{companyName}</span>
              {companyVerified && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="py-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Checking your account…
            </div>
          )}

          {/* Success */}
          {submitted && (
            <div className="py-2 text-center" data-testid="apply-success">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
              <h3 className="font-semibold mb-1">Application sent!</h3>
              <p className="text-sm text-muted-foreground mb-3">{submitted.message}</p>
              {submitted.dailyLimit < 9999 && (
                <p className="text-xs text-muted-foreground mb-4">
                  You've used <strong>{submitted.appsToday}</strong> of <strong>{submitted.dailyLimit}</strong> applications today.
                </p>
              )}
              <div className="flex gap-2 justify-center">
                <Button onClick={onClose} variant="outline">Browse more jobs</Button>
                <Button onClick={() => navigate("/kenya-careers/my-applications")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  My applications
                </Button>
              </div>
            </div>
          )}

          {/* Not signed in */}
          {!loading && !submitted && status?.reason === "signin" && (
            <div className="py-2" data-testid="apply-signin">
              <div className="flex items-start gap-2 p-3 mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800 text-sm">
                <Lock className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
                <span>Sign in or sign up first — applying is included with the <strong>KES 99 trial</strong> that also unlocks overseas jobs.</span>
              </div>
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/kenya-careers/job/${jobId}`)}`)}
              >
                Sign in to apply
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-2">
                Don't have an account? <a href="/signup" className="underline text-emerald-700 dark:text-emerald-300">Create one in 30 seconds</a>
              </p>
            </div>
          )}

          {/* Free tier — needs upgrade */}
          {!loading && !submitted && status?.reason === "upgrade" && (
            <div className="py-2" data-testid="apply-upgrade">
              <div className="rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 ring-1 ring-emerald-200 dark:ring-emerald-800 p-4 mb-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  <strong className="text-sm">Unlock applying — KES 99</strong>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  One trial subscription covers <strong>both</strong> the overseas board AND Kenya Careers:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Apply to <strong>3 jobs per day</strong> (Trial) or <strong>20/day</strong> (Monthly) or <strong>unlimited</strong> (Yearly)</li>
                  <li>Verified overseas jobs in 9 countries</li>
                  <li>Salary comparison + country roadmaps</li>
                  <li>CV check + interview practice</li>
                </ul>
              </div>
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => navigate("/pricing")}
                data-testid="btn-upgrade-from-apply"
              >
                See plans (from KES 99)
              </Button>
            </div>
          )}

          {/* Daily limit hit */}
          {!loading && !submitted && status?.reason === "daily_limit" && (
            <div className="py-2" data-testid="apply-daily-limit">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800 p-4 mb-3">
                <AlertCircle className="h-5 w-5 text-amber-700 dark:text-amber-300 mb-2" />
                <p className="text-sm">{status.message}</p>
              </div>
              <Button className="w-full" onClick={() => navigate("/pricing")}>
                See higher-tier plans
              </Button>
            </div>
          )}

          {/* Paid tier — show the form */}
          {!loading && !submitted && status?.canApply && (
            <div className="space-y-3" data-testid="apply-form">
              <p className="text-sm text-muted-foreground">
                We'll send your phone, email and (if attached) your CV to <strong>{companyName}</strong>. They'll contact you directly if you're shortlisted.
              </p>

              {/* CV upload */}
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  CV (optional — PDF or Word, max 5 MB)
                </label>
                {cvFile ? (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-md border bg-muted/30 text-sm">
                    <span className="truncate flex-1">{cvFile.name}</span>
                    <button
                      type="button"
                      className="text-xs text-rose-700 dark:text-rose-300 hover:underline"
                      onClick={() => { setCvFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-3 rounded-md border-2 border-dashed border-muted-foreground/30 hover:border-emerald-400 cursor-pointer text-sm text-muted-foreground">
                    <Upload className="h-4 w-4" />
                    <span>Tap to attach your CV</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && f.size > 5 * 1024 * 1024) {
                          setError("That CV is over 5 MB. Try compressing it or upload a PDF.");
                          return;
                        }
                        setCvFile(f ?? null);
                        setError(null);
                      }}
                      data-testid="apply-cv-input"
                    />
                  </label>
                )}
              </div>

              {/* Cover note */}
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  Short note (optional)
                </label>
                <Textarea
                  placeholder="Why do you want this role? Keep it short — 2-3 sentences is fine."
                  value={coverNote}
                  onChange={(e) => setCoverNote(e.target.value.slice(0, 2000))}
                  rows={3}
                  className="text-sm"
                  data-testid="apply-cover-input"
                />
                <p className="text-[10px] text-muted-foreground text-right mt-0.5">{coverNote.length} / 2000</p>
              </div>

              {/* Daily-quota note */}
              {status.dailyLimit < 9999 && (
                <p className="text-xs text-muted-foreground">
                  You've used <strong>{status.appsToday}</strong> of <strong>{status.dailyLimit}</strong> applications today.
                </p>
              )}

              {error && (
                <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 rounded-md p-2">
                  {error}
                </div>
              )}

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={submitApplication}
                disabled={submitting}
                data-testid="btn-submit-application"
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending application…</>
                  : <><Sparkles className="h-4 w-4 mr-1.5" /> Send my application</>}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                By applying, you agree {companyName} can contact you on your phone and email.
              </p>
            </div>
          )}

          {/* Fallback error */}
          {!loading && !submitted && error && !status && (
            <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 rounded-md p-3">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
