/**
 * <MpesaErrorCard> — single component that renders an M-Pesa failure into a
 * Kenyan-friendly card with a clear next step, a Retry button when sensible,
 * AND the manual Paybill 4153025 fallback box so the user always has a way
 * forward.
 *
 * Usage:
 *   import { MpesaErrorCard, type MpesaError } from "@/components/mpesa-error-card";
 *   const [err, setErr] = useState<MpesaError | null>(null);
 *   ...
 *   if (err) return <MpesaErrorCard error={err} onRetry={handleRetry} />;
 *
 * 2026-06: built after founder said "make sure that we don't have failed
 * M Pesa's when people are trying to upgrade." Now every failure path
 * surfaces (1) what went wrong in plain language, (2) what to do next,
 * (3) the manual Paybill option as a permanent escape hatch.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Copy, Check, RefreshCw, Phone, Mail } from "lucide-react";

export interface MpesaError {
  title?:        string;
  message?:      string;
  error?:        string;
  nextStep?:     string;
  retrySafe?:    boolean;
  offerPaybill?: boolean;
  badPhone?:     boolean;
  darajaCode?:   string | null;
  paybillFallback?: {
    paybill:  string;
    account:  string;
    amount:   number;
    planName?: string;
  };
}

interface Props {
  error:   MpesaError;
  onRetry?: () => void;
  onFixPhone?: () => void;
}

function CopyableValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 font-mono font-bold text-base text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 px-2 py-1 rounded transition-colors"
      title={`Copy ${label}`}
      data-testid={`copy-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {value}
      {copied
        ? <Check className="h-3.5 w-3.5 text-emerald-600" />
        : <Copy className="h-3.5 w-3.5 opacity-60" />}
    </button>
  );
}

export function MpesaErrorCard({ error, onRetry, onFixPhone }: Props) {
  const title    = error.title    || "M-Pesa didn't go through";
  const body     = error.message  || error.error || "We couldn't complete the payment.";
  const nextStep = error.nextStep || "Try once more, or use the manual Paybill option below.";

  return (
    <Card className="border-2 border-rose-300 dark:border-rose-700 bg-rose-50/60 dark:bg-rose-950/30">
      <CardContent className="p-4 space-y-3">
        {/* Title + plain-English explanation */}
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-700 dark:text-rose-300 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-rose-900 dark:text-rose-100">{title}</h3>
            <p className="text-xs text-rose-800 dark:text-rose-200 mt-1 leading-relaxed">{body}</p>
          </div>
        </div>

        {/* Next-step line — what to actually do */}
        <div className="text-xs text-foreground/90 bg-white dark:bg-black/30 border border-rose-200 dark:border-rose-800 rounded p-2.5 leading-relaxed">
          <strong className="text-rose-700 dark:text-rose-300">What to do: </strong>
          {nextStep}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {error.retrySafe && onRetry && (
            <Button
              onClick={onRetry}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
              data-testid="button-mpesa-retry"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Pay again
            </Button>
          )}
          {error.badPhone && onFixPhone && (
            <Button
              onClick={onFixPhone}
              variant="outline"
              size="sm"
              data-testid="button-mpesa-fix-phone"
            >
              <Phone className="h-3.5 w-3.5 mr-1.5" />
              Use a different phone
            </Button>
          )}
        </div>

        {/* Manual Paybill fallback — the permanent escape hatch */}
        {error.offerPaybill && error.paybillFallback && (
          <div className="border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg p-3">
            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-100 mb-2">
              ✅ Or pay manually — works 100% of the time
            </p>
            <ol className="text-xs text-emerald-900 dark:text-emerald-100 space-y-1.5 leading-relaxed">
              <li>
                <strong>1.</strong> Open M-Pesa → Lipa na M-Pesa → <strong>Pay Bill</strong>
              </li>
              <li>
                <strong>2.</strong> Business Number: <CopyableValue value={error.paybillFallback.paybill} label="Paybill" />
              </li>
              <li>
                <strong>3.</strong> Account Number: <CopyableValue value={error.paybillFallback.account} label="Account" />
              </li>
              <li>
                <strong>4.</strong> Amount: <CopyableValue value={String(error.paybillFallback.amount)} label="Amount" />{" "}
                {error.paybillFallback.planName && (
                  <span className="text-[10px] opacity-70">({error.paybillFallback.planName})</span>
                )}
              </li>
              <li>
                <strong>5.</strong> Enter your PIN. We'll detect the payment in a few minutes and unlock your access automatically.
              </li>
            </ol>
            <p className="text-[10px] text-emerald-800/80 dark:text-emerald-200/70 mt-2.5">
              Stuck? Email{" "}
              <a href="mailto:support@workabroadhub.tech" className="underline font-medium">
                <Mail className="h-2.5 w-2.5 inline mr-0.5" />support@workabroadhub.tech
              </a>
              {" "}with your M-Pesa receipt and we'll unlock you ourselves.
            </p>
          </div>
        )}

        {/* Diagnostic — small, so users can quote it to support */}
        {error.darajaCode && (
          <p className="text-[10px] text-rose-600/60 dark:text-rose-400/60 font-mono">
            ref: {error.darajaCode}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
