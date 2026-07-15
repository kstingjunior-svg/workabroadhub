// ─────────────────────────────────────────────────────────────────────────────
// /tools/interview-practice — Voice Mock Interview (browser-only voice)
//
// Voice in:  window.SpeechRecognition (live transcription as the user speaks)
// Voice out: window.speechSynthesis (system voice reads each AI question aloud)
//
// No server-side TTS or STT — same pattern Nanjila uses. Free, fast, private.
//
// Flow:
//   1. User picks country + role -> POST /api/interview/start
//   2. Receives question text -> browser speaks it via speechSynthesis
//   3. User taps "Start speaking" -> SpeechRecognition transcribes live
//   4. User taps "Submit" -> POST text to /api/interview/respond
//   5. After 5 Qs -> summary screen with final score + coaching paragraph
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";
import {
  Mic, Square, Loader2, ArrowRight, RefreshCw,
  Sparkles, Award, ArrowLeft, Volume2, VolumeX,
} from "lucide-react";
import { Link } from "wouter";
import { AiDisclaimer } from "@/components/ai-disclaimer";

interface QATurn {
  q: string;
  a: string;
  scores?: {
    relevance: number;
    structure: number;
    specificity: number;
    confidence: number;
    feedback: string;
  };
}

interface InterviewState {
  id: string;
  status: "in_progress" | "completed";
  questionNumber: number;
  transcript: QATurn[];
  nextQuestion?: string;
  finalScore?: number;
  finalSummary?: string;
}

const COUNTRIES = ["United Kingdom", "UAE", "Saudi Arabia", "Canada", "Qatar", "Germany", "Australia"];
const TOTAL_QUESTIONS = 5;

// ─── Web Speech helpers ──────────────────────────────────────────────────────

function speakAloud(text: string, onEnd?: () => void) {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  // Cancel anything currently speaking so we don't queue up old questions.
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  // Prefer a UK or US English voice for the interviewer feel.
  const voices = synth.getVoices();
  const preferred =
    voices.find((v) => /en-GB/i.test(v.lang)) ??
    voices.find((v) => /en-US/i.test(v.lang)) ??
    voices.find((v) => /^en/i.test(v.lang));
  if (preferred) u.voice = preferred;
  u.rate = 0.95;
  u.pitch = 1.0;
  if (onEnd) u.onend = onEnd;
  synth.speak(u);
}

function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

// SpeechRecognition is non-standard. Chrome/Edge expose webkitSpeechRecognition.
// Firefox does not support it. We feature-detect and fall back to typing.
function getRecognitionCtor(): any | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function InterviewPracticePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [country, setCountry] = useState(COUNTRIES[0]);
  const [role, setRole] = useState("");
  const [state, setState] = useState<InterviewState | null>(null);
  const [starting, setStarting] = useState(false);
  const [responding, setResponding] = useState(false);

  // Voice in
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [textAnswer, setTextAnswer] = useState("");
  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef<string>("");

  // Voice out
  const [muted, setMuted] = useState(false);
  const lastSpokenIdRef = useRef<string>("");

  // Auto-speak the latest question whenever it changes
  useEffect(() => {
    if (!state || muted) return;
    const q = state.nextQuestion ?? state.transcript[state.transcript.length - 1]?.q;
    if (!q) return;
    const speakerKey = `${state.id}:${state.transcript.length}`;
    if (lastSpokenIdRef.current === speakerKey) return;
    lastSpokenIdRef.current = speakerKey;
    // Small delay so the question card renders first.
    const t = setTimeout(() => speakAloud(q), 200);
    return () => clearTimeout(t);
  }, [state, muted]);

  // Hard stop voices/listening when the page unmounts
  useEffect(() => () => { stopSpeaking(); try { recognitionRef.current?.stop?.(); } catch {} }, []);

  async function startInterview() {
    if (!role.trim()) {
      toast({ title: "Tell us what role you're targeting", variant: "destructive" });
      return;
    }
    setStarting(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/interview/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ country, role: role.trim() }),
      });
      if (res.status === 401) {
        toast({ title: "Please sign in", description: "Mock interview requires an account.", variant: "destructive" });
        navigate("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Could not start");
      setState(data as InterviewState);
    } catch (err: any) {
      toast({ title: "Couldn't start interview", description: err?.message, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  function startListening() {
    stopSpeaking(); // don't let the recogniser hear the AI voice
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      toast({
        title: "Voice input not supported here",
        description: "Use Chrome on Android or desktop. You can still type your answer below.",
        variant: "destructive",
      });
      return;
    }
    finalTextRef.current = "";
    setLiveTranscript("");

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event: any) => {
      let interim = "";
      let appendFinal = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) appendFinal += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (appendFinal) finalTextRef.current = (finalTextRef.current + " " + appendFinal).trim();
      setLiveTranscript((finalTextRef.current + " " + interim).trim());
    };
    rec.onerror = (e: any) => {
      console.warn("[interview] recognition error:", e?.error ?? e);
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch (err: any) {
      toast({
        title: "Mic denied",
        description: "Allow microphone access, or type your answer.",
        variant: "destructive",
      });
    }
  }

  function stopListening() {
    try { recognitionRef.current?.stop?.(); } catch {}
    setListening(false);
  }

  async function submitAnswer() {
    if (!state) return;
    const answerText = (liveTranscript.trim() || textAnswer.trim());
    if (!answerText) {
      toast({ title: "Speak or type an answer first", variant: "destructive" });
      return;
    }
    stopListening();
    stopSpeaking();
    setResponding(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/interview/respond", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ sessionId: state.id, answerText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Could not submit");
      setState(data as InterviewState);
      setLiveTranscript("");
      setTextAnswer("");
      finalTextRef.current = "";
    } catch (err: any) {
      toast({ title: "Couldn't submit answer", description: err?.message, variant: "destructive" });
    } finally {
      setResponding(false);
    }
  }

  function resetSession() {
    stopSpeaking();
    stopListening();
    setState(null);
    setLiveTranscript("");
    setTextAnswer("");
    setRole("");
  }

  // ── Render: intake screen ─────────────────────────────────────────────────
  if (!state) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <header className="sticky top-0 z-30 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md border-b">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
            <AiDisclaimer className="mb-4" />
            <Link href="/tools">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" /> Tools
              </Button>
            </Link>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
          <div className="text-center">
            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 mb-3">
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Voice practice · Real feedback
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3 tracking-tight">
              Let's practice — out loud
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              Five questions employers actually ask. You speak, we listen — then
              we point out what was strong, what to work on, and a phrase or two to swap.
              Like having a coach in your pocket. Nobody else listening.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Set up your interview</CardTitle>
              <CardDescription>Tell us what you're practicing for.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="country">Target country</Label>
                <select
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  data-testid="select-country"
                >
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role you're applying for</Label>
                <Input
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Registered Nurse, Software Engineer, Hotel Receptionist"
                  data-testid="input-role"
                />
              </div>
              <Button
                onClick={startInterview}
                disabled={starting || !role.trim()}
                className="w-full"
                size="lg"
                data-testid="button-start-interview"
              >
                {starting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing your first question…</>) : (<>Start interview <ArrowRight className="h-4 w-4 ml-2" /></>)}
              </Button>
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground text-center">
            Voice processing happens entirely in your browser — your audio never leaves your device.
          </div>
        </main>
      </div>
    );
  }

  // ── Render: summary ──────────────────────────────────────────────────────
  if (state.status === "completed") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
          <div className="text-center">
            <div className="inline-flex h-16 w-16 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 items-center justify-center mb-3">
              <Award className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold mb-1">Interview complete</h1>
            <p className="text-muted-foreground">Here's how you did.</p>
          </div>

          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-6xl font-bold tabular-nums text-primary mb-2">
                {state.finalScore ?? "—"}
              </div>
              <div className="text-sm text-muted-foreground mb-4">out of 100</div>
              <p className="text-sm leading-relaxed text-left">{state.finalSummary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Question-by-question</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {state.transcript.map((t, i) => (
                <div key={i} className="border-l-2 border-primary/30 pl-3 space-y-1">
                  <div className="text-xs font-semibold text-primary">Q{i + 1}</div>
                  <div className="text-sm font-medium">{t.q}</div>
                  <div className="text-xs text-muted-foreground line-clamp-3">{t.a}</div>
                  {t.scores && (
                    <div className="flex flex-wrap gap-2 mt-1 text-[10px]">
                      <span>Relevance {t.scores.relevance}/10</span>
                      <span>Structure {t.scores.structure}/10</span>
                      <span>Specificity {t.scores.specificity}/10</span>
                      <span>Confidence {t.scores.confidence}/10</span>
                    </div>
                  )}
                  {t.scores?.feedback && (
                    <div className="text-[11px] italic text-muted-foreground mt-1">{t.scores.feedback}</div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button onClick={resetSession} variant="outline" className="flex-1">
              <RefreshCw className="h-4 w-4 mr-2" /> Practice another
            </Button>
            <Link href="/services" className="flex-1">
              <Button className="w-full">Explore career services</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Render: in-progress (question + answer) ───────────────────────────────
  const currentTurn = state.transcript[state.transcript.length - 1];
  const questionText = currentTurn?.q ?? state.nextQuestion ?? "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Question {state.transcript.length} of {TOTAL_QUESTIONS}</span>
            <span>{state.transcript.length - 1} answered</span>
          </div>
          <Progress value={(state.transcript.length - 1) / TOTAL_QUESTIONS * 100} className="h-2" />
        </div>

        <Card>
          <CardContent className="p-5 sm:p-6 space-y-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-purple-500/15 flex items-center justify-center">
                <Volume2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                    Interviewer
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (muted) { setMuted(false); speakAloud(questionText); }
                      else       { setMuted(true);  stopSpeaking(); }
                    }}
                    className="h-7 px-2"
                    data-testid="button-toggle-mute"
                  >
                    {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    <span className="ml-1 text-[11px]">{muted ? "Muted" : "On"}</span>
                  </Button>
                </div>
                <p className="text-base font-medium leading-relaxed">{questionText}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => speakAloud(questionText)}
              className="w-full"
              data-testid="button-replay-question"
            >
              <Volume2 className="h-3.5 w-3.5 mr-2" /> Replay question
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 sm:p-6 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your answer
            </div>

            {/* Voice button */}
            <div className="flex items-center justify-center gap-3 py-3">
              {!listening ? (
                <Button onClick={startListening} size="lg" variant="default" className="rounded-full h-16 w-16 p-0" data-testid="button-record">
                  <Mic className="h-6 w-6" />
                </Button>
              ) : (
                <Button onClick={stopListening} size="lg" variant="destructive" className="rounded-full h-16 w-16 p-0 animate-pulse" data-testid="button-stop">
                  <Square className="h-6 w-6 fill-current" />
                </Button>
              )}
            </div>
            <div className="text-center text-xs text-muted-foreground">
              {listening ? "Listening — speak naturally, then tap stop" : "Tap to speak (or type below)"}
            </div>

            {/* Live transcript */}
            {liveTranscript && (
              <div className="rounded-md border bg-slate-50 dark:bg-slate-900/40 p-3 text-sm">
                {liveTranscript}
              </div>
            )}

            {/* Text fallback */}
            <div className="space-y-1.5">
              <Label htmlFor="text-answer" className="text-xs">Or type your answer instead</Label>
              <textarea
                id="text-answer"
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                placeholder="If your mic isn't working or you prefer typing…"
                rows={3}
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2"
                data-testid="textarea-answer"
              />
            </div>

            <Button
              onClick={submitAnswer}
              disabled={responding || (!liveTranscript.trim() && !textAnswer.trim())}
              className="w-full"
              size="lg"
              data-testid="button-submit-answer"
            >
              {responding ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scoring + preparing next question…</>
              ) : (
                <>Submit answer <ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
