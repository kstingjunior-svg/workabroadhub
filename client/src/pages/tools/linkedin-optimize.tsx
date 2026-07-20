/**
 * LinkedIn Profile Optimization workspace — 2026-07 (Tony's premium AI tool).
 *
 * Live AI experience:
 *   1. Pro gate (server-side + client-side check)
 *   2. Input pane: manual form (paste headline / about / experience / skills)
 *   3. Kick off /stream (SSE): animated progress steps, then live scores +
 *      live rewrites (headline / about / experience / skills / keywords)
 *   4. Score gauge animates from before → after
 *   5. AI chat panel: "target Canada", "make headline stronger", etc.
 *   6. Save version, download PDF, copy to clipboard for each section
 *
 * Deliberately shipped without: profile-photo analysis, banner generation,
 * DOCX export. Those are v2.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Sparkles, Loader2, CheckCircle2, TrendingUp, Copy, Download,
  MessageSquare, Send, RefreshCw, Linkedin, AlertCircle, ArrowRight,
  History,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";
import { isPaidUser } from "@/lib/plan";

const TARGET_COUNTRIES = [
  "Canada", "UK", "UAE", "Saudi Arabia", "Qatar", "Bahrain",
  "Germany", "Australia", "USA", "Ireland", "Netherlands",
];

interface ExperienceBlock {
  company: string;
  role: string;
  start: string;
  end: string;
  responsibilities: string;
}

interface ProfileInput {
  fullName?:        string;
  currentHeadline?: string;
  aboutSection?:    string;
  currentRole?:     string;
  yearsExperience?: number;
  experience?:      ExperienceBlock[];
  education?:       string;
  skills?:          string[];
  certifications?:  string;
  targetRole?:      string;
  targetCountry?:   string;
}

interface ProfileScores {
  overall: number;
  headline: number;
  about: number;
  experience: number;
  skills: number;
  keywords: number;
  recruiterVisibility: number;
  atsCompatibility: number;
  internationalReadiness: number;
  explanations?: {
    headline?: string;
    about?: string;
    experience?: string;
    skills?: string;
    keywords?: string;
    recruiterVisibility?: string;
  };
}

interface ProfileRewrite {
  headline: string;
  about: string;
  experience: Array<{ company: string; role: string; bullets: string[] }>;
  skills: string[];
  keywords: string[];
  targetSummary: string;
}

const EMPTY_EXP: ExperienceBlock = { company: "", role: "", start: "", end: "", responsibilities: "" };

// ─── ScoreGauge — animated circular progress ─────────────────────────────
function ScoreGauge({ value, label, size = 130 }: { value: number; label: string; size?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const from = display;
    const to = value;
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const r = (size / 2) - 10;
  const c = 2 * Math.PI * r;
  const offset = c - (display / 100) * c;
  const color = display >= 80 ? "#22c55e" : display >= 60 ? "#0a66c2" : display >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1f2937" strokeWidth="10" fill="transparent" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth="10" fill="transparent"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.15s linear" }}
        />
        <text
          x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
          className="rotate-90 fill-white"
          style={{ transform: `rotate(90deg)`, transformOrigin: "center", fontSize: size * 0.24, fontWeight: 700 }}
        >
          {display}
        </text>
      </svg>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}

// ─── Small linear score bar ──────────────────────────────────────────────
function ScoreBar({ label, value }: { label: string; value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setDisplay(value), 30);
    return () => clearTimeout(timer);
  }, [value]);
  const color = value >= 80 ? "bg-green-500" : value >= 60 ? "bg-blue-500" : value >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="font-mono text-gray-400">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${display}%` }} />
      </div>
    </div>
  );
}

// ─── Typewriter — reveals text character-by-character ────────────────────
function Typewriter({ text, speed = 12 }: { text: string; speed?: number }) {
  const [out, setOut] = useState("");
  useEffect(() => {
    setOut("");
    if (!text) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return <span className="whitespace-pre-wrap">{out}<span className="animate-pulse text-blue-400">▍</span></span>;
}

// ─── CopyBtn ─────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const { toast } = useToast();
  return (
    <Button
      size="sm" variant="ghost"
      onClick={() => { navigator.clipboard.writeText(text); toast({ title: "Copied" }); }}
      className="text-gray-400 hover:text-white"
    >
      <Copy className="h-3.5 w-3.5" />
    </Button>
  );
}

// ─── The workspace itself ────────────────────────────────────────────────
export default function LinkedinOptimizePage() {
  const [, navigate]     = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast }        = useToast();

  const [draftId, setDraftId]     = useState<string | null>(null);
  const [phase, setPhase]         = useState<"input" | "streaming" | "done" | "error">("input");
  const [progress, setProgress]   = useState<Array<{ msg: string; done: boolean }>>([]);
  const [scores, setScores]       = useState<ProfileScores | null>(null);
  const [rewrite, setRewrite]     = useState<ProfileRewrite | null>(null);
  const [errMsg, setErrMsg]       = useState<string>("");

  // Input state
  const [input, setInput] = useState<ProfileInput>({
    fullName: "", currentHeadline: "", aboutSection: "", currentRole: "",
    yearsExperience: undefined,
    experience: [{ ...EMPTY_EXP }],
    education: "", skills: [], certifications: "",
    targetRole: "", targetCountry: "Canada",
  });
  const [skillInput, setSkillInput] = useState("");

  // Chat
  const [chatMsg, setChatMsg] = useState("");
  const [refining, setRefining] = useState(false);

  const esRef = useRef<EventSource | null>(null);

  // ── Gate: Pro only ──────────────────────────────────────────────────
  const isPro = useMemo(() => isPaidUser((user as any)?.plan), [user]);

  useEffect(() => {
    return () => { if (esRef.current) esRef.current.close(); };
  }, []);

  if (authLoading) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-gray-400">Loading...</div>;
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-3 text-center">
        <p className="text-gray-300">Please sign in to use the LinkedIn AI Optimizer.</p>
        <Button onClick={() => navigate("/login?returnTo=/tools/linkedin-optimize")}>Sign in</Button>
      </div>
    );
  }
  if (!isPro) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card className="border-blue-800 bg-gradient-to-br from-blue-950/40 to-slate-900">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <Linkedin className="h-14 w-14 text-blue-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">LinkedIn AI Optimizer</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Rewrite your entire LinkedIn profile with AI in under 2 minutes.
              Live scores, achievement bullets, recruiter keywords, and a PDF
              report. Included with Pro.
            </p>
            <Button
              onClick={() => navigate("/pricing")}
              className="bg-gradient-to-r from-blue-500 to-blue-700 text-white"
            >
              Upgrade to Pro <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────
  async function startAnalysis() {
    // 1. Create draft
    let id = draftId;
    try {
      const csrf = await fetchCsrfToken();
      if (!id) {
        const startRes = await fetch("/api/linkedin-optimize/start", {
          method: "POST", credentials: "include",
          headers: { "X-CSRF-Token": csrf },
        });
        const j = await startRes.json();
        if (!startRes.ok) throw new Error(j?.error ?? "Could not start");
        id = j.id as string;
        setDraftId(id);
      }
      // 2. Save input
      const putRes = await fetch(`/api/linkedin-optimize/${id}/input`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify(input),
      });
      if (!putRes.ok) throw new Error("Could not save input");
    } catch (err: any) {
      setErrMsg(err?.message ?? "Setup failed");
      setPhase("error");
      return;
    }

    // 3. Open SSE stream
    setPhase("streaming");
    setProgress([]);
    setScores(null);
    setRewrite(null);
    setErrMsg("");

    const es = new EventSource(`/api/linkedin-optimize/${id}/stream`, { withCredentials: true } as any);
    esRef.current = es;

    es.addEventListener("step", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        setProgress((p) => {
          const marked = p.map((x) => ({ ...x, done: true }));
          return [...marked, { msg: d.message, done: false }];
        });
      } catch { /* ignore */ }
    });
    es.addEventListener("scores", (e: MessageEvent) => {
      try { setScores(JSON.parse(e.data)); } catch { /* ignore */ }
    });
    es.addEventListener("rewrite", (e: MessageEvent) => {
      try { setRewrite(JSON.parse(e.data)); } catch { /* ignore */ }
    });
    es.addEventListener("done", () => {
      setProgress((p) => p.map((x) => ({ ...x, done: true })));
      setPhase("done");
      es.close();
    });
    es.addEventListener("error", (e: any) => {
      const msg = (() => {
        try { return JSON.parse(e.data).message; } catch { return "Stream error"; }
      })();
      setErrMsg(msg);
      setPhase("error");
      es.close();
    });
  }

  async function refine() {
    if (!draftId || !chatMsg.trim()) return;
    setRefining(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/linkedin-optimize/${draftId}/refine`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ message: chatMsg }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Refine failed");
      setRewrite(j.output);
      setChatMsg("");
      toast({ title: "Profile refined" });
    } catch (err: any) {
      toast({ title: "Refine failed", description: err?.message ?? "", variant: "destructive" });
    } finally {
      setRefining(false);
    }
  }

  async function saveVersion() {
    if (!draftId) return;
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/linkedin-optimize/${draftId}/save-version`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ note: "manual save" }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Version saved" });
    } catch {
      toast({ title: "Could not save version", variant: "destructive" });
    }
  }

  function updateExp(i: number, patch: Partial<ExperienceBlock>) {
    setInput((cur) => {
      const exp = [...(cur.experience ?? [])];
      exp[i] = { ...exp[i], ...patch };
      return { ...cur, experience: exp };
    });
  }
  function addExp() {
    setInput((cur) => ({ ...cur, experience: [...(cur.experience ?? []), { ...EMPTY_EXP }] }));
  }
  function addSkill() {
    const s = skillInput.trim();
    if (!s) return;
    setInput((cur) => ({ ...cur, skills: [...(cur.skills ?? []), s] }));
    setSkillInput("");
  }
  function removeSkill(i: number) {
    setInput((cur) => ({ ...cur, skills: (cur.skills ?? []).filter((_, x) => x !== i) }));
  }

  const inputValid = (input.currentHeadline?.trim().length ?? 0) > 3
                  || (input.aboutSection?.trim().length ?? 0) > 20
                  || (input.experience?.[0]?.role?.trim().length ?? 0) > 0;

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 text-gray-100" data-testid="page-linkedin-optimize">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-5">
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-950/40 border border-blue-800/50">
              <Linkedin className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">LinkedIn AI Optimizer</h1>
              <p className="text-xs text-gray-400">Live rewrite for international recruiter search</p>
            </div>
          </div>
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40">Pro tool</Badge>
        </div>

        {/* ── Phase: input ────────────────────────────────────────── */}
        {phase === "input" && (
          <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-400" />
                Let's optimize your LinkedIn profile
              </CardTitle>
              <CardDescription className="text-gray-400">
                Paste your current profile below. The AI will score every section,
                rewrite it for recruiter search, and explain every change.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-gray-300">Full name</Label>
                  <Input className="bg-slate-800/60 border-slate-700 text-white"
                         value={input.fullName ?? ""}
                         onChange={(e) => setInput({ ...input, fullName: e.target.value })}
                         data-testid="input-fullname" />
                </div>
                <div className="space-y-1">
                  <Label className="text-gray-300">Years of experience</Label>
                  <Input type="number" className="bg-slate-800/60 border-slate-700 text-white"
                         value={input.yearsExperience ?? ""}
                         onChange={(e) => setInput({ ...input, yearsExperience: Number(e.target.value) || undefined })}
                         data-testid="input-years" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-gray-300">Current LinkedIn headline</Label>
                  <Input className="bg-slate-800/60 border-slate-700 text-white"
                         placeholder="Customer Service Representative"
                         value={input.currentHeadline ?? ""}
                         onChange={(e) => setInput({ ...input, currentHeadline: e.target.value })}
                         data-testid="input-headline" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-gray-300">About / Summary</Label>
                  <Textarea rows={4} className="bg-slate-800/60 border-slate-700 text-white"
                            placeholder="Paste your current LinkedIn About section, or type a short summary of what you do."
                            value={input.aboutSection ?? ""}
                            onChange={(e) => setInput({ ...input, aboutSection: e.target.value })}
                            data-testid="input-about" />
                </div>
                <div className="space-y-1">
                  <Label className="text-gray-300">Target role</Label>
                  <Input className="bg-slate-800/60 border-slate-700 text-white"
                         placeholder="Warehouse Associate, Registered Nurse, ..."
                         value={input.targetRole ?? ""}
                         onChange={(e) => setInput({ ...input, targetRole: e.target.value })}
                         data-testid="input-target-role" />
                </div>
                <div className="space-y-1">
                  <Label className="text-gray-300">Target country</Label>
                  <Select value={input.targetCountry ?? "Canada"} onValueChange={(v) => setInput({ ...input, targetCountry: v })}>
                    <SelectTrigger className="bg-slate-800/60 border-slate-700 text-white" data-testid="select-target-country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Experience blocks */}
              <div className="space-y-3">
                <Label className="text-gray-300">Work experience</Label>
                {(input.experience ?? []).map((e, i) => (
                  <div key={i} className="p-3 rounded-lg border border-slate-700 bg-slate-800/40 space-y-2">
                    <div className="grid sm:grid-cols-2 gap-2">
                      <Input placeholder="Company" className="bg-slate-900/60 border-slate-700 text-white"
                             value={e.company} onChange={(ev) => updateExp(i, { company: ev.target.value })} />
                      <Input placeholder="Role" className="bg-slate-900/60 border-slate-700 text-white"
                             value={e.role} onChange={(ev) => updateExp(i, { role: ev.target.value })} />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <Input placeholder="Start (e.g. 2022)" className="bg-slate-900/60 border-slate-700 text-white"
                             value={e.start} onChange={(ev) => updateExp(i, { start: ev.target.value })} />
                      <Input placeholder="End (or 'present')" className="bg-slate-900/60 border-slate-700 text-white"
                             value={e.end} onChange={(ev) => updateExp(i, { end: ev.target.value })} />
                    </div>
                    <Textarea rows={2} placeholder="What did you do here?" className="bg-slate-900/60 border-slate-700 text-white"
                              value={e.responsibilities} onChange={(ev) => updateExp(i, { responsibilities: ev.target.value })} />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addExp}
                        className="border-slate-700 text-gray-300 hover:bg-slate-800">
                  Add another role
                </Button>
              </div>

              {/* Skills */}
              <div className="space-y-2">
                <Label className="text-gray-300">Current skills</Label>
                <div className="flex gap-2">
                  <Input className="bg-slate-800/60 border-slate-700 text-white"
                         placeholder="Type a skill and press Enter"
                         value={skillInput}
                         onChange={(e) => setSkillInput(e.target.value)}
                         onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }} />
                  <Button onClick={addSkill} variant="outline" className="border-slate-700">Add</Button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(input.skills ?? []).map((s, i) => (
                    <Badge key={i} onClick={() => removeSkill(i)}
                           className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-gray-100">
                      {s} ×
                    </Badge>
                  ))}
                </div>
              </div>

              <Button
                onClick={startAnalysis}
                disabled={!inputValid}
                size="lg"
                className="w-full bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-semibold"
                data-testid="button-start-analysis"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Start AI Optimization
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Phase: streaming or done ─────────────────────────────── */}
        {(phase === "streaming" || phase === "done") && (
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Left: score gauge + breakdown */}
            <div className="space-y-4">
              <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                <CardContent className="pt-5 flex flex-col items-center gap-3">
                  <ScoreGauge value={scores?.overall ?? 0} label="Profile strength" />
                  <div className="text-[11px] text-gray-500">Target: 95+</div>
                </CardContent>
              </Card>

              {scores && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader><CardTitle className="text-sm text-white">Section scores</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <ScoreBar label="Headline"              value={scores.headline} />
                    <ScoreBar label="About"                 value={scores.about} />
                    <ScoreBar label="Experience"            value={scores.experience} />
                    <ScoreBar label="Skills"                value={scores.skills} />
                    <ScoreBar label="Keywords"              value={scores.keywords} />
                    <ScoreBar label="Recruiter visibility"  value={scores.recruiterVisibility} />
                    <ScoreBar label="ATS compatibility"     value={scores.atsCompatibility} />
                    <ScoreBar label="International readiness" value={scores.internationalReadiness} />
                  </CardContent>
                </Card>
              )}

              {phase === "done" && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardContent className="pt-4 space-y-2">
                    <a href={`/api/linkedin-optimize/${draftId}/report.pdf`} target="_blank" rel="noopener">
                      <Button variant="outline" className="w-full border-slate-700 text-white hover:bg-slate-800">
                        <Download className="h-4 w-4 mr-2" />
                        Download PDF report
                      </Button>
                    </a>
                    <Button onClick={saveVersion} variant="outline" className="w-full border-slate-700 text-white hover:bg-slate-800">
                      <History className="h-4 w-4 mr-2" />
                      Save version
                    </Button>
                    <Button onClick={() => setPhase("input")} variant="ghost" className="w-full text-gray-400 hover:text-white">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Edit input
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Middle + right: progress + rewrites */}
            <div className="lg:col-span-2 space-y-4">
              {/* Progress */}
              <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                <CardContent className="pt-4 space-y-1.5">
                  {progress.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {p.done
                        ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                        : <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />}
                      <span className={p.done ? "text-gray-400" : "text-white"}>{p.msg}</span>
                    </div>
                  ))}
                  {progress.length === 0 && (
                    <div className="text-sm text-gray-500 py-2">Warming up the AI...</div>
                  )}
                </CardContent>
              </Card>

              {/* Explanations (when scores land) */}
              {scores?.explanations && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader><CardTitle className="text-sm text-white flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-400" />
                    Why these scores
                  </CardTitle></CardHeader>
                  <CardContent className="text-xs text-gray-300 space-y-2">
                    {scores.explanations.headline    && <p><b className="text-gray-100">Headline:</b> {scores.explanations.headline}</p>}
                    {scores.explanations.about       && <p><b className="text-gray-100">About:</b> {scores.explanations.about}</p>}
                    {scores.explanations.experience  && <p><b className="text-gray-100">Experience:</b> {scores.explanations.experience}</p>}
                    {scores.explanations.keywords    && <p><b className="text-gray-100">Keywords:</b> {scores.explanations.keywords}</p>}
                    {scores.explanations.recruiterVisibility && <p><b className="text-gray-100">Recruiter visibility:</b> {scores.explanations.recruiterVisibility}</p>}
                  </CardContent>
                </Card>
              )}

              {/* Headline before / after */}
              {rewrite?.headline && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm text-white">Headline</CardTitle>
                    <CopyBtn text={rewrite.headline} />
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="text-xs text-gray-500">Before</div>
                    <div className="p-2 rounded bg-slate-800/40 text-gray-400 line-through">
                      {input.currentHeadline || "—"}
                    </div>
                    <div className="text-xs text-blue-400">After</div>
                    <div className="p-2 rounded bg-blue-950/30 border border-blue-800/50 text-white">
                      <Typewriter text={rewrite.headline} speed={10} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* About */}
              {rewrite?.about && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm text-white">About</CardTitle>
                    <CopyBtn text={rewrite.about} />
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="p-3 rounded bg-blue-950/30 border border-blue-800/50 text-gray-100 whitespace-pre-wrap leading-relaxed">
                      <Typewriter text={rewrite.about} speed={5} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Experience */}
              {rewrite?.experience && rewrite.experience.length > 0 && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm text-white">Experience</CardTitle>
                    <CopyBtn text={rewrite.experience.map((e) =>
                      `${e.role} @ ${e.company}\n${e.bullets.map((b) => `• ${b}`).join("\n")}`
                    ).join("\n\n")} />
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {rewrite.experience.map((e, i) => (
                      <div key={i} className="p-2 rounded bg-slate-800/40">
                        <div className="font-semibold text-white">{e.role}</div>
                        <div className="text-xs text-gray-400 mb-1">{e.company}</div>
                        <ul className="text-xs text-gray-200 space-y-1">
                          {e.bullets.map((b, j) => <li key={j}>• {b}</li>)}
                        </ul>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Skills */}
              {rewrite?.skills && rewrite.skills.length > 0 && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm text-white">Recommended skills</CardTitle>
                    <CopyBtn text={rewrite.skills.join(", ")} />
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {rewrite.skills.map((s, i) => (
                        <Badge key={i} className="bg-blue-950/40 border border-blue-800/50 text-blue-100">{s}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Keywords */}
              {rewrite?.keywords && rewrite.keywords.length > 0 && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm text-white">Recruiter search keywords</CardTitle>
                    <CopyBtn text={rewrite.keywords.join(", ")} />
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {rewrite.keywords.map((k, i) => (
                        <Badge key={i} className="bg-emerald-950/40 border border-emerald-800/50 text-emerald-100">{k}</Badge>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">
                      These are terms international recruiters type into LinkedIn search.
                      Weave them into your profile naturally.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* AI chat panel — only after first pass */}
              {phase === "done" && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader><CardTitle className="text-sm text-white flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-400" />
                    Refine with AI
                  </CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-xs text-gray-400">
                      Try: "target Canada", "make the headline stronger", "focus on nursing", "shorten the about".
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="What should the AI change?"
                        value={chatMsg}
                        onChange={(e) => setChatMsg(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") refine(); }}
                        disabled={refining}
                        className="bg-slate-800/60 border-slate-700 text-white"
                        data-testid="input-refine"
                      />
                      <Button onClick={refine} disabled={refining || !chatMsg.trim()}
                              className="bg-blue-600 hover:bg-blue-700 text-white">
                        {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ── Phase: error ────────────────────────────────────────── */}
        {phase === "error" && (
          <Card className="border-red-900 bg-red-950/40">
            <CardContent className="pt-6 pb-6 space-y-3 text-center">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
              <h2 className="text-lg font-bold text-white">Optimization failed</h2>
              <p className="text-sm text-red-200">{errMsg || "Please try again."}</p>
              <Button onClick={() => setPhase("input")} className="bg-red-600 hover:bg-red-700 text-white">Try again</Button>
            </CardContent>
          </Card>
        )}

        <div className="text-[11px] text-gray-600 text-center pt-4">
          AI-generated content is a suggestion. Always verify facts before publishing to LinkedIn.
        </div>
      </div>
    </div>
  );
}
