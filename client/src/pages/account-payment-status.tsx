/**
 * /account/payment-status — Self-service payment + plan diagnostic.
 *
 * 2026-06: founder asked "client paid KES 99 but can't access jobs". This
 * page lets the user (or Tony, by asking the user to share a screenshot)
 * see exactly what's happening with their account:
 *
 *   • Current plan from the same source-of-truth the gate uses (getUserPlan)
 *   • Their last 10 payments (status, amount, plan, M-Pesa receipt)
 *   • A clear human verdict — paid_but_free / pending / expired / etc.
 *   • A "Recover my plan" button when the verdict is paid_but_free
 *
 * Backend: GET /api/account/payment-status, POST /api/account/recover-plan.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Clock, XCircle, RefreshCcw, Loader2, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface PaymentRow {
  paymentId:    string;
  amount:       number;
  status:       string;
  planId:       string | null;
  serviceId:    string | null;
  mpesaReceipt: string | null;
  createdAt:    string;
  failReason:   string | null;
}

interface PaymentStatusResponse {
  userId:       string;
  email:        string | null;
  phone:        string | null;
  currentPlan:  string;
  subscription: { status: string; plan: string; endDate: string | null } | null;
  payments:     PaymentRow[];
  verdict:      string;
  action:       string | null;
  canSelfRecover: boolean;
}

const PLAN_LABEL: Record<string, string> = {
  free:    "Free",
  trial:   "1-Day Trial (KES 99)",
  monthly: "Monthly (KES 1,000)",
  yearly:  "Yearly (KES 4,500)",
  pro:     "Pro (KES 4,500)",
  pro_referral: "Pro — Referral (KES 3,600)",
  basic:   "1-Day Trial (KES 99)",   // legacy alias
};

export default function AccountPaymentStatus() {
  const [data, setData]       = useState<PaymentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/payment-status", { credentials: "include" });
      if (res.status === 401) {
        window.location.href = "/login?redirect=/account/payment-status";
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err: any) {
      setError(err?.message || "Could not load your payment status. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function recoverPlan() {
    setRecovering(true);
    try {
      const res = await fetch("/api/account/recover-plan", {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Recovery couldn't finish",
          description: body?.message || "Please contact support@workabroadhub.tech.",
        });
        return;
      }
      toast({
        title: "Done!",
        description: body?.message || `Your ${body?.plan ?? "plan"} is now active.`,
      });
      await load();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Recovery failed",
        description: err?.message || "Try again, or contact support@workabroadhub.tech.",
      });
    } finally {
      setRecovering(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading your account…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <XCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
            <h2 className="font-semibold mb-1">Couldn't load your account</h2>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={load}><RefreshCcw className="h-4 w-4 mr-1.5" /> Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pick the right verdict pictogram + accent
  const verdictIcon =
    data.verdict.startsWith("active:")          ? <CheckCircle2 className="h-8 w-8 text-emerald-600" /> :
    data.verdict === "paid_but_free"            ? <AlertTriangle className="h-8 w-8 text-amber-600" /> :
    data.verdict === "payment_pending"          ? <Clock className="h-8 w-8 text-blue-600" /> :
    data.verdict === "recent_failure"           ? <XCircle className="h-8 w-8 text-rose-600" /> :
                                                  <Receipt className="h-8 w-8 text-muted-foreground" />;
  const verdictTitle =
    data.verdict.startsWith("active:")          ? `Your ${PLAN_LABEL[data.currentPlan] ?? data.currentPlan} is active` :
    data.verdict === "paid_but_free"            ? "Your payment went through — let's activate your plan" :
    data.verdict === "payment_pending"          ? "We're waiting for M-Pesa to confirm" :
    data.verdict === "recent_failure"           ? "Your last payment didn't go through" :
    data.verdict === "plan_expired"             ? "Your plan has expired" :
                                                  "No paid plan on your account";

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Account &amp; Payment Status</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{data.email}</span>
            {data.phone ? <> · {data.phone}</> : null}
          </p>
        </div>

        {/* Verdict card */}
        <Card className="border-2">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <div className="shrink-0">{verdictIcon}</div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold leading-tight">{verdictTitle}</h2>
                {data.action && (
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{data.action}</p>
                )}
                {data.canSelfRecover && (
                  <Button
                    className="mt-4 bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={recoverPlan}
                    disabled={recovering}
                    data-testid="btn-recover-plan"
                  >
                    {recovering
                      ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Activating…</>
                      : <>Activate my plan</>}
                  </Button>
                )}
              </div>
            </div>

            {/* Sub details — show only when active */}
            {data.subscription && data.verdict.startsWith("active:") && (
              <div className="mt-4 pt-4 border-t text-sm grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">{data.subscription.status}</span>
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{PLAN_LABEL[data.subscription.plan] ?? data.subscription.plan}</span>
                {data.subscription.endDate && (
                  <>
                    <span className="text-muted-foreground">Expires</span>
                    <span className="font-medium">
                      {new Date(data.subscription.endDate).toLocaleString("en-KE")}
                    </span>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent payments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent payments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.payments.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No payments on record yet. <a href="/pricing" className="text-primary underline">Go to pricing</a> to start.
              </div>
            ) : (
              <ul className="divide-y">
                {data.payments.map((p) => (
                  <li key={p.paymentId} className="px-4 py-3 flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">
                        KES {p.amount.toLocaleString()}
                        {p.planId && <span className="text-muted-foreground"> · {PLAN_LABEL[p.planId] ?? p.planId}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(p.createdAt).toLocaleString("en-KE")}
                        {p.mpesaReceipt && <> · receipt {p.mpesaReceipt}</>}
                      </div>
                      {p.failReason && (
                        <div className="text-xs text-rose-600 mt-1">{p.failReason}</div>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        (p.status === "success" || p.status === "completed") ? "border-emerald-300 text-emerald-700 bg-emerald-50" :
                        (p.status === "pending" || p.status === "awaiting_payment") ? "border-blue-300 text-blue-700 bg-blue-50" :
                        p.status === "failed" ? "border-rose-300 text-rose-700 bg-rose-50" :
                        "border-muted-foreground/30 text-muted-foreground"
                      }
                    >
                      {p.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground pt-2 text-center">
          Still stuck? Email <a href="mailto:support@workabroadhub.tech" className="text-primary underline">support@workabroadhub.tech</a> with your M-Pesa receipt and we'll fix it within the hour.
        </div>
      </div>
    </div>
  );
}
