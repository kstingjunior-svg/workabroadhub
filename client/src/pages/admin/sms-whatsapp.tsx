import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  MessageSquare, Phone, Send, CheckCircle, XCircle, Wifi, WifiOff,
  Bot, Users, Eye, Megaphone, Briefcase, Bell, Sparkles, ShoppingCart, AlertTriangle, RefreshCw,
  TrendingUp, Activity, UserCheck, UserX
} from "lucide-react";
import AdminLayout from "@/components/admin-layout";

interface TestResult {
  success: boolean;
  smsResult?: { success: boolean; sid?: string; error?: string };
  whatsappResult?: { success: boolean; sid?: string; error?: string };
  message?: string;
}

interface TwilioStatus {
  connected: boolean;
  message: string;
}

interface PreviewResult {
  preview: string;
  recipientCount: number;
}

interface AlertResult {
  ok: boolean;
  sent: number;
  failed: number;
  skipped: number;
  total: number;
  errors: string[];
}

const TEMPLATES = [
  {
    value: "job_alert",
    label: "Job Alert",
    icon: Briefcase,
    description: "New job posting notification",
    fields: ["jobTitle", "location"],
  },
  {
    value: "pro_nudge",
    label: "PRO Upgrade Nudge",
    icon: Sparkles,
    description: "Encourage free users to upgrade",
    fields: [],
  },
  {
    value: "checkin",
    label: "Friendly Check-in",
    icon: Bell,
    description: "Re-engage inactive users",
    fields: [],
  },
  {
    value: "custom",
    label: "Custom Message",
    icon: MessageSquare,
    description: "Write your own — use {name} for personalisation",
    fields: ["customBody"],
  },
];

const AUDIENCES = [
  { value: "all_with_phone", label: "All users with phone numbers" },
  { value: "pro_users", label: "PRO users only" },
  { value: "free_users", label: "FREE users only" },
];

export default function AdminSmsWhatsApp() {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<"both" | "sms" | "whatsapp">("both");
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Proactive alert state
  const [template, setTemplate] = useState("job_alert");
  const [audience, setAudience] = useState("all_with_phone");
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [alertResult, setAlertResult] = useState<AlertResult | null>(null);

  // Abandoned cart state
  const [cartMinMinutes, setCartMinMinutes] = useState("60");
  const [cartMaxHours, setCartMaxHours] = useState("48");
  const [cartResult, setCartResult] = useState<AlertResult | null>(null);

  const { toast } = useToast();

  const { data: twilioStatus, isLoading: statusLoading } = useQuery<TwilioStatus>({
    queryKey: ["/api/admin/twilio-status"],
    refetchInterval: 30000,
  });

  const { data: nanjilaMetrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<{
    today: { total: number; resolved: number; escalated: number; resolutionRate: string };
    history: { date: string; total: number; resolved: number; escalated: number; resolutionRate: string }[];
  }>({
    queryKey: ["/api/admin/nanjila/metrics"],
    refetchInterval: 60000,
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/test-sms", {
        phone,
        message: message || undefined,
        channel: channel === "both" ? undefined : channel,
      });
      return res.json();
    },
    onSuccess: (data: TestResult) => {
      setTestResult(data);
      toast({
        title: data.success ? "Message Sent" : "Send Failed",
        description: data.message || (data.success ? "Test message sent successfully" : "Check logs for details"),
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Send Failed", description: error.message, variant: "destructive" });
    },
  });

  const buildVariables = () => ({
    jobTitle: jobTitle.trim() || undefined,
    location: location.trim() || undefined,
    customBody: customBody.trim() || undefined,
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/whatsapp/proactive-preview", {
        audience,
        template,
        variables: buildVariables(),
      });
      return res.json();
    },
    onSuccess: (data: PreviewResult) => setPreview(data),
    onError: (e: Error) => toast({ title: "Preview failed", description: e.message, variant: "destructive" }),
  });

  const sendAlertMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/whatsapp/proactive-alert", {
        audience,
        template,
        variables: buildVariables(),
      });
      return res.json();
    },
    onSuccess: (data: AlertResult) => {
      setAlertResult(data);
      toast({
        title: data.failed === 0 ? "Alerts Sent!" : "Alerts Sent (with some failures)",
        description: `${data.sent} sent · ${data.failed} failed · ${data.total} total`,
        variant: data.failed === 0 ? "default" : "destructive",
      });
    },
    onError: (e: Error) => toast({ title: "Send Failed", description: e.message, variant: "destructive" }),
  });

  const { data: abandonedData, isLoading: abandonedLoading, refetch: refetchAbandoned } = useQuery<{
    orders: { orderId: string; serviceName: string; amount: number; createdAt: string; userPhone: string | null; userName: string; userEmail: string | null }[];
    recoverableCount: number;
    totalAbandoned: number;
  }>({
    queryKey: ["/api/admin/whatsapp/abandoned-carts", cartMinMinutes, cartMaxHours],
    queryFn: async () => {
      const res = await fetch(`/api/admin/whatsapp/abandoned-carts?minMinutes=${cartMinMinutes}&maxHours=${cartMaxHours}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const sendCartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/whatsapp/abandoned-cart-alerts", {
        minMinutes: parseInt(cartMinMinutes) || 60,
        maxHours: parseInt(cartMaxHours) || 48,
      });
      return res.json();
    },
    onSuccess: (data: AlertResult) => {
      setCartResult(data);
      refetchAbandoned();
      toast({
        title: data.failed === 0 ? "Recovery Messages Sent!" : "Sent (with some failures)",
        description: `${data.sent} sent · ${data.failed} failed · ${data.skipped} skipped (no phone) · ${data.total} total`,
        variant: data.failed === 0 ? "default" : "destructive",
      });
    },
    onError: (e: Error) => toast({ title: "Send Failed", description: e.message, variant: "destructive" }),
  });

  const selectedTemplate = TEMPLATES.find(t => t.value === template);

  return (
    <AdminLayout title="SMS & WhatsApp">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="page-title">SMS & WhatsApp</h1>
            <p className="text-muted-foreground">Test messages and send proactive alerts via Nanjila</p>
          </div>
          {statusLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <Badge
              variant={twilioStatus?.connected ? "default" : "destructive"}
              className="flex items-center gap-2"
              data-testid="badge-twilio-status"
            >
              {twilioStatus?.connected ? (
                <><Wifi className="h-3 w-3" />Twilio Connected</>
              ) : (
                <><WifiOff className="h-3 w-3" />Twilio Disconnected</>
              )}
            </Badge>
          )}
        </div>

        {/* ── Nanjila Daily Metrics ── */}
        <Card className="border-2 border-primary/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Nanjila Conversation Metrics
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => refetchMetrics()} data-testid="button-refresh-metrics">
                <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
              </Button>
            </div>
            <CardDescription>Live stats from Firebase — today's resolution rate and 7-day trend</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {metricsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
              </div>
            ) : nanjilaMetrics ? (
              <>
                {/* Today's KPI tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-lg border bg-muted/30 p-4 text-center" data-testid="metric-total">
                    <MessageSquare className="h-5 w-5 mx-auto mb-1 text-primary opacity-70" />
                    <p className="text-2xl font-bold">{nanjilaMetrics.today.total}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total today</p>
                  </div>
                  <div className="rounded-lg border bg-green-50 dark:bg-green-950/30 p-4 text-center" data-testid="metric-resolved">
                    <UserCheck className="h-5 w-5 mx-auto mb-1 text-green-600 opacity-80" />
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">{nanjilaMetrics.today.resolved}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Resolved</p>
                  </div>
                  <div className="rounded-lg border bg-red-50 dark:bg-red-950/30 p-4 text-center" data-testid="metric-escalated">
                    <UserX className="h-5 w-5 mx-auto mb-1 text-red-500 opacity-80" />
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{nanjilaMetrics.today.escalated}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Escalated</p>
                  </div>
                  <div className="rounded-lg border bg-primary/5 p-4 text-center" data-testid="metric-resolution-rate">
                    <TrendingUp className="h-5 w-5 mx-auto mb-1 text-primary opacity-80" />
                    <p className="text-2xl font-bold text-primary">{nanjilaMetrics.today.resolutionRate}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Resolution rate</p>
                  </div>
                </div>

                {/* 7-day history table */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">7-Day History</p>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm" data-testid="metrics-history-table">
                      <thead>
                        <tr className="border-b bg-muted/40 text-muted-foreground text-xs">
                          <th className="text-left px-3 py-2 font-medium">Date</th>
                          <th className="text-center px-3 py-2 font-medium">Total</th>
                          <th className="text-center px-3 py-2 font-medium">Resolved</th>
                          <th className="text-center px-3 py-2 font-medium">Escalated</th>
                          <th className="text-center px-3 py-2 font-medium">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nanjilaMetrics.history.map((row, i) => (
                          <tr
                            key={row.date}
                            className={`border-b last:border-0 ${i === 0 ? "bg-primary/5 font-medium" : ""}`}
                            data-testid={`metrics-row-${row.date}`}
                          >
                            <td className="px-3 py-2 text-xs">
                              {i === 0 ? <span className="text-primary">Today</span> : row.date}
                            </td>
                            <td className="px-3 py-2 text-center">{row.total || "—"}</td>
                            <td className="px-3 py-2 text-center text-green-600">{row.resolved || "—"}</td>
                            <td className="px-3 py-2 text-center text-red-500">{row.escalated || "—"}</td>
                            <td className="px-3 py-2 text-center">
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  row.resolutionRate === "N/A"
                                    ? "text-muted-foreground"
                                    : parseFloat(row.resolutionRate) >= 80
                                      ? "text-green-600 border-green-600"
                                      : parseFloat(row.resolutionRate) >= 50
                                        ? "text-amber-600 border-amber-500"
                                        : "text-red-600 border-red-500"
                                }`}
                              >
                                {row.resolutionRate}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No metrics yet — they appear after the first WhatsApp conversation</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Nanjila Proactive Alerts ── */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Nanjila Proactive Alerts
            </CardTitle>
            <CardDescription>
              Send personalised WhatsApp messages from Nanjila to opted-in users — job alerts, PRO nudges, or custom messages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Left: Compose */}
              <div className="space-y-4">
                {/* Template */}
                <div className="space-y-2">
                  <Label>Message Template</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {TEMPLATES.map(t => (
                      <button
                        key={t.value}
                        onClick={() => { setTemplate(t.value); setPreview(null); setAlertResult(null); }}
                        data-testid={`template-${t.value}`}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          template === t.value
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <t.icon className="h-4 w-4" />
                          <span className="text-sm font-medium">{t.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Template variables */}
                {template === "job_alert" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="job-title">Job Title</Label>
                      <Input
                        id="job-title"
                        placeholder="e.g. NHS Nurse"
                        value={jobTitle}
                        onChange={e => { setJobTitle(e.target.value); setPreview(null); }}
                        data-testid="input-job-title"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        placeholder="e.g. Manchester"
                        value={location}
                        onChange={e => { setLocation(e.target.value); setPreview(null); }}
                        data-testid="input-location"
                      />
                    </div>
                  </div>
                )}

                {template === "custom" && (
                  <div className="space-y-1">
                    <Label htmlFor="custom-body">Custom Message</Label>
                    <Textarea
                      id="custom-body"
                      placeholder={"Hi {name}! 👋 We have exciting news...\n\n— Nanjila, WorkAbroad Hub"}
                      value={customBody}
                      onChange={e => { setCustomBody(e.target.value); setPreview(null); }}
                      rows={5}
                      data-testid="input-custom-body"
                    />
                    <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">{"{name}"}</code> to insert the user's first name</p>
                  </div>
                )}

                {/* Audience */}
                <div className="space-y-2">
                  <Label>Audience</Label>
                  <Select value={audience} onValueChange={v => { setAudience(v); setPreview(null); }}>
                    <SelectTrigger data-testid="select-audience">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIENCES.map(a => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => previewMutation.mutate()}
                    disabled={previewMutation.isPending}
                    className="flex-1"
                    data-testid="button-preview"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {previewMutation.isPending ? "Loading..." : "Preview"}
                  </Button>
                  <Button
                    onClick={() => sendAlertMutation.mutate()}
                    disabled={sendAlertMutation.isPending || !preview}
                    className="flex-1"
                    data-testid="button-send-alert"
                  >
                    <Megaphone className="h-4 w-4 mr-2" />
                    {sendAlertMutation.isPending ? "Sending..." : "Send Alert"}
                  </Button>
                </div>
                {!preview && (
                  <p className="text-xs text-muted-foreground text-center">Preview the message first, then send</p>
                )}
              </div>

              {/* Right: Preview & Results */}
              <div className="space-y-4">
                {preview && (
                  <div className="space-y-3" data-testid="preview-panel">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Message Preview</span>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {preview.recipientCount} recipients
                      </Badge>
                    </div>
                    {/* WhatsApp bubble */}
                    <div className="bg-[#dcf8c6] dark:bg-[#1e3a2f] rounded-2xl rounded-tl-sm p-4 text-sm whitespace-pre-wrap leading-relaxed shadow-sm border border-green-200 dark:border-green-900">
                      {preview.preview}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ⚠️ Users outside the 24h response window may not receive this. Sandbox users must have opted in.
                    </p>
                  </div>
                )}

                {alertResult && (
                  <div className="space-y-3 p-4 border rounded-lg bg-muted/30" data-testid="alert-results">
                    <div className="text-sm font-medium">Delivery Report</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-green-50 dark:bg-green-950 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{alertResult.sent}</div>
                        <div className="text-xs text-muted-foreground">Sent</div>
                      </div>
                      <div className="p-2 bg-red-50 dark:bg-red-950 rounded-lg">
                        <div className="text-2xl font-bold text-red-600">{alertResult.failed}</div>
                        <div className="text-xs text-muted-foreground">Failed</div>
                      </div>
                      <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">{alertResult.total}</div>
                        <div className="text-xs text-muted-foreground">Total</div>
                      </div>
                    </div>
                    {alertResult.errors.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-destructive">First failures:</p>
                        {alertResult.errors.map((e, i) => (
                          <p key={i} className="text-xs text-muted-foreground font-mono">{e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!preview && !alertResult && (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-center">
                    <Bot className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-sm">Configure your message and click Preview</p>
                    <p className="text-xs mt-1">Nanjila will personalise each message with the user's name</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* ── Abandoned Cart Recovery ── */}
        <Card className="border-2 border-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-amber-500" />
              Abandoned Cart Recovery
            </CardTitle>
            <CardDescription>
              Find users who started a service payment but didn't complete it, and send a personalised recovery message from Nanjila
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Time window controls */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cart-min-minutes">Minimum age (minutes)</Label>
                <Input
                  id="cart-min-minutes"
                  type="number"
                  min="15"
                  max="1440"
                  value={cartMinMinutes}
                  onChange={e => setCartMinMinutes(e.target.value)}
                  data-testid="input-cart-min-minutes"
                />
                <p className="text-xs text-muted-foreground">Orders older than this — avoids alerting too soon</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cart-max-hours">Maximum age (hours)</Label>
                <Input
                  id="cart-max-hours"
                  type="number"
                  min="1"
                  max="168"
                  value={cartMaxHours}
                  onChange={e => setCartMaxHours(e.target.value)}
                  data-testid="input-cart-max-hours"
                />
                <p className="text-xs text-muted-foreground">Orders newer than this — stops messaging after expiry</p>
              </div>
            </div>

            {/* Abandoned orders list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Pending Recoverable Orders</Label>
                <Button variant="ghost" size="sm" onClick={() => refetchAbandoned()} data-testid="button-refresh-abandoned">
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
                </Button>
              </div>

              {abandonedLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : abandonedData && abandonedData.orders.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1" data-testid="abandoned-orders-list">
                  {abandonedData.orders.map(o => (
                    <div
                      key={o.orderId}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/40"
                      data-testid={`abandoned-order-${o.orderId.slice(0, 8)}`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{o.serviceName}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.userName} · {o.userEmail || "no email"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="text-sm font-semibold">KES {o.amount.toLocaleString()}</span>
                        {o.userPhone ? (
                          <Badge variant="outline" className="text-green-600 border-green-600 text-xs">Has phone</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-xs">No phone</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground border rounded-lg">
                  <CheckCircle className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No abandoned orders in this time window</p>
                </div>
              )}

              {abandonedData && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span data-testid="text-total-abandoned">{abandonedData.totalAbandoned} total abandoned</span>
                  <span>·</span>
                  <span data-testid="text-recoverable-count">{abandonedData.recoverableCount} have phone numbers</span>
                </div>
              )}
            </div>

            {/* Message preview */}
            <div className="rounded-lg bg-muted/50 border p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Message Preview</p>
              <p className="text-sm whitespace-pre-line leading-relaxed">
                {`Hi [Name]! 👋\n\nI noticed you started the *[Service Name]* service but didn't complete payment.\n\nNeed help with M-Pesa, or have questions about what's included?\n\nJust reply here and I'll sort you out right away 😊\n\nOr complete payment at:\n👉 workabroadhub.tech/services\n\n— Nanjila, WorkAbroad Hub`}
              </p>
            </div>

            {/* Send button */}
            <div className="flex items-center justify-between gap-4">
              {abandonedData && abandonedData.recoverableCount === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  No users with phone numbers to contact
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Will send to <strong>{abandonedData?.recoverableCount ?? "..."}</strong> user(s) with phone numbers
                </div>
              )}
              <Button
                onClick={() => sendCartMutation.mutate()}
                disabled={sendCartMutation.isPending || !abandonedData || abandonedData.recoverableCount === 0}
                className="bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="button-send-abandoned-cart"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                {sendCartMutation.isPending ? "Sending..." : "Send Recovery Messages"}
              </Button>
            </div>

            {/* Send result */}
            {cartResult && (
              <div className="rounded-lg border p-4 space-y-2 bg-background" data-testid="cart-alert-result">
                <p className="font-medium text-sm">Last Send Results</p>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="default" className="bg-green-500 text-white">
                    <CheckCircle className="h-3 w-3 mr-1" />{cartResult.sent} sent
                  </Badge>
                  {cartResult.failed > 0 && (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" />{cartResult.failed} failed
                    </Badge>
                  )}
                  {cartResult.skipped > 0 && (
                    <Badge variant="outline">{cartResult.skipped} skipped (no phone)</Badge>
                  )}
                  <Badge variant="secondary">{cartResult.total} total</Badge>
                </div>
                {cartResult.errors && cartResult.errors.length > 0 && (
                  <div className="text-xs text-destructive space-y-1">
                    {cartResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Test Message ── */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send Test Message
              </CardTitle>
              <CardDescription>
                Test your Twilio integration by sending a message to any phone number
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  placeholder="0712345678 or +254712345678"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  data-testid="input-phone"
                />
                <p className="text-xs text-muted-foreground">Kenyan format (07xx) or international (+254xxx)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel">Channel</Label>
                <Select value={channel} onValueChange={v => setChannel(v as typeof channel)}>
                  <SelectTrigger data-testid="select-channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both SMS & WhatsApp</SelectItem>
                    <SelectItem value="sms">SMS Only</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Custom Message (Optional)</Label>
                <Textarea
                  id="message"
                  placeholder="Leave empty to send default test message"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  data-testid="input-message"
                />
              </div>
              <Button
                onClick={() => {
                  if (!phone.trim()) {
                    toast({ title: "Phone Required", description: "Enter a phone number", variant: "destructive" });
                    return;
                  }
                  testMutation.mutate();
                }}
                disabled={testMutation.isPending}
                className="w-full"
                data-testid="button-send-test"
              >
                {testMutation.isPending ? "Sending..." : "Send Test Message"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Test Results
              </CardTitle>
              <CardDescription>Results from your most recent test message</CardDescription>
            </CardHeader>
            <CardContent>
              {testResult ? (
                <div className="space-y-4" data-testid="test-results">
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <Badge variant="default" className="bg-green-500" data-testid="badge-success">
                        <CheckCircle className="h-3 w-3 mr-1" />Success
                      </Badge>
                    ) : (
                      <Badge variant="destructive" data-testid="badge-failed">
                        <XCircle className="h-3 w-3 mr-1" />Failed
                      </Badge>
                    )}
                  </div>
                  {testResult.smsResult && (
                    <div className="p-3 bg-muted rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span className="font-medium">SMS</span>
                        <Badge variant="outline" className={testResult.smsResult.success ? "text-green-600 border-green-600" : "text-red-600 border-red-600"}>
                          {testResult.smsResult.success ? "Sent" : "Failed"}
                        </Badge>
                      </div>
                      {testResult.smsResult.sid && <p className="text-xs text-muted-foreground font-mono">SID: {testResult.smsResult.sid}</p>}
                      {testResult.smsResult.error && <p className="text-xs text-destructive">Error: {testResult.smsResult.error}</p>}
                    </div>
                  )}
                  {testResult.whatsappResult && (
                    <div className="p-3 bg-muted rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <span className="font-medium">WhatsApp</span>
                        <Badge variant="outline" className={testResult.whatsappResult.success ? "text-green-600 border-green-600" : "text-red-600 border-red-600"}>
                          {testResult.whatsappResult.success ? "Sent" : "Failed"}
                        </Badge>
                      </div>
                      {testResult.whatsappResult.sid && <p className="text-xs text-muted-foreground font-mono">SID: {testResult.whatsappResult.sid}</p>}
                      {testResult.whatsappResult.error && <p className="text-xs text-destructive">Error: {testResult.whatsappResult.error}</p>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No test results yet</p>
                  <p className="text-sm">Send a test message to see results here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Auto-notification events */}
        <Card>
          <CardHeader>
            <CardTitle>Automatic Notification Events</CardTitle>
            <CardDescription>SMS/WhatsApp notifications sent automatically by the system</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { event: "Payment Received", description: "When M-Pesa payment is confirmed", id: "payment-received" },
                { event: "Subscription Activated", description: "When user gains access to dashboards", id: "subscription-activated" },
                { event: "Order Received", description: "When user places a service order", id: "order-received" },
                { event: "Order Processing", description: "When order status changes to processing", id: "order-processing" },
                { event: "Order Ready", description: "When order is completed and ready for download", id: "order-ready" },
                { event: "Referral Recorded", description: "When someone uses an influencer code", id: "referral-recorded" },
                { event: "Payout Complete", description: "When referral commission is paid out", id: "payout-complete" },
                { event: "Human Escalation", description: "When user asks to speak to Grace M.", id: "human-escalation" },
              ].map(item => (
                <div key={item.event} className="p-3 border rounded-lg" data-testid={`event-${item.id}`}>
                  <p className="font-medium text-sm">{item.event}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
