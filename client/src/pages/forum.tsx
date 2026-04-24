import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  MessageSquare,
  ThumbsUp,
  Eye,
  ChevronDown,
  ChevronUp,
  Send,
  Plus,
  Loader2,
  Globe,
  Users,
  UserPlus,
  UserMinus,
  CheckCircle2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  postQuestion,
  answerQuestion,
  markAnswerHelpful,
  incrementViews,
  subscribeToQuestions,
  joinCountryGroup,
  leaveCountryGroup,
  getUserGroupMembership,
  subscribeToGroupMembers,
  GROUP_STATUSES,
  GROUP_TIMELINES,
  type ForumQuestion,
  type GroupMember,
  type GroupStatus,
  type GroupTimeline,
} from "@/lib/firebase-forum";

// ─── Country meta ─────────────────────────────────────────────────────────────

const COUNTRY_META: Record<string, { name: string; flag: string }> = {
  usa:       { name: "USA",              flag: "🇺🇸" },
  canada:    { name: "Canada",           flag: "🇨🇦" },
  uae:       { name: "UAE / Arab Countries", flag: "🇦🇪" },
  uk:        { name: "United Kingdom",   flag: "🇬🇧" },
  australia: { name: "Australia",        flag: "🇦🇺" },
  europe:    { name: "Europe",           flag: "🇪🇺" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  if (!ts) return "just now";
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function initials(userId: string): string {
  return userId.substring(0, 2).toUpperCase();
}

// ─── Answer row ───────────────────────────────────────────────────────────────

function AnswerRow({
  answer,
  country,
  questionId,
}: {
  answer: ForumQuestion["answers"][number];
  country: string;
  questionId: string;
}) {
  const [helpful, setHelpful] = useState(answer.helpful);
  const [voted, setVoted] = useState(false);

  const handleHelpful = async () => {
    if (voted) return;
    setVoted(true);
    setHelpful((n) => n + 1);
    await markAnswerHelpful(country, questionId, answer.id).catch(() => {
      setVoted(false);
      setHelpful((n) => n - 1);
    });
  };

  return (
    <div className="flex gap-3 py-3 border-b border-border/60 last:border-0" data-testid={`answer-${answer.id}`}>
      <div className="h-7 w-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
        {initials(answer.userId)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground/90 leading-relaxed">{answer.answer}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[11px] text-muted-foreground">{timeAgo(answer.timestamp)}</span>
          <button
            onClick={handleHelpful}
            disabled={voted}
            className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${
              voted
                ? "text-green-600 dark:text-green-400"
                : "text-muted-foreground hover:text-green-600 dark:hover:text-green-400"
            }`}
            data-testid={`button-helpful-${answer.id}`}
          >
            <ThumbsUp className="h-3 w-3" />
            {helpful > 0 ? helpful : ""} Helpful
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Question card ────────────────────────────────────────────────────────────

function QuestionCard({
  q,
  country,
  currentUserId,
}: {
  q: ForumQuestion;
  country: string;
  currentUserId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAnswerBox, setShowAnswerBox] = useState(false);
  const [answerText, setAnswerText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const viewTracked = useRef(false);

  const handleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !viewTracked.current) {
      viewTracked.current = true;
      await incrementViews(country, q.id).catch(() => {});
    }
  };

  const handleAnswer = async () => {
    if (!answerText.trim() || !currentUserId) return;
    setSubmitting(true);
    try {
      await answerQuestion(country, q.id, answerText, currentUserId);
      setAnswerText("");
      setShowAnswerBox(false);
      toast({ title: "Answer posted", description: "Your answer is now live." });
    } catch {
      toast({ title: "Failed to post", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const answerCount = q.answers.length;

  return (
    <Card className="border-border/70 hover:border-primary/40 transition-colors" data-testid={`question-card-${q.id}`}>
      <CardContent className="p-4">
        {/* Question header */}
        <button
          className="w-full text-left"
          onClick={handleExpand}
          data-testid={`button-expand-${q.id}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3 items-start min-w-0">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">
                {initials(q.userId)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-snug">{q.question}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[11px] text-muted-foreground">{timeAgo(q.timestamp)}</span>
                  <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />
                    {answerCount} {answerCount === 1 ? "answer" : "answers"}
                  </span>
                  {q.views > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                      <Eye className="h-3 w-3" />
                      {q.views}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span className="text-muted-foreground shrink-0 mt-1">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>
        </button>

        {/* Expanded answers */}
        {expanded && (
          <div className="mt-4 pl-11">
            {answerCount === 0 ? (
              <p className="text-xs text-muted-foreground italic">No answers yet — be the first to help!</p>
            ) : (
              <div className="divide-y divide-border/50">
                {q.answers
                  .slice()
                  .sort((a, b) => b.helpful - a.helpful || a.timestamp - b.timestamp)
                  .map((a) => (
                    <AnswerRow key={a.id} answer={a} country={country} questionId={q.id} />
                  ))}
              </div>
            )}

            {/* Answer box */}
            {!showAnswerBox ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setShowAnswerBox(true)}
                data-testid={`button-show-answer-${q.id}`}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Write an Answer
              </Button>
            ) : (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Share what you know…"
                  rows={3}
                  className="text-sm resize-none"
                  data-testid={`textarea-answer-${q.id}`}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAnswer}
                    disabled={submitting || !answerText.trim()}
                    data-testid={`button-submit-answer-${q.id}`}
                  >
                    {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                    Post Answer
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowAnswerBox(false); setAnswerText(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Forum page ───────────────────────────────────────────────────────────────

export default function Forum() {
  const [, params] = useRoute("/forum/:country");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const country = (params?.country ?? "").toLowerCase();
  const meta = COUNTRY_META[country];

  const [questions, setQuestions] = useState<ForumQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAskBox, setShowAskBox] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [posting, setPosting] = useState(false);

  // ── Group state ──────────────────────────────────────────────────────────────
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [myMembership, setMyMembership] = useState<GroupMember | null>(null);
  const [membershipLoaded, setMembershipLoaded] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joinStatus, setJoinStatus] = useState<GroupStatus>("Looking for opportunities");
  const [joinTimeline, setJoinTimeline] = useState<GroupTimeline>("Planning to move in 3-6 months");
  const [joiningGroup, setJoiningGroup] = useState(false);

  // Redirect invalid country slugs
  useEffect(() => {
    if (!meta) navigate("/");
  }, [meta, navigate]);

  // Real-time Q&A subscription
  useEffect(() => {
    if (!country || !meta) return;
    setLoading(true);
    const unsub = subscribeToQuestions(country, (qs) => {
      setQuestions(qs);
      setLoading(false);
    });
    return unsub;
  }, [country, meta]);

  // Real-time group members subscription
  useEffect(() => {
    if (!country || !meta) return;
    const unsub = subscribeToGroupMembers(country, (m) => setMembers(m));
    return unsub;
  }, [country, meta]);

  // Fetch current user's own membership once on load
  useEffect(() => {
    if (!user?.id || !country || !meta) { setMembershipLoaded(true); return; }
    getUserGroupMembership(country, user.id).then((m) => {
      setMyMembership(m);
      if (m) {
        setJoinStatus(m.status);
        setJoinTimeline(m.timeline);
      }
      setMembershipLoaded(true);
    });
  }, [user?.id, country, meta]);

  const handleJoinGroup = async () => {
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in to join the group." });
      return;
    }
    setJoiningGroup(true);
    try {
      await joinCountryGroup(country, user.id, joinStatus, joinTimeline);
      setMyMembership({ userId: user.id, joinedAt: Date.now(), status: joinStatus, timeline: joinTimeline });
      setShowJoinForm(false);
      toast({ title: "Joined group!", description: `You're now part of the ${meta?.name} community group.` });
    } catch {
      toast({ title: "Failed to join", description: "Please try again.", variant: "destructive" });
    } finally {
      setJoiningGroup(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!user?.id) return;
    setJoiningGroup(true);
    try {
      await leaveCountryGroup(country, user.id);
      setMyMembership(null);
      toast({ title: "Left group", description: "You've left the group. You can rejoin anytime." });
    } catch {
      toast({ title: "Failed to leave", description: "Please try again.", variant: "destructive" });
    } finally {
      setJoiningGroup(false);
    }
  };

  const handlePostQuestion = async () => {
    if (!questionText.trim()) return;
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in to ask a question.", variant: "destructive" });
      return;
    }
    setPosting(true);
    try {
      await postQuestion(country, questionText, user.id);
      setQuestionText("");
      setShowAskBox(false);
      toast({ title: "Question posted!", description: "Others can now see and answer your question." });
    } catch {
      toast({ title: "Failed to post", description: "Please try again.", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  if (!meta) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary/90 to-primary sticky top-0 z-20 shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/country/${country}`)}
              className="text-white/80 hover:text-white transition-colors"
              data-testid="button-back"
              aria-label="Back to country dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="text-2xl">{meta.flag}</span>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">
                {meta.name} Community Q&amp;A
              </h1>
              <p className="text-white/70 text-xs">Ask questions · Share experience</p>
            </div>
          </div>
          <Link href="/dashboard">
            <Button size="sm" variant="secondary" className="text-xs" data-testid="button-dashboard">
              <Globe className="h-3.5 w-3.5 mr-1" />
              Dashboard
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Ask question CTA */}
        {!showAskBox ? (
          <button
            onClick={() => {
              if (!user?.id) {
                toast({ title: "Sign in required", description: "Please sign in to ask a question." });
                return;
              }
              setShowAskBox(true);
            }}
            className="w-full flex items-center gap-3 rounded-xl border border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10 px-4 py-3 text-sm text-primary/80 hover:text-primary transition-colors"
            data-testid="button-ask-question"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Ask the community a question about working in {meta.name}…
          </button>
        ) : (
          <Card className="border-primary/30">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Your Question</p>
              <Textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder={`e.g. "What documents do I need for a work visa in ${meta.name}?"`}
                rows={3}
                className="text-sm resize-none"
                autoFocus
                maxLength={500}
                data-testid="textarea-question"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{questionText.length}/500</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setShowAskBox(false); setQuestionText(""); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handlePostQuestion}
                    disabled={posting || !questionText.trim()}
                    data-testid="button-post-question"
                  >
                    {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                    Post Question
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats bar */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            {questions.length} question{questions.length !== 1 ? "s" : ""}
          </span>
          <span>·</span>
          <span>
            {questions.reduce((s, q) => s + q.answers.length, 0)} answers
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {members.length} member{members.length !== 1 ? "s" : ""}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        </div>

        {/* ── Country Group Panel ───────────────────────────────────────────── */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-cyan-500/5" data-testid="card-group-panel">
          <CardContent className="p-4">
            {/* Header row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground leading-tight">
                    {meta.name} Job Seekers Group
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {members.length} member{members.length !== 1 ? "s" : ""} · Connect with fellow applicants
                  </p>
                </div>
              </div>

              {membershipLoaded && (
                myMembership ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Joined
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2"
                      onClick={handleLeaveGroup}
                      disabled={joiningGroup}
                      data-testid="button-leave-group"
                    >
                      {joiningGroup ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3 mr-1" />}
                      Leave
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="text-xs h-7 shrink-0"
                    onClick={() => setShowJoinForm((v) => !v)}
                    data-testid="button-join-group"
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1" />
                    Join Group
                  </Button>
                )
              )}
            </div>

            {/* My status badge (when already joined) */}
            {myMembership && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-xs">
                  {myMembership.status}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {myMembership.timeline}
                </Badge>
              </div>
            )}

            {/* Join form (status + timeline pickers) */}
            {showJoinForm && !myMembership && (
              <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
                <p className="text-xs font-medium text-foreground">Tell the group about yourself</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Your status</label>
                    <Select
                      value={joinStatus}
                      onValueChange={(v) => setJoinStatus(v as GroupStatus)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-join-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GROUP_STATUSES.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Your timeline</label>
                    <Select
                      value={joinTimeline}
                      onValueChange={(v) => setJoinTimeline(v as GroupTimeline)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-join-timeline">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GROUP_TIMELINES.map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleJoinGroup}
                    disabled={joiningGroup}
                    className="text-xs"
                    data-testid="button-confirm-join"
                  >
                    {joiningGroup ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />}
                    Confirm &amp; Join
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowJoinForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Recent members preview (up to 6 avatars) */}
            {members.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <p className="text-[11px] text-muted-foreground mb-2">Recent members</p>
                <div className="flex flex-wrap gap-2">
                  {members.slice(0, 8).map((m) => (
                    <div
                      key={m.userId}
                      title={`${m.status} · ${m.timeline}`}
                      className="flex items-center gap-1.5 rounded-full bg-background border border-border/70 px-2 py-0.5"
                      data-testid={`member-${m.userId}`}
                    >
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                        {m.userId.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-[10px] text-muted-foreground max-w-[90px] truncate">{m.status}</span>
                    </div>
                  ))}
                  {members.length > 8 && (
                    <span className="text-[11px] text-muted-foreground self-center">
                      +{members.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Questions list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4 h-20" />
              </Card>
            ))}
          </div>
        ) : questions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center space-y-3">
              <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="font-semibold text-foreground/70">No questions yet</p>
              <p className="text-sm text-muted-foreground">
                Be the first to ask something about working in {meta.name}!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                country={country}
                currentUserId={user?.id ?? ""}
              />
            ))}
          </div>
        )}

        {/* Footer disclaimer */}
        <p className="text-[11px] text-muted-foreground text-center leading-relaxed pb-4">
          This is a community-driven Q&amp;A space. Answers are from fellow job seekers and are not official advice.
          Always verify information with official government and employer sources.
        </p>
      </main>
    </div>
  );
}
