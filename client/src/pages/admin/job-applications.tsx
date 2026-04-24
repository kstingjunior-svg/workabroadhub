import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Briefcase,
  GraduationCap,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ExternalLink,
  Search,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
  Globe,
  Upload,
  Eye,
  Send,
  XCircle,
  Star,
  Filter,
} from "lucide-react";
import type { UserJobApplication } from "@shared/schema";

interface AdminApplication extends UserJobApplication {
  userEmail?: string;
  userName?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  submitted:            { label: "Submitted",         color: "bg-blue-500",    badgeVariant: "default" },
  queued:               { label: "Queued",            color: "bg-sky-500",     badgeVariant: "secondary" },
  analyzing:            { label: "Analyzing",         color: "bg-amber-500",   badgeVariant: "secondary" },
  generating:           { label: "Generating",        color: "bg-yellow-400",  badgeVariant: "secondary" },
  preparing:            { label: "Preparing",         color: "bg-yellow-500",  badgeVariant: "secondary" },
  materials_ready:      { label: "Materials Ready",   color: "bg-green-500",   badgeVariant: "default" },
  downloaded:           { label: "Downloaded",        color: "bg-emerald-600", badgeVariant: "default" },
  failed:               { label: "Failed",            color: "bg-red-500",     badgeVariant: "destructive" },
  user_action_required: { label: "Action Required",   color: "bg-orange-500",  badgeVariant: "secondary" },
  applied:              { label: "Applied",           color: "bg-purple-500",  badgeVariant: "default" },
  confirmed:            { label: "Confirmed",         color: "bg-emerald-500", badgeVariant: "default" },
  rejected:             { label: "Not Selected",      color: "bg-gray-500",    badgeVariant: "outline" },
  interview_scheduled:  { label: "Interview",         color: "bg-primary",     badgeVariant: "default" },
};

const STATUS_ORDER = ["submitted", "queued", "analyzing", "generating", "preparing", "materials_ready", "downloaded", "failed", "user_action_required", "applied", "confirmed", "rejected", "interview_scheduled"];

function getDeadlineUrgency(deadline?: string | Date | null) {
  if (!deadline) return null;
  const d = new Date(deadline);
  const now = new Date();
  const diffHours = (d.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (diffHours < 0) return "overdue";
  if (diffHours < 24) return "critical";
  if (diffHours < 72) return "urgent";
  return "normal";
}

export default function AdminJobApplications() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedApp, setSelectedApp] = useState<AdminApplication | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatusMessage, setEditStatusMessage] = useState("");
  const [cvUrl, setCvUrl] = useState("");
  const [coverLetterUrl, setCoverLetterUrl] = useState("");
  const [sopUrl, setSopUrl] = useState("");

  const { data: applications, isLoading } = useQuery<AdminApplication[]>({
    queryKey: ["/api/admin/user-job-applications"],
    refetchInterval: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/user-job-applications/${id}`, data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/user-job-applications"] });
      toast({ title: "Application updated successfully" });
      setSelectedApp(null);
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const openDialog = (app: AdminApplication) => {
    setSelectedApp(app);
    setEditStatus(app.status);
    setEditNotes(app.adminNotes || "");
    setEditStatusMessage("");
    const mats = app.preparedMaterials as any || {};
    setCvUrl(mats.cvUrl || "");
    setCoverLetterUrl(mats.coverLetterUrl || "");
    setSopUrl(mats.sopUrl || "");
  };

  const handleSave = () => {
    if (!selectedApp) return;
    const preparedMaterials: any = {};
    if (cvUrl) preparedMaterials.cvUrl = cvUrl;
    if (coverLetterUrl) preparedMaterials.coverLetterUrl = coverLetterUrl;
    if (sopUrl) preparedMaterials.sopUrl = sopUrl;

    updateMutation.mutate({
      id: selectedApp.id,
      data: {
        status: editStatus || undefined,
        statusMessage: editStatusMessage || undefined,
        adminNotes: editNotes || undefined,
        preparedMaterials: Object.keys(preparedMaterials).length ? preparedMaterials : undefined,
      },
    });
  };

  const filtered = (applications || [])
    .filter(app => {
      if (statusFilter !== "all" && app.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          app.jobTitle?.toLowerCase().includes(q) ||
          app.companyName?.toLowerCase().includes(q) ||
          app.userEmail?.toLowerCase().includes(q) ||
          app.userName?.toLowerCase().includes(q) ||
          app.targetCountry?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const urgencyOrder = { overdue: 0, critical: 1, urgent: 2, normal: 3, null: 4 };
      const ua = urgencyOrder[getDeadlineUrgency(a.applicationDeadline) as keyof typeof urgencyOrder ?? "null"] ?? 4;
      const ub = urgencyOrder[getDeadlineUrgency(b.applicationDeadline) as keyof typeof urgencyOrder ?? "null"] ?? 4;
      if (ua !== ub) return ua - ub;
      return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
    });

  const counts = applications?.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <AdminLayout title="Job Applications">
      <div className="p-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold">{applications?.length ?? 0}</p>
              <p className="text-sm text-muted-foreground">Total Applications</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold text-yellow-600">{(counts.submitted || 0) + (counts.preparing || 0)}</p>
              <p className="text-sm text-muted-foreground">Pending Action</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold text-green-600">{counts.materials_ready || 0}</p>
              <p className="text-sm text-muted-foreground">Ready for Review</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold text-purple-600">{(counts.applied || 0) + (counts.confirmed || 0)}</p>
              <p className="text-sm text-muted-foreground">Submitted by Client</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by job title, company, user…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-applications"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48" data-testid="select-status-filter">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUS_ORDER.map(s => (
                <SelectItem key={s} value={s}>
                  {STATUS_CONFIG[s]?.label} {counts[s] ? `(${counts[s]})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Applications List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Card key={i}><CardContent className="py-4"><Skeleton className="h-16" /></CardContent></Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-semibold">No applications found</p>
              <p className="text-muted-foreground">
                {applications?.length === 0 ? "No application requests have been submitted yet." : "No results match your filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(app => {
              const urgency = getDeadlineUrgency(app.applicationDeadline);
              const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.submitted;
              const mats = app.preparedMaterials as any || {};
              const hasMaterials = !!(mats.cvUrl || mats.coverLetterUrl || mats.sopUrl);
              return (
                <Card
                  key={app.id}
                  className={`cursor-pointer hover:shadow-md transition-shadow ${urgency === "overdue" ? "border-red-300 dark:border-red-800" : urgency === "critical" ? "border-orange-300 dark:border-orange-800" : ""}`}
                  onClick={() => openDialog(app)}
                  data-testid={`card-application-${app.id}`}
                >
                  <CardContent className="py-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`h-9 w-9 rounded-full ${cfg.color} flex items-center justify-center flex-shrink-0`}>
                          <Briefcase className="h-4 w-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold truncate">{app.jobTitle}</span>
                            <span className="text-muted-foreground">@</span>
                            <span className="text-muted-foreground">{app.companyName}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {app.userName || app.userEmail || "Unknown user"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {app.targetCountry}
                            </span>
                            {app.applicationDeadline && (
                              <span className={`flex items-center gap-1 ${urgency === "overdue" ? "text-red-600" : urgency === "critical" ? "text-orange-600" : urgency === "urgent" ? "text-yellow-600" : ""}`}>
                                <Calendar className="h-3 w-3" />
                                Deadline: {new Date(app.applicationDeadline).toLocaleDateString()}
                                {urgency === "overdue" && " (OVERDUE)"}
                                {urgency === "critical" && " (< 24h!)"}
                                {urgency === "urgent" && " (< 3 days)"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        {hasMaterials && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <FileText className="h-3 w-3" />
                            Materials Ready
                          </Badge>
                        )}
                        <Badge className={`${cfg.color} text-white text-xs`}>
                          {cfg.label}
                        </Badge>
                        <Button variant="ghost" size="sm" data-testid={`button-manage-${app.id}`}>
                          Manage
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedApp?.jobTitle} — {selectedApp?.companyName}
            </DialogTitle>
          </DialogHeader>

          {selectedApp && (
            <div className="space-y-5">
              {/* App Info */}
              <div className="grid grid-cols-2 gap-3 text-sm bg-muted/40 rounded-lg p-4">
                <div>
                  <p className="text-muted-foreground">Client</p>
                  <p className="font-medium">{selectedApp.userName || selectedApp.userEmail || "—"}</p>
                  <p className="text-muted-foreground text-xs">{selectedApp.userEmail}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Country</p>
                  <p className="font-medium">{selectedApp.targetCountry}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="font-medium">{new Date(selectedApp.createdAt!).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Deadline</p>
                  <p className={`font-medium ${getDeadlineUrgency(selectedApp.applicationDeadline) === "overdue" ? "text-red-600" : getDeadlineUrgency(selectedApp.applicationDeadline) === "critical" ? "text-orange-600" : ""}`}>
                    {selectedApp.applicationDeadline ? new Date(selectedApp.applicationDeadline).toLocaleDateString() : "Not set"}
                  </p>
                </div>
                {selectedApp.jobUrl && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Job URL</p>
                    <a href={selectedApp.jobUrl} target="_blank" rel="noopener noreferrer"
                       className="text-primary flex items-center gap-1 hover:underline text-xs truncate">
                      {selectedApp.jobUrl}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>
                )}
                {selectedApp.jobDescription && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Job Description</p>
                    <p className="text-xs mt-1 line-clamp-3">{selectedApp.jobDescription}</p>
                  </div>
                )}
              </div>

              {/* Intake Data */}
              {selectedApp.intakeData && (
                <div className="text-sm bg-muted/30 rounded-lg p-4 space-y-2">
                  <p className="font-medium text-muted-foreground uppercase tracking-wide text-xs">Client Intake Information</p>
                  {Object.entries(selectedApp.intakeData as any).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-muted-foreground capitalize min-w-[120px]">{k.replace(/([A-Z])/g, ' $1').trim()}:</span>
                      <span className="flex-1 break-words">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Status Update */}
              <div className="space-y-3">
                <Label>Update Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger data-testid="select-edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map(s => (
                      <SelectItem key={s} value={s}>{STATUS_CONFIG[s]?.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Status message to display to client (optional)"
                  value={editStatusMessage}
                  onChange={e => setEditStatusMessage(e.target.value)}
                  data-testid="input-status-message"
                />
              </div>

              {/* Materials Upload (URL-based) */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Prepared Materials (share links)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Paste shareable links to prepared documents (Google Docs, Dropbox, etc.). The client will see these links to download their materials.
                </p>
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Input
                      placeholder="CV / Resume URL"
                      value={cvUrl}
                      onChange={e => setCvUrl(e.target.value)}
                      data-testid="input-cv-url"
                    />
                    {cvUrl && (
                      <a href={cvUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    <Send className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Input
                      placeholder="Cover Letter URL"
                      value={coverLetterUrl}
                      onChange={e => setCoverLetterUrl(e.target.value)}
                      data-testid="input-cover-letter-url"
                    />
                    {coverLetterUrl && (
                      <a href={coverLetterUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    <GraduationCap className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Input
                      placeholder="SOP / Motivation Letter URL (for university apps)"
                      value={sopUrl}
                      onChange={e => setSopUrl(e.target.value)}
                      data-testid="input-sop-url"
                    />
                    {sopUrl && (
                      <a href={sopUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Admin Notes */}
              <div className="space-y-2">
                <Label>Internal Admin Notes</Label>
                <Textarea
                  placeholder="Internal notes (not visible to client)"
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={3}
                  data-testid="textarea-admin-notes"
                />
              </div>

              {/* Existing materials preview */}
              {(() => {
                const mats = selectedApp.preparedMaterials as any || {};
                if (!mats.cvUrl && !mats.coverLetterUrl && !mats.sopUrl) return null;
                return (
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">Currently uploaded materials:</p>
                    {mats.cvUrl && (
                      <a href={mats.cvUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 hover:underline">
                        <FileText className="h-4 w-4" /> CV / Resume
                      </a>
                    )}
                    {mats.coverLetterUrl && (
                      <a href={mats.coverLetterUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 hover:underline">
                        <Send className="h-4 w-4" /> Cover Letter
                      </a>
                    )}
                    {mats.sopUrl && (
                      <a href={mats.sopUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 hover:underline">
                        <GraduationCap className="h-4 w-4" /> SOP / Motivation Letter
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setSelectedApp(null)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              data-testid="button-save-application"
            >
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
