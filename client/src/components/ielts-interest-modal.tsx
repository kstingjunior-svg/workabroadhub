/**
 * IELTS Prep — interest-signup modal (Phase 0).
 *
 * 2026-06: collects email + target band + test timing + current level
 * so Tony can see whether the demand for a KES 10,000 IELTS prep product
 * is real before building it. Public — anonymous and signed-in users both
 * supported. Server stamps userId if signed in so we can cross-reference
 * with paid-tier customers later.
 */
import { useState } from "react";
import { X, Loader2, CheckCircle2, Sparkles, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

export function IeltsInterestModal({ open, onClose, defaultEmail = "" }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [band, setBand] = useState("");
  const [window, setWindow] = useState("");
  const [level, setLevel] = useState("");
  const [testType, setTestType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function reset() {
    setBand(""); setWindow(""); setLevel(""); setTestType("");
    setSubmitting(false); setError(null); setDone(null);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ielts/interest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          targetBand:         band     || undefined,
          plannedTestWindow:  window   || undefined,
          currentProficiency: level    || undefined,
          testType:           testType || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body?.message || `Submission failed (${res.status}).`); return; }
      setDone(body?.message ?? "Thanks — we'll let you know.");
    } catch (err: any) {
      setError(err?.message || "Could not save. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ielts-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => { reset(); onClose(); }}
    >
      <div
        className="relative bg-background w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="ielts-interest-modal"
      >
        <button
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted text-muted-foreground"
          onClick={() => { reset(); onClose(); }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="p-5 sm:p-6">
          {done ? (
            <div className="text-center py-2" data-testid="ielts-interest-success">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
              <h3 className="font-semibold mb-1">You're on the list</h3>
              <p className="text-sm text-muted-foreground mb-4">{done}</p>
              <Button onClick={() => { reset(); onClose(); }} variant="outline">Close</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="h-4 w-4 text-emerald-600" />
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                  Coming soon · IELTS Prep · KES 10,000
                </p>
              </div>
              <h2 id="ielts-modal-title" className="font-bold text-lg leading-tight">
                Tell me when WorkAbroad Hub IELTS is ready
              </h2>
              <p className="text-sm text-muted-foreground">
                We're putting together a Kenyan-built IELTS prep system at KES 10,000 — about a third of what
                you'd pay anywhere else. Full mock tests, AI essay feedback, personal study plan.
                Drop your email and we'll let you know the day it goes live.
              </p>

              <div>
                <label htmlFor="ielts-email" className="text-sm font-medium block mb-1">Your email *</label>
                <Input
                  id="ielts-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.slice(0, 160))}
                  placeholder="you@gmail.com"
                  data-testid="ielts-email"
                />
              </div>

              <div>
                <label htmlFor="ielts-band" className="text-sm font-medium block mb-1">Target band score</label>
                <select
                  id="ielts-band"
                  value={band}
                  onChange={(e) => setBand(e.target.value)}
                  className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                  data-testid="ielts-band"
                >
                  <option value="">Select…</option>
                  <option value="5.5">Band 5.5</option>
                  <option value="6.0">Band 6.0</option>
                  <option value="6.5">Band 6.5 (most common for UK work)</option>
                  <option value="7.0">Band 7.0 (NHS / Canada Express Entry)</option>
                  <option value="7.5">Band 7.5</option>
                  <option value="8.0+">Band 8.0+</option>
                  <option value="unsure">Not sure yet</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ielts-window" className="text-sm font-medium block mb-1">When's your test?</label>
                  <select
                    id="ielts-window"
                    value={window}
                    onChange={(e) => setWindow(e.target.value)}
                    className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                    data-testid="ielts-window"
                  >
                    <option value="">Select…</option>
                    <option value="within_1_month">Within 1 month</option>
                    <option value="1_to_3_months">1-3 months</option>
                    <option value="3_to_6_months">3-6 months</option>
                    <option value="6_plus_months">6+ months</option>
                    <option value="unsure">Not booked yet</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ielts-type" className="text-sm font-medium block mb-1">Test type</label>
                  <select
                    id="ielts-type"
                    value={testType}
                    onChange={(e) => setTestType(e.target.value)}
                    className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                    data-testid="ielts-type"
                  >
                    <option value="">Select…</option>
                    <option value="academic">Academic (uni / nurse-UK)</option>
                    <option value="general_training">General Training (work / migration)</option>
                    <option value="unsure">Not sure</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="ielts-level" className="text-sm font-medium block mb-1">Your current English confidence</label>
                <select
                  id="ielts-level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                  data-testid="ielts-level"
                >
                  <option value="">Select…</option>
                  <option value="beginner">Beginner — I struggle with grammar / vocabulary</option>
                  <option value="intermediate">Intermediate — I can hold a conversation</option>
                  <option value="advanced">Advanced — I'm fluent, just need test technique</option>
                  <option value="unsure">Not sure</option>
                </select>
              </div>

              {error && (
                <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 rounded-md p-2">
                  {error}
                </div>
              )}

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={submit}
                disabled={submitting || !email.trim()}
                data-testid="btn-ielts-submit"
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</>
                  : <><Sparkles className="h-4 w-4 mr-1.5" /> Notify me when it's ready</>}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                One email when we launch. No spam. Unsubscribe anytime.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
