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
 */
import { useCallback, useRef, useState } from "react";
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

export const TOOL_SCAN_PRICE_KES = 100;

const TOOL_LABELS: Record<string, string> = {
  offer_check:    "Offer Letter Screening",
  visa_check:     "Visa Screening",
  ielts_verify:   "IELTS Verification",
  job_scam_check: "Job Scam Check",
};

type PayPhase = "idle" | "sending" | "waiting" | "paid" | "failed";

export function useToolPayment(tool: string) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<PayPhase>("idle");
  const [payError, setPayError] = useState<string | null>(null);
  const [scanToken, setScanToken] = useState<string | null>(null);
  const onPaidRef = useRef<(() => void) | null>(null);
  const pollAbortRef = useRef<boolean>(false);

  const label = TOOL_LABELS[tool] ?? "Verification";

  /** Open the pay modal; `run` fires automatically once payment confirms. */
  const requestScan = useCallback((run: () => void) => {
    onPaidRef.current = run;
    setPayError(null);
    setPhase("idle");
    setOpen(true);
  }, []);

  /** One payment = one scan: call after the scan request went through. */
  const consumeToken = useCallback(() => setScanToken(null), []);

  /** The server rejected the token (402) — clear it and re-open the modal. */
  const handle402 = useCallback((data: any) => {
    setScanToken(null);
    setPayError(
      data?.code === "PAYMENT_PENDING"
        ? "Payment not confirmed yet — complete the M-Pesa prompt on your phone, then pay again if it expired."
        : data?.message || `This check costs KES ${TOOL_SCAN_PRICE_KES}.`,
    );
    setPhase("idle");
    setOpen(true);
  }, []);

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
      setPhase("waiting");

      // Poll payment status every 3s for up to 2 minutes.
      pollAbortRef.current = false;
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline && !pollAbortRef.current) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const sRes = await fetch(`/api/tools/pay/${encodeURIComponent(paymentId)}/status`, {
            credentials: "include",
          });
          if (!sRes.ok) continue;
          const s = await sRes.json();
          if (s.paid) {
            setScanToken(paymentId);
            setPhase("paid");
            setOpen(false);
            const run = onPaidRef.current;
            onPaidRef.current = null;
            // Let the dialog close before the scan kicks off.
            setTimeout(() => run?.(), 50);
            return;
          }
          if (s.status === "failed") {
            setPayError("The M-Pesa payment failed or was cancelled. Please try again.");
            setPhase("failed");
            return;
          }
        } catch {
          /* transient poll error — keep polling */
        }
      }
      if (!pollAbortRef.current) {
        setPayError("We didn't get payment confirmation in time. If you completed the M-Pesa prompt, wait a few seconds and press Pay again — you won't be charged twice for the same prompt.");
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
