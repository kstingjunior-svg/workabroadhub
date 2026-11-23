/**
 * "Unlock jobs — KES 1,000" prompt (2026-11). Shown when a job seeker without
 * an active plan taps Call / WhatsApp / Apply on a Kazi Karibu or Kenyan Jobs
 * listing. One option only: Monthly, KES 1,000 for 30 days.
 *
 * Usage: openJobUnlock(serverBody) from anywhere; <JobUnlockHost/> is mounted
 * once in App.tsx.
 */
import { useEffect, useState } from "react";
import { Lock, Phone, MessageCircle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const EVT = "wah:job-unlock";
export const JOB_UNLOCK_DEFAULT_URL = "/payment?plan=monthly&only=1";

export function openJobUnlock(body?: { payUrl?: string } | null) {
  const ret = window.location.pathname + window.location.search;
  const payUrl = body?.payUrl && body.payUrl.startsWith("/payment")
    ? body.payUrl
    : `${JOB_UNLOCK_DEFAULT_URL}&return=${encodeURIComponent(ret)}`;
  window.dispatchEvent(new CustomEvent(EVT, { detail: { payUrl } }));
}

export function JobUnlockHost() {
  const [payUrl, setPayUrl] = useState<string | null>(null);
  useEffect(() => {
    const h = (e: Event) => setPayUrl((e as CustomEvent).detail?.payUrl ?? JOB_UNLOCK_DEFAULT_URL);
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return (
    <Dialog open={!!payUrl} onOpenChange={(o) => { if (!o) setPayUrl(null); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-job-unlock">
        <DialogHeader>
          <div className="mx-auto mb-1 h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <Lock className="h-6 w-6 text-emerald-700 dark:text-emerald-300" />
          </div>
          <DialogTitle className="text-center text-xl">Unlock employer contacts</DialogTitle>
          <DialogDescription className="text-center">
            Pay once and call or WhatsApp employers directly for 30 days.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border-2 border-emerald-500 p-4 text-center">
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white">KES 1,000</div>
          <div className="text-sm text-slate-500">30 days · M-Pesa</div>
        </div>
        <ul className="text-sm space-y-1.5 text-slate-700 dark:text-slate-300">
          <li className="flex gap-2"><Phone className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />Call employers directly</li>
          <li className="flex gap-2"><MessageCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />WhatsApp employers</li>
          <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />Kazi Karibu + Kenyan Jobs Section, new jobs daily</li>
        </ul>
        <Button size="lg" className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700" data-testid="btn-job-unlock-pay"
          onClick={() => { const u = payUrl!; setPayUrl(null); window.location.href = u; }}>
          Pay KES 1,000 and unlock
        </Button>
        <p className="text-[11px] text-center text-slate-500">Never pay an employer to get a job. Your KES 1,000 goes to WorkAbroadHub only.</p>
      </DialogContent>
    </Dialog>
  );
}
