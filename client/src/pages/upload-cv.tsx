import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";
import {
  Upload,
  FileText,
  CheckCircle,
  Sparkles,
  ArrowRight,
  MessageCircle,
  Loader2,
  Globe,
  ChevronRight,
} from "lucide-react";

/** Fire-and-forget CV funnel event — never throws, never blocks UI. */
async function trackFunnelEvent(event: string, meta: Record<string, unknown> = {}) {
  try {
    await fetch("/api/analytics/cv-funnel", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, meta }),
    });
  } catch { /* silent */ }
}

const WA_LINK =
  "https://wa.me/254742619777?text=Hi%20Nanjila%2C%20I%20want%20to%20upload%20my%20CV%20for%20overseas%20job%20matching";

const MATCH_COUNTRIES = [
  { flag: "🇬🇧", name: "United Kingdom", desc: "NHS · Tier 2 Visa" },
  { flag: "🇨🇦", name: "Canada", desc: "Express Entry · PNP" },
  { flag: "🇦🇺", name: "Australia", desc: "Skilled Migration" },
  { flag: "🇩🇪", name: "Germany", desc: "EU Blue Card" },
  { flag: "🇦🇪", name: "UAE / Gulf", desc: "Tax-Free · Fast Visa" },
  { flag: "🇺🇸", name: "USA", desc: "H-1B · EB-3" },
];

interface MatchResult {
  score: number;
  grade: string;
  summary: string;
  strengths?: string[];
  suggestions?: string[];
  missingKeywords?: string[];
}

export default function UploadCVPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);

  const [matchedJobs, setMatchedJobs]     = useState<any[]>([]);
  const [cvMatchLocked, setCvMatchLocked] = useState(false);

  useEffect(() => {
    fetch("/api/cv-matches", { credentials: "include" })
      .then(res => { if (res.status === 403) { setCvMatchLocked(true); return null; } return res.json(); })
      .then(data => { if (data && Array.isArray(data)) setMatchedJobs(data); })
      .catch(() => {});
  }, []);

  const { data: userPlan } = useQuery<{ planId: string } | null>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
  });
  const isPro = userPlan?.planId === "pro";

  const { mutate: analyseCV, isPending } = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append("cv", f);
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/tools/ats-check", {
        method: "POST",
        body: form,
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Analysis failed");
      }
      return res.json() as Promise<MatchResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      trackFunnelEvent("viewed_jobs", { atsScore: data.score, atsGrade: data.grade });
    },
    onError: (err: any) =>
      toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const handleFile = useCallback(
    (f: File) => {
      const allowed = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (!allowed.includes(f.type)) {
        toast({ title: "Wrong file type", description: "Please upload a PDF or DOCX file.", variant: "destructive" });
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast({ title: "File too large", description: "Maximum file size is 10 MB.", variant: "destructive" });
        return;
      }
      setFile(f);
      setResult(null);
      analyseCV(f);
    },
    [analyseCV, toast]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const scoreColor =
    result && result.score >= 70
      ? "#10b981"
      : result && result.score >= 45
      ? "#f59e0b"
      : "#ef4444";

  return (
    <div className="min-h-screen bg-[#F9F8F6] dark:bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-12">

        {/* ── Hero ── */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-full px-4 py-1.5 text-xs font-medium text-[#5A6A7A] dark:text-gray-400 mb-5">
            <Sparkles size={13} className="text-amber-500" />
            Powered by Nanjila AI · Matches in under 60 seconds
          </div>
          <h1 className="text-4xl sm:text-5xl font-serif font-medium text-[#1A2530] dark:text-white mb-4 leading-tight">
            📄 Upload Your CV.<br />Get Matched Instantly.
          </h1>
          <p className="text-lg text-[#5A6A7A] dark:text-gray-400 max-w-xl mx-auto">
            Nanjila will analyse your experience and show you overseas jobs you qualify for — in under 60 seconds.
          </p>
        </div>

        {/* ── Upload area ── */}
        {!result && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !isPending && fileRef.current?.click()}
            data-testid="cv-upload-dropzone"
            className={`relative flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed cursor-pointer transition-all duration-200 py-16 px-8 bg-white dark:bg-gray-800 ${
              dragOver
                ? "border-[#4A7C59] bg-[#F0FBF4] dark:bg-gray-700"
                : "border-[#D1CEC8] dark:border-gray-600 hover:border-[#4A7C59] hover:bg-[#F9F8F6] dark:hover:bg-gray-700"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              data-testid="cv-file-input"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />

            {isPending ? (
              <>
                <Loader2 size={48} className="text-[#4A7C59] animate-spin" />
                <div className="text-center">
                  <p className="text-lg font-semibold text-[#1A2530] dark:text-white">Nanjila is analysing your CV…</p>
                  <p className="text-sm text-[#5A6A7A] dark:text-gray-400 mt-1">Matching against 1,200+ overseas jobs</p>
                </div>
                <div className="flex gap-3 mt-2">
                  {["Reading CV", "Extracting skills", "Matching jobs"].map((step, i) => (
                    <span
                      key={step}
                      className="text-xs px-3 py-1 rounded-full text-[#4A7C59] font-medium"
                      style={{ background: "#E8F5E9", opacity: 0.6 + i * 0.2 }}
                    >
                      {step}
                    </span>
                  ))}
                </div>
              </>
            ) : file ? (
              <>
                <CheckCircle size={48} className="text-[#4A7C59]" />
                <div className="text-center">
                  <p className="text-lg font-semibold text-[#1A2530] dark:text-white">{file.name}</p>
                  <p className="text-sm text-[#5A6A7A] dark:text-gray-400 mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB · Analysis complete
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="h-20 w-20 rounded-2xl bg-[#F0FBF4] dark:bg-gray-700 flex items-center justify-center">
                  <Upload size={36} className="text-[#4A7C59]" />
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold text-[#1A2530] dark:text-white mb-1">
                    📁 Drop your CV here or click to choose
                  </p>
                  <p className="text-sm text-[#7A8A9A] dark:text-gray-500">PDF or Word · Max 10 MB</p>
                </div>
                <button
                  type="button"
                  data-testid="button-choose-cv"
                  className="mt-2 px-8 py-3 rounded-full text-white font-semibold text-sm transition-all"
                  style={{ background: "#1A2530" }}
                  onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                >
                  Choose CV File
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Results ── */}
        {result && (
          <div className="space-y-5">
            {/* Score card */}
            <div className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Score ring */}
                <div className="relative h-32 w-32 shrink-0">
                  <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="50" fill="none"
                      stroke={scoreColor} strokeWidth="10"
                      strokeDasharray={2 * Math.PI * 50}
                      strokeDashoffset={2 * Math.PI * 50 * (1 - result.score / 100)}
                      strokeLinecap="round"
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold" style={{ color: scoreColor }}>{result.score}</span>
                    <span className="text-xs text-[#7A8A9A] font-medium">{result.grade}</span>
                  </div>
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h2 className="text-xl font-serif font-semibold text-[#1A2530] dark:text-white mb-2">
                    Your CV ATS Score
                  </h2>
                  <p className="text-sm text-[#5A6A7A] dark:text-gray-400 leading-relaxed">{result.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2 justify-center sm:justify-start">
                    <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: result.score >= 70 ? "#E8F5E9" : "#FEF9C3", color: result.score >= 70 ? "#166534" : "#854d0e" }}>
                      {result.score >= 70 ? "✅ ATS-Safe" : result.score >= 45 ? "⚠️ Needs improvement" : "❌ High rejection risk"}
                    </span>
                    {file && (
                      <span className="text-xs px-3 py-1 rounded-full bg-[#F0F4FF] text-[#3730a3] font-medium">
                        <FileText size={11} className="inline mr-1" />{file.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Strengths */}
            {result.strengths && result.strengths.length > 0 && (
              <div className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-[#1A2530] dark:text-white uppercase tracking-wide mb-3">✅ Strengths</h3>
                <ul className="space-y-2">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[#5A6A7A] dark:text-gray-400">
                      <CheckCircle size={14} className="text-[#4A7C59] shrink-0 mt-0.5" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggestions */}
            {result.suggestions && result.suggestions.length > 0 && (
              <div className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-[#1A2530] dark:text-white uppercase tracking-wide mb-3">💡 Improvements</h3>
                <ul className="space-y-2">
                  {result.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[#5A6A7A] dark:text-gray-400">
                      <ChevronRight size={14} className="text-amber-500 shrink-0 mt-0.5" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Country matches */}
            <div className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Globe size={16} className="text-[#4A7C59]" />
                <h3 className="text-sm font-semibold text-[#1A2530] dark:text-white uppercase tracking-wide">
                  ✨ Your Top Destination Matches
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {MATCH_COUNTRIES.map((c) => (
                  <div
                    key={c.name}
                    className="flex flex-col items-center text-center p-3 rounded-xl bg-[#F9F8F6] dark:bg-gray-700 border border-[#EDE9E2] dark:border-gray-600"
                  >
                    <span className="text-3xl mb-1">{c.flag}</span>
                    <span className="text-xs font-semibold text-[#1A2530] dark:text-white">{c.name}</span>
                    <span className="text-[10px] text-[#7A8A9A] dark:text-gray-500 mt-0.5">{c.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CV matching — locked for free users */}
            {cvMatchLocked && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 flex items-start gap-3">
                <span className="text-2xl">🔒</span>
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">CV Matching is a PRO feature</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 mb-3">Upgrade to PRO to see the top 10 jobs matched to your CV with a compatibility score.</p>
                  <Link href="/pricing" data-testid="link-upgrade-cv-match" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors">
                    Upgrade to PRO <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            )}

            {/* CV-matched jobs */}
            {matchedJobs.length > 0 && (
              <div className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-5">
                <h2 className="text-lg font-bold text-[#1A2530] dark:text-white mb-3">🔥 Jobs Matching Your CV</h2>
                <div className="space-y-2">
                  {matchedJobs.map(job => (
                    <div key={job.id} data-testid={`card-cv-match-${job.id}`} className="rounded-xl bg-[#F9F8F6] dark:bg-gray-700 border border-[#EDE9E2] dark:border-gray-600 px-4 py-3">
                      <p className="text-sm font-medium text-[#1A2530] dark:text-gray-100" data-testid={`text-cv-match-title-${job.id}`}>
                        {job.title} <span className="text-[#4A7C59] dark:text-emerald-400">(Score: {job.score})</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/global-opportunities"
                data-testid="link-view-opportunities"
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-white font-semibold text-sm transition-all hover:opacity-90"
                style={{ background: "#1A2530" }}
                onClick={() => trackFunnelEvent("clicked_apply", { destination: "global_opportunities", atsScore: result?.score })}
              >
                View All Overseas Jobs <ArrowRight size={16} />
              </Link>
              <Link
                href="/tools/ats-cv-checker"
                data-testid="link-full-ats"
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-sm border-2 border-[#1A2530] dark:border-white text-[#1A2530] dark:text-white transition-all hover:bg-[#1A2530] hover:text-white dark:hover:bg-white dark:hover:text-[#1A2530]"
              >
                Full ATS Report
              </Link>
            </div>

            {/* Try again */}
            <button
              onClick={() => { setFile(null); setResult(null); }}
              data-testid="button-reupload-cv"
              className="w-full text-sm text-[#7A8A9A] dark:text-gray-500 hover:text-[#1A2530] dark:hover:text-white transition-colors py-2"
            >
              ↑ Upload a different CV
            </button>
          </div>
        )}

        {/* ── WhatsApp alternative ── */}
        <div className="mt-8 flex items-center justify-center gap-3 text-sm text-[#5A6A7A] dark:text-gray-400">
          <MessageCircle size={16} className="text-[#25D366]" />
          <span>Prefer WhatsApp?</span>
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-whatsapp-cv"
            className="font-semibold text-[#1A2530] dark:text-white underline underline-offset-2 hover:text-[#4A7C59] dark:hover:text-emerald-400 transition-colors"
          >
            Send CV to Nanjila →
          </a>
        </div>

        {/* ── How it works ── */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          {[
            { step: "1", icon: "📁", title: "Upload your CV", desc: "PDF or Word accepted. Under 10 MB." },
            { step: "2", icon: "🤖", title: "Nanjila analyses it", desc: "AI reads your skills, experience & qualifications." },
            { step: "3", icon: "🌍", title: "Get matched", desc: "See which countries & jobs you qualify for now." },
          ].map((s) => (
            <div key={s.step} className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-5">
              <div className="text-3xl mb-2">{s.icon}</div>
              <h3 className="text-sm font-semibold text-[#1A2530] dark:text-white mb-1">{s.title}</h3>
              <p className="text-xs text-[#7A8A9A] dark:text-gray-500">{s.desc}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
