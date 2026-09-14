/**
 * use-tool-payment.tsx — KES 100 pay-per-scan gate for the verification tools.
 *
 * 2026-09 (Tony's monetisation directive): the four verification tools
 * (offer letter, visa, IELTS, job-scam) now cost KES 100 per check, paid by
 * M-Pesa STK push. The ATS CV checker stays free.
 *
 * Usage inside a tool page:
 *
 *   const pay = useToolPayment("offer_check");
 *   ...
 *   async function handleVerify() {
 *     if (!pay.scanToken) { pay.requestScan(() => handleVerify()); return; }
 *     const res = await fetch("/api/tools/offer-verify", {
 *       headers: { "x-scan-token": pay.scanToken, ... }, ...
 *     });
 *     if (res.status === 402) { pay.handle402(await res.json()); return; }
 *     pay.consumeToken(); // one payment = one scan
 *     ...
 *   }
 *   ...
 *   return <>... <pay.PayModal /> ...</>;
 *
 * The server is the real gate (requireToolCredit consumes the credit
 * atomically) — this hook is UX: collect the phone, fire the STK push,
 * poll until paid, then run the scan the user asked for.
 *
 * 2026-09 (Tony's "clients pay but get nothing" report): real customers on
 * real phones were paying KES 100, the M-Pesa payment genuinely succeeding
 * (server-side recovery — server/stk-recovery.ts — actively queries Safaricom
 * every 15s and recovers a payment even if Safaricom's callback is dropped),
 * and then getting NOTHING, while it "worked fine" whenever the site owner
 * tested it himself. Root cause: this hook kept the paid/pending state in
 * plain React state only, and gave up after a fixed 2-minute client-side
 * poll. Entering an M-Pesa PIN takes real users through their phone's own
 * SIM-toolkit / notification UI, which very commonly backgrounds or
 * suspends the browser tab — mobile browsers throttle or fully pause
 * setTimeout/fetch while backgrounded, and low-memory phones often evict a
 * backgrounded tab outright. A quick tester at a desk on WiFi almost never
 * hits that; someone on a mid-range Android phone reading an SMS while
 * paying does, every time. When that happened the payment still succeeded
 * server-side minutes later, but the client had already reset to a blank
 * page with nothing to redeem it — an orphaned, already-paid credit.
 *
 * Fix: persist the pending paymentId to localStorage the moment the STK
 * push is sent, re-check status immediately when the tab regains focus
 * (not just on the next 3s tick), extend the give-up window to comfortably
 * outlast the server's own 5-minute auto-recovery window, and — critically
 * — on every mount, silently look for a leftover paid-but-unconsumed credit
 * for this tool and adopt it instead of demanding another KES 100.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { fetchCsrfToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export const TOOL_SCAN_PRICE_KES = 100;

// ── Pending-payment persistence ─────────────────────────────────────────────
// Survives a reload, a backgrounded/evicted tab, or the user just closing the
// browser and coming back later. Scoped per tool so paying for one check
// never gets confused with another. 30 minutes comfortably outlasts every
// server-side recovery path (STK auto-recovery poller times out at 5 min;
// the M-Pesa Pull-API reconciler runs every 5 min looking back 90 min).
const PENDING_TTL_MS = 30 * 60 * 1000;

function pendingKey(tool: string): string {
  return `wah_toolpay_pending:${tool}`;
}

function readPending(tool: string): { paymentId: string; startedAt: number } | null {
  try {
    const raw = localStorage.getItem(pendingKey(tool));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.paymentId || typeof parsed.startedAt !== "number") return null;
    if (Date.now() - parsed.startedAt > PENDING_TTL_MS) {
      localStorage.removeItem(pendingKey(tool));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePending(tool: string, paymentId: string): void {
  try {
    localStorage.setItem(pendingKey(tool), JSON.stringify({ paymentId, startedAt: Date.now() }));
  } catch {
    /* localStorage unavailable (private mode etc.) — polling still works, just not resumable across reload */
  }
}

function clearPending(tool: string): void {
  try {
    localStorage.removeItem(pendingKey(tool));
  } catch {
    /* ignore */
  }
}

const TOOL_LABELS: Record<string, string> = {
  offer_check:    "Offer Letter Screening",
  visa_check:     "Visa Screening",
  ielts_verify:   "IELTS Verification",
  job_scam_check: "Job Scam Check",
};

type PayPhase = "idle" | "sending" | "waiting" | "paid" | "failed";

/** Sleep `ms`, but return early the moment the tab becomes visible again —
 * so a poll loop resumes checking immediately on focus instead of waiting
 * out the rest of a 3s tick after a backgrounded/evicted tab wakes up. */
function waitTickOrVisible(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    function onVisible() {
      if (document.visibilityState === "visible") finish();
    }
    document.addEventListener("visibilitychange", onVisible);
  });
}

export function useToolPayment(tool: string) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<PayPhase>("idle");
  const [payError, setPayError] = useState<string | null>(null);
  const [scanToken, setScanToken] = useState<string | null>(null);
  const { toast } = useToast();
  // 2026-09 (Tony: "automatic the moment one pays"): `run` is stashed here
  // and fired once payment confirms. It takes the fresh token as an ARGUMENT
  // rather than the caller re-reading `pay.scanToken` off its own closure —
  // that closure is captured at the moment the user first clicked "Verify"
  // (before payment), so `pay.scanToken` inside it is permanently null even
  // after the real state updates. Passing the token explicitly is what makes
  // the retry actually see the payment instead of silently re-opening the
  // pay modal, which used to force people to cancel and click Verify again.
  const onPaidRef = useRef<((token: string) => void) | null>(null);
  const pollAbortRef = useRef<boolean>(false);

  const label = TOOL_LABELS[tool] ?? "Verification";

  // On every mount, silently check for a leftover paid-but-unconsumed credit
  // for this tool (e.g. the tab was backgrounded during M-Pesa PIN entry last
  // time and the poll loop never got to redeem it). If found, adopt it so the
  // user doesn't get charged again; if it turns out to have failed or already
  // been used, drop the stale local record.
  useEffect(() => {
    const pending = readPending(tool);
    if (!pending) return;
    let cancelled = false;
    (async () => {
      try {
        const sRes = await fetch(`/api/tools/pay/${encodeURIComponent(pending.paymentId)}/status`, {
          credentials: "include",
        });
        if (!sRes.ok || cancelled) return;
        const s = await sRes.json();
        if (cancelled) return;
        if (s.paid && !s.consumed) {
          setScanToken(pending.paymentId);
          clearPending(tool);
          toast({
            title: "Earlier payment found",
            description: `Your KES ${TOOL_SCAN_PRICE_KES} payment for ${label} went through — you can run the check now without paying again.`,
          });
        } else if (s.consumed || s.status === "failed") {
          clearPending(tool);
        }
        // else still genuinely pending (rare) — leave the local record so a
        // later mount or the TTL expiry resolves it.
      } catch {
        /* transient — leave the pending record, we'll retry next mount */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  /** Open the pay modal; `run(token)` fires automatically once payment confirms. */
  const requestScan = useCallback((run: (token: string) => void) => {
    onPaidRef.current = run;
    setPayError(null);
    setPhase("idle");
    setOpen(true);
  }, []);

  /** One payment = one scan: call after the scan request went through. */
  const consumeToken = useCallback(() => {
    setScanToken(null);
    clearPending(tool);
  }, [tool]);

  /** The server rejected the token (402) — clear it and re-open the modal. */
  const handle402 = useCallback((data: any) => {
    setScanToken(null);
    // PAYMENT_PENDING means the credit is real but not confirmed yet — keep
    // the local pending record so the mount-time check / poll can still pick
    // it up automatically later. Any other 402 (already used, wrong tool,
    // not found) means the local record is stale — drop it.
    if (data?.code !== "PAYMENT_PENDING") {
      clearPending(tool);
    }
    setPayError(
      data?.code === "PAYMENT_PENDING"
        ? "Payment not confirmed yet — complete the M-Pesa prompt on your phone. We'll pick it up automatically; you don't need to pay again."
        : data?.message || `This check costs KES ${TOOL_SCAN_PRICE_KES}.`,
    );
    setPhase("idle");
    setOpen(true);
  }, [tool]);

  const startPayment = useCallback(async () => {
    setPayError(null);
    setPhase("sending");
    try {
      const csrf = await fetchCsrfToken().catch(() => "");
      const res = await fetch("/api/tools/pay", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ tool, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayError(data?.message || "Could not start the payment. Please try again.");
        setPhase("failed");
        return;
      }
      const paymentId: string = data.paymentId;
      writePending(tool, paymentId);
      setPhase("waiting");

      // Poll payment status every ~3s (sooner if the tab regains focus) for
      // up to 6 minutes — comfortably outlasting the server's own 5-minute
      // STK auto-recovery window, so a payment that only confirms server-side
      // after the phone's M-Pesa UI backgrounds/suspends this tab still gets
      // caught here instead of orphaned.
      pollAbortRef.current = false;
      const deadline = Date.now() + 360_000;
      while (Date.now() < deadline && !pollAbortRef.current) {
        await waitTickOrVisible(3000);
        try {
          const sRes = await fetch(`/api/tools/pay/${encodeURIComponent(paymentId)}/status`, {
            credentials: "include",
          });
          if (!sRes.ok) continue;
          const s = await sRes.json();
          if (s.paid) {
            clearPending(tool);
            setScanToken(paymentId);
            setPhase("paid");
            setOpen(false);
            const run = onPaidRef.current;
            onPaidRef.current = null;
            // Let the dialog close before the scan kicks off. Pass the fresh
            // paymentId directly — see the note on onPaidRef above.
            setTimeout(() => run?.(paymentId), 50);
            return;
          }
          if (s.status === "failed") {
            clearPending(tool);
            setPayError("The M-Pesa payment failed or was cancelled. Please try again.");
            setPhase("failed");
            return;
          }
        } catch {
          /* transient poll error — keep polling */
        }
      }
      if (!pollAbortRef.current) {
        // Deliberately NOT clearing the pending record here: the payment may
        // still confirm server-side after we stop watching (that's exactly
        // the failure mode this fix targets), and the mount-time check will
        // pick it up automatically next time this page loads.
        setPayError("Still waiting on M-Pesa confirmation. If you completed the PIN prompt, your payment will be picked up automatically — just reopen this page in a few minutes. No need to pay again unless you cancelled the prompt.");
        setPhase("failed");
      }
    } catch (err: any) {
      setPayError("Network problem starting the payment. Please try again.");
      setPhase("failed");
    }
  }, [tool, phone]);

  const closeModal = useCallback(() => {
    pollAbortRef.current = true;
    setOpen(false);
    setPhase("idle");
  }, []);

  const busy = phase === "sending" || phase === "waiting";

  // ── Stable modal component ────────────────────────────────────────────────
  // PayModal must keep the SAME function identity across every render of this
  // hook. Previously it was declared as a plain nested function, so every
  // re-render (including the one triggered by each keystroke via setPhone)
  // produced a brand-new function reference. React treats a changed component
  // type as a different component and remounts the whole Dialog subtree —
  // which drops focus off the phone Input after every single character, so
  // typing more than one digit was impossible. Reading live values through a
  // ref (refreshed on every render, before PayModal itself is rendered as a
  // child) keeps the component's output current without ever changing its
  // identity, so React just updates it in place and focus is preserved.
  const liveRef = useRef({ open, phone, phase, payError, busy, label, setPhone, startPayment, closeModal });
  liveRef.current = { open, phone, phase, payError, busy, label, setPhone, startPayment, closeModal };

  const payModalRef = useRef<(() => JSX.Element) | null>(null);
  if (!payModalRef.current) {
    payModalRef.current = function PayModal() {
      const { open, phone, phase, payError, busy, label, setPhone, startPayment, closeModal } = liveRef.current;
      return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) closeModal(); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-teal-600" />
                {label} — KES {TOOL_SCAN_PRICE_KES}
              </DialogTitle>
              <DialogDescription>
                Each check costs KES {TOOL_SCAN_PRICE_KES}, paid via M-Pesa. Enter your
                Safaricom number, approve the prompt on your phone, and your scan runs
                immediately. One payment covers one check.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="tool-pay-phone">M-Pesa phone number</Label>
                <Input
                  id="tool-pay-phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="07XX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={busy}
                  data-testid="input-tool-pay-phone"
                />
              </div>

              {payError && (
                <p className="text-sm text-red-600 dark:text-red-400" data-testid="text-tool-pay-error">{payError}</p>
              )}

              {phase === "waiting" && (
                <p className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <Smartphone className="h-4 w-4 animate-pulse" />
                  STK push sent — enter your M-Pesa PIN on your phone. Waiting for confirmation…
                </p>
              )}

              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={startPayment}
                disabled={busy || phone.replace(/\D/g, "").length < 9}
                data-testid="button-tool-pay"
              >
                {phase === "sending" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending STK push…</>
                ) : phase === "waiting" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Waiting for M-Pesa PIN…</>
                ) : (
                  <>Pay KES {TOOL_SCAN_PRICE_KES} via M-Pesa</>
                )}
              </Button>

              <p className="text-[11px] text-center text-muted-foreground">
                Safaricom lines only. The result appears here the moment payment confirms —
                keep this page open.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      );
    };
  }

  return { scanToken, requestScan, consumeToken, handle402, PayModal: payModalRef.current, payOpen: open };
}
