/**
 * Kenya Careers — Claim Company sheet (Phase 3a).
 *
 * 2026-06: "Are you this employer? Claim your company profile."
 *
 * Public modal (no auth required) — opened from any company strip / job
 * detail page. Submits to POST /api/local-jobs/companies/:id/claim which
 * stores the request and emails the founder for manual verification.
 * Phase 4 will add full self-service verification (work-email loop +
 * domain matching), but Phase 3a is a one-screen claim form pointing at
 * Tony's inbox.
 */
import { useState } from "react";
import { Building2, X, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ClaimSheetProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
}

export function KenyaCareersClaimSheet({ open, onClose, companyId, companyName }: ClaimSheetProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  function reset() {
    setName(""); setEmail(""); setPhone(""); setRole(""); setMessage("");
    setError(null); setSubmitted(null); setSubmitting(false);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/local-jobs/companies/${companyId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, phone, role, message }),
      });
      const ct = res.headers.get("content-type") || "";
      const body = ct.includes("application/json") ? await res.json() : null;
      if (!res.ok) {
        setError(body?.message || `Submission failed (${res.status}).`);
        return;
      }
      setSubmitted(body?.message ?? "Thanks — we received your claim.");
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
      aria-labelledby="claim-sheet-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => { reset(); onClose(); }}
    >
      <div
        className="relative bg-background w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="claim-sheet"
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
              <Building2 className="h-3 w-3" /> Claim company profile
            </p>
            <h2 id="claim-sheet-title" className="font-bold text-lg leading-tight">{companyName}</h2>
          </div>

          {submitted ? (
            <div className="text-center py-2" data-testid="claim-success">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
              <h3 className="font-semibold mb-1">Claim received</h3>
              <p className="text-sm text-muted-foreground mb-4">{submitted}</p>
              <Button onClick={() => { reset(); onClose(); }} variant="outline">Close</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                If you work at <strong>{companyName}</strong>, claim this profile to take over the listings and post jobs directly. We'll review your claim within 1-2 business days.
              </p>

              <div>
                <label htmlFor="claim-name" className="text-sm font-medium block mb-1">Your full name</label>
                <Input
                  id="claim-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 160))}
                  placeholder="e.g. Mary Wanjiku"
                  data-testid="claim-name-input"
                />
              </div>

              <div>
                <label htmlFor="claim-email" className="text-sm font-medium block mb-1">Work email</label>
                <Input
                  id="claim-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.slice(0, 160))}
                  placeholder={`e.g. you@${companyName.toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, "").slice(0, 12) || "company"}.co.ke`}
                  data-testid="claim-email-input"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  We use this to verify you work at {companyName}.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="claim-phone" className="text-sm font-medium block mb-1">Phone (optional)</label>
                  <Input
                    id="claim-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.slice(0, 40))}
                    placeholder="07XX XXX XXX"
                    data-testid="claim-phone-input"
                  />
                </div>
                <div>
                  <label htmlFor="claim-role" className="text-sm font-medium block mb-1">Your role</label>
                  <Input
                    id="claim-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value.slice(0, 120))}
                    placeholder="HR Manager"
                    data-testid="claim-role-input"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="claim-message" className="text-sm font-medium block mb-1">Anything else? (optional)</label>
                <Textarea
                  id="claim-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                  rows={2}
                  placeholder="e.g. We'd like to post 5 new openings this month."
                  data-testid="claim-message-input"
                />
              </div>

              {error && (
                <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 rounded-md p-2">
                  {error}
                </div>
              )}

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={submit}
                disabled={submitting || !name.trim() || !email.trim()}
                data-testid="btn-submit-claim"
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending…</>
                  : <><Sparkles className="h-4 w-4 mr-1.5" /> Send claim</>}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                We'll email you at the address above within 1-2 business days.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
