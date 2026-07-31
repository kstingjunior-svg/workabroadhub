/**
 * Offer Letter Check — premium AI verification dashboard.
 *
 * 2026-07 (Tony's founder brief): "Build the world's most intelligent
 * Employment Offer Letter Verification Tool. The AI should behave like an
 * experienced HR manager, immigration officer, labour inspector, and
 * document forensic analyst."
 *
 * Route: /tools/offer-check
 * Backend: POST /api/tools/offer-verify (v2 AI engine — see analyzer.ts)
 * Legacy PDF fallback: POST /api/tools/offer-check (v1 heuristic).
 */

import { useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  Info, ExternalLink, ChevronDown, ChevronUp, Camera, RefreshCw, Phone,
  Mail, Globe, Building2, DollarSign, Briefcase,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";

interface SubScore { key: string; label: string; score: number; detail: string; }
interface Finding  { id: string; label: string; severity: "hard" | "soft" | "info"; detail: string; actionable?: string; }
interface CountryPanel {
  code: string; name: string; flag: string;
  links: Record<string, string | null>;
  contacts: Record<string, string | null>;
  nextStepAdvice: string;
}
interface SalaryAssessment {
  detected: boolean;
  occupationLabel: string | null;
  offeredMonthly: number | null;
  currency: string | null;
  expectedMonthlyMin: number | null;
  expectedMonthlyMax: number | null;
  band: "below_range" | "in_range" | "above_range" | "too_high" | "unknown";
  explanation: string;
}
interface VerifyResponse {
  ok: true;
  overallTrust: number; confidence: number;
  riskBand: "low" | "medium" | "high" | "critical";
  verdict: "trustworthy" | "verify_first" | "suspicious" | "high_risk";
  headline: string; explanation: string;
  extractedFields: Record<string, any>;
  country: CountryPanel | null;
  subScores: SubScore[];
  findings: Finding[];
  salaryAssessment: SalaryAssessment;
  positiveIndicators: string[];
  negativeIndicators: string[];
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
    label: "Well-structured offer",
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
    label: "Serious concerns",
  },
  high_risk: {
    bg: "bg-red-600",
    text: "text-red-700 dark:text-red-400",
    accent: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900",
    icon: AlertTriangle,
    label: "High risk — likely scam",
  },
} as const;

export default function OfferCheckPage() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  function handleFile(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast({ title: "Please upload an image", description: "JPG, PNG or WEBP — a clear photo of the offer letter works best.", variant: "destructive" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload something under 10 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setResult(null);
    setPreview(URL.createObjectURL(f));
  }

  async function handleVerify() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      // 2026-07 (production CSRF fix): every mutating request needs the token.
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/tools/offer-verify", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
        body: form,
      });
      const data = await res.json();
      if (!data.ok) {
        toast({ title: "Couldn't verify", description: data.message || "Please try again with a clearer image.", variant: "destructive" });
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
            <Briefcase className="h-3.5 w-3.5" />
            AI OFFER LETTER VERIFICATION
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Verify any job offer</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-lg mx-auto leading-relaxed">
            Our AI reads the letter, checks the employer, benchmarks the salary against real market rates, flags scam patterns, and shows you where to verify with the government.
          </p>
        </div>

        {!result && (
          <Card className="border-2 border-dashed border-teal-300 dark:border-teal-800">
            <CardContent className="pt-6 pb-6 space-y-4">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="hidden"
                data-testid="input-offer-file"
              />

              {!preview ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-3 py-8 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 rounded-lg transition"
                  data-testid="button-pick-offer"
                >
                  <div className="h-16 w-16 rounded-full bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center">
                    <Camera className="h-8 w-8 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 dark:text-white">Take or upload a photo</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">JPG, PNG or WEBP · up to 10 MB · a clear photo of the letter works</p>
                  </div>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 max-h-80">
                    <img src={preview} alt="Offer preview" className="w-full h-auto object-contain max-h-80" />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleVerify}
                      disabled={loading}
                      className="flex-1 h-12 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold"
                      data-testid="button-verify-offer"
                    >
                      {loading ? (
                        <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Verifying (up to 30 sec)…</>
                      ) : (
                        <><ShieldCheck className="h-5 w-5 mr-2" /> Verify this offer</>
                      )}
                    </Button>
                    <Button variant="outline" onClick={handleReset} disabled={loading} data-testid="button-change-offer">
                      Change
                    </Button>
                  </div>
                </div>
              )}

              <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-1.5 leading-relaxed pt-2 border-t border-gray-100 dark:border-gray-800">
                <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <span>Your offer letter is analyzed then discarded. We never store the original. This is a screening, not an official verification.</span>
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
  result: VerifyResponse; showTechnical: boolean; onToggleTechnical: () => void; onReset: () => void;
}) {
  const style = VERDICT_STYLES[result.verdict];
  const Icon = style.icon;
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

      <CompanyProfileCard fields={result.extractedFields} country={result.country} />
      <SalaryAssessmentCard salary={result.salaryAssessment} />
      <ScamAlertPanel findings={result.findings.filter(f => f.severity === "hard" || f.severity === "soft")} />
      {result.country && <GovLinksPanel country={result.country} />}
      <RecommendationsPanel recommendations={result.recommendations} />
      {result.scamPatternsMatched.length > 0 && (
        <CountryScamsPanel patterns={result.scamPatternsMatched} country={result.country?.name || "this country"} />
      )}

      <Card>
        <CardContent className="pt-4 pb-4">
          <button
            type="button"
            onClick={onToggleTechnical}
            className="w-full flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white"
          >
            <span>Technical Report ({result.subScores.length + result.findings.length} checks)</span>
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
                      <span className="font-bold">{s.score}%</span>
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
              {(result.positiveIndicators.length > 0 || result.negativeIndicators.length > 0) && (
                <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Forensic observations</p>
                  {result.positiveIndicators.map((i, idx) => (
                    <div key={`p-${idx}`} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 dark:text-gray-300">{i}</span>
                    </div>
                  ))}
                  {result.negativeIndicators.map((i, idx) => (
                    <div key={`n-${idx}`} className="flex items-start gap-2 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
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
        <Button variant="outline" onClick={onReset} className="flex-1" data-testid="button-verify-another-offer">
          <RefreshCw className="h-4 w-4 mr-2" /> Verify another offer
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

function CompanyProfileCard({ fields, country }: { fields: Record<string, any>; country: CountryPanel | null }) {
  const displayRows: [string, string][] = useMemo(() => {
    const rows: [string, string][] = [];
    if (fields.employerName)              rows.push(["Employer",           fields.employerName]);
    if (fields.jobTitle)                  rows.push(["Job title",          fields.jobTitle]);
    if (fields.workLocation)              rows.push(["Location",           fields.workLocation]);
    if (fields.startDate)                 rows.push(["Start date",         fields.startDate]);
    if (fields.contractDuration)          rows.push(["Contract duration", fields.contractDuration]);
    if (fields.probationPeriod)           rows.push(["Probation",          fields.probationPeriod]);
    if (fields.recruiterName)             rows.push(["Recruiter",          fields.recruiterName]);
    if (fields.recruiterEmail)            rows.push(["Recruiter email",   fields.recruiterEmail]);
    if (fields.recruiterPhone)            rows.push(["Recruiter phone",   fields.recruiterPhone]);
    if (fields.companyWebsite)            rows.push(["Website",            fields.companyWebsite]);
    if (fields.companyRegistrationNumber) rows.push(["Registration",       fields.companyRegistrationNumber]);
    return rows;
  }, [fields]);

  return (
    <Card>
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-teal-600 dark:text-teal-400" />
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 font-semibold">Company & Offer</p>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">{fields.employerName || "Unknown employer"}</h3>
          </div>
          {country && <span className="text-2xl" title={country.name}>{country.flag}</span>}
        </div>
        {displayRows.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-gray-200 dark:border-gray-800 text-sm">
            {displayRows.map(([label, value]) => (
              <div key={label}>
                <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{label}</p>
                <p className="text-gray-900 dark:text-white font-medium truncate">{value}</p>
              </div>
            ))}
          </div>
        )}
        {fields.benefits && Array.isArray(fields.benefits) && fields.benefits.length > 0 && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Benefits</p>
            <div className="flex flex-wrap gap-1.5">
              {fields.benefits.map((b: string, idx: number) => (
                <span key={idx} className="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300">{b}</span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SalaryAssessmentCard({ salary }: { salary: SalaryAssessment }) {
  if (!salary.detected && salary.band === "unknown") {
    return (
      <Card>
        <CardContent className="pt-5 pb-5 flex items-start gap-3">
          <DollarSign className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Salary check</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">{salary.explanation}</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  const bandStyle = {
    below_range: { color: "text-red-600 dark:text-red-400",     bg: "bg-red-50 dark:bg-red-950/20",     border: "border-red-200 dark:border-red-900",     label: "BELOW RANGE" },
    in_range:    { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/20", border: "border-emerald-200 dark:border-emerald-900", label: "MATCHES MARKET" },
    above_range: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20", border: "border-amber-200 dark:border-amber-900", label: "ABOVE RANGE" },
    too_high:    { color: "text-red-600 dark:text-red-400",     bg: "bg-red-50 dark:bg-red-950/20",     border: "border-red-200 dark:border-red-900",     label: "UNREALISTIC" },
    unknown:     { color: "text-gray-600 dark:text-gray-400",   bg: "bg-gray-50 dark:bg-gray-900",      border: "border-gray-200 dark:border-gray-800",   label: "UNKNOWN" },
  }[salary.band];

  return (
    <Card className={`border-2 ${bandStyle.border} ${bandStyle.bg}`}>
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className={`h-5 w-5 ${bandStyle.color}`} />
            <p className="text-sm font-bold text-gray-900 dark:text-white">Salary check</p>
          </div>
          <span className={`text-[10px] uppercase tracking-widest font-bold ${bandStyle.color}`}>{bandStyle.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Offered</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {salary.offeredMonthly ? `${salary.offeredMonthly.toLocaleString()} ${salary.currency}` : "—"}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">per month</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Market range</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {salary.expectedMonthlyMin && salary.expectedMonthlyMax
                ? `${salary.expectedMonthlyMin.toLocaleString()}–${salary.expectedMonthlyMax.toLocaleString()} ${salary.currency}`
                : "—"}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{salary.occupationLabel ?? "per month"}</p>
          </div>
        </div>
        <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed pt-2 border-t border-current/10">{salary.explanation}</p>
      </CardContent>
    </Card>
  );
}

function ScamAlertPanel({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) return null;
  const hardCount = findings.filter(f => f.severity === "hard").length;
  return (
    <Card className={`border-2 ${hardCount > 0 ? "border-red-400 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900" : "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900"}`}>
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`h-5 w-5 ${hardCount > 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} />
          <p className={`font-bold ${hardCount > 0 ? "text-red-900 dark:text-red-200" : "text-amber-900 dark:text-amber-200"}`}>
            {hardCount > 0 ? `${hardCount} critical scam indicator${hardCount === 1 ? "" : "s"} detected` : `${findings.length} concern${findings.length === 1 ? "" : "s"} detected`}
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
          <p className="text-xs uppercase tracking-widest text-teal-700 dark:text-teal-400 font-bold">Official Verification Channels — {country.name}</p>
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

function CountryScamsPanel({ patterns, country }: { patterns: string[]; country: string }) {
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
