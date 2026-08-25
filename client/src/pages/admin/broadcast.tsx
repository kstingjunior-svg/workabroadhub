/**
 * Admin → Broadcast page.
 *
 * 2026-08 (Tony's "Resend was down, users can't verify" recovery):
 *   One-tap WhatsApp broadcast to unverified users, so we can nudge them
 *   to re-request a verification code the moment an outage is over.
 *
 * Flow:
 *   1. Click "Load unverified users" → fetches /api/admin/unverified-users
 *   2. Review count + optionally edit the message
 *   3. Click "Send broadcast" → POST /api/admin/broadcast-sms in batches of 100
 *   4. Watch per-batch success/failure counts in the log
 *
 * Endpoint reuses the existing /api/admin/broadcast-sms which already
 * dispatches via Twilio + Africa's Talking with WhatsApp preferred.
 */

import { useEffect, useState } from "react";
import { fetchCsrfToken } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Users, RefreshCw, MessageSquare, AlertTriangle, Mail } from "lucide-react";

const DEFAULT_MESSAGE =
  "Hi! Good news — our email verification issue is now fixed. Please refresh WorkAbroadHub and tap 'Resend' in the red banner at the top. You'll get a fresh 6-digit code within 30 seconds. Sorry for the delay! – Tony";

interface UnverifiedUser {
  id: string;
  email: string;
  phone: string;
  firstName: string | null;
  createdAt: string;
}

interface BatchResult {
  batch: number;
  total: number;
  successful: number;
  failed: number;
}

export default function AdminBroadcastPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UnverifiedUser[]>([]);
  const [hoursBack, setHoursBack] = useState(72);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<BatchResult[]>([]);
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ total: number; successful: number; failed: number } | null>(null);

  async function sendEmailBroadcast() {
    if (!confirm(`Send a FRESH verification code email to every unverified user in the last ${hoursBack} hours? This uses Resend (already fixed) and cannot be undone.`)) return;
    setEmailSending(true);
    setEmailResult(null);
    try {
      const csrfToken = await fetchCsrfToken();
      const res = await fetch("/api/admin/broadcast-verify-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ hours: hoursBack }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Failed (${res.status})`);
      setEmailResult({ total: data.total, successful: data.successful, failed: data.failed });
      toast({
        title: "Emails sent",
        description: `${data.successful}/${data.total} verification codes delivered to inboxes.`,
      });
    } catch (err: any) {
      toast({
        title: "Email broadcast failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setEmailSending(false);
    }
  }

  async function loadUsers() {
    setLoading(true);
    setProgress([]);
    try {
      const res = await fetch(`/api/admin/unverified-users?hours=${hoursBack}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = await res.json();
      setUsers(data.users || []);
      toast({
        title: "Loaded",
        description: `${data.total} unverified users with a phone in the last ${hoursBack}h.`,
      });
    } catch (err: any) {
      toast({
        title: "Could not load users",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function sendBroadcast() {
    if (users.length === 0) {
      toast({ title: "Load users first", variant: "destructive" });
      return;
    }
    if (message.trim().length < 10) {
      toast({ title: "Message too short", variant: "destructive" });
      return;
    }
    if (!confirm(`Send WhatsApp to ${users.length} users? This cannot be undone.`)) return;

    setSending(true);
    setProgress([]);

    try {
      const csrfToken = await fetchCsrfToken();

      // Split into batches of 100 (server cap)
      const BATCH_SIZE = 100;
      const batches: string[][] = [];
      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        batches.push(users.slice(i, i + BATCH_SIZE).map(u => u.phone));
      }

      for (let i = 0; i < batches.length; i++) {
        const phones = batches[i];
        try {
          const res = await fetch("/api/admin/broadcast-sms", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
            body: JSON.stringify({ phones, message, channel }),
          });
          const data = await res.json();
          const result: BatchResult = {
            batch: i + 1,
            total: data.total ?? phones.length,
            successful: data.successful ?? 0,
            failed: data.failed ?? phones.length,
          };
          setProgress(prev => [...prev, result]);
          // Small pause between batches so provider isn't hammered
          if (i < batches.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (batchErr: any) {
          setProgress(prev => [...prev, {
            batch: i + 1,
            total: phones.length,
            successful: 0,
            failed: phones.length,
          }]);
          console.error(`Batch ${i + 1} failed:`, batchErr);
        }
      }

      const totalSent = progress.reduce((sum, p) => sum + p.successful, 0);
      toast({
        title: "Broadcast complete",
        description: `See per-batch results below.`,
      });
    } catch (err: any) {
      toast({
        title: "Broadcast failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  const totalSent = progress.reduce((sum, p) => sum + p.successful, 0);
  const totalFailed = progress.reduce((sum, p) => sum + p.failed, 0);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6" /> Broadcast to Unverified Users
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Send a one-tap WhatsApp (falls back to SMS) to users who haven't verified their email yet.
        </p>
      </div>

      {/* 2026-08 (Resend recovery): fastest recovery path — resend the actual
          verification code via email. No opt-in windows, no carrier setup,
          works instantly since Resend is fixed. Users get a fresh 6-digit
          code they can enter immediately. */}
      <Card className="border-2 border-green-500/40 bg-green-50/40 dark:bg-green-950/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-5 w-5 text-green-700 dark:text-green-400" />
            RECOMMENDED: Email a fresh verification code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Send a brand-new 6-digit verification code to <b>every unverified user</b> from the last{" "}
            <b>{hoursBack} hours</b>. They open the email, get the code, enter it — done.
            Fastest possible recovery. Works instantly since Resend is now fixed.
          </p>
          <Button
            onClick={sendEmailBroadcast}
            disabled={emailSending}
            className="w-full bg-green-700 hover:bg-green-800 text-white"
            data-testid="btn-broadcast-email"
          >
            {emailSending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Emailing all unverified users…</>
              : <><Mail className="h-4 w-4 mr-2" /> Email fresh code to all unverified users</>}
          </Button>
          {emailResult && (
            <div className="rounded border border-green-300 dark:border-green-800 bg-white dark:bg-black/30 p-3 text-sm">
              <span className="text-green-700 dark:text-green-400 font-semibold">
                {emailResult.successful} / {emailResult.total} delivered
              </span>
              {emailResult.failed > 0 && (
                <span className="text-red-600 ml-2">· {emailResult.failed} failed</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground">
        — or use SMS / WhatsApp as backup —
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Load recipients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="hours">Signed up within last (hours)</Label>
              <Input
                id="hours"
                type="number"
                min={1}
                max={720}
                value={hoursBack}
                onChange={(e) => setHoursBack(Math.max(1, Math.min(720, Number(e.target.value) || 72)))}
                data-testid="input-hours-back"
              />
              <p className="text-xs text-muted-foreground mt-1">
                72h = default. Older accounts get auto-deleted so we don't message them.
              </p>
            </div>
            <Button onClick={loadUsers} disabled={loading} data-testid="btn-load-users">
              {loading
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…</>
                : <><RefreshCw className="h-4 w-4 mr-2" /> Load users</>}
            </Button>
          </div>
          {users.length > 0 && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <Badge variant="secondary" data-testid="badge-user-count">
                {users.length} users ready
              </Badge>
              <span className="text-xs text-muted-foreground">
                (will send in {Math.ceil(users.length / 100)} batch{users.length > 100 ? "es" : ""} of 100)
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Compose message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={800}
            data-testid="input-broadcast-message"
          />
          <div className="text-xs text-muted-foreground flex justify-between">
            <span>{message.length}/800 chars</span>
            <span>WhatsApp preview format</span>
          </div>

          <div>
            <Label>Channel preference</Label>
            <div className="flex gap-2 mt-1">
              <Button
                type="button"
                size="sm"
                variant={channel === "whatsapp" ? "default" : "outline"}
                onClick={() => setChannel("whatsapp")}
                data-testid="btn-channel-whatsapp"
              >
                WhatsApp (falls back to SMS)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={channel === "sms" ? "default" : "outline"}
                onClick={() => setChannel("sms")}
                data-testid="btn-channel-sms"
              >
                SMS only
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Send</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" />
            <p className="text-xs text-amber-900 dark:text-amber-200">
              This is a one-shot broadcast — cannot be undone. Only run after a
              confirmed outage recovery so users get a useful nudge.
            </p>
          </div>
          <Button
            onClick={sendBroadcast}
            disabled={sending || users.length === 0}
            className="w-full"
            data-testid="btn-send-broadcast"
          >
            {sending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
              : <><Send className="h-4 w-4 mr-2" /> Send to {users.length} user{users.length === 1 ? "" : "s"}</>}
          </Button>
        </CardContent>
      </Card>

      {progress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm mb-3">
              <b>{totalSent}</b> delivered · <b>{totalFailed}</b> failed
            </div>
            <div className="space-y-1 text-sm">
              {progress.map((p) => (
                <div key={p.batch} className="flex justify-between border-b pb-1">
                  <span>Batch {p.batch} ({p.total} recipients)</span>
                  <span>
                    <span className="text-green-600 font-semibold">{p.successful} sent</span>
                    {" · "}
                    <span className={p.failed > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                      {p.failed} failed
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
