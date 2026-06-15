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
import { Mail, CheckCircle2, Loader2, ShieldCheck, AlertTriangle, Trash2 } from "lucide-react";
import { fetchCsrfToken } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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

  // ── Account deletion state ───────────────────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deletionReason, setDeletionReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (!status?.email) return;
    if (confirmEmail.trim().toLowerCase() !== status.email.trim().toLowerCase()) {
      toast({
        title: "Email confirmation does not match",
        description: "Type your email address exactly as shown above to confirm.",
        variant: "destructive",
      });
      return;
    }
    setDeleting(true);
    try {
      const data = await jsonPost("/api/auth/delete-account", {
        confirmEmail: confirmEmail.trim().toLowerCase(),
        reason: deletionReason.trim(),
      });
      toast({
        title: "Account deleted",
        description: data?.message ?? "Your account has been permanently deleted. You will be signed out.",
      });
      // Hard reset client state — clear any cached query data + redirect home.
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
      // Small delay so the toast renders before navigation.
      setTimeout(() => {
        navigate("/");
        window.location.reload();
      }, 800);
    } catch (err: any) {
      toast({
        title: "Could not delete account",
        description: err?.message ?? "Something went wrong. Please try again or contact support.",
        variant: "destructive",
      });
      setDeleting(false);
    }
  }


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
      const result = await jsonPost("/api/auth/send-email-code", {}) as any;
      setEmailCodeSent(true);
      toast({
        title: "Code sent",
        description: result?.message || "Check your inbox AND your spam folder for a 6-digit code.",
      });
    } catch (err: any) {
      // 2026-06: surface delivery failure clearly and offer fallback path.
      // Previously this was a generic "Could not send code" — users had no
      // idea whether to retry, wait, or switch to phone verification.
      const offerSms = err?.body?.offerSmsFallback || /deliver|send|smtp/i.test(err?.message || "");
      toast({
        title: "Email delivery problem",
        description: offerSms
          ? `${err.message} — try the SMS option below, or contact support@workabroadhub.tech with your email and we'll verify you manually.`
          : err.message,
        variant: "destructive",
        duration: 12000,
      });
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

        {/* ── Danger Zone — account deletion ──────────────────────────── */}
        <Card className="mt-8 border-red-300 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300 text-base">
              <AlertTriangle className="h-4 w-4" />
              Danger zone
            </CardTitle>
            <CardDescription>
              You can permanently delete your account at any time. We respect that — if you're done with us, just go.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-2 text-muted-foreground">
              <p>What gets deleted:</p>
              <ul className="list-disc pl-5 space-y-0.5 text-xs">
                <li>Your name, email, phone number, profile, and any uploaded CV text</li>
                <li>Your login credentials — you won't be able to sign back in</li>
                <li>Verification codes and active sessions</li>
              </ul>
              <p className="pt-1">What we have to keep (Kenya Revenue Authority requires this):</p>
              <ul className="list-disc pl-5 space-y-0.5 text-xs">
                <li>Anonymised payment records — your name and contact details are stripped</li>
              </ul>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              data-testid="button-open-delete-account"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete my account
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Confirmation dialog ─────────────────────────────────────────── */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" />
              Permanently delete your account?
            </DialogTitle>
            <DialogDescription>
              This cannot be undone. Type your email to confirm you really want to leave.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="confirm-email" className="text-xs">
                Your email (must match exactly)
              </Label>
              <div className="text-[11px] text-muted-foreground mb-1">
                <span className="font-mono">{status?.email ?? ""}</span>
              </div>
              <Input
                id="confirm-email"
                type="email"
                placeholder="type your email to confirm"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                disabled={deleting}
                data-testid="input-delete-confirm-email"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-reason" className="text-xs">
                Why are you leaving? <span className="text-muted-foreground">(optional — helps us improve)</span>
              </Label>
              <Textarea
                id="delete-reason"
                placeholder="e.g. I found a job, the service didn't work for me, I no longer need it"
                value={deletionReason}
                onChange={(e) => setDeletionReason(e.target.value)}
                disabled={deleting}
                rows={3}
                maxLength={500}
                data-testid="textarea-delete-reason"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
              data-testid="button-cancel-delete-account"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={
                deleting ||
                !confirmEmail ||
                confirmEmail.trim().toLowerCase() !== (status?.email ?? "").trim().toLowerCase()
              }
              data-testid="button-confirm-delete-account"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
