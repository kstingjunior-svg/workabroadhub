// ─────────────────────────────────────────────────────────────────────────────
// /tools/interview-practice — Voice Mock Interview
//
// Flow:
//   1. User picks country + role -> POST /api/interview/start
//   2. Receives question text + audio URL -> we play the audio (ElevenLabs voice)
//   3. User taps "Record answer" -> MediaRecorder captures mic
//   4. User taps "Submit" -> upload audio to /api/interview/respond
//   5. Backend Whispers it, scores it, returns next question
//   6. After 5 Qs -> summary screen with final score + coaching paragraph
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
  Mic, Square, Play, Loader2, ArrowRight, RefreshCw,
  Sparkles, Award, ArrowLeft, Volume2,
} from "lucide-react";
import { Link } from "wouter";

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
  nextAudioUrl?: string;
  finalScore?: number;
  finalSummary?: string;
}

const COUNTRIES = ["United Kingdom", "UAE", "Saudi Arabia", "Canada", "Qatar", "Germany", "Australia"];

const TOTAL_QUESTIONS = 5;

export default function InterviewPracticePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [country, setCountry] = useState(COUNTRIES[0]);
  const [role, setRole] = useState("");
  const [state, setState] = useState<InterviewState | null>(null);
  const [starting, setStarting] = useState(false);
  const [responding, setResponding] = useState(false);

  // Recording state
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-play AI question when it changes
  useEffect(() => {
    if (state?.nextAudioUrl && audioRef.current) {
      audioRef.current.load();
      audioRef.current.play().catch(() => { /* user gesture needed; ignore */ });
    }
  }, [state?.nextAudioUrl]);

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

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setAudioBlob(null);
      setTextAnswer("");
    } catch (err: any) {
      toast({
        title: "Microphone access denied",
        description: "Allow mic access in your browser, or type your answer instead.",
        variant: "destructive",
      });
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function submitAnswer() {
    if (!state) return;
    if (!audioBlob && !textAnswer.trim()) {
      toast({ title: "Record an answer first (or type one)", variant: "destructive" });
      return;
    }
    setResponding(true);
    try {
      const csrf = await fetchCsrfToken();
      const fd = new FormData();
      fd.append("sessionId", state.id);
      if (audioBlob) fd.append("audio", audioBlob, "answer.webm");
      if (textAnswer.trim()) fd.append("answerText", textAnswer.trim());
      const res = await fetch("/api/interview/respond", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Could not submit");
      setState(data as InterviewState);
      setAudioBlob(null);
      setTextAnswer("");
    } catch (err: any) {
      toast({ title: "Couldn't submit answer", description: err?.message, variant: "destructive" });
    } finally {
      setResponding(false);
    }
  }

  function resetSession() {
    setState(null);
    setAudioBlob(null);
    setTextAnswer("");
    setRole("");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!state) {
    // Intake screen
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <header className="sticky top-0 z-30 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md border-b">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
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
              <Sparkles className="h-3.5 w-3.5 mr-1" /> AI-powered · Voice-driven
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3 tracking-tight">
              Mock interview, with a real recruiter's voice
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              5 adaptive questions. You answer with your voice (or type). We score
              every answer on four dimensions and send you a coaching report.
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
            Your audio is transcribed and discarded — we only keep the text transcript.
          </div>
        </main>
      </div>
    );
  }

  if (state.status === "completed") {
    // Summary screen
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

  // In-progress: question + answer screen
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
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-purple-500/15 flex items-center justify-center">
                <Volume2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-400 mb-1">
                  Interviewer
                </div>
                <p className="text-base font-medium leading-relaxed">{questionText}</p>
              </div>
            </div>
            {state.nextAudioUrl && (
              <audio
                ref={audioRef}
                controls
                className="w-full h-10"
                data-testid="audio-question"
              >
                <source src={state.nextAudioUrl} type="audio/mpeg" />
              </audio>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 sm:p-6 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your answer
            </div>

            {/* Recording UI */}
            <div className="flex items-center justify-center gap-3 py-4">
              {!recording && !audioBlob && (
                <Button onClick={startRecording} size="lg" variant="default" className="rounded-full h-16 w-16 p-0" data-testid="button-record">
                  <Mic className="h-6 w-6" />
                </Button>
              )}
              {recording && (
                <Button onClick={stopRecording} size="lg" variant="destructive" className="rounded-full h-16 w-16 p-0 animate-pulse" data-testid="button-stop">
                  <Square className="h-6 w-6 fill-current" />
                </Button>
              )}
              {!recording && audioBlob && (
                <>
                  <audio controls src={URL.createObjectURL(audioBlob)} className="h-10" />
                  <Button onClick={startRecording} variant="outline" size="sm">
                    <RefreshCw className="h-3 w-3 mr-1" /> Re-record
                  </Button>
                </>
              )}
            </div>

            <div className="text-center text-xs text-muted-foreground">
              {recording ? "Listening…" : (audioBlob ? "Audio ready — submit or re-record" : "Tap the mic to record (or type below)")}
            </div>

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
              disabled={responding || (!audioBlob && !textAnswer.trim())}
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
