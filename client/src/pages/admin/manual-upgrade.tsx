/**
 * Admin → Manual Plan Upgrade
 *
 * When a user reports "I paid but I'm still locked out," paste their email,
 * click Diagnose, then one click to activate. Backed by:
 *   GET  /api/admin/diagnose-user?email=...
 *   POST /api/admin/users/:userId/grant-plan
 *
 * Built 2026-06 after Tony reported that the M-Pesa callback occasionally
 * misses, leaving paying users stuck on the free tier.
 */
import { useState } from "react";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Search, CheckCircle2, AlertTriangle, Clock, User as UserIcon,
  CreditCard, ShieldCheck, Loader2,
} from "lucide-react";

// Plan tiers map directly to the server's ADMIN_GRANT_VALID list. Pricing
// shown here mirrors what we ask users to pay so an admin can verify the
// M-Pesa receipt amount matches the plan they're about to grant.
const PLAN_OPTIONS = [
  { id: "basic",        label: "Basic — KES 99 (24 hrs)",  price: 99    },
  { id: "monthly",      label: "Monthly — KES 1,000 (30 days)", price: 1000  },
  { id: "yearly",       label: "Yearly — KES 4,500 (360 days)", price: 4500  },
  { id: "pro",          label: "Pro (yearly equivalent)",       price: 4500  },
  { id: "pro_referral", label: "Pro Referral (1 yr — free comp)", price: 0     },
  { id: "trial",        label: "Trial (24 hrs)",                price: 0     },
];

interface DiagnoseResponse {
  email: string;
  user: { id: string; plan: string; subscriptionStatus: string; planEndDate?: string; isActive: boolean; createdAt: string };
  livePlan: any;
  payments: Array<{ id: string; amount: number; currency: string; method: string; status: string; service_id: string; transaction_ref: string; created_at: string }>;
  subscriptions: Array<{ id: string; plan: string; status: string; start_date: string; end_date: string }>;
  summary: { successfulPayments: number; pendingPayments: number; hasActiveSub: boolean; hasExpiredSub: boolean };
  verdict: string;
  fix: string;
}

async function fetchCsrfToken(): Promise<string> {
  const r = await fetch("/api/csrf-token", { credentials: "include" });
  const j = await r.json();
  return j.csrfToken;
}

export default function AdminManualUpgrade() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [grantLoading, setGrantLoading] = useState(false);
  const [result, setResult] = useState<DiagnoseResponse | null>(null);
  const [planId, setPlanId] = useState<string>("monthly");
  const [transactionCode, setTransactionCode] = useState("");
  const [note, setNote] = useState("");

  async function runDiagnose() {
    if (!email.trim()) {
      toast({ title: "Email required", description: "Paste the user's email first.", variant: "destructive" });
      return;
    }
    setDiagnoseLoading(true);
    setResult(null);
    try {
      const r = await fetch(`/api/admin/diagnose-user?email=${encodeURIComponent(email.trim().toLowerCase())}`, {
        credentials: "include",
      });
      if (r.status === 404) {
        toast({ title: "No user with that email", description: "Check the spelling or ask them how they registered.", variant: "destructive" });
        setResult(null);
        return;
      }
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      const data = await r.json() as DiagnoseResponse;
      setResult(data);
      // Pre-fill the transaction code from the most recent successful payment so
      // the admin doesn't have to re-paste it.
      const firstReceipt = data.payments.find((p) => p.transaction_ref);
      if (firstReceipt?.transaction_ref) setTransactionCode(firstReceipt.transaction_ref);
      // Pre-pick the plan from the receipt amount if we can.
      const matchByAmount = data.payments.find((p) => p.status === "success");
      if (matchByAmount) {
        const amt = Number(matchByAmount.amount);
        if (amt === 99) setPlanId("basic");
        else if (amt === 1000) setPlanId("monthly");
        else if (amt === 4500) setPlanId("yearly");
      }
    } catch (err: any) {
      toast({ title: "Diagnose failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setDiagnoseLoading(false);
    }
  }

  async function runGrant() {
    if (!result?.user?.id) {
      toast({ title: "Diagnose first", description: "Run Diagnose so we have the user's ID.", variant: "destructive" });
      return;
    }
    if (!transactionCode.trim()) {
      toast({ title: "M-Pesa code required", description: "Paste the M-Pesa receipt code from the user's payment.", variant: "destructive" });
      return;
    }
    setGrantLoading(true);
    try {
      const csrf = await fetchCsrfToken();
      const r = await fetch(`/api/admin/users/${result.user.id}/grant-plan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ planId, transactionCode: transactionCode.trim(), note: note.trim() || `Manual grant via admin dashboard` }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast({ title: "Grant failed", description: j?.message ?? `${r.status}`, variant: "destructive" });
        return;
      }
      toast({
        title: "Plan activated",
        description: `${planId} active until ${j.expiresAt ? new Date(j.expiresAt).toLocaleString() : "—"}. Tell the user to refresh.`,
      });
      // Re-diagnose so the admin sees the new state.
      runDiagnose();
    } catch (err: any) {
      toast({ title: "Grant failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setGrantLoading(false);
    }
  }

  return (
    <AdminLayout title="Manual Plan Upgrade">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Step 1: Search */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" /> Step 1 — Find the user
            </CardTitle>
            <CardDescription>
              Paste the email the user signed up with. We'll pull every payment + subscription + plan they have.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runDiagnose(); }}
              data-testid="input-diagnose-email"
              className="flex-1"
            />
            <Button onClick={runDiagnose} disabled={diagnoseLoading} data-testid="button-diagnose">
              {diagnoseLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Looking…</> : <><Search className="h-4 w-4 mr-2" /> Diagnose</>}
            </Button>
          </CardContent>
        </Card>

        {/* Step 2: Diagnosis result */}
        {result && (
          <Card className={
            result.verdict.startsWith("user_should_already")
              ? "border-amber-300"
              : result.verdict.includes("succeeded_but_no_subscription")
                ? "border-rose-400"
                : "border-blue-300"
          }>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result.summary.hasActiveSub
                  ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                  : <AlertTriangle className="h-5 w-5 text-amber-600" />
                }
                Diagnosis
              </CardTitle>
              <CardDescription className="font-mono text-xs break-all">{result.verdict}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Plan</div>
                  <div className="font-semibold mt-1">{result.user.plan ?? "free"}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Sub status</div>
                  <div className="font-semibold mt-1">{result.user.subscriptionStatus ?? "—"}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Active sub?</div>
                  <div className="font-semibold mt-1">{result.summary.hasActiveSub ? "Yes ✓" : "No"}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Successful pays</div>
                  <div className="font-semibold mt-1">{result.summary.successfulPayments}</div>
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <div className="font-semibold mb-1">What to do</div>
                <div className="text-muted-foreground">{result.fix}</div>
              </div>

              {/* Recent payments */}
              <div>
                <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Recent payments (newest first)
                </div>
                {result.payments.length === 0 ? (
                  <div className="text-sm text-muted-foreground italic">No payments on file for this user.</div>
                ) : (
                  <div className="space-y-1.5">
                    {result.payments.slice(0, 6).map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center gap-2 text-xs rounded border p-2">
                        <Badge variant={p.status === "success" ? "default" : p.status === "pending" ? "secondary" : "destructive"}>
                          {p.status}
                        </Badge>
                        <span className="font-mono">{p.currency} {Number(p.amount).toLocaleString()}</span>
                        <span className="text-muted-foreground">{p.method}</span>
                        {p.transaction_ref && <span className="font-mono text-muted-foreground">ref: {p.transaction_ref}</span>}
                        <span className="text-muted-foreground ml-auto">{new Date(p.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Subscriptions */}
              {result.subscriptions.length > 0 && (
                <div>
                  <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Subscription history
                  </div>
                  <div className="space-y-1.5">
                    {result.subscriptions.slice(0, 4).map((s) => (
                      <div key={s.id} className="flex flex-wrap items-center gap-2 text-xs rounded border p-2">
                        <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                        <span className="font-mono">{s.plan}</span>
                        <span className="text-muted-foreground">
                          {s.start_date ? new Date(s.start_date).toLocaleDateString() : "—"}
                          {" → "}
                          {s.end_date ? new Date(s.end_date).toLocaleDateString() : "no expiry"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Activate */}
        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                Step 2 — Activate the plan
              </CardTitle>
              <CardDescription>
                Verify the M-Pesa receipt code from the user's screenshot or your Safaricom statement,
                pick the matching plan tier, then click <strong>Activate</strong>. The user's Pro access
                kicks in immediately — they just need to refresh.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="plan-select">Plan tier</Label>
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger id="plan-select" data-testid="select-plan">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_OPTIONS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="txn-input">M-Pesa receipt code</Label>
                  <Input
                    id="txn-input"
                    placeholder="e.g. SGH4K2M9XZ"
                    value={transactionCode}
                    onChange={(e) => setTransactionCode(e.target.value.toUpperCase())}
                    className="font-mono"
                    data-testid="input-transaction-code"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="note-input">Note (optional, kept for audit)</Label>
                <Textarea
                  id="note-input"
                  placeholder="e.g. Verified on Safaricom statement, callback didn't fire"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  data-testid="input-note"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <Button
                  onClick={runGrant}
                  disabled={grantLoading}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-activate"
                >
                  {grantLoading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Activating…</>
                    : <><ShieldCheck className="h-4 w-4 mr-2" /> Activate {planId} plan</>
                  }
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footnote */}
        <div className="text-xs text-muted-foreground flex items-start gap-2">
          <UserIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            Every activation is logged with your admin ID, the M-Pesa code, and the note. The user
            also gets a real-time WebSocket <code>plan_activated</code> event, so if they're online they
            see the unlock without a refresh.
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
