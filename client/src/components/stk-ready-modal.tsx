/**
 * StkReadyModal — one-tap M-Pesa payment confirmation.
 *
 * 2026-09 (Tony): the earlier 3-item checklist + 5-second countdown was
 * confusing users — the labels were unreadable in dark mode and the
 * intermediate step buried the actual "Pay" action. Simplified down to
 * a one-screen confirmation that shows the amount + phone number and a
 * single "Pay Now" button that fires the STK push immediately.
 *
 * IMPORTANT — the public API (props) is unchanged so every caller keeps
 * working without edits: payment.tsx, upgrade-modal.tsx, service-order-flow.tsx,
 * cv-fix-lite-instant-pay.tsx, service-order.tsx. Do not rename or drop props.
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Props {
  open:          boolean;
  onOpenChange:  (v: boolean) => void;
  onConfirmed:   () => void;
  amountKes:     number;
  phone?:        string | null;
  productName?:  string;
  /** Retained for backwards-compat with existing callers; no longer used. */
  countdownSec?: number;
}

export function StkReadyModal({
  open, onOpenChange, onConfirmed,
  amountKes, phone, productName,
}: Props) {
  const [firing, setFiring] = useState(false);

  // Reset the firing lock every time the modal re-opens.
  useEffect(() => {
    if (open) setFiring(false);
  }, [open]);

  const fire = () => {
    if (firing) return;
    setFiring(true);
    onConfirmed();
    // Give the parent mutation a beat to actually POST before closing us.
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

        <p className="text-xs text-muted-foreground text-center mt-2 leading-relaxed">
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
              : <>Pay Now</>}
          </Button>
          <button
            onClick={() => onOpenChange(false)}
            className="text-xs text-muted-foreground hover:text-foreground text-center pt-1"
            data-testid="stk-ready-cancel"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
