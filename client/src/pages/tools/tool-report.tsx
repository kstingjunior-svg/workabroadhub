import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import {
  FileText,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle,
  AlertCircle,
  Star,
  Copy,
  Check,
  ArrowRight,
  Eye,
  Share2,
  ExternalLink,
} from "lucide-react";
import { SiWhatsapp, SiFacebook } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────
interface ATSReportData {
  score: number;
  grade: string;
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  missingKeywords?: string[];
  suggestions?: string[];
}

interface ScamReportData {
  riskLevel: "low" | "medium" | "high";
  riskScore: number;
  warningSignals: string[];
  recommendations: string[];
}

interface ToolReportRecord {
  id: string;
  toolName: "ats" | "scam";
  reportData: ATSReportData | ScamReportData;
  views: number;
  shares: number;
  createdAt: string;
}

// ─── ATS Score Ring ───────────────────────────────────────────────────────────
function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference * (1 - score / 100);
  const color = score >= 70 ? "#10b981" : score >= 45 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative h-36 w-36 mx-auto">
      <svg className="h-36 w-36 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle cx="60" cy="60" r="54" fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-muted-foreground font-medium">{grade}</span>
      </div>
    </div>
  );
}

const SCAM_CONFIG = {
  low: { label: "Low Risk", icon: ShieldCheck, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/20", border: "border-green-200 dark:border-green-700", bar: "bg-green-500", badgeClass: "bg-green-100 text-green-700" },
  medium: { label: "Medium Risk", icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-700", bar: "bg-amber-500", badgeClass: "bg-amber-100 text-amber-700" },
  high: { label: "High Risk — Likely Scam", icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-700", bar: "bg-red-500", badgeClass: "bg-red-100 text-red-700" },
};

const TOOL_META = {
  ats: { label: "ATS CV Analysis", icon: FileText, color: "from-blue-600 to-blue-500", path: "/tools/ats-cv-checker", cta: "Check Your Own CV Free" },
  scam: { label: "Job Scam Analysis", icon: ShieldAlert, color: "from-red-600 to-red-500", path: "/tools/job-scam-checker", cta: "Check Your Own Job Advert Free" },
};

// ─── Share Buttons ────────────────────────────────────────────────────────────
function ShareBar({ reportUrl, toolName, reportId, views, shares }: { reportUrl: string; toolName: string; reportId: string; views: number; shares: number }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const { mutate: trackShare } = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tool-reports/${reportId}/share`),
  });

  const encode = (text: string) => encodeURIComponent(text);
  const meta = TOOL_META[toolName as keyof typeof TOOL_META];
  const shareText = `I just used the free ${meta.label} tool on WorkAbroad Hub 🌍 Check it out:`;

  const handleShare = (platform: string, url: string) => {
    trackShare();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(reportUrl).then(() => {
      setCopied(true);
      trackShare();
      toast({ title: "Link copied!", description: "Share it anywhere." });
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <Card className="border-slate-200 dark:border-slate-700">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Share2 className="h-4 w-4 text-blue-500" />
          <p className="text-sm font-semibold">Share This Report</p>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{views}</span>
            <span className="flex items-center gap-1"><Share2 className="h-3 w-3" />{shares}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button
            onClick={() => handleShare("whatsapp", `https://api.whatsapp.com/send?text=${encode(`${shareText} ${reportUrl}`)}`)}
            className="h-10 text-xs gap-1.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white border-0"
            data-testid="button-share-whatsapp"
          >
            <SiWhatsapp className="h-4 w-4" /> WhatsApp
          </Button>
          <Button
            onClick={() => handleShare("facebook", `https://www.facebook.com/sharer/sharer.php?u=${encode(reportUrl)}`)}
            className="h-10 text-xs gap-1.5 bg-[#1877F2] hover:bg-[#0d6be0] text-white border-0"
            data-testid="button-share-facebook"
          >
            <SiFacebook className="h-4 w-4" /> Facebook
          </Button>
          <Button
            onClick={() => handleShare("linkedin", `https://www.linkedin.com/sharing/share-offsite/?url=${encode(reportUrl)}`)}
            className="h-10 text-xs gap-1.5 bg-[#0A66C2] hover:bg-[#0958a8] text-white border-0"
            data-testid="button-share-linkedin"
          >
            <SiFacebook className="h-4 w-4" /> LinkedIn
          </Button>
          <Button
            onClick={handleCopy}
            variant="outline"
            className="h-10 text-xs gap-1.5"
            data-testid="button-copy-report-link"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy Link"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ATS Report View ──────────────────────────────────────────────────────────
function ATSReportView({ data }: { data: ATSReportData }) {
  const scoreColor = data.score >= 70 ? "text-green-600" : data.score >= 45 ? "text-amber-600" : "text-red-600";
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 text-center">
          <ScoreRing score={data.score} grade={data.grade} />
          <p className={`text-sm font-semibold mt-3 ${scoreColor}`}>
            {data.score >= 70 ? "Strong ATS Compatibility" : data.score >= 45 ? "Moderate — Improvements Needed" : "Weak — Significant Improvements Needed"}
          </p>
          {data.summary && <p className="text-xs text-muted-foreground mt-2 max-w-xs mx-auto">{data.summary}</p>}
        </CardContent>
      </Card>

      {data.strengths && data.strengths.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" />Strengths ({data.strengths.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" data-testid={`strength-${i}`}>
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />{s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.weaknesses && data.weaknesses.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" />Weaknesses ({data.weaknesses.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" data-testid={`weakness-${i}`}>
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />{w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.missingKeywords && data.missingKeywords.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-500" />Missing Keywords</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.missingKeywords.map((k, i) => (
                <Badge key={i} variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300" data-testid={`keyword-${i}`}>{k}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.suggestions && data.suggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Star className="h-4 w-4 text-blue-500" />Suggestions</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.suggestions.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" data-testid={`suggestion-${i}`}>
                  <span className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Scam Report View ─────────────────────────────────────────────────────────
function ScamReportView({ data }: { data: ScamReportData }) {
  const cfg = SCAM_CONFIG[data.riskLevel];
  const Icon = cfg.icon;
  return (
    <div className="space-y-4">
      <Card className={`${cfg.border} ${cfg.bg}`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <Icon className={`h-7 w-7 ${cfg.color}`} />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className={`font-bold text-base ${cfg.color}`} data-testid="text-risk-level">{cfg.label}</h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badgeClass}`}>Risk Score: {data.riskScore}/100</span>
              </div>
            </div>
          </div>
          <div className="h-2.5 bg-white/60 dark:bg-black/20 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`} style={{ width: `${data.riskScore}%` }} />
          </div>
        </CardContent>
      </Card>

      {data.warningSignals.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Warning Signals ({data.warningSignals.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.warningSignals.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" data-testid={`warning-${i}`}>
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />{w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.warningSignals.length === 0 && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <p className="text-sm">No common scam phrases detected in this advert.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-500" />Recommendations</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {data.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" data-testid={`recommendation-${i}`}>
                <span className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                {r}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Report Page ─────────────────────────────────────────────────────────
export default function ToolReport() {
  const params = useParams<{ toolName: string; reportId: string }>();
  const toolName = params.toolName as "ats" | "scam";
  const reportId = params.reportId;

  const { data: report, isLoading, isError } = useQuery<ToolReportRecord>({
    queryKey: ["/api/tool-reports", reportId],
    queryFn: () => fetch(`/api/tool-reports/${reportId}`).then((r) => { if (!r.ok) throw new Error("Not found"); return r.json(); }),
    enabled: !!reportId,
    staleTime: 30_000,
  });

  const meta = TOOL_META[toolName] ?? TOOL_META.ats;
  const MetaIcon = meta.icon;
  const reportUrl = typeof window !== "undefined" ? window.location.href : "";

  // Dynamic meta tags for SEO / OG
  useEffect(() => {
    if (!report) return;
    const toolLabel = meta.label;
    let title = `${toolLabel} Report | WorkAbroad Hub`;
    let desc = "View this shared tool report from WorkAbroad Hub — free career tools for Kenyans seeking overseas employment.";

    if (report.toolName === "ats") {
      const d = report.reportData as ATSReportData;
      title = `ATS CV Score: ${d.score}/100 — ${d.grade} | WorkAbroad Hub`;
      desc = `This CV scored ${d.score}/100 for ATS compatibility. ${d.summary ?? "See full analysis on WorkAbroad Hub."}`;
    } else if (report.toolName === "scam") {
      const d = report.reportData as ScamReportData;
      title = `Job Scam Check: ${SCAM_CONFIG[d.riskLevel]?.label} (${d.riskScore}/100) | WorkAbroad Hub`;
      desc = `Risk score ${d.riskScore}/100 — ${d.warningSignals.length} warning signal(s) detected. View the full scam analysis.`;
    }

    document.title = title;
    const setMeta = (name: string, content: string, prop = false) => {
      const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let el = document.querySelector(sel) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); if (prop) el.setAttribute("property", name); else el.setAttribute("name", name); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("description", desc);
    setMeta("og:title", title, true);
    setMeta("og:description", desc, true);
    setMeta("og:url", reportUrl, true);
    setMeta("og:type", "article", true);
    setMeta("og:site_name", "WorkAbroad Hub", true);
    setMeta("twitter:card", "summary");
    setMeta("twitter:title", title);
    setMeta("twitter:description", desc);
  }, [report, reportUrl, meta]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 rounded-full border-4 border-blue-400 border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Loading report…</p>
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <XCircle className="h-12 w-12 text-red-400" />
        <h1 className="text-lg font-bold">Report Not Found</h1>
        <p className="text-sm text-muted-foreground max-w-xs">This report may have been removed or the link is incorrect.</p>
        <Link href="/tools">
          <Button variant="outline" size="sm" className="gap-1">Back to Tools <ArrowRight className="h-3 w-3" /></Button>
        </Link>
      </div>
    );
  }

  const isAts = report.toolName === "ats";
  const isScam = report.toolName === "scam";

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className={`bg-gradient-to-r ${meta.color} px-4 pt-10 pb-6 text-white`}>
        <Link href="/tools">
          <button className="flex items-center gap-1 text-white/80 text-sm mb-4 hover:text-white" data-testid="link-back-tools">
            ← Tools
          </button>
        </Link>
        <div className="flex items-center gap-3 max-w-xl mx-auto">
          <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <MetaIcon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold" data-testid="text-report-title">{meta.label} Report</h1>
              <Badge className="bg-white/20 text-white border-white/30 text-xs">Shared Report</Badge>
            </div>
            <p className="text-white/70 text-xs flex items-center gap-2 mt-0.5">
              <Eye className="h-3 w-3" /> {report.views} views · {report.shares} shares
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-4 space-y-4">
        {/* Report results */}
        {isAts && <ATSReportView data={report.reportData as ATSReportData} />}
        {isScam && <ScamReportView data={report.reportData as ScamReportData} />}

        {/* Share buttons */}
        <ShareBar
          reportUrl={reportUrl}
          toolName={report.toolName}
          reportId={report.id}
          views={report.views}
          shares={report.shares}
        />

        {/* CTA — Try the tool yourself */}
        <Card className="bg-gradient-to-r from-blue-600 to-teal-600 border-0 text-white overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <MetaIcon className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base mb-1">Try This Tool Yourself</h3>
                <p className="text-white/80 text-sm mb-3">
                  {isAts
                    ? "Upload your own CV and get an instant ATS score, keyword analysis, and AI improvement tips — completely free."
                    : "Paste any job advert and instantly detect scam signals — fake fees, suspicious contacts, and high-risk phrases. Free, no sign-in needed."}
                </p>
                <Link href={meta.path}>
                  <Button
                    className="bg-white text-blue-700 hover:bg-blue-50 border-0 gap-1 font-semibold"
                    size="sm"
                    data-testid="button-try-tool"
                  >
                    {meta.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Related tools */}
        <div className="pb-2">
          <p className="text-xs text-muted-foreground font-semibold mb-2">More Free Tools</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/tools/ats-cv-checker"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2 flex items-center gap-1"><FileText className="h-3 w-3" /> ATS CV Checker</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <Link href="/tools/job-scam-checker"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2 flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> Scam Checker</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <Link href="/tools/visa-sponsorship-jobs"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Visa Jobs</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <Link href="/nea-agencies"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2 flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Verify Agency</span></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
