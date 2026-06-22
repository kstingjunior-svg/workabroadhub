/**
 * Kenya Careers — Notify Me sheet (Phase 3a safety).
 *
 * 2026-06: Replaces the Apply button on every seeded job. The founder
 * confirmed the catalogue jobs aren't real postings yet — applying would
 * be misleading. So instead of a payment-gated apply form, the user gets
 * to leave their email and we'll notify them when the named employer
 * (Naivas, Aga Khan, etc.) actually starts posting real openings.
 *
 * No KES 99 paywall here. No false promise. Honest.
 *
 * Submits to POST /api/local-jobs/companies/:companyId/notify.
 */
import { useState } from "react";
import { Bell, X, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NotifySheetProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  jobId?: string;
}

export function KenyaCareersNotifySheet({ open, onClose, companyId, companyName, jobId }: NotifySheetProps) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  function reset() {
    setEmail(""); setPhone(""); setError(null); setSubmitted(null); setSubmitting(false);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/local-jobs/companies/${companyId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, phone, jobId }),
      });
      const ct = res.headers.get("content-type") || "";
      const body = ct.includes("application/json") ? await res.json() : null;
      if (!res.ok) {
        setError(body?.message || `Signup failed (${res.status}).`);
        return;
      }
      setSubmitted(body?.message ?? "Got it! We'll let you know.");
    } catch (err: any) {
      setError(err?.message || "Could not save your signup. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notify-sheet-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => { reset(); onClose(); }}
    >
      <div
        className="relative bg-background w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="notify-sheet"
      >
        <button
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted text-muted-foreground"
          onClick={() => { reset(); onClose(); }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
              <Bell className="h-3 w-3" /> Notify me
            </p>
            <h2 id="notify-sheet-title" className="font-bold text-lg leading-tight">
              When {companyName} starts hiring
            </h2>
          </div>

          {submitted ? (
            <div className="text-center py-2" data-testid="notify-success">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
              <h3 className="font-semibold mb-1">You're on the list</h3>
              <p className="text-sm text-muted-foreground mb-4">{submitted}</p>
              <Button onClick={() => { reset(); onClose(); }} variant="outline">Close</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Honest disclosure — this is the critical legal piece */}
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800 p-3 text-sm">
                <p className="font-medium text-amber-900 dark:text-amber-200 mb-1">This is a sample listing</p>
                <p className="text-xs text-amber-800 dark:text-amber-300/90">
                  We're showing what jobs at <strong>{companyName}</strong> typically look like — but they haven't started posting real openings here yet. Leave your email and we'll notify you the moment they do.
                </p>
              </div>

              <div>
                <label htmlFor="notify-email" className="text-sm font-medium block mb-1">Your email</label>
                <Input
                  id="notify-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.slice(0, 160))}
                  placeholder="you@gmail.com"
                  data-testid="notify-email-input"
                />
              </div>

              <div>
                <label htmlFor="notify-phone" className="text-sm font-medium block mb-1">Phone (optional)</label>
                <Input
                  id="notify-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.slice(0, 40))}
                  placeholder="07XX XXX XXX"
                  data-testid="notify-phone-input"
                />
              </div>

              {error && (
                <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 rounded-md p-2">
                  {error}
                </div>
              )}

              <Button
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                onClick={submit}
                disabled={submitting || !email.trim()}
                data-testid="btn-submit-notify"
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</>
                  : <><Sparkles className="h-4 w-4 mr-1.5" /> Notify me when they post</>}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                We don't take payment for sample listings. One email when {companyName} is live — no spam.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
