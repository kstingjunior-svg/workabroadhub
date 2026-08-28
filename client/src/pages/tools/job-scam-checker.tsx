/**
 * Job Scam Checker — premium AI investigation dashboard.
 *
 * 2026-07 (Tony's founder brief): "The AI should investigate overseas job
 * opportunities... Never simply answer 'This job is genuine.' Instead
 * explain WHY."
 *
 * Route: /tools/job-scam-checker
 * Backend: POST /api/tools/job-scam-check
 *
 * Accepts either pasted text (WhatsApp chat / email / job ad) OR an image
 * upload (screenshot / offer letter) — or both.
 */

import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  Info, ExternalLink, ChevronDown, ChevronUp, Camera, RefreshCw,
  Phone, Mail, Globe, Building2, MessageSquare, DollarSign, Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";

interface SubScore { key: string; label: string; score: number; detail: string; }
interface Finding  {
  id: string;
  label: string;
  severity: "hard" | "soft" | "info";
  category: "phone" | "url" | "text" | "payment" | "recruitment" | "identity";
  detail: string;
  actionable?: string;
}
interface CountryPanel {
  code: string; name: string; flag: string;
  links: Record<string, string | null>;
  contacts: Record<string, string | null>;
  nextStepAdvice: string;
}
interface CheckResponse {
  ok: true;
  overallTrust: number; confidence: number;
  riskBand: "low" | "medium" | "high" | "critical";
  verdict: "trustworthy" | "verify_first" | "suspicious" | "high_risk";
  headline: string; explanation: string;
  extractedFields: Record<string, any>;
  country: CountryPanel | null;
  subScores: SubScore[];
  findings: Finding[];
  positiveIndicators: string[];
  recommendations: string[];
  scamPatternsMatched: string[];
  disclaimer: string;
}

const VERDICT_STYLES = {
  trustworthy: {
    bg: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    accent: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900",
    icon: ShieldCheck,
    label: "Looks legitimate",
  },
  verify_first: {
    bg: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    accent: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900",
    icon: Info,
    label: "Verify before proceeding",
  },
  suspicious: {
    bg: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-400",
    accent: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900",
    icon: ShieldAlert,
    label: "Suspicious",
  },
  high_risk: {
    bg: "bg-red-600",
    text: "text-red-700 dark:text-red-400",
    accent: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900",
    icon: AlertTriangle,
    label: "High risk — likely scam",
  },
} as const;

export default function JobScamCheckerPage() {
  usePageSeo({
    title:       "Free Job Scam Checker — Spot Fake Overseas Job Offers in Seconds | WorkAbroad Hub",
    description: "Paste any suspicious job posting, agency message, or offer letter. Get instant AI analysis identifying red flags: fake salaries, unreliable agencies, upfront-fee scams, and phishing signs. Free.",
    path:        "/tools/job-scam-checker",
    keywords:    ["job scam checker kenya", "fake job offer check", "recruitment scam detector kenya", "overseas job scam verify"],
  });

  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  // 2026-08 (Tony): accept PDF + Word forwards too — many scam job ads
  // arrive as WhatsApp PDF attachments or DOC files. Server extracts text
  // and merges with any pasted text before analysis.
  const ACCEPTED_MIMES = new Set<string>([
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ]);

  function handleFile(f: File | null) {
    if (!f) return;
    const isAccepted = ACCEPTED_MIMES.has(f.type) || /\.(pdf|docx?|jpe?g|png|webp)$/i.test(f.name);
    if (!isAccepted) {
      toast({ title: "Unsupported file type", description: "Screenshot (JPG/PNG/WEBP) or the file itself (PDF or Word).", variant: "destructive" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload under 10 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setResult(null);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  async function handleCheck() {
    if (!text.trim() && !file) {
      toast({ title: "Nothing to check", description: "Paste the chat text OR upload a screenshot (or both).", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      if (text.trim()) form.append("text", text.trim());
      if (file)         form.append("file", file);
      // 2026-07 (production CSRF fix): every mutating request needs the token.
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/tools/job-scam-check", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
        body: form,
      });
      const data = await res.json();
      if (!data.ok) {
        toast({ title: "Couldn't complete the check", description: data.message || "Please try again.", variant: "destructive" });
      } else {
        setResult(data);
      }
    } catch {
      toast({ title: "Network issue", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setText("");
    setFile(null);
    setPreview(null);
    setResult(null);
    setShowTechnical(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-xs font-semibold">
            <Search className="h-3.5 w-3.5" />
            AI JOB SCAM INVESTIGATOR
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Is this job real?</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-lg mx-auto leading-relaxed">
            Paste the WhatsApp chat, email, or job ad. Upload a screenshot too if you have one. We check the recruiter, payment method, phone number, salary, and 40+ scam patterns.
          </p>
        </div>

        {!result && (
          <Card className="border-2 border-teal-200 dark:border-teal-900">
            <CardContent className="pt-6 pb-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-1.5">
                  <MessageSquare className="h-4 w-4" />
                  Paste chat, email, or job ad
                </label>
                <Textarea
                  placeholder="Paste the WhatsApp message, email body, or job description here…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  className="text-sm"
                  data-testid="input-scam-text"
                />
                <p className="text-[11px] text-gray-500 mt-1">Anything you paste stays private — we analyze then discard.</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-1.5">
                  <Camera className="h-4 w-4" />
                  Or attach a screenshot (optional)
                </label>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                  data-testid="input-scam-file"
                />
                {!file ? (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="w-full py-4 border-2 border-dashed border-teal-300 dark:border-teal-800 rounded-lg hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition text-sm text-gray-600 dark:text-gray-400"
                    data-testid="button-pick-scam-file"
                  >
                    Tap to attach a screenshot, PDF, or Word document (WhatsApp / email / offer letter)
                  </button>
                ) : (
                  <div className="space-y-2">
                    {preview ? (
                      <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 max-h-60">
                        <img src={preview} alt="Evidence" className="w-full h-auto object-contain max-h-60" />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 flex items-center gap-3 bg-gray-50 dark:bg-gray-900/50" data-testid="scam-doc-card">
                        <div className="h-10 w-10 rounded-md bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300">
                            {/\.pdf$/i.test(file.name) ? "PDF" : "DOC"}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900 dark:text-white truncate text-sm">{file.name}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            {(file.size / 1024).toFixed(0)} KB · text will be scanned for scam patterns
                          </p>
                        </div>
                      </div>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={() => { setFile(null); setPreview(null); if (inputRef.current) inputRef.current.value = ""; }}>
                      Remove file
                    </Button>
                  </div>
                )}
              </div>

              <Button
                onClick={handleCheck}
                disabled={loading || (!text.trim() && !file)}
                className="w-full h-12 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold"
                data-testid="button-run-scam-check"
              >
                {loading ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Investigating (up to 30 sec)…</> : <><ShieldCheck className="h-5 w-5 mr-2" /> Check this job</>}
              </Button>

              <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-1.5 leading-relaxed pt-2 border-t border-gray-100 dark:border-gray-800">
                <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <span>This is an AI screening — not a legal determination. Always verify through official government portals before making decisions.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <ResultView
            result={result}
            showTechnical={showTechnical}
            onToggleTechnical={() => setShowTechnical((v) => !v)}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
}

function ResultView({ result, showTechnical, onToggleTechnical, onReset }: {
  result: CheckResponse; showTechnical: boolean; onToggleTechnical: () => void; onReset: () => void;
}) {
  const style = VERDICT_STYLES[result.verdict];
  const Icon = style.icon;
  const hardFindings = result.findings.filter((f) => f.severity === "hard" || f.severity === "soft");

  return (
    <div className="space-y-4">
      <Card className={`border-2 ${style.accent}`}>
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className={`h-14 w-14 rounded-full ${style.bg} flex items-center justify-center flex-shrink-0`}>
              <Icon className="h-7 w-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs uppercase tracking-widest font-bold ${style.text}`}>{style.label}</p>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mt-0.5 leading-tight">{result.headline}</h2>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mt-2">{result.explanation}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <TrustGauge value={result.overallTrust} label="Overall Trust" />
            <TrustGauge value={result.confidence} label="AI Confidence" muted />
          </div>
        </CardContent>
      </Card>

      <EvidenceSummary fields={result.extractedFields} country={result.country} />

      {hardFindings.length > 0 && (
        <ConcernsPanel findings={hardFindings} />
      )}

      {result.country && <GovLinksPanel country={result.country} />}
      <RecommendationsPanel recommendations={result.recommendations} />

      {result.scamPatternsMatched.length > 0 && (
        <ScamPatternsPanel patterns={result.scamPatternsMatched} country={result.country?.name || "this country"} />
      )}

      <Card>
        <CardContent className="pt-4 pb-4">
          <button
            type="button"
            onClick={onToggleTechnical}
            className="w-full flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white"
          >
            <span>Investigation Report ({result.subScores.length + result.findings.length} checks)</span>
            {showTechnical ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showTechnical && (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sub-scores</p>
                {result.subScores.map((s) => (
                  <div key={s.key} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{s.label}</span>
                      <span className="font-bold">{Math.round(s.score)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full ${s.score >= 80 ? "bg-emerald-500" : s.score >= 60 ? "bg-amber-500" : s.score >= 40 ? "bg-orange-500" : "bg-red-600"}`}
                        style={{ width: `${Math.max(4, s.score)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">{s.detail}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">All findings</p>
                {result.findings.map((f) => <FindingRow key={f.id} finding={f} />)}
              </div>
              {result.positiveIndicators.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Positive observations</p>
                  {result.positiveIndicators.map((i, idx) => (
                    <div key={`p-${idx}`} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 dark:text-gray-300">{i}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onReset} className="flex-1" data-testid="button-check-another">
          <RefreshCw className="h-4 w-4 mr-2" /> Check another
        </Button>
      </div>
      <p className="text-[11px] text-center text-gray-500 dark:text-gray-400 leading-relaxed">{result.disclaimer}</p>
    </div>
  );
}

function TrustGauge({ value, label, muted = false }: { value: number; label: string; muted?: boolean }) {
  const color = value >= 80 ? "text-emerald-600" : value >= 60 ? "text-amber-600" : value >= 40 ? "text-orange-600" : "text-red-600";
  return (
    <div className="text-center">
      <div className={`text-3xl font-extrabold ${muted ? "text-gray-500 dark:text-gray-400" : color}`}>{value}%</div>
      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function EvidenceSummary({ fields, country }: { fields: Record<string, any>; country: CountryPanel | null }) {
  const rows: [string, string, React.ReactNode][] = [];
  if (fields.employerName)     rows.push(["Employer",           fields.employerName,           <Building2 className="h-3.5 w-3.5" />]);
  if (fields.jobTitle)         rows.push(["Job title",          fields.jobTitle,               <Search className="h-3.5 w-3.5" />]);
  if (fields.recruiterName)    rows.push(["Recruiter",          fields.recruiterName,          <Search className="h-3.5 w-3.5" />]);
  if (fields.recruiterEmail)   rows.push(["Recruiter email",   fields.recruiterEmail,         <Mail className="h-3.5 w-3.5" />]);
  if (fields.recruiterPhone)   rows.push(["Recruiter phone",   fields.recruiterPhone,         <Phone className="h-3.5 w-3.5" />]);
  if (fields.companyWebsite)   rows.push(["Website",            fields.companyWebsite,         <Globe className="h-3.5 w-3.5" />]);
  if (fields.salaryText)       rows.push(["Salary",             fields.salaryText,             <DollarSign className="h-3.5 w-3.5" />]);
  if (fields.recruitmentAgency) rows.push(["Agency",            fields.recruitmentAgency,     <Building2 className="h-3.5 w-3.5" />]);
  return (
    <Card>
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-center gap-3">
          <Search className="h-6 w-6 text-teal-600 dark:text-teal-400" />
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 font-semibold">What we extracted</p>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {fields.employerName || fields.recruiterName || "Evidence analyzed"}
            </h3>
          </div>
          {country && <span className="text-2xl" title={country.name}>{country.flag}</span>}
        </div>
        {rows.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-gray-200 dark:border-gray-800 text-sm">
            {rows.map(([label, value, icon]) => (
              <div key={label}>
                <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1">{icon} {label}</p>
                <p className="text-gray-900 dark:text-white font-medium truncate">{value}</p>
              </div>
            ))}
          </div>
        )}
        {rows.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-800">
            The evidence didn't contain enough clearly-identifiable fields to extract details — but scam-pattern detection still ran on the text.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ConcernsPanel({ findings }: { findings: Finding[] }) {
  const hardCount = findings.filter(f => f.severity === "hard").length;
  return (
    <Card className={`border-2 ${hardCount > 0 ? "border-red-400 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900" : "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900"}`}>
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`h-5 w-5 ${hardCount > 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} />
          <p className={`font-bold ${hardCount > 0 ? "text-red-900 dark:text-red-200" : "text-amber-900 dark:text-amber-200"}`}>
            {hardCount > 0
              ? `${hardCount} critical scam indicator${hardCount === 1 ? "" : "s"} detected`
              : `${findings.length} concern${findings.length === 1 ? "" : "s"} detected`}
          </p>
        </div>
        <div className="space-y-3">
          {findings.map((f) => (
            <div key={f.id} className={`rounded-md p-3 ${f.severity === "hard" ? "bg-red-100/70 dark:bg-red-950/30" : "bg-amber-100/60 dark:bg-amber-950/25"}`}>
              <p className={`text-sm font-semibold ${f.severity === "hard" ? "text-red-900 dark:text-red-200" : "text-amber-900 dark:text-amber-200"}`}>
                {f.severity === "hard" ? "❌" : "⚠️"} {f.label}
              </p>
              <p className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed mt-1">{f.detail}</p>
              {f.actionable && (
                <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed mt-1.5 pl-3 border-l-2 border-current/30">
                  <strong>What to do:</strong> {f.actionable}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function GovLinksPanel({ country }: { country: CountryPanel }) {
  const linkRows: [string, string | null, typeof Globe][] = [
    ["Employer / Sponsor Registry",  country.links.employerCheck,     Building2],
    ["Recruitment Agency Check",     country.links.recruitmentCheck,  Building2],
    ["Work Permit Info",             country.links.workPermitChecker, ShieldCheck],
    ["Immigration Department",       country.links.immigration,       Globe],
    ["Labour Ministry",              country.links.labourMinistry,    Building2],
    ["Embassy in Kenya",             country.links.embassyInKenya,    Globe],
    ["Fraud Reporting",              country.links.fraudReporting,    AlertTriangle],
    ["Kenya MFA (Consular)",         country.links.kenyaConsularSupport, Globe],
  ];
  const available = linkRows.filter(([, url]) => !!url);
  return (
    <Card className="border-teal-200 dark:border-teal-900 bg-teal-50/40 dark:bg-teal-950/10">
      <CardContent className="pt-5 pb-5 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-teal-700 dark:text-teal-400 font-bold">Official Verification — {country.name}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">{country.nextStepAdvice}</p>
        </div>
        <div className="grid gap-1.5 pt-3 border-t border-teal-200 dark:border-teal-900">
          {available.map(([label, url, IconLink]) => (
            <a key={label} href={url!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-teal-700 dark:text-teal-400 hover:underline">
              <IconLink className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
            </a>
          ))}
        </div>
        {(country.contacts.embassyPhone || country.contacts.embassyEmail) && (
          <div className="pt-3 border-t border-teal-200 dark:border-teal-900 space-y-1 text-xs text-gray-700 dark:text-gray-300">
            <p className="font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider text-[11px]">Direct contact</p>
            {country.contacts.embassyPhone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> Embassy: {country.contacts.embassyPhone}</div>}
            {country.contacts.embassyEmail && <div className="flex items-center gap-1.5"><Mail  className="h-3 w-3" /> {country.contacts.embassyEmail}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecommendationsPanel({ recommendations }: { recommendations: string[] }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 font-bold mb-3">What to do next</p>
        <ol className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          {recommendations.map((rec, idx) => (
            <li key={idx} className="flex items-start gap-2 leading-relaxed">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 text-xs font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
              <span>{rec}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function ScamPatternsPanel({ patterns, country }: { patterns: string[]; country: string }) {
  return (
    <Card className="border-amber-400 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
      <CardContent className="pt-5 pb-5 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <p className="font-bold text-amber-900 dark:text-amber-200">Known {country} scam patterns — watch for these</p>
        </div>
        <ul className="space-y-1.5 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
          {patterns.map((p, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              <span className="text-amber-500 mt-0.5">•</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const Icon = finding.severity === "hard" ? XCircle
             : finding.severity === "soft" ? AlertTriangle
             :                                 Info;
  const color = finding.severity === "hard" ? "text-red-500"
              : finding.severity === "soft" ? "text-amber-500"
              :                                 "text-blue-500";
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${color}`} />
      <div>
        <span className="font-semibold text-gray-900 dark:text-white">{finding.label}:</span>{" "}
        <span className="text-gray-700 dark:text-gray-300">{finding.detail}</span>
      </div>
    </div>
  );
}
