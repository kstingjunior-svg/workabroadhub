/**
 * "Report this vacancy" — 2026-10 School Recruitment Portal (trust & safety).
 * Posts to /api/local-jobs/:id/report. Signed-out users give an email.
 */
import { useState } from "react";
import { Flag, Loader2, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";

const REASONS = [
  { v: "asks_for_money", l: "Asks applicants to pay money" },
  { v: "fake", l: "Fake or the school doesn't exist" },
  { v: "wrong_info", l: "Wrong or misleading information" },
  { v: "discriminatory", l: "Discriminatory or offensive" },
  { v: "other", l: "Something else" },
];

export function ReportVacancy({ jobId }: { jobId: string }) {
  const { user } = useAuth() as any;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    if (sending) return;
    if (!reason) { setMsg({ ok: false, text: "Choose a reason." }); return; }
    setSending(true); setMsg(null);
    try {
      const res = await fetch(`/api/local-jobs/${jobId}/report`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details, email: user ? undefined : email }),
      });
      const data = await res.json().catch(() => ({}));
      setMsg({ ok: res.ok, text: data?.message ?? (res.ok ? "Thanks — we'll review it." : "Could not send your report.") });
    } catch {
      setMsg({ ok: false, text: "Network problem — please try again." });
    } finally { setSending(false); }
  }

  return (
    <div className="mt-6 text-center">
      <button type="button" onClick={() => { setOpen(true); setMsg(null); }}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-rose-700 underline-offset-4 hover:underline min-h-[44px]"
        data-testid="btn-report-vacancy">
        <Flag className="h-3.5 w-3.5" aria-hidden="true" /> Report this vacancy
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="rv-title">
          <div className="relative bg-background w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 text-left shadow-xl">
            <button aria-label="Close" className="absolute top-3 right-3 p-2 rounded-full hover:bg-muted" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
            {msg?.ok ? (
              <div className="text-center py-4">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm">{msg.text}</p>
                <Button className="mt-4 h-11" onClick={() => setOpen(false)}>Done</Button>
              </div>
            ) : (
              <>
                <h2 id="rv-title" className="font-semibold text-lg mb-1">Report this vacancy</h2>
                <p className="text-sm text-muted-foreground mb-3">Our team reviews every report. Never pay anyone to get a job.</p>
                <fieldset className="space-y-1.5">
                  <legend className="sr-only">Reason</legend>
                  {REASONS.map((r) => (
                    <label key={r.v} className="flex items-center gap-2 text-sm min-h-[40px]">
                      <input type="radio" name="rv-reason" className="h-4 w-4" checked={reason === r.v} onChange={() => setReason(r.v)} />
                      {r.l}
                    </label>
                  ))}
                </fieldset>
                <label htmlFor="rv-details" className="text-sm font-medium block mt-3 mb-1">Details (optional)</label>
                <Textarea id="rv-details" rows={3} value={details} onChange={(e) => setDetails(e.target.value.slice(0, 1500))} />
                {!user && (
                  <>
                    <label htmlFor="rv-email" className="text-sm font-medium block mt-3 mb-1">Your email *</label>
                    <Input id="rv-email" type="email" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" />
                  </>
                )}
                {msg && !msg.ok && <p className="text-sm text-rose-700 mt-2" role="alert">{msg.text}</p>}
                <Button className="w-full h-11 mt-4 bg-rose-600 hover:bg-rose-700 text-white" disabled={sending} onClick={submit}>
                  {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null} Send report
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
