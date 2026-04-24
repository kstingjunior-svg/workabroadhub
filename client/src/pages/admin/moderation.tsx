import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  Trash2,
  Loader2,
  MessageSquare,
  Building2,
  Globe,
  Clock,
  Eye,
  Star,
  ShieldCheck,
  DatabaseZap,
  AlertTriangle,
  CheckCheck,
} from "lucide-react";
import {
  subscribeToQueue,
  approveContent,
  rejectContent,
  deleteModerationItem,
  migrateLegacyTestimonials,
  type ModerationItem,
  type ModerationStatus,
  type ContentType,
  type TestimonialContent,
  type AgencyReviewContent,
  type PortalSubmissionContent,
  type MigrationResult,
} from "@/lib/firebase-moderation";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  if (!ts) return "—";
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TYPE_META: Record<ContentType, { label: string; icon: typeof MessageSquare; color: string }> = {
  testimonial:       { label: "Testimonial",   icon: MessageSquare, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  agency_review:     { label: "Agency Review", icon: Building2,     color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  portal_submission: { label: "Job Portal",    icon: Globe,         color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
};

// ─── Content preview ──────────────────────────────────────────────────────────

function ContentPreview({ item }: { item: ModerationItem }) {
  if (item.type === "testimonial") {
    const c = item.content as TestimonialContent;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-sm">{c.name}</span>
          {c.role && <span className="text-xs text-muted-foreground">{c.role}</span>}
          {c.country && <Badge variant="outline" className="text-xs">{c.country}</Badge>}
          {c.rating > 0 && (
            <span className="flex items-center gap-0.5 text-yellow-500 text-xs">
              {Array.from({ length: c.rating }).map((_, i) => <Star key={i} className="h-3 w-3 fill-current" />)}
            </span>
          )}
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed">{c.text}</p>
      </div>
    );
  }

  if (item.type === "agency_review") {
    const c = item.content as AgencyReviewContent;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-sm">{c.agencyName}</span>
          {c.rating > 0 && (
            <span className="flex items-center gap-0.5 text-yellow-500 text-xs">
              {Array.from({ length: c.rating }).map((_, i) => <Star key={i} className="h-3 w-3 fill-current" />)}
            </span>
          )}
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed">{c.text}</p>
      </div>
    );
  }

  if (item.type === "portal_submission") {
    const c = item.content as PortalSubmissionContent;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-sm">{c.portalName}</span>
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2">{c.url}</a>
          <Badge variant="outline" className="text-xs">{c.category}</Badge>
          {c.country && <Badge variant="outline" className="text-xs">{c.country}</Badge>}
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed">{c.description}</p>
      </div>
    );
  }

  return null;
}

// ─── Moderation card ──────────────────────────────────────────────────────────

function ModerationCard({
  item,
  adminId,
  onAction,
}: {
  item: ModerationItem;
  adminId: string;
  onAction: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy]               = useState(false);
  const [showReject, setShowReject]   = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showDelete, setShowDelete]   = useState(false);

  const meta = TYPE_META[item.type];
  const Icon = meta.icon;

  const handleApprove = async () => {
    setBusy(true);
    try {
      await approveContent(item.id, adminId);
      toast({ title: "Approved & published", description: "Content is now live on the platform." });
      onAction();
    } catch {
      toast({ title: "Failed to approve", description: "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const handleReject = async () => {
    setBusy(true);
    try {
      await rejectContent(item.id, adminId, rejectReason);
      toast({ title: "Rejected", description: "The submission has been rejected." });
      setShowReject(false);
      onAction();
    } catch {
      toast({ title: "Failed to reject", description: "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteModerationItem(item.id);
      toast({ title: "Deleted" });
      setShowDelete(false);
      onAction();
    } catch {
      toast({ title: "Failed to delete", description: "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <>
      <Card className="border-border/70" data-testid={`moderation-card-${item.id}`}>
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${meta.color}`}>
                <Icon className="h-3 w-3" />
                {meta.label}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {timeAgo(item.submittedAt)}
              </span>
              <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                by {item.submittedBy.substring(0, 8)}…
              </span>
            </div>
            {item.status === "approved" && (
              <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-0">
                <CheckCircle2 className="h-3 w-3 mr-0.5" /> Approved
              </Badge>
            )}
            {item.status === "rejected" && (
              <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0">
                <XCircle className="h-3 w-3 mr-0.5" /> Rejected
              </Badge>
            )}
          </div>

          {/* Content preview */}
          <div className="pl-1">
            <ContentPreview item={item} />
          </div>

          {/* Reject reason */}
          {item.status === "rejected" && item.rejectReason && (
            <p className="text-xs text-muted-foreground italic border-l-2 border-red-300 pl-2">
              Reason: {item.rejectReason}
            </p>
          )}

          {/* Reviewer info */}
          {item.reviewedBy && (
            <p className="text-[11px] text-muted-foreground">
              Reviewed {timeAgo(item.reviewedAt ?? 0)} by {item.reviewedBy.substring(0, 8)}…
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 border-t border-border/60">
            {item.status === "pending" && (
              <>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleApprove} disabled={busy} data-testid={`button-approve-${item.id}`}>
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Approve &amp; Publish
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => setShowReject(true)} disabled={busy} data-testid={`button-reject-${item.id}`}>
                  <XCircle className="h-3 w-3" /> Reject
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground ml-auto" onClick={() => setShowDelete(true)} disabled={busy} data-testid={`button-delete-${item.id}`}>
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>Optionally provide a reason (not shown publicly).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Inappropriate content, spam, duplicate submission…"
              rows={3}
              className="text-sm resize-none"
              data-testid="textarea-reject-reason"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowReject(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={handleReject} disabled={busy} data-testid="button-confirm-reject">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Confirm Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Permanently?</DialogTitle>
            <DialogDescription>This removes the record from the queue entirely. It cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={busy} data-testid="button-confirm-delete">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Queue tab ────────────────────────────────────────────────────────────────

function QueueTab({
  status,
  adminId,
}: {
  status: ModerationStatus;
  adminId: string;
}) {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToQueue(status, (data) => {
      setItems(data);
      setLoading(false);
    });
    return unsub;
  }, [status]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse"><CardContent className="p-4 h-28" /></Card>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-10 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No {status} submissions</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ModerationCard key={item.id} item={item} adminId={adminId} onAction={() => {}} />
      ))}
    </div>
  );
}

// ─── Legacy migration panel ────────────────────────────────────────────────────

function LegacyMigrationPanel({ adminId }: { adminId: string }) {
  const { toast } = useToast();
  const [running, setRunning]       = useState(false);
  const [result, setResult]         = useState<MigrationResult | null>(null);
  const [dismissed, setDismissed]   = useState(false);

  if (dismissed) return null;

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await migrateLegacyTestimonials(adminId);
      setResult(r);
      if (r.migrated === 0 && r.skipped === 0) {
        toast({ title: "Nothing to migrate", description: "No entries found in testimonials/pending/ or testimonials/approved/." });
        setDismissed(true);
      } else {
        toast({
          title: `Migration complete — ${r.migrated} imported`,
          description: r.errors.length > 0
            ? `${r.errors.length} error(s) — see panel for details.`
            : r.skipped > 0
              ? `${r.skipped} skipped (empty text).`
              : "All entries are now in the moderation queue.",
        });
      }
    } catch (err: any) {
      toast({ title: "Migration failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20" data-testid="migration-panel">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <DatabaseZap className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Legacy Testimonials Found</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Entries in <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">testimonials/pending/</code> and{" "}
                <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">testimonials/approved/</code> are not visible in this queue.
                Run the migration to import them.
              </p>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-500 hover:text-amber-700 text-lg leading-none shrink-0"
            aria-label="Dismiss"
            data-testid="button-dismiss-migration"
          >
            ×
          </button>
        </div>

        {result && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-white dark:bg-background p-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCheck className="h-3.5 w-3.5" />
              <span><strong>{result.migrated}</strong> testimonial{result.migrated !== 1 ? "s" : ""} imported into the moderation queue</span>
            </div>
            {result.skipped > 0 && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span><strong>{result.skipped}</strong> skipped (no text content)</span>
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-destructive font-medium flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> {result.errors.length} error(s):
                </p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-destructive/80 pl-5 font-mono">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={run}
            disabled={running}
            data-testid="button-run-migration"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseZap className="h-3.5 w-3.5" />}
            {running ? "Migrating…" : result ? "Run Again" : "Import Legacy Testimonials"}
          </Button>
          {result && result.migrated > 0 && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDismissed(true)} data-testid="button-done-migration">
              Done
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminModerationPage() {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    const unsub = subscribeToQueue("pending", (items) => setPendingCount(items.length));
    return unsub;
  }, []);

  const adminId = String(user?.id ?? "admin");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Content Moderation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and publish user-submitted testimonials, agency reviews, and job portal suggestions.
          </p>
        </div>
        {pendingCount !== null && pendingCount > 0 && (
          <Badge className="text-sm px-3 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200">
            {pendingCount} pending
          </Badge>
        )}
      </div>

      <LegacyMigrationPanel adminId={adminId} />

      {/* Key for the 3 types */}
      <div className="flex gap-2 flex-wrap text-xs text-muted-foreground">
        {(Object.entries(TYPE_META) as [ContentType, typeof TYPE_META[ContentType]][]).map(([, m]) => {
          const Ic = m.icon;
          return (
            <span key={m.label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${m.color}`}>
              <Ic className="h-3 w-3" /> {m.label}
            </span>
          );
        })}
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="h-9">
          <TabsTrigger value="pending" className="text-xs gap-1.5" data-testid="tab-pending">
            <Clock className="h-3.5 w-3.5" />
            Pending
            {pendingCount !== null && pendingCount > 0 && (
              <span className="ml-1 bg-amber-500 text-white rounded-full px-1.5 py-0 text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="text-xs gap-1.5" data-testid="tab-approved">
            <CheckCircle2 className="h-3.5 w-3.5" /> Approved
          </TabsTrigger>
          <TabsTrigger value="rejected" className="text-xs gap-1.5" data-testid="tab-rejected">
            <XCircle className="h-3.5 w-3.5" /> Rejected
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="pending">
            <QueueTab status="pending" adminId={adminId} />
          </TabsContent>
          <TabsContent value="approved">
            <QueueTab status="approved" adminId={adminId} />
          </TabsContent>
          <TabsContent value="rejected">
            <QueueTab status="rejected" adminId={adminId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
