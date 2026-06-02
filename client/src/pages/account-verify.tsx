/**
 * Identity verification page — separate from /verify (agency verification).
 *
 * Route: /account/verify
 * Lets the signed-in user verify their email via a 6-digit OTP code.
 * Phone verification was removed — M-Pesa STK PIN proves phone ownership.
 * Payment endpoints (server-side) reject requests until both flags are true.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { fetchCsrfToken } from "@/lib/queryClient";

interface VerificationStatus {
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
}

async function jsonPost(path: string, body: any): Promise<any> {
  const csrf = await fetchCsrfToken();
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

export default function AccountVerifyPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [emailCode, setEmailCode] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);


  async function loadStatus() {
    try {
      const res = await fetch("/api/auth/verification-status", { credentials: "include" });
      if (res.status === 401) {
        navigate("/?redirect=/account/verify");
        return;
      }
      const data: VerificationStatus = await res.json();
      setStatus(data);
      if (data.emailVerified) {
        toast({ title: "All verified", description: "You're good to go." });
        setTimeout(() => navigate("/dashboard"), 1200);
      }
    } catch (err: any) {
      toast({
        title: "Could not load verification status",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendEmail() {
    setEmailSending(true);
    try {
      await jsonPost("/api/auth/send-email-code", {});
      setEmailCodeSent(true);
      toast({ title: "Code sent", description: "Check your inbox for a 6-digit code." });
    } catch (err: any) {
      toast({ title: "Could not send code", description: err.message, variant: "destructive" });
    } finally {
      setEmailSending(false);
    }
  }

  async function submitEmailCode() {
    if (emailCode.replace(/\D/g, "").length !== 6) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setEmailVerifying(true);
    try {
      await jsonPost("/api/auth/verify-email", { code: emailCode });
      toast({ title: "Email verified ✓", description: "Your email is confirmed." });
      setEmailCode("");
      await loadStatus();
    } catch (err: any) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    } finally {
      setEmailVerifying(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!status) return null;

  const allDone = status.emailVerified;

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
            <ShieldCheck className="h-7 w-7 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold">Verify your account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verify your email once and you're done — no SMS step needed. Required before payment.
          </p>
        </div>

        {allDone && (
          <Card className="border-green-300 bg-green-50 dark:bg-green-950/30">
            <CardContent className="pt-6 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <div className="font-semibold">All verified</div>
                <div className="text-sm text-muted-foreground">Redirecting you to the dashboard…</div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* EMAIL */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email address</span>
              {status.emailVerified ? (
                <span className="text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 rounded-full">Verified ✓</span>
              ) : (
                <span className="text-xs font-medium text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded-full">Unverified</span>
              )}
            </CardTitle>
            <CardDescription>{status.email}</CardDescription>
          </CardHeader>
          {!status.emailVerified && (
            <CardContent className="space-y-3">
              {!emailCodeSent ? (
                <Button onClick={sendEmail} disabled={emailSending} className="w-full">
                  {emailSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                  Send verification code
                </Button>
              ) : (
                <div className="space-y-3">
                  <Label htmlFor="email-code">6-digit code from your inbox</Label>
                  <Input
                    id="email-code"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    className="font-mono text-center text-lg tracking-widest"
                  />
                  <div className="flex gap-2">
                    <Button onClick={submitEmailCode} disabled={emailVerifying || emailCode.length !== 6} className="flex-1">
                      {emailVerifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Verify
                    </Button>
                    <Button variant="outline" onClick={sendEmail} disabled={emailSending}>
                      Resend
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        <p className="text-xs text-center text-muted-foreground pt-4">
          Your email is never shared or sold. We use it only for service delivery notifications and account recovery. Your M-Pesa phone is only used for payment prompts.
        </p>
      </div>
    </div>
  );
}
