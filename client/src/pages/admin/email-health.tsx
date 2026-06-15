/**
 * /admin/email-health — Email delivery diagnostic + manual override.
 *
 * Lives at /admin/email-health. Shows:
 *   - Which providers are configured (Gmail / SMTP / Resend)
 *   - Recent send attempts (last 50) with success/failure + reason
 *   - "Send test email" button — verify any address right now
 *   - "Resend code to user" — looks up user by email, returns the plaintext
 *      code so admin can WhatsApp it if email is broken
 *   - "Force-verify email" — emergency override to unblock a paid user
 *
 * Built 2026-06 in response to "people can't see their verification codes".
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Mail, ArrowLeft, CheckCircle2, AlertCircle, Loader2, Send, RotateCcw,
  ShieldCheck, Eye, Copy,
} from "lucide-react";

interface Diagnostics {
  providers: {
    gmailConfigured: boolean;
    smtpConfigured: boolean;
    resendConfigured: boolean;
    recentSuccess: number;
    recentFail: number;
    recentFailureReasons: Record<string, number>;
    lastFailureAt: string | null;
  };
  codesGeneratedLastHour: number;
  unverifiedSignupsLast24h: number;
  recentAttempts: Array<{
    at: string; to: string; subject: string; success: boolean;
    provider?: string; errorCode?: string; error?: string; durationMs?: number;
  }>;
}

export default function EmailHealthPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [testEmail, setTestEmail] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);

  const diag = useQuery<Diagnostics>({
    queryKey: ["/api/admin/email/diagnostics"],
    refetchInterval: 10_000,
  });

  const testSend = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/email/test", { to: testEmail });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/email/diagnostics"] });
      if (data.success) {
        toast({
          title: "Test email sent",
          description: `To ${data.to}. Code in inbox: ${data.testCode}. MessageId: ${data.messageId || "n/a"}`,
        });
      } else {
        toast({
          title: "Test email FAILED",
          description: data.error?.slice(0, 200) || "Unknown error",
          variant: "destructive",
        });
      }
    },
  });

  // Resend code by email — uses admin/users lookup to find userId first
  const lookup = useMutation({
    mutationFn: async () => {
      const email = lookupEmail.trim().toLowerCase();
      if (!email) throw new Error("Enter an email address");
      // Find user by email via existing admin search endpoint
      const search = await apiRequest("GET", `/api/admin/users?search=${encodeURIComponent(email)}&limit=1`);
      const body = await search.json();
      const list = Array.isArray(body) ? body : body.users || body.data || [];
      if (list.length === 0) throw new Error("No user with that email");
      const user = list[0];
      const resend = await apiRequest("POST", `/api/admin/email/resend-code/${user.id}`);
      const result = await resend.json();
      return { user, result };
    },
    onSuccess: ({ user, result }) => {
      setLookupResult({ user, result });
      qc.invalidateQueries({ queryKey: ["/api/admin/email/diagnostics"] });
    },
    onError: (err: any) => {
      toast({ title: "Lookup failed", description: err?.message, variant: "destructive" });
    },
  });

  const forceVerify = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/email/force-verify/${userId}`, {
        reason: "support-override (email delivery broken)",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Force-verify done", description: "User can now proceed without entering a code." });
      setLookupResult(null);
      setLookupEmail("");
    },
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => toast({ title: "Copied to clipboard" }));
  };

  const d = diag.data;

  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="bg-gradient-to-br from-amber-600 to-orange-600 text-white">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <Link href="/admin">
            <a className="text-xs text-amber-50 hover:text-white inline-flex items-center gap-1 mb-2">
              <ArrowLeft className="h-3 w-3" /> Back to Admin
            </a>
          </Link>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Mail className="h-5 w-5" /> Email Health
          </h1>
          <p className="text-xs md:text-sm text-amber-50 mt-1">
            See delivery status in real time, test sending to any address,
            resend codes manually, and force-verify users whose email is broken.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {/* Provider status */}
        <Card>
          <CardContent className="p-4">
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Provider configuration
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <div className={`p-3 rounded-md border-2 ${d?.providers.gmailConfigured ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-rose-300 bg-rose-50 dark:bg-rose-950/30"}`}>
                <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Gmail SMTP</div>
                <div className="font-bold text-sm mt-0.5">
                  {d?.providers.gmailConfigured ? "✓ Configured" : "✗ Not set"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">GMAIL_USER + GMAIL_APP_PASSWORD</div>
              </div>
              <div className={`p-3 rounded-md border-2 ${d?.providers.smtpConfigured ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-muted"}`}>
                <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Generic SMTP</div>
                <div className="font-bold text-sm mt-0.5">
                  {d?.providers.smtpConfigured ? "✓ Configured" : "Not set"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">SMTP_HOST/USER/PASS</div>
              </div>
              <div className={`p-3 rounded-md border-2 ${d?.providers.resendConfigured ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-amber-300 bg-amber-50 dark:bg-amber-950/30"}`}>
                <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Resend (fallback)</div>
                <div className="font-bold text-sm mt-0.5">
                  {d?.providers.resendConfigured ? "✓ Configured" : "⚠ Not set"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">RESEND_API_KEY</div>
              </div>
            </div>
            {!d?.providers.resendConfigured && (
              <div className="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-300 rounded p-2.5 mt-3">
                <strong>Recommendation:</strong> add a <code>RESEND_API_KEY</code> env var in Render so we have a
                fallback when Gmail SMTP fails. Free tier = 3,000 emails/month, proper SPF/DKIM included.
                Sign up at <a href="https://resend.com/signup" target="_blank" rel="noopener noreferrer" className="underline">resend.com</a>.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent stats */}
        {d && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Recent successes</div>
              <div className="text-xl font-bold text-emerald-700">{d.providers.recentSuccess}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Recent failures</div>
              <div className="text-xl font-bold text-rose-700">{d.providers.recentFail}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Codes (last hour)</div>
              <div className="text-xl font-bold">{d.codesGeneratedLastHour}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Unverified (last 24h)</div>
              <div className="text-xl font-bold">{d.unverifiedSignupsLast24h}</div>
            </CardContent></Card>
          </div>
        )}

        {/* Test send */}
        <Card>
          <CardContent className="p-4">
            <h2 className="font-bold mb-2 flex items-center gap-2">
              <Send className="h-4 w-4" /> Test email delivery
            </h2>
            <div className="flex gap-2">
              <Input
                placeholder="your@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                type="email"
                data-testid="input-test-email"
              />
              <Button
                onClick={() => testSend.mutate()}
                disabled={!testEmail || testSend.isPending}
                data-testid="button-test-send"
              >
                {testSend.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send test"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Sends a one-off email with a 6-digit test code. Watch the inbox AND spam folder.
            </p>
          </CardContent>
        </Card>

        {/* Lookup + resend */}
        <Card>
          <CardContent className="p-4">
            <h2 className="font-bold mb-2 flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> Resend verification code to a user
            </h2>
            <div className="flex gap-2">
              <Input
                placeholder="user@example.com"
                value={lookupEmail}
                onChange={(e) => setLookupEmail(e.target.value)}
                type="email"
                data-testid="input-lookup-email"
              />
              <Button
                onClick={() => lookup.mutate()}
                disabled={!lookupEmail || lookup.isPending}
                data-testid="button-resend-code"
              >
                {lookup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find + resend"}
              </Button>
            </div>

            {lookupResult && (
              <div className="mt-3 border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 rounded-md p-3 space-y-2">
                <div className="text-xs">
                  <strong>User:</strong> {lookupResult.user.email}{" "}
                  <span className="text-muted-foreground">({lookupResult.user.id})</span>
                </div>
                {lookupResult.result.alreadyVerified ? (
                  <div className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> User is already verified — no code needed.
                  </div>
                ) : (
                  <>
                    <div className="text-xs">
                      <strong>Email send:</strong>{" "}
                      {lookupResult.result.emailSentSuccessfully ? (
                        <span className="text-emerald-700"><CheckCircle2 className="inline h-3 w-3" /> sent</span>
                      ) : (
                        <span className="text-rose-700"><AlertCircle className="inline h-3 w-3" /> failed: {lookupResult.result.sendError?.slice(0, 100)}</span>
                      )}
                    </div>
                    <div className="text-xs">
                      <strong>Code to relay manually:</strong>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-2xl font-bold tabular-nums tracking-widest bg-white dark:bg-black/40 px-3 py-1.5 rounded border">
                          {lookupResult.result.code}
                        </code>
                        <Button size="sm" variant="outline" onClick={() => copyCode(lookupResult.result.code)}>
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {lookupResult.result.instructions}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-blue-200">
                      <p className="text-xs mb-1">
                        Still can't verify? Skip the code entirely:
                      </p>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => forceVerify.mutate(lookupResult.user.id)}
                        disabled={forceVerify.isPending}
                        data-testid="button-force-verify"
                      >
                        {forceVerify.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                        Force-verify this user
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent attempts */}
        <Card>
          <CardContent className="p-4">
            <h2 className="font-bold mb-2 flex items-center gap-2">
              <Eye className="h-4 w-4" /> Recent send attempts
              {diag.isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-2">Time</th>
                    <th className="py-2 px-2">To</th>
                    <th className="py-2 px-2">Subject</th>
                    <th className="py-2 px-2">Provider</th>
                    <th className="py-2 px-2 text-right">ms</th>
                    <th className="py-2 pl-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(d?.recentAttempts || []).map((a, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">
                        {new Date(a.at).toLocaleTimeString("en-KE")}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-[10px]">{a.to}</td>
                      <td className="py-1.5 px-2 truncate max-w-[200px]">{a.subject}</td>
                      <td className="py-1.5 px-2"><Badge variant="outline" className="text-[9px]">{a.provider || "—"}</Badge></td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{a.durationMs ?? "—"}</td>
                      <td className="py-1.5 pl-2">
                        {a.success ? (
                          <Badge className="text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">✓ Sent</Badge>
                        ) : (
                          <span className="text-rose-700 text-[10px]">{a.errorCode || a.error?.slice(0, 50) || "fail"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!d?.recentAttempts || d.recentAttempts.length === 0) && (
                    <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No attempts yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
