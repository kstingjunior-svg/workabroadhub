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
  History, Upload, Users, Search, FileText, Target, Star,
  Briefcase, PenLine, MessagesSquare, Undo2,
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
  // v2 extended sections
  languages?:       string[];
  awards?:          string;
  projects?:        string;
  licenses?:        string;
  volunteer?:       string;
  targetRole?:      string;
  targetCountry?:   string;
  targetCountries?: string[];
  toneVariant?:     "professional" | "leadership" | "friendly" | "executive" | "technical" | "international";
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
  profileCompleteness?: number;
  professionalBranding?: number;
  networkingReadiness?: number;
  countryMatch?: Record<string, number>;
  explanations?: {
    headline?: string;
    about?: string;
    experience?: string;
    skills?: string;
    keywords?: string;
    recruiterVisibility?: string;
  };
}

interface HeadlineVariants {
  professional?: string;
  executive?:    string;
  international?: string;
  countryFocus?:  string;
  keywordDense?:  string;
}

interface KeywordAnalysis {
  detected?:    string[];
  missing?:     string[];
  highValue?:   string[];
  competition?: string;
  suggestions?: string[];
}

interface RecruiterView {
  headline?:            string;
  aboutSnippet?:        string;
  topSkills?:           string[];
  searchKeywords?:      string[];
  experienceSummary?:   string;
  visibilityRating?:    "Low" | "Medium" | "High" | "Very High";
  recruiterVerdict?:    string;
}

interface InterviewPrep {
  questions?: Array<{ question: string; tip: string; sample: string }>;
  overallCoaching?: string;
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
    languages: [], awards: "", projects: "", licenses: "", volunteer: "",
    targetRole: "", targetCountry: "Canada", targetCountries: ["Canada"],
  });
  const [skillInput,    setSkillInput]    = useState("");
  const [languageInput, setLanguageInput] = useState("");
  const [inputMode,     setInputMode]     = useState<"upload" | "paste" | "manual">("manual");
  const [pastedText,    setPastedText]    = useState("");
  const [uploading,     setUploading]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Chat
  const [chatMsg, setChatMsg] = useState("");
  const [refining, setRefining] = useState(false);

  // v2 panels
  const [headlineVariants, setHeadlineVariants] = useState<HeadlineVariants | null>(null);
  const [headlineLoading,  setHeadlineLoading]  = useState(false);
  const [toneLoading,      setToneLoading]      = useState<string | null>(null);
  const [kwAnalysis,       setKwAnalysis]       = useState<KeywordAnalysis | null>(null);
  const [kwLoading,        setKwLoading]        = useState(false);
  const [recruiterView,    setRecruiterView]    = useState<RecruiterView | null>(null);
  const [rvLoading,        setRvLoading]        = useState(false);
  const [showTools,        setShowTools]        = useState<"none" | "network" | "post" | "interview">("none");
  const [netMsg,           setNetMsg]           = useState<string>("");
  const [postOut,          setPostOut]          = useState<{ post: string; hashtags: string[] } | null>(null);
  const [interviewPrep,    setInterviewPrep]    = useState<InterviewPrep | null>(null);
  const [toolBusy,         setToolBusy]         = useState(false);
  const [versions,         setVersions]         = useState<Array<{ at: string; note: string; output: any }>>([]);
  const [saveStatus,       setSaveStatus]       = useState<"idle" | "saving" | "saved">("idle");

  const esRef = useRef<EventSource | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Gate: Pro only ──────────────────────────────────────────────────
  const isPro = useMemo(() => isPaidUser((user as any)?.plan), [user]);

  useEffect(() => {
    return () => { if (esRef.current) esRef.current.close(); };
  }, []);

  // ── Auto-create draft on mount so auto-save + upload have an id ────
  useEffect(() => {
    if (draftId || !isPro || authLoading) return;
    (async () => {
      try {
        const csrf = await fetchCsrfToken();
        const res = await fetch("/api/linkedin-optimize/start", {
          method: "POST", credentials: "include", headers: { "X-CSRF-Token": csrf },
        });
        const j = await res.json();
        if (res.ok) setDraftId(j.id);
      } catch { /* handled on user action */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro, authLoading]);

  // ── Auto-save: debounce PUT /input whenever the form changes ─────────
  useEffect(() => {
    if (!draftId || phase !== "input") return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const csrf = await fetchCsrfToken();
        await fetch(`/api/linkedin-optimize/${draftId}/input`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify(input),
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1200);
      } catch {
        setSaveStatus("idle");
      }
    }, 1400);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [input, draftId, phase]);

  // ── CV upload handler ────────────────────────────────────────────────
  async function uploadCv(file: File) {
    setUploading(true);
    try {
      const csrf = await fetchCsrfToken();
      const fd = new FormData();
      fd.append("cv", file);
      const res = await fetch("/api/linkedin-optimize/parse-cv", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Parse failed");
      // Merge parsed fields into our input form
      const parsed = (j.input ?? {}) as ProfileInput;
      setInput((cur) => ({
        ...cur,
        ...parsed,
        experience: parsed.experience && parsed.experience.length > 0 ? parsed.experience : cur.experience,
        skills:     parsed.skills    && parsed.skills.length    > 0 ? parsed.skills    : cur.skills,
        languages:  parsed.languages && parsed.languages.length > 0 ? parsed.languages : cur.languages,
      }));
      setInputMode("manual"); // so user can review/edit
      toast({ title: "CV parsed", description: "Review the fields below, then click Start." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  // ── Paste-parse: treat pasted text as if it were a CV ────────────────
  async function parsePasted() {
    if (!pastedText.trim()) return;
    setUploading(true);
    try {
      // Same endpoint accepts multipart, so wrap text in a Blob
      const csrf = await fetchCsrfToken();
      const blob = new Blob([pastedText], { type: "text/plain" });
      const fd = new FormData();
      fd.append("cv", blob, "pasted.txt");
      const res = await fetch("/api/linkedin-optimize/parse-cv", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Parse failed");
      const parsed = (j.input ?? {}) as ProfileInput;
      setInput((cur) => ({
        ...cur,
        ...parsed,
        experience: parsed.experience && parsed.experience.length > 0 ? parsed.experience : cur.experience,
        skills:     parsed.skills    && parsed.skills.length    > 0 ? parsed.skills    : cur.skills,
      }));
      setInputMode("manual");
      toast({ title: "Profile parsed" });
    } catch (err: any) {
      toast({ title: "Parse failed", description: err?.message ?? "", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  // ── v2 panel handlers ────────────────────────────────────────────────
  async function loadHeadlineVariants() {
    if (!draftId) return;
    setHeadlineLoading(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/linkedin-optimize/${draftId}/headline-variants`, {
        method: "POST", credentials: "include", headers: { "X-CSRF-Token": csrf },
      });
      const j = await res.json();
      if (res.ok) setHeadlineVariants(j.variants);
      else toast({ title: "Could not load variants", variant: "destructive" });
    } finally { setHeadlineLoading(false); }
  }

  async function pickHeadline(v: string) {
    if (!v || !rewrite) return;
    setRewrite({ ...rewrite, headline: v });
    toast({ title: "Headline applied" });
  }

  async function rewriteAboutInTone(tone: NonNullable<ProfileInput["toneVariant"]>) {
    if (!draftId) return;
    setToneLoading(tone);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/linkedin-optimize/${draftId}/about-tone`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ tone }),
      });
      const j = await res.json();
      if (res.ok && rewrite) setRewrite({ ...rewrite, about: j.about });
    } finally { setToneLoading(null); }
  }

  async function loadKwAnalysis() {
    if (!draftId) return;
    setKwLoading(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/linkedin-optimize/${draftId}/keyword-analysis`, {
        method: "POST", credentials: "include", headers: { "X-CSRF-Token": csrf },
      });
      const j = await res.json();
      if (res.ok) setKwAnalysis(j.analysis);
    } finally { setKwLoading(false); }
  }

  async function loadRecruiterView() {
    if (!draftId) return;
    setRvLoading(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/linkedin-optimize/${draftId}/recruiter-view`, {
        method: "POST", credentials: "include", headers: { "X-CSRF-Token": csrf },
      });
      const j = await res.json();
      if (res.ok) setRecruiterView(j.view);
    } finally { setRvLoading(false); }
  }

  async function draftNetworking(kind: string) {
    if (!draftId) return;
    setToolBusy(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/linkedin-optimize/${draftId}/networking`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ kind }),
      });
      const j = await res.json();
      if (res.ok) setNetMsg(j.message);
    } finally { setToolBusy(false); }
  }

  async function draftPost(category: string) {
    if (!draftId) return;
    setToolBusy(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/linkedin-optimize/${draftId}/post`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ category }),
      });
      const j = await res.json();
      if (res.ok) setPostOut({ post: j.post, hashtags: j.hashtags });
    } finally { setToolBusy(false); }
  }

  async function loadInterviewPrep() {
    if (!draftId) return;
    setToolBusy(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/linkedin-optimize/${draftId}/interview-prep`, {
        method: "POST", credentials: "include", headers: { "X-CSRF-Token": csrf },
      });
      const j = await res.json();
      if (res.ok) setInterviewPrep(j.prep);
    } finally { setToolBusy(false); }
  }

  async function loadVersions() {
    if (!draftId) return;
    try {
      const res = await fetch(`/api/linkedin-optimize/${draftId}`, { credentials: "include" });
      const j = await res.json();
      if (res.ok) setVersions(j.versions ?? []);
    } catch { /* silent */ }
  }

  async function restoreVersion(index: number) {
    if (!draftId) return;
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/linkedin-optimize/${draftId}/restore-version`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ index }),
      });
      const j = await res.json();
      if (res.ok) {
        setRewrite(j.output);
        loadVersions();
        toast({ title: "Version restored" });
      }
    } catch { /* silent */ }
  }

  function toggleTargetCountry(c: string) {
    setInput((cur) => {
      const set = new Set(cur.targetCountries ?? []);
      if (set.has(c)) set.delete(c); else set.add(c);
      const arr = Array.from(set);
      return { ...cur, targetCountries: arr, targetCountry: arr[0] ?? cur.targetCountry };
    });
  }
  function addLanguage() {
    const l = languageInput.trim();
    if (!l) return;
    setInput((cur) => ({ ...cur, languages: [...(cur.languages ?? []), l] }));
    setLanguageInput("");
  }

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
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                  Let's optimize your LinkedIn profile
                </CardTitle>
                <CardDescription className="text-gray-400 mt-1">
                  Upload a CV, paste your LinkedIn profile, or type manually.
                  Then click Start to watch the AI work in real time.
                </CardDescription>
              </div>
              {saveStatus !== "idle" && (
                <Badge className={saveStatus === "saving" ? "bg-amber-500/20 text-amber-200 border-amber-500/40" : "bg-green-500/20 text-green-200 border-green-500/40"}>
                  {saveStatus === "saving" ? "Saving..." : "Saved"}
                </Badge>
              )}
            </CardHeader>

            <CardContent className="space-y-5">
              {/* ── Input-mode tabs: Upload / Paste / Manual ───────── */}
              <div className="flex gap-2 border-b border-slate-800 pb-1">
                {[
                  { k: "upload" as const, label: "Upload CV",       icon: Upload },
                  { k: "paste"  as const, label: "Paste LinkedIn",  icon: PenLine },
                  { k: "manual" as const, label: "Manual entry",    icon: Briefcase },
                ].map((t) => {
                  const Icon = t.icon;
                  const active = inputMode === t.k;
                  return (
                    <button
                      key={t.k}
                      onClick={() => setInputMode(t.k)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-t flex items-center gap-1.5 border-b-2 transition-colors ${
                        active
                          ? "text-blue-300 border-blue-400"
                          : "text-gray-500 border-transparent hover:text-gray-300"
                      }`}
                      data-testid={`tab-${t.k}`}
                    >
                      <Icon className="h-3.5 w-3.5" /> {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Upload */}
              {inputMode === "upload" && (
                <div className="p-4 rounded-lg border-2 border-dashed border-slate-700 bg-slate-800/30 text-center space-y-3">
                  <Upload className="h-8 w-8 text-blue-400 mx-auto" />
                  <div className="text-sm text-gray-300">
                    Upload your CV (PDF or DOCX). We'll extract every field, and you can review it below.
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCv(f); }}
                    data-testid="input-cv-upload"
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || !draftId}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Parsing...</> : <><Upload className="h-4 w-4 mr-2" />Choose file</>}
                  </Button>
                  <div className="text-[11px] text-gray-500">Max 8 MB. Text-based PDFs work best.</div>
                </div>
              )}

              {/* Paste */}
              {inputMode === "paste" && (
                <div className="space-y-2">
                  <Textarea
                    rows={8}
                    className="bg-slate-800/60 border-slate-700 text-white"
                    placeholder="Paste your LinkedIn profile text here (headline, about, experience — anything you have)."
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    data-testid="textarea-paste"
                  />
                  <Button
                    onClick={parsePasted}
                    disabled={uploading || !pastedText.trim() || !draftId}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Parsing...</> : "Parse profile"}
                  </Button>
                </div>
              )}

              {/* Manual — always visible after upload/paste so user can review */}
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
                  <Label className="text-gray-300">Primary target country</Label>
                  <Select value={input.targetCountry ?? "Canada"} onValueChange={(v) => {
                    setInput({ ...input, targetCountry: v, targetCountries: [v, ...(input.targetCountries ?? []).filter((c) => c !== v)] });
                  }}>
                    <SelectTrigger className="bg-slate-800/60 border-slate-700 text-white" data-testid="select-target-country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Multi-country target picker */}
              <div className="space-y-2">
                <Label className="text-gray-300">Also score for these markets (click to toggle)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TARGET_COUNTRIES.map((c) => {
                    const active = (input.targetCountries ?? []).includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleTargetCountry(c)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          active
                            ? "bg-blue-500/25 border-blue-400 text-blue-100"
                            : "bg-slate-800/50 border-slate-700 text-gray-400 hover:text-gray-200 hover:border-slate-500"
                        }`}
                        data-testid={`toggle-country-${c}`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-500">
                  We compute a Country Match score for every market you pick.
                </p>
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

              {/* Extended optional sections */}
              <details className="rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-gray-300">
                  More sections (education, languages, awards, projects, licenses, volunteer)
                </summary>
                <div className="pt-3 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-gray-300">Education</Label>
                    <Textarea rows={2} className="bg-slate-900/60 border-slate-700 text-white"
                              placeholder="e.g. BSc Nursing, University of Nairobi, 2020"
                              value={input.education ?? ""}
                              onChange={(e) => setInput({ ...input, education: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-gray-300">Certifications</Label>
                    <Textarea rows={2} className="bg-slate-900/60 border-slate-700 text-white"
                              placeholder="e.g. NCLEX-RN, IELTS Academic 7.5, CSCS card"
                              value={input.certifications ?? ""}
                              onChange={(e) => setInput({ ...input, certifications: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-gray-300">Languages</Label>
                    <div className="flex gap-2">
                      <Input className="bg-slate-900/60 border-slate-700 text-white"
                             placeholder="e.g. English (fluent), Swahili (native)"
                             value={languageInput}
                             onChange={(e) => setLanguageInput(e.target.value)}
                             onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLanguage(); } }} />
                      <Button onClick={addLanguage} variant="outline" className="border-slate-700 text-gray-300">Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(input.languages ?? []).map((l, i) => (
                        <Badge key={i} onClick={() => setInput({ ...input, languages: (input.languages ?? []).filter((_, x) => x !== i) })}
                               className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-gray-100">{l} ×</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-gray-300">Awards</Label>
                      <Textarea rows={2} className="bg-slate-900/60 border-slate-700 text-white"
                                placeholder="e.g. Employee of the Year 2024"
                                value={input.awards ?? ""}
                                onChange={(e) => setInput({ ...input, awards: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-gray-300">Projects</Label>
                      <Textarea rows={2} className="bg-slate-900/60 border-slate-700 text-white"
                                placeholder="e.g. Rolled out the new inventory system across 3 stores."
                                value={input.projects ?? ""}
                                onChange={(e) => setInput({ ...input, projects: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-gray-300">Licenses</Label>
                      <Textarea rows={2} className="bg-slate-900/60 border-slate-700 text-white"
                                placeholder="e.g. UK NMC PIN pending, KE driving licence class BCE"
                                value={input.licenses ?? ""}
                                onChange={(e) => setInput({ ...input, licenses: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-gray-300">Volunteer</Label>
                      <Textarea rows={2} className="bg-slate-900/60 border-slate-700 text-white"
                                placeholder="e.g. Weekend medical camps, Red Cross Kenya, 2022–present"
                                value={input.volunteer ?? ""}
                                onChange={(e) => setInput({ ...input, volunteer: e.target.value })} />
                    </div>
                  </div>
                </div>
              </details>

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

              {/* Country match scores (multi-country) */}
              {scores?.countryMatch && Object.keys(scores.countryMatch).length > 0 && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader><CardTitle className="text-sm text-white flex items-center gap-2">
                    <Target className="h-4 w-4 text-emerald-400" />
                    Country match
                  </CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(scores.countryMatch)
                      .sort(([, a], [, b]) => (Number(b) - Number(a)))
                      .map(([country, val]) => (
                        <ScoreBar key={country} label={country} value={Number(val)} />
                      ))}
                  </CardContent>
                </Card>
              )}

              {/* Profile completeness checklist */}
              {rewrite && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader><CardTitle className="text-sm text-white flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-400" />
                    Profile completeness
                  </CardTitle></CardHeader>
                  <CardContent className="space-y-1.5 text-xs">
                    {[
                      { k: "Headline",        ok: !!rewrite.headline },
                      { k: "About",           ok: !!rewrite.about },
                      { k: "Experience",      ok: (rewrite.experience?.length ?? 0) > 0 },
                      { k: "Skills",          ok: (rewrite.skills?.length ?? 0) >= 5 },
                      { k: "Keywords",        ok: (rewrite.keywords?.length ?? 0) >= 10 },
                      { k: "Education",       ok: !!input.education },
                      { k: "Certifications",  ok: !!input.certifications },
                      { k: "Languages",       ok: (input.languages?.length ?? 0) > 0 },
                      { k: "Awards",          ok: !!input.awards },
                      { k: "Projects",        ok: !!input.projects },
                    ].map((r) => (
                      <div key={r.k} className="flex items-center gap-2">
                        {r.ok
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          : <div className="h-3.5 w-3.5 rounded-full border border-gray-600" />}
                        <span className={r.ok ? "text-gray-300" : "text-gray-500"}>{r.k}</span>
                      </div>
                    ))}
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
                    <Button onClick={loadVersions} variant="ghost" size="sm" className="w-full text-gray-400 hover:text-white">
                      Show history
                    </Button>
                    <Button onClick={() => setPhase("input")} variant="ghost" className="w-full text-gray-400 hover:text-white">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Edit input
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Version history */}
              {phase === "done" && versions.length > 0 && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader><CardTitle className="text-sm text-white flex items-center gap-2">
                    <History className="h-4 w-4 text-gray-400" />
                    Versions
                  </CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {versions.map((v, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-slate-800/40 border border-slate-700">
                        <div>
                          <div className="text-gray-200">{v.note}</div>
                          <div className="text-gray-500">{new Date(v.at).toLocaleString()}</div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => restoreVersion(i)}
                                className="text-blue-300 hover:text-blue-100 hover:bg-blue-900/30 h-6 px-2">
                          <Undo2 className="h-3 w-3 mr-1" /> Restore
                        </Button>
                      </div>
                    ))}
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
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={loadHeadlineVariants} disabled={headlineLoading}
                              className="text-blue-300 hover:text-blue-100 hover:bg-blue-950/40 h-7 text-xs">
                        {headlineLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-1" />5 variants</>}
                      </Button>
                      <CopyBtn text={rewrite.headline} />
                    </div>
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

                    {/* 5 headline variants */}
                    {headlineVariants && (
                      <div className="pt-3 space-y-2">
                        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                          Pick a different angle
                        </div>
                        {[
                          { k: "professional",  label: "Professional"  },
                          { k: "executive",     label: "Executive"     },
                          { k: "international", label: "International" },
                          { k: "countryFocus",  label: `${input.targetCountry ?? "Country"} focus` },
                          { k: "keywordDense",  label: "Keyword-dense" },
                        ].map((v) => {
                          const val = (headlineVariants as any)[v.k] as string | undefined;
                          if (!val) return null;
                          return (
                            <button
                              key={v.k}
                              onClick={() => pickHeadline(val)}
                              className="w-full text-left p-2 rounded border border-slate-700 bg-slate-800/40 hover:border-blue-500 hover:bg-blue-950/30 transition-colors"
                              data-testid={`headline-variant-${v.k}`}
                            >
                              <div className="text-[10px] uppercase tracking-wide text-blue-400 mb-0.5">{v.label}</div>
                              <div className="text-xs text-gray-100 leading-snug">{val}</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* About with tone picker */}
              {rewrite?.about && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm text-white">About</CardTitle>
                    <CopyBtn text={rewrite.about} />
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex flex-wrap gap-1.5">
                      {(["professional", "leadership", "friendly", "executive", "technical", "international"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => rewriteAboutInTone(t)}
                          disabled={toneLoading !== null}
                          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                            toneLoading === t
                              ? "bg-blue-500/30 border-blue-400 text-blue-100"
                              : "bg-slate-800/50 border-slate-700 text-gray-300 hover:border-blue-500 hover:text-blue-200"
                          }`}
                          data-testid={`tone-${t}`}
                        >
                          {toneLoading === t ? <Loader2 className="h-3 w-3 inline animate-spin mr-1" /> : null}
                          {t[0].toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
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

              {/* ── v2: Keyword Analysis panel ─────────────────────── */}
              {phase === "done" && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm text-white flex items-center gap-2">
                      <Search className="h-4 w-4 text-emerald-400" />
                      Keyword analysis
                    </CardTitle>
                    <Button size="sm" variant="ghost" onClick={loadKwAnalysis} disabled={kwLoading}
                            className="text-gray-400 hover:text-white h-7 text-xs">
                      {kwLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : (kwAnalysis ? "Refresh" : "Analyse")}
                    </Button>
                  </CardHeader>
                  {kwAnalysis && (
                    <CardContent className="space-y-3 text-xs">
                      {kwAnalysis.competition && (
                        <div className="text-gray-300 italic">"{kwAnalysis.competition}"</div>
                      )}
                      {(kwAnalysis.detected?.length ?? 0) > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-green-400 mb-1 font-semibold">Detected ({kwAnalysis.detected!.length})</div>
                          <div className="flex flex-wrap gap-1">
                            {kwAnalysis.detected!.map((k, i) => (
                              <Badge key={i} className="bg-green-950/40 border border-green-800/50 text-green-100 text-[10px]">{k}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {(kwAnalysis.highValue?.length ?? 0) > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-amber-400 mb-1 font-semibold">
                            <Star className="h-3 w-3 inline mr-1" />High-value missing ({kwAnalysis.highValue!.length})
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {kwAnalysis.highValue!.map((k, i) => (
                              <Badge key={i} className="bg-amber-950/40 border border-amber-700/50 text-amber-100 text-[10px]">{k}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {(kwAnalysis.missing?.length ?? 0) > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-red-400 mb-1 font-semibold">Also missing</div>
                          <div className="flex flex-wrap gap-1">
                            {kwAnalysis.missing!.filter((k) => !kwAnalysis.highValue?.includes(k)).map((k, i) => (
                              <Badge key={i} className="bg-red-950/40 border border-red-800/50 text-red-100 text-[10px]">{k}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {(kwAnalysis.suggestions?.length ?? 0) > 0 && (
                        <div className="pt-1 border-t border-slate-800">
                          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 font-semibold">How to weave them in</div>
                          <ul className="space-y-1 text-gray-300">
                            {kwAnalysis.suggestions!.map((s, i) => <li key={i}>• {s}</li>)}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              )}

              {/* ── v2: Recruiter View panel ─────────────────────────── */}
              {phase === "done" && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm text-white flex items-center gap-2">
                      <Users className="h-4 w-4 text-indigo-400" />
                      What a recruiter sees
                    </CardTitle>
                    <Button size="sm" variant="ghost" onClick={loadRecruiterView} disabled={rvLoading}
                            className="text-gray-400 hover:text-white h-7 text-xs">
                      {rvLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : (recruiterView ? "Refresh" : "Preview")}
                    </Button>
                  </CardHeader>
                  {recruiterView && (
                    <CardContent className="space-y-3 text-xs">
                      <div className="p-3 rounded-lg bg-white/95 text-gray-900 shadow-md">
                        <div className="text-[10px] uppercase text-gray-500 mb-1 tracking-wide font-semibold">Search result preview</div>
                        <div className="font-bold text-sm">{input.fullName || "Candidate"}</div>
                        <div className="text-xs text-gray-700 mb-1">{recruiterView.headline}</div>
                        <div className="text-[11px] text-gray-600 line-clamp-3">{recruiterView.aboutSnippet}</div>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-gray-500 font-semibold">Verdict: </span>
                        <span className="text-gray-200">{recruiterView.recruiterVerdict}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase text-gray-500 font-semibold">Visibility</span>
                        <Badge className={
                          recruiterView.visibilityRating === "Very High" ? "bg-green-500/25 text-green-100 border-green-500/40" :
                          recruiterView.visibilityRating === "High"      ? "bg-blue-500/25  text-blue-100  border-blue-500/40"  :
                          recruiterView.visibilityRating === "Medium"    ? "bg-amber-500/25 text-amber-100 border-amber-500/40" :
                                                                          "bg-red-500/25   text-red-100   border-red-500/40"
                        }>{recruiterView.visibilityRating}</Badge>
                      </div>
                      <div className="text-gray-300"><b className="text-gray-100">Recruiter would say:</b> "{recruiterView.experienceSummary}"</div>
                      {(recruiterView.topSkills?.length ?? 0) > 0 && (
                        <div>
                          <div className="text-[10px] uppercase text-gray-500 mb-1 font-semibold">Top skills recruiters notice</div>
                          <div className="flex flex-wrap gap-1">
                            {recruiterView.topSkills!.map((s, i) => (
                              <Badge key={i} className="bg-indigo-950/40 border border-indigo-800/50 text-indigo-100 text-[10px]">{s}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              )}

              {/* ── v2: Tools drawer (Networking / Post / Interview) ─── */}
              {phase === "done" && (
                <Card className="bg-slate-900/60 backdrop-blur border-slate-800">
                  <CardHeader><CardTitle className="text-sm text-white flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-blue-400" />
                    Career tools
                  </CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <Button size="sm" variant={showTools === "network" ? "default" : "outline"}
                              onClick={() => setShowTools(showTools === "network" ? "none" : "network")}
                              className={showTools === "network" ? "bg-blue-600 text-white" : "border-slate-700 text-gray-300"}>
                        <MessagesSquare className="h-3.5 w-3.5 mr-1" />Networking
                      </Button>
                      <Button size="sm" variant={showTools === "post" ? "default" : "outline"}
                              onClick={() => setShowTools(showTools === "post" ? "none" : "post")}
                              className={showTools === "post" ? "bg-blue-600 text-white" : "border-slate-700 text-gray-300"}>
                        <FileText className="h-3.5 w-3.5 mr-1" />Post
                      </Button>
                      <Button size="sm" variant={showTools === "interview" ? "default" : "outline"}
                              onClick={() => setShowTools(showTools === "interview" ? "none" : "interview")}
                              className={showTools === "interview" ? "bg-blue-600 text-white" : "border-slate-700 text-gray-300"}>
                        <Users className="h-3.5 w-3.5 mr-1" />Interview
                      </Button>
                    </div>

                    {/* Networking */}
                    {showTools === "network" && (
                      <div className="space-y-2 pt-2 border-t border-slate-800">
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { k: "connection_request", label: "Connection request" },
                            { k: "recruiter_intro",    label: "Recruiter intro" },
                            { k: "follow_up",          label: "Follow-up" },
                            { k: "thank_you",          label: "Thank-you" },
                          ].map((n) => (
                            <Button key={n.k} size="sm" variant="outline"
                                    onClick={() => draftNetworking(n.k)} disabled={toolBusy}
                                    className="border-slate-700 text-gray-300 text-xs">
                              {n.label}
                            </Button>
                          ))}
                        </div>
                        {netMsg && (
                          <div className="p-3 rounded bg-slate-800/50 border border-slate-700 text-xs text-gray-100 whitespace-pre-wrap relative">
                            <div className="absolute top-1 right-1"><CopyBtn text={netMsg} /></div>
                            {netMsg}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Post */}
                    {showTools === "post" && (
                      <div className="space-y-2 pt-2 border-t border-slate-800">
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { k: "career_growth",     label: "Career growth" },
                            { k: "certification",     label: "Certification" },
                            { k: "new_job",           label: "New job" },
                            { k: "networking",        label: "Networking" },
                            { k: "industry_insights", label: "Industry insight" },
                            { k: "job_search",        label: "Job search" },
                          ].map((c) => (
                            <Button key={c.k} size="sm" variant="outline"
                                    onClick={() => draftPost(c.k)} disabled={toolBusy}
                                    className="border-slate-700 text-gray-300 text-xs">
                              {c.label}
                            </Button>
                          ))}
                        </div>
                        {postOut && (
                          <div className="p-3 rounded bg-slate-800/50 border border-slate-700 text-xs text-gray-100 relative">
                            <div className="absolute top-1 right-1"><CopyBtn text={`${postOut.post}\n\n${postOut.hashtags.join(" ")}`} /></div>
                            <div className="whitespace-pre-wrap">{postOut.post}</div>
                            {postOut.hashtags.length > 0 && (
                              <div className="pt-2 flex flex-wrap gap-1">
                                {postOut.hashtags.map((h, i) => (
                                  <span key={i} className="text-blue-300">{h.startsWith("#") ? h : `#${h}`}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Interview */}
                    {showTools === "interview" && (
                      <div className="space-y-2 pt-2 border-t border-slate-800">
                        <Button size="sm" onClick={loadInterviewPrep} disabled={toolBusy}
                                className="bg-blue-600 hover:bg-blue-700 text-white">
                          {toolBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                          Generate 5 questions
                        </Button>
                        {interviewPrep?.overallCoaching && (
                          <div className="text-xs text-gray-300 italic p-2 rounded bg-slate-800/40">
                            {interviewPrep.overallCoaching}
                          </div>
                        )}
                        {(interviewPrep?.questions ?? []).map((q, i) => (
                          <div key={i} className="p-2 rounded bg-slate-800/40 border border-slate-700 space-y-1 text-xs">
                            <div className="font-semibold text-white">{i + 1}. {q.question}</div>
                            <div className="text-gray-400"><b className="text-gray-200">Tip:</b> {q.tip}</div>
                            <div className="text-gray-300 pl-2 border-l-2 border-blue-800/50"><b className="text-blue-300">Sample:</b> {q.sample}</div>
                          </div>
                        ))}
                      </div>
                    )}
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
