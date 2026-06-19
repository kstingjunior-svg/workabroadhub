/**
 * <MpesaPaybillOption> — always-visible Paybill 4153025 manual-pay card.
 *
 * Sits next to the STK-push form (NOT only on failure). Many Kenyan users
 * trust manual Paybill more than STK push and bail out of the prompt — we
 * lose them. Showing manual pay as a co-equal option converts those users.
 *
 * Each value (Paybill, Account, Amount) has a copy-to-clipboard button so
 * they can switch to their M-Pesa menu and paste each value. After they pay,
 * they enter their M-Pesa receipt code into the verification field and we
 * confirm the payment via Daraja Pull API or the reconciler.
 *
 * 2026-06: built when founder reported 46% M-Pesa success rate and asked
 * for 70%+.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Check, ChevronDown, ChevronUp, Building2 } from "lucide-react";

interface Props {
  /** The KES amount to charge. */
  amount:    number;
  /** The user's email — used as the Account Number for matching. */
  account:   string;
  /** Optional plan name shown next to the amount. */
  planName?: string;
  /** Default open state. Defaults to closed for STK-push focused flows;
   *  set to true on the dashboard's Pro pricing modal where Paybill is the
   *  primary fallback message. */
  defaultOpen?: boolean;
}

function CopyValue({ value, label, big = false }: { value: string; label: string; big?: boolean }) {
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
      className={`inline-flex items-center gap-1.5 font-mono font-bold ${big ? "text-lg" : "text-base"} text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 px-2 py-1 rounded transition-colors`}
      title={`Copy ${label}`}
      data-testid={`paybill-copy-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {value}
      {copied
        ? <Check className="h-3.5 w-3.5 text-emerald-600" />
        : <Copy className="h-3.5 w-3.5 opacity-60" />}
    </button>
  );
}

export function MpesaPaybillOption({ amount, account, planName, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="border-2 border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 mt-4">
      <CardContent className="p-0">
        {/* Toggle header */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-emerald-100/40 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
          aria-expanded={open}
          data-testid="paybill-option-toggle"
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
            <span className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
              Or pay manually via Paybill
            </span>
            <span className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 font-medium bg-emerald-200/50 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
              Works 100% of the time
            </span>
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-emerald-700" /> : <ChevronDown className="h-4 w-4 text-emerald-700" />}
        </button>

        {/* Expanded body */}
        {open && (
          <div className="px-4 pb-4 pt-2 border-t border-emerald-200 dark:border-emerald-800/40">
            <ol className="text-sm text-emerald-900 dark:text-emerald-100 space-y-2 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="font-bold shrink-0">1.</span>
                <span>Open <strong>M-Pesa</strong> → <strong>Lipa na M-Pesa</strong> → <strong>Pay Bill</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold shrink-0">2.</span>
                <span>
                  Business Number: <CopyValue value="4153025" label="Paybill" big />
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold shrink-0">3.</span>
                <span>
                  Account Number: <CopyValue value={account} label="Account" />
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold shrink-0">4.</span>
                <span>
                  Amount: <CopyValue value={String(amount)} label="Amount" big />
                  {planName && <span className="text-[11px] opacity-70 ml-1">({planName})</span>}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold shrink-0">5.</span>
                <span>Enter your M-Pesa PIN. Our system spots the payment within 2 minutes and unlocks your access automatically.</span>
              </li>
            </ol>
            <div className="mt-3 text-[11px] text-emerald-800/80 dark:text-emerald-200/70 bg-white/40 dark:bg-black/20 rounded p-2 border border-emerald-200 dark:border-emerald-800/40">
              <strong>If it doesn't auto-unlock</strong> after 5 minutes, send the M-Pesa receipt
              code to support@workabroadhub.tech and we'll do it by hand.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
