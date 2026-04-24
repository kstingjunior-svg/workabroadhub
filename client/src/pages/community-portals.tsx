import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Globe, ThumbsUp, ThumbsDown, Plus, ExternalLink, Clock,
  CheckCircle, Users, Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  submitPortalForVerification,
  votePortal,
  usePendingPortals,
  getVisitorId,
} from "@/lib/firebase-portals";

const COUNTRIES = [
  "Kenya", "Uganda", "Tanzania", "Rwanda", "Ghana", "Nigeria", "Ethiopia",
  "South Africa", "Global", "UAE", "Saudi Arabia", "Qatar", "Kuwait",
  "Bahrain", "Oman", "UK", "Canada", "Australia", "Germany", "Other",
];

const EMPTY = { url: "", name: "", country: "Kenya", description: "" };

export default function CommunityPortalsPage() {
  const { toast } = useToast();
  const { portals, loading } = usePendingPortals();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [voted, setVoted] = useState<Record<string, "up" | "down">>({});
  const [submitting, setSubmitting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  async function handleSubmit() {
    if (!form.url.trim() || !form.name.trim()) {
      toast({ title: "URL and portal name are required.", variant: "destructive" });
      return;
    }
    let url = form.url.trim();
    if (!url.startsWith("http")) url = `https://${url}`;
    setSubmitting(true);
    try {
      await submitPortalForVerification(url, form.name, form.country, form.description);
      toast({ title: "Portal submitted!", description: "The community will vote on it. Thank you." });
      setForm(EMPTY);
      setOpen(false);
    } catch {
      toast({ title: "Submission failed. Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVote(id: string, type: "upvotes" | "downvotes") {
    if (voted[id]) {
      toast({ title: "You've already voted on this portal." });
      return;
    }
    setVotingId(id);
    try {
      await votePortal(id, type);
      setVoted(prev => ({ ...prev, [id]: type === "upvotes" ? "up" : "down" }));
    } catch {
      toast({ title: "Vote failed. Please try again.", variant: "destructive" });
    } finally {
      setVotingId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-4 py-1.5 rounded-full text-sm font-medium border border-teal-200 dark:border-teal-700">
          <Users className="h-4 w-4" />
          Community Verified
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Job Portal Directory
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Know a legitimate job or visa portal that should be listed? Submit it and let the community vote it in.
          Portals with strong community support are reviewed by our admin team.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white gap-2 mt-2" data-testid="button-submit-portal">
              <Plus className="h-4 w-4" /> Submit a Portal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Submit a Job Portal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label>Portal Name <span className="text-red-500">*</span></Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. BrighterMonday Kenya"
                  data-testid="input-portal-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Website URL <span className="text-red-500">*</span></Label>
                <Input
                  value={form.url}
                  onChange={e => setForm({ ...form, url: e.target.value })}
                  placeholder="https://www.example.com"
                  type="url"
                  data-testid="input-portal-url"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Country / Region</Label>
                <select
                  value={form.country}
                  onChange={e => setForm({ ...form, country: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  data-testid="select-portal-country"
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Why should this be listed? <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Briefly describe what makes this portal trustworthy..."
                  rows={3}
                  data-testid="input-portal-description"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Submissions are anonymous. Portals must be free for job seekers to use.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !form.url.trim() || !form.name.trim()}
                  className="bg-teal-600 hover:bg-teal-700 text-white gap-2"
                  data-testid="button-submit-confirm"
                >
                  <Send className="h-3.5 w-3.5" />
                  {submitting ? "Submitting…" : "Submit"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Send, title: "1. Submit", desc: "Anyone can suggest a legitimate job portal or visa resource." },
          { icon: ThumbsUp, title: "2. Community votes", desc: "Upvote portals you trust. Downvote spam or suspicious sites." },
          { icon: CheckCircle, title: "3. Admin verifies", desc: "High-voted submissions are reviewed and added to the verified list." },
        ].map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="border-dashed">
            <CardContent className="p-4 flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex items-center justify-center">
                <Icon className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Submissions list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">
            Pending Community Submissions
            {portals.length > 0 && (
              <Badge variant="outline" className="ml-2 text-xs">{portals.length}</Badge>
            )}
          </h2>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : portals.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center">
              <Globe className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="font-medium text-gray-700 dark:text-gray-200">No submissions yet</p>
              <p className="text-sm text-muted-foreground mt-1">Be the first to suggest a trusted portal.</p>
            </CardContent>
          </Card>
        ) : (
          portals.map((portal) => {
            const myVote = voted[portal.id];
            const score = portal.upvotes - portal.downvotes;
            return (
              <Card key={portal.id} className="hover:shadow-sm transition-shadow" data-testid={`card-portal-${portal.id}`}>
                <CardContent className="p-4 flex gap-4 items-start">
                  {/* Vote column */}
                  <div className="flex flex-col items-center gap-1.5 min-w-[52px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-8 w-8 p-0 rounded-lg ${myVote === "up" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"}`}
                      onClick={() => handleVote(portal.id, "upvotes")}
                      disabled={!!myVote || votingId === portal.id}
                      data-testid={`button-upvote-${portal.id}`}
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <span className={`text-sm font-bold tabular-nums ${score > 0 ? "text-emerald-600" : score < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {score >= 0 ? `+${score}` : score}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-8 w-8 p-0 rounded-lg ${myVote === "down" ? "bg-red-100 text-red-500 dark:bg-red-900/30" : "text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"}`}
                      onClick={() => handleVote(portal.id, "downvotes")}
                      disabled={!!myVote || votingId === portal.id}
                      data-testid={`button-downvote-${portal.id}`}
                    >
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-gray-200 leading-tight">
                          {portal.name}
                        </p>
                        <a
                          href={portal.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-teal-600 hover:underline flex items-center gap-1 mt-0.5"
                        >
                          {portal.url.replace(/^https?:\/\//, "").slice(0, 55)}
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="text-xs">{portal.country}</Badge>
                        <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      </div>
                    </div>
                    {portal.description && (
                      <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{portal.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Submitted {new Date(portal.timestamp).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}
                      {" · "}{portal.upvotes} up · {portal.downvotes} down
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
