/**
 * /interview — AI Mock Interview simulator.
 *
 * 5-question adaptive flow:
 *   1. Pick country + role
 *   2. AI generates question #1
 *   3. User types (or speaks via Web Speech) their answer
 *   4. AI scores on relevance/structure/specificity/confidence + writes feedback
 *   5. Repeat to 5 questions → final 0-100 score + coaching summary
 *
 * Voice: browser-native SpeechSynthesis (read question aloud) and
 * SpeechRecognition (transcribe spoken answer). Both are progressive
 * enhancements — text-only fallback works on every browser.
 *
 * Backend: /api/interview/start, /api/interview/respond, /api/interview/:id
 * already shipped; we're just rendering them.
 *
 * 2026-06 retention #3.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Volume2, VolumeX, Loader2, Trophy, Send, RotateCcw,
  Star, Target, MessageSquare, Sparkles, ArrowRight,
} from "lucide-react";
import { SUPPORTED_JOURNEY_COUNTRIES } from "@shared/country-journey-steps";
import { SALARY_ROLES } from "@shared/salary-intelligence";

interface QATurn {
  q: string;
  a: string;
  scores?: {
    relevance: number;       // 0-10
    structure: number;
    specificity: number;
    confidence: number;
    feedback: string;
  };
}

interface SessionSnapshot {
  id: string;
  country: string;
  role: string;
  status: "in_progress" | "completed";
  questionNumber: number;
  transcript: QATurn[];
  nextQuestion?: string;
  finalScore?: number;
  finalSummary?: string;
}

const SUGGESTED_ROLES = SALARY_ROLES.map((r) => r.label);

const COUNTRIES = SUPPORTED_JOURNEY_COUNTRIES;

export default function InterviewPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ sessionId?: string }>();
  const { toast } = useToast();

  const [sessionId, setSessionId] = useState<string | null>(params.sessionId ?? null);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [country, setCountry] = useState("");
  const [role, setRole] = useState("");
  const [answer, setAnswer] = useState("");

  // Web Speech state
  const [ttsOn, setTtsOn] = useState(true);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const lastSpokenIdxRef = useRef<number>(-1);

  // ── Fetch existing session if URL has :sessionId ────────────────────────
  useEffect(() => {
    if (!sessionId || session) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/interview/${sessionId}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSession(data);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [sessionId, session]);

  // ── Read next question aloud whenever it changes ────────────────────────
  useEffect(() => {
    if (!ttsOn || !session) return;
    const idx = session.transcript.findIndex((t) => !t.a);
    if (idx < 0 || idx === lastSpokenIdxRef.current) return;
    const q = session.transcript[idx]?.q;
    if (!q) return;
    lastSpokenIdxRef.current = idx;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(q);
      utter.rate = 0.95;
      utter.pitch = 1.0;
      // Prefer an English voice if available
      const enVoice = synth.getVoices().find((v) => v.lang.startsWith("en"));
      if (enVoice) utter.voice = enVoice;
      synth.speak(utter);
    } catch { /* SSR / browser unsupported */ }
  }, [session, ttsOn]);

  // ── Web Speech recognition setup (text fallback always works) ───────────
  function toggleMic() {
    const SR = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition;
    if (!SR) {
      toast({ title: "Voice not supported", description: "Your browser doesn't support voice input. Type your answer instead.", variant: "destructive" });
      return;
    }
    if (listening) {
      try { recognitionRef.current?.stop(); } catch {}
      setListening(false);
      return;
    }
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (evt: any) => {
      let text = "";
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        text += evt.results[i][0].transcript;
      }
      setAnswer((prev) => (prev + " " + text).trim());
    };
    r.onerror = () => { setListening(false); };
    r.onend = () => { setListening(false); };
    recognitionRef.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  }

  // ── Start a new session ─────────────────────────────────────────────────
  async function startInterview() {
    if (!country || !role) {
      toast({ title: "Pick a country and role", description: "Both are required to tailor the questions.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/interview/start", { country, role });
      const data = await res.json();
      setSession(data);
      setSessionId(data.id);
      navigate(`/interview/${data.id}`, { replace: true });
    } catch (err: any) {
      toast({ title: "Couldn't start", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // ── Submit an answer ────────────────────────────────────────────────────
  async function submitAnswer() {
    if (!session || !answer.trim()) return;
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/interview/respond", {
        sessionId: session.id, answerText: answer.trim(),
      });
      const data = await res.json();
      setSession(data);
      setAnswer("");
    } catch (err: any) {
      toast({ title: "Couldn't submit", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // ── Auth gate ───────────────────────────────────────────────────────────
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md"><CardContent className="p-6 text-center">
          <Mic className="h-10 w-10 mx-auto mb-3 text-primary" />
          <h2 className="text-xl font-bold mb-2">Sign in to start your mock interview</h2>
          <p className="text-sm text-muted-foreground mb-4">
            We'll save your sessions so you can review feedback later.
          </p>
          <Button onClick={() => navigate("/?redirect=" + encodeURIComponent("/interview"))}>Sign in</Button>
        </CardContent></Card>
      </div>
    );
  }

  // ── Picker view (no session yet) ────────────────────────────────────────
  if (!session) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 text-primary mb-2">
              <Mic className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wider">AI Mock Interview</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">Practice before the real call</h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              5 adaptive questions tailored to your target role and country. Speak or type your
              answers — AI scores each one and gives you specific coaching.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Set up your interview</CardTitle>
              <CardDescription>The role and destination shape the questions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Country picker */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                  Target country
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {COUNTRIES.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => setCountry(c.name)}
                      className={`rounded-lg border p-2 text-center transition ${
                        country === c.name
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border hover:border-primary/40"
                      }`}
                      data-testid={`pick-country-${c.code}`}
                    >
                      <div className="text-xl">{c.flag}</div>
                      <div className="text-[10px] font-medium">{c.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Role picker */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                  Target role
                </label>
                <Textarea
                  placeholder="e.g. Registered Nurse · Truck Driver · Software Developer"
                  value={role}
                  onChange={(e) => setRole(e.target.value.slice(0, 200))}
                  rows={2}
                  className="resize-none"
                  data-testid="input-role"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {SUGGESTED_ROLES.slice(0, 6).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5 transition"
                      data-testid={`suggest-role-${r}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                onClick={startInterview}
                disabled={loading || !country || !role.trim()}
                data-testid="button-start-interview"
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing…</>
                  : <><Sparkles className="h-4 w-4 mr-2" /> Start interview</>
                }
              </Button>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center mt-4 max-w-sm mx-auto">
            Your audio never leaves your device — voice is transcribed locally by your browser.
          </p>
        </div>
      </div>
    );
  }

  // ── In-progress view OR completed view ──────────────────────────────────
  const totalQuestions = 5;
  const answeredCount = session.transcript.filter((t) => t.a).length;
  const pendingIdx = session.transcript.findIndex((t) => !t.a);
  const currentQuestion = pendingIdx >= 0 ? session.transcript[pendingIdx].q : null;
  const isComplete = session.status === "completed";

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Interview · {session.country} · {session.role}</div>
            <div className="text-xs font-mono text-muted-foreground">
              {isComplete ? "Completed" : `Question ${Math.min(answeredCount + 1, totalQuestions)} of ${totalQuestions}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTtsOn((v) => !v)}
              className="p-2 rounded-full border border-border hover:border-primary/40 text-muted-foreground"
              data-testid="toggle-tts"
              title={ttsOn ? "Stop reading questions aloud" : "Read questions aloud"}
            >
              {ttsOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              onClick={() => { setSession(null); setSessionId(null); navigate("/interview", { replace: true }); }}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              data-testid="button-new-interview"
            >
              <RotateCcw className="h-3 w-3" /> New
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
            style={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
          />
        </div>

        {/* In progress: question + input */}
        {!isComplete && currentQuestion && (
          <>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Question
                </div>
                <p className="text-base sm:text-lg font-medium leading-snug">{currentQuestion}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <Textarea
                  placeholder="Type your answer, or tap the mic to speak…"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value.slice(0, 4000))}
                  rows={6}
                  className="resize-none"
                  data-testid="input-answer"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMic}
                    className={`p-2.5 rounded-full border transition ${
                      listening
                        ? "border-rose-300 bg-rose-50 text-rose-700 animate-pulse"
                        : "border-border hover:border-primary/40 text-muted-foreground"
                    }`}
                    data-testid="toggle-mic"
                  >
                    {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                  <span className="text-xs text-muted-foreground flex-1">
                    {listening ? "Listening… speak now" : "Voice or text — both work"}
                  </span>
                  <Button
                    onClick={submitAnswer}
                    disabled={loading || !answer.trim()}
                    data-testid="button-submit-answer"
                  >
                    {loading
                      ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Scoring…</>
                      : <>Submit <ArrowRight className="h-4 w-4 ml-1" /></>
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Previously answered questions — feedback collapsed */}
        {session.transcript.filter((t) => t.a).length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4">
              Past questions ({session.transcript.filter((t) => t.a).length})
            </div>
            {session.transcript.filter((t) => t.a).map((turn, idx) => (
              <PastTurn key={idx} index={idx} turn={turn} />
            ))}
          </div>
        )}

        {/* Completion screen */}
        {isComplete && (
          <Card className="border-emerald-300 dark:border-emerald-800 overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <Trophy className="h-6 w-6 text-emerald-700 dark:text-emerald-300" />
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-tight">Interview complete</h2>
                  <p className="text-xs text-muted-foreground">5 questions answered.</p>
                </div>
              </div>

              {typeof session.finalScore === "number" && (
                <div className="mb-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold tabular-nums">{session.finalScore}</span>
                    <span className="text-sm text-muted-foreground">/ 100</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 via-blue-500 to-emerald-500"
                      style={{ width: `${session.finalScore}%` }}
                    />
                  </div>
                </div>
              )}

              {session.finalSummary && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
                  {session.finalSummary}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-4">
                <Button
                  onClick={() => { setSession(null); setSessionId(null); navigate("/interview", { replace: true }); }}
                  data-testid="button-try-again"
                >
                  <RotateCcw className="h-4 w-4 mr-1.5" /> Try another role
                </Button>
                <Button variant="outline" onClick={() => navigate("/journey")} data-testid="button-back-to-journey">
                  Back to my journey
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Past Q&A card — collapses scores into a compact strip ────────────────

function PastTurn({ index, turn }: { index: number; turn: QATurn }) {
  const [expanded, setExpanded] = useState(false);
  const s = turn.scores;
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-3 hover:bg-muted/40 transition flex items-start gap-3"
        data-testid={`past-turn-${index}`}
      >
        <span className="text-xs font-mono text-muted-foreground mt-0.5 shrink-0">{String(index + 1).padStart(2, "0")}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm mb-0.5 line-clamp-1">{turn.q}</div>
          <div className="text-xs text-muted-foreground line-clamp-1">{turn.a}</div>
        </div>
        {s && (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-[10px] shrink-0">
            {Math.round((s.relevance + s.structure + s.specificity + s.confidence) * 2.5)}/100
          </Badge>
        )}
      </button>
      {expanded && s && (
        <div className="border-t bg-muted/20 p-3 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <ScoreBox icon={Target}        label="Relevance"   value={s.relevance} />
            <ScoreBox icon={MessageSquare} label="Structure"   value={s.structure} />
            <ScoreBox icon={Sparkles}      label="Specificity" value={s.specificity} />
            <ScoreBox icon={Star}          label="Confidence"  value={s.confidence} />
          </div>
          <div className="text-xs leading-relaxed rounded-md bg-background p-2.5 border">
            <span className="font-semibold">Coach feedback:</span> {s.feedback}
          </div>
        </div>
      )}
    </Card>
  );
}

function ScoreBox({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{value}<span className="text-muted-foreground text-[10px]">/10</span></div>
    </div>
  );
}
