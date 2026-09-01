/**
 * StkReadyModal — pre-STK "Get Ready" checklist + 5-second countdown.
 *
 * 2026-08 (Tony's payment-failure audit): 208 of 501 monthly STK failures
 * came from DS-timeout + No-response (78% of all failures). Root cause is
 * NOT our code — users tap "Pay KES X" while their phone is locked, in
 * another app, or out of network. By the time they realise the STK arrived,
 * Safaricom has already timed out.
 *
 * This modal buys 5 seconds of setup time and shows a 3-item checklist so
 * the user has a moment to unlock their phone, close M-Pesa, and confirm
 * network before we fire. Aggressive countdown auto-advances so users who
 * already know what they're doing aren't slowed down.
 *
 * Usage — wrap any STK button:
 *
 *   const [readyOpen, setReadyOpen] = useState(false);
 *   ...
 *   <Button onClick={() => setReadyOpen(true)}>Pay KES 99</Button>
 *   <StkReadyModal
 *     open={readyOpen}
 *     onOpenChange={setReadyOpen}
 *     onConfirmed={() => paymentMutation.mutate(...)}
 *     amountKes={99}
 *     phone={phoneNumber}
 *     productName="Trial Plan"
 *   />
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Smartphone, Signal, KeyRound, Loader2 } from "lucide-react";

interface Props {
  open:          boolean;
  onOpenChange:  (v: boolean) => void;
  onConfirmed:   () => void;
  amountKes:     number;
  phone?:        string | null;
  productName?:  string;
  /** Countdown length in seconds. Defaults to 5. */
  countdownSec?: number;
}

const CHECKLIST = [
  { key: "unlock",  icon: Smartphone, label: "Unlock your phone" },
  { key: "network", icon: Signal,     label: "Confirm you have M-Pesa network" },
  { key: "ready",   icon: KeyRound,   label: "Have your M-Pesa PIN ready" },
];

export function StkReadyModal({
  open, onOpenChange, onConfirmed,
  amountKes, phone, productName,
  countdownSec = 5,
}: Props) {
  const [seconds, setSeconds] = useState(countdownSec);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [firing, setFiring]   = useState(false);

  // Reset every time the modal opens
  useEffect(() => {
    if (!open) return;
    setSeconds(countdownSec);
    setChecked(new Set());
    setFiring(false);
    const t = setInterval(() => {
      setSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [open, countdownSec]);

  const fire = () => {
    if (firing) return;
    setFiring(true);
    onConfirmed();
    // Give the parent mutation a beat to actually POST before closing us
    setTimeout(() => onOpenChange(false), 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl" data-testid="stk-ready-modal">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">Get your phone ready</DialogTitle>
          <DialogDescription className="text-center text-sm mt-1">
            We're about to send an M-Pesa payment request to{" "}
            <span className="font-mono font-medium text-foreground">{phone ?? "your phone"}</span>{" "}
            for <span className="font-semibold text-emerald-700">KES {amountKes.toLocaleString()}</span>
            {productName ? <> — {productName}</> : null}.
          </DialogDescription>
        </DialogHeader>

        {/* Checklist — tap to tick, purely for user reassurance (not enforced). */}
        <div className="space-y-2 mt-2">
          {CHECKLIST.map((item) => {
            const isDone = checked.has(item.key);
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => {
                  setChecked((prev) => {
                    const next = new Set(prev);
                    isDone ? next.delete(item.key) : next.add(item.key);
                    return next;
                  });
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition text-left ${
                  isDone
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-white border-slate-200 hover:bg-slate-50"
                }`}
                data-testid={`stk-ready-check-${item.key}`}
              >
                {isDone
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                  : <Circle className="h-5 w-5 text-slate-400 flex-shrink-0" />}
                <Icon className="h-4 w-4 text-slate-500 flex-shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Warm reassurance line */}
        <p className="text-xs text-muted-foreground text-center mt-1 leading-relaxed">
          The M-Pesa prompt will pop up on your phone within a few seconds. Enter your PIN quickly — it expires in about 60 seconds.
        </p>

        <div className="flex flex-col gap-2 mt-4">
          <Button
            onClick={fire}
            disabled={firing}
            className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-semibold gap-2"
            data-testid="stk-ready-confirm"
          >
            {firing
              ? <><Loader2 className="h-5 w-5 animate-spin" /> Sending STK…</>
              : seconds > 0
                ? <>I'm ready — send it now ({seconds}s)</>
                : <>I'm ready — send it now</>}
          </Button>
          <button
            onClick={() => onOpenChange(false)}
            className="text-xs text-muted-foreground hover:text-foreground text-center pt-1"
            data-testid="stk-ready-cancel"
          >
            Cancel — I'll pay later
          </button>
        </div>

        {/* Auto-advance when countdown hits 0 AND user hasn't clicked yet */}
        {seconds === 0 && !firing && (
          <div className="text-center text-xs text-emerald-700 font-medium pt-1">
            Ready to fire — tap the button above.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
