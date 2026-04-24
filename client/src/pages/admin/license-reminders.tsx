import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin-layout";
import {
  Bell,
  BellOff,
  Send,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Settings,
  MessageSquare,
  Phone,
  Mail,
} from "lucide-react";

interface ReminderLog {
  id: string;
  agencyId: string;
  agencyName: string;
  licenseNumber: string;
  reminderTier: string;
  channel: string;
  recipientAddress: string;
  messageContent: string;
  status: string;
  providerSid: string | null;
  errorMessage: string | null;
  expiryDate: string;
  daysRemaining: number;
  retryCount: number;
  lastRetryAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface ReminderStats {
  totalReminders: number;
  sent: number;
  failed: number;
  pending: number;
  lastCheckAt: string | null;
  lastCheckRemindersSent: number;
  lastCheckRemindersFailed: number;
}

interface NotificationPref {
  id?: string;
  agencyId: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactName: string | null;
  enableSms: boolean;
  enableWhatsapp: boolean;
  enableEmail: boolean;
  preferredChannel: string;
  remindersEnabled: boolean;
}

function tierLabel(tier: string): string {
  switch (tier) {
    case "60_days": return "60 Days";
    case "30_days": return "30 Days";
    case "7_days": return "7 Days";
    case "on_expiry": return "On Expiry";
    case "7_days_after": return "7 Days After";
    default: return tier;
  }
}

function tierBadge(tier: string) {
  const variants: Record<string, string> = {
    "60_days": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "30_days": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    "7_days": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    "on_expiry": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    "7_days_after": "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-100",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[tier] || "bg-gray-100 text-gray-800"}`} data-testid={`tier-badge-${tier}`}>
      {tierLabel(tier)}
    </span>
  );
}

function statusBadge(status: string) {
  if (status === "sent") {
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="status-sent"><CheckCircle2 className="w-3 h-3 mr-1" />Sent</Badge>;
  }
  if (status === "failed") {
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid="status-failed"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
  }
  return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" data-testid="status-pending"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
}

function channelIcon(channel: string) {
  switch (channel) {
    case "sms": return <Phone className="w-4 h-4" />;
    case "whatsapp": return <MessageSquare className="w-4 h-4" />;
    case "email": return <Mail className="w-4 h-4" />;
    default: return <Send className="w-4 h-4" />;
  }
}

export default function AdminLicenseReminders() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<ReminderLog | null>(null);
  const [prefsDialog, setPrefsDialog] = useState<{ agencyId: string; agencyName: string } | null>(null);
  const { toast } = useToast();

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (tierFilter !== "all") params.set("reminderTier", tierFilter);
    params.set("limit", "100");
    return params.toString();
  };

  const { data: logsData, isLoading: logsLoading } = useQuery<{ logs: ReminderLog[]; total: number }>({
    queryKey: ["/api/admin/license-reminder-logs", statusFilter, tierFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/license-reminder-logs?${buildQueryString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ReminderStats>({
    queryKey: ["/api/admin/license-reminder-stats"],
  });

  const retryMutation = useMutation({
    mutationFn: async (logId: string) => {
      const res = await apiRequest("POST", `/api/admin/license-reminder-retry/${logId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Retry successful", description: "The reminder has been resent." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/license-reminder-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/license-reminder-stats"] });
    },
    onError: (error: any) => {
      toast({ title: "Retry failed", description: error.message, variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (agencyId: string) => {
      const res = await apiRequest("POST", `/api/admin/agency-disable-reminders/${agencyId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reminders disabled", description: "Reminders have been turned off for this agency." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-notification-preferences"] });
    },
  });

  const enableMutation = useMutation({
    mutationFn: async (agencyId: string) => {
      const res = await apiRequest("POST", `/api/admin/agency-enable-reminders/${agencyId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reminders enabled", description: "Reminders have been turned on for this agency." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-notification-preferences"] });
    },
  });

  const logs = logsData?.logs || [];
  const filteredLogs = searchQuery
    ? logs.filter(l =>
        l.agencyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.licenseNumber.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : logs;

  return (
    <AdminLayout title="License Expiry Reminders">
      <div className="space-y-6" data-testid="license-reminders-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="page-title">License Expiry Reminders</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Automated reminder system for agency license renewals
            </p>
          </div>
        </div>

        {statsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card data-testid="stat-total">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.totalReminders}</p>
                    <p className="text-xs text-muted-foreground">Total Reminders</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="stat-sent">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.sent}</p>
                    <p className="text-xs text-muted-foreground">Sent</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="stat-failed">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.failed}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="stat-last-check">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="text-sm font-semibold">
                      {stats.lastCheckAt ? new Date(stats.lastCheckAt).toLocaleString() : "Never"}
                    </p>
                    <p className="text-xs text-muted-foreground">Last Check</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg">Reminder History</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search agency..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-48"
                    data-testid="search-input"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32" data-testid="status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger className="w-36" data-testid="tier-filter">
                    <SelectValue placeholder="Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    <SelectItem value="60_days">60 Days</SelectItem>
                    <SelectItem value="30_days">30 Days</SelectItem>
                    <SelectItem value="7_days">7 Days</SelectItem>
                    <SelectItem value="on_expiry">On Expiry</SelectItem>
                    <SelectItem value="7_days_after">7 Days After</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="space-y-2">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="empty-state">
                <BellOff className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No reminders found</p>
                <p className="text-sm mt-1">
                  Reminders are sent automatically when licenses reach 60, 30, 7, 0, or -7 days from expiry.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto" data-testid="reminder-table">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium">Agency</th>
                      <th className="text-left py-2 px-2 font-medium">License</th>
                      <th className="text-left py-2 px-2 font-medium">Tier</th>
                      <th className="text-left py-2 px-2 font-medium">Channel</th>
                      <th className="text-left py-2 px-2 font-medium">Status</th>
                      <th className="text-left py-2 px-2 font-medium">Sent At</th>
                      <th className="text-left py-2 px-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="border-b hover:bg-muted/50" data-testid={`reminder-row-${log.id}`}>
                        <td className="py-2 px-2">
                          <div className="font-medium text-xs truncate max-w-[160px]">{log.agencyName}</div>
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">{log.licenseNumber}</td>
                        <td className="py-2 px-2">{tierBadge(log.reminderTier)}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1 text-xs capitalize">
                            {channelIcon(log.channel)}
                            {log.channel}
                          </div>
                        </td>
                        <td className="py-2 px-2">{statusBadge(log.status)}</td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">
                          {log.sentAt ? new Date(log.sentAt).toLocaleString() : "-"}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            {log.status === "failed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => retryMutation.mutate(log.id)}
                                disabled={retryMutation.isPending}
                                data-testid={`retry-btn-${log.id}`}
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Retry
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedLog(log)}
                              data-testid={`details-btn-${log.id}`}
                            >
                              Details
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPrefsDialog({ agencyId: log.agencyId, agencyName: log.agencyName })}
                              data-testid={`prefs-btn-${log.id}`}
                            >
                              <Settings className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedLog && (
          <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
            <DialogContent className="max-w-lg" data-testid="log-detail-dialog">
              <DialogHeader>
                <DialogTitle>Reminder Details</DialogTitle>
                <DialogDescription>
                  {selectedLog.agencyName} - {selectedLog.licenseNumber}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-medium text-muted-foreground">Tier:</span>
                    <div className="mt-1">{tierBadge(selectedLog.reminderTier)}</div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Status:</span>
                    <div className="mt-1">{statusBadge(selectedLog.status)}</div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Channel:</span>
                    <div className="mt-1 flex items-center gap-1 capitalize">{channelIcon(selectedLog.channel)} {selectedLog.channel}</div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Recipient:</span>
                    <div className="mt-1">{selectedLog.recipientAddress}</div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Days Remaining:</span>
                    <div className="mt-1">{selectedLog.daysRemaining}</div>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Retry Count:</span>
                    <div className="mt-1">{selectedLog.retryCount}</div>
                  </div>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Message:</span>
                  <div className="mt-1 p-3 bg-muted rounded-md text-xs whitespace-pre-wrap" data-testid="message-content">
                    {selectedLog.messageContent}
                  </div>
                </div>
                {selectedLog.errorMessage && (
                  <div>
                    <span className="font-medium text-red-600">Error:</span>
                    <div className="mt-1 p-3 bg-red-50 dark:bg-red-950 rounded-md text-xs text-red-700 dark:text-red-300" data-testid="error-message">
                      {selectedLog.errorMessage}
                    </div>
                  </div>
                )}
                {selectedLog.providerSid && (
                  <div>
                    <span className="font-medium text-muted-foreground">Provider SID:</span>
                    <div className="mt-1 text-xs font-mono">{selectedLog.providerSid}</div>
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Created: {new Date(selectedLog.createdAt).toLocaleString()}
                  {selectedLog.sentAt && ` | Sent: ${new Date(selectedLog.sentAt).toLocaleString()}`}
                  {selectedLog.lastRetryAt && ` | Last Retry: ${new Date(selectedLog.lastRetryAt).toLocaleString()}`}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {prefsDialog && (
          <NotificationPrefsDialog
            agencyId={prefsDialog.agencyId}
            agencyName={prefsDialog.agencyName}
            onClose={() => setPrefsDialog(null)}
          />
        )}
      </div>
    </AdminLayout>
  );
}

function NotificationPrefsDialog({ agencyId, agencyName, onClose }: { agencyId: string; agencyName: string; onClose: () => void }) {
  const { toast } = useToast();

  const { data: pref, isLoading } = useQuery<NotificationPref>({
    queryKey: ["/api/admin/agency-notification-preferences", agencyId],
  });

  const [formData, setFormData] = useState<NotificationPref | null>(null);

  if (pref && !formData) {
    setFormData({
      agencyId,
      contactEmail: pref.contactEmail || "",
      contactPhone: pref.contactPhone || "",
      contactName: pref.contactName || "",
      enableSms: pref.enableSms,
      enableWhatsapp: pref.enableWhatsapp,
      enableEmail: pref.enableEmail,
      preferredChannel: pref.preferredChannel,
      remindersEnabled: pref.remindersEnabled,
    });
  }

  const saveMutation = useMutation({
    mutationFn: async (data: NotificationPref) => {
      const res = await apiRequest("PUT", `/api/admin/agency-notification-preferences/${agencyId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Preferences saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-notification-preferences"] });
      onClose();
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="prefs-dialog">
        <DialogHeader>
          <DialogTitle>Notification Preferences</DialogTitle>
          <DialogDescription>{agencyName}</DialogDescription>
        </DialogHeader>
        {isLoading || !formData ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Reminders Enabled</Label>
              <Switch
                checked={formData.remindersEnabled}
                onCheckedChange={(v) => setFormData({ ...formData, remindersEnabled: v })}
                data-testid="toggle-reminders"
              />
            </div>
            <div>
              <Label>Contact Name</Label>
              <Input
                value={formData.contactName || ""}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                placeholder="Agency contact person"
                data-testid="input-contact-name"
              />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input
                value={formData.contactPhone || ""}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                placeholder="+254..."
                data-testid="input-contact-phone"
              />
            </div>
            <div>
              <Label>Contact Email</Label>
              <Input
                value={formData.contactEmail || ""}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                placeholder="agency@example.com"
                data-testid="input-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Notification Channels</Label>
              <div className="flex items-center justify-between">
                <span className="text-sm">SMS</span>
                <Switch
                  checked={formData.enableSms}
                  onCheckedChange={(v) => setFormData({ ...formData, enableSms: v })}
                  data-testid="toggle-sms"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">WhatsApp</span>
                <Switch
                  checked={formData.enableWhatsapp}
                  onCheckedChange={(v) => setFormData({ ...formData, enableWhatsapp: v })}
                  data-testid="toggle-whatsapp"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Email</span>
                <Switch
                  checked={formData.enableEmail}
                  onCheckedChange={(v) => setFormData({ ...formData, enableEmail: v })}
                  data-testid="toggle-email"
                />
              </div>
            </div>
            <div>
              <Label>Preferred Channel</Label>
              <Select value={formData.preferredChannel} onValueChange={(v) => setFormData({ ...formData, preferredChannel: v })}>
                <SelectTrigger data-testid="select-preferred-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => saveMutation.mutate(formData)}
              disabled={saveMutation.isPending}
              data-testid="save-prefs-btn"
            >
              {saveMutation.isPending ? "Saving..." : "Save Preferences"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
