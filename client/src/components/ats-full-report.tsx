/**
 * ATS Full Report — v1
 *
 * Renders the 18-section deep analysis emitted by the ATS Career Intelligence
 * Engine 3.0 (server/lib/ats-analysis-engine.ts). Wired into
 * /tools/ats-cv-checker as a paid-tier section that appears BELOW the legacy
 * strengths / weaknesses / keywords / suggestions cards, so free users keep
 * seeing the summary they know and paid users get everything.
 *
 * The report is progressive-disclosure: the Executive Summary and headline
 * Employability score sit at the top always-visible, everything else is in an
 * accordion so users can drill into what matters to them without a wall of
 * text on first paint.
 *
 * All 18 sections render defensively — if the AI omits a field the section
 * hides quietly rather than showing an empty card. Nothing here calls the
 * server; this is a pure presentation component.
 */

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Target,
  Users,
  Eye,
  Bot,
  BookOpen,
  Briefcase,
  Search,
  Globe,
  Flag,
  BarChart3,
  Award,
  MessageSquare,
  GraduationCap,
  ListChecks,
  Wand2,
  Gavel,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────

interface SubScore { score: number; note: string }

export interface ATSFullReportData {
  executiveSummary?: string;

  employability?: {
    overall: number;
    subscores: Record<string, SubScore>;
  };

  atsCompatibility?: {
    overall: number;
    subscores: Record<string, SubScore>;
  };

  recruiterReview?: {
    wouldShortlist: boolean;
    wouldInterview: boolean;
    impressedBy: string;
    concerns: string[];
    strongestSection: string;
    weakestSection: string;
    reasoning: string;
  };

  firstImpression?: {
    standsOutFirst: string;
    attractsAttention: string[];
    getsIgnored: string[];
    scanFriendly: boolean;
    summaryCreatesInterest: boolean;
    verdict: string;
  };

  humanAuthenticity?: {
    score: number;
    aiDetectionRisk: "Low" | "Medium" | "High";
    aiLikeSections: string[];
    naturalAlternatives: Array<{ aiLike: string; natural: string }>;
  };

  careerStory?: {
    hasCompellingNarrative: boolean;
    progression: string;
    stability: string;
    employmentGaps: string[];
    industryTransitions: string[];
    verdict: string;
  };

  experienceQuality?: Array<{
    role: string;
    employer: string;
    issues: string[];
    improvedBullets: Array<{ before: string; after: string }>;
  }>;

  keywordIntelligence?: {
    existing: string[];
    missing: {
      critical: string[];
      important: string[];
      optional: string[];
    };
    explanations: Array<{ keyword: string; whyItMatters: string }>;
  };

  jobMatch?: null | {
    overall: number;
    skills: number;
    experience: number;
    education: number;
    industry: number;
    keyword: number;
    responsibility: number;
    culture: number;
    missingQualifications: string[];
    suggestedImprovements: string[];
  };

  industryAlignment?: {
    detectedIndustry: string;
    alignmentScore: number;
    expectedVocabularyPresent: string[];
    expectedVocabularyMissing: string[];
  };

  countryReadiness?: {
    targetCountry: string | null;
    readinessScore: number | null;
    countrySpecificImprovements: string[];
  };

  atsRiskReport?: Array<{
    severity: "Critical" | "High" | "Medium" | "Low";
    issue: string;
    whyItMatters: string;
    howToFix: string;
    estimatedScoreLift: number;
  }>;

  strengthHeatMap?: Array<{
    area: string;
    level: "Exceptional" | "Strong" | "Developing" | "Needs Improvement";
    reasoning: string;
  }>;

  interviewReadiness?: {
    likelihood: "High" | "Medium" | "Low";
    likelyQuestions: Array<{ question: string; prepHint: string }>;
    areasNeedingClarification: string[];
    preparationRecommendations: string[];
  };

  careerEnhancement?: {
    certifications: string[];
    technicalSkills: string[];
    softSkills: string[];
    professionalMemberships: string[];
    portfolioImprovements: string[];
    linkedinImprovements: string[];
    trainingOpportunities: string[];
    languageSkills: string[];
    careerDevelopment: string[];
  };

  actionPlan?: {
    priority1?: PlanItem[];
    priority2?: PlanItem[];
    priority3?: PlanItem[];
  };

  oneClickImprovements?: Array<{
    currentText: string;
    reason: string;
    recommendation: string;
    improved: string;
  }>;

  verdict?: string;
}

interface PlanItem {
  improve: string;
  why: string;
  how: string;
  expectedBenefit: string;
  impactOnInterview: "High" | "Medium" | "Low";
}

// ── Helper components ────────────────────────────────────────────────────

function scoreColor(n: number): string {
  if (n >= 80) return "text-emerald-600";
  if (n >= 60) return "text-amber-600";
  return "text-rose-600";
}

function scoreBar(n: number): string {
  if (n >= 80) return "bg-emerald-500";
  if (n >= 60) return "bg-amber-500";
  return "bg-rose-500";
}

function severityBadge(s: string): string {
  const map: Record<string, string> = {
    Critical:            "border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/30",
    High:                "border-orange-300 text-orange-700 bg-orange-50 dark:bg-orange-950/30",
    Medium:              "border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30",
    Low:                 "border-slate-300 text-slate-700 bg-slate-50 dark:bg-slate-950/30",
    Exceptional:         "border-emerald-400 text-emerald-800 bg-emerald-50 dark:bg-emerald-950/30",
    Strong:              "border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30",
    Developing:          "border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30",
    "Needs Improvement": "border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/30",
  };
  return map[s] ?? "border-slate-300 text-slate-700 bg-slate-50";
}

function SubScoreRow({ label, sub }: { label: string; sub: SubScore }) {
  const score = Math.max(0, Math.min(100, sub.score ?? 0));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium capitalize">
          {label.replace(/([A-Z])/g, " $1").trim()}
        </span>
        <span className={`font-mono font-bold ${scoreColor(score)}`}>{score}/100</span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${scoreBar(score)} transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
      {sub.note && <p className="text-xs text-muted-foreground leading-snug">{sub.note}</p>}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export function ATSFullReport({ report }: { report: ATSFullReportData | null | undefined }) {
  if (!report) return null;

  return (
    <div className="space-y-4" data-testid="ats-full-report">
      {/* Headline — Executive Summary + Employability score */}
      {(report.executiveSummary || report.employability) && (
        <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-transparent dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-blue-600" />
              Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.executiveSummary && (
              <p className="text-sm leading-relaxed">{report.executiveSummary}</p>
            )}
            {report.employability && (
              <div className="pt-3 border-t border-blue-100 dark:border-blue-900/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold">Overall Employability</span>
                  <span className={`text-3xl font-black ${scoreColor(report.employability.overall)}`}>
                    {report.employability.overall}
                    <span className="text-base font-normal text-muted-foreground">/100</span>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(report.employability.subscores ?? {}).map(([k, v]) => (
                    <SubScoreRow key={k} label={k} sub={v} />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Everything else — progressive disclosure via accordion */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            Full Report — 14 detailed sections
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Accordion type="multiple" className="w-full">

            {/* ATS Compatibility deep breakdown */}
            {report.atsCompatibility && (
              <AccordionItem value="ats">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-blue-600" />
                    ATS Compatibility &mdash; {report.atsCompatibility.overall}/100
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {Object.entries(report.atsCompatibility.subscores ?? {}).map(([k, v]) => (
                      <SubScoreRow key={k} label={k} sub={v} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Recruiter Review */}
            {report.recruiterReview && (
              <AccordionItem value="recruiter">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-600" />
                    Recruiter Review &mdash; {report.recruiterReview.wouldInterview ? "Would interview" : "Would not interview"}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className={report.recruiterReview.wouldShortlist ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-rose-300 text-rose-700 bg-rose-50"}>
                      {report.recruiterReview.wouldShortlist ? "✓ Would shortlist" : "✗ Would not shortlist"}
                    </Badge>
                    <Badge variant="outline" className={report.recruiterReview.wouldInterview ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-rose-300 text-rose-700 bg-rose-50"}>
                      {report.recruiterReview.wouldInterview ? "✓ Would interview" : "✗ Would not interview"}
                    </Badge>
                  </div>
                  <div className="text-sm space-y-2">
                    {report.recruiterReview.impressedBy && (
                      <p><strong className="text-emerald-700">Impressed by:</strong> {report.recruiterReview.impressedBy}</p>
                    )}
                    {report.recruiterReview.strongestSection && (
                      <p><strong>Strongest section:</strong> {report.recruiterReview.strongestSection}</p>
                    )}
                    {report.recruiterReview.weakestSection && (
                      <p><strong className="text-rose-700">Weakest section:</strong> {report.recruiterReview.weakestSection}</p>
                    )}
                    {report.recruiterReview.concerns?.length > 0 && (
                      <div>
                        <strong className="text-rose-700">Concerns:</strong>
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                          {report.recruiterReview.concerns.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                    )}
                    {report.recruiterReview.reasoning && (
                      <p className="text-muted-foreground italic pt-1 border-t border-border">{report.recruiterReview.reasoning}</p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* First Impression */}
            {report.firstImpression && (
              <AccordionItem value="first-impression">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-indigo-600" />
                    10-Second Recruiter Scan
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2 text-sm">
                  {report.firstImpression.standsOutFirst && (
                    <p><strong>Stands out first:</strong> {report.firstImpression.standsOutFirst}</p>
                  )}
                  {report.firstImpression.attractsAttention?.length > 0 && (
                    <div>
                      <strong className="text-emerald-700">Attracts attention:</strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        {report.firstImpression.attractsAttention.map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                  {report.firstImpression.getsIgnored?.length > 0 && (
                    <div>
                      <strong className="text-rose-700">Gets ignored:</strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        {report.firstImpression.getsIgnored.map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap pt-1">
                    <Badge variant="outline" className={report.firstImpression.scanFriendly ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-rose-300 text-rose-700 bg-rose-50"}>
                      Scan-friendly: {report.firstImpression.scanFriendly ? "yes" : "no"}
                    </Badge>
                    <Badge variant="outline" className={report.firstImpression.summaryCreatesInterest ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-rose-300 text-rose-700 bg-rose-50"}>
                      Summary creates interest: {report.firstImpression.summaryCreatesInterest ? "yes" : "no"}
                    </Badge>
                  </div>
                  {report.firstImpression.verdict && (
                    <p className="italic text-muted-foreground pt-1 border-t border-border">{report.firstImpression.verdict}</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Human Authenticity */}
            {report.humanAuthenticity && (
              <AccordionItem value="authenticity">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-cyan-600" />
                    Human Authenticity &mdash; {report.humanAuthenticity.score}/100
                    <Badge variant="outline" className={
                      report.humanAuthenticity.aiDetectionRisk === "Low" ? "border-emerald-300 text-emerald-700 bg-emerald-50 ml-1" :
                      report.humanAuthenticity.aiDetectionRisk === "Medium" ? "border-amber-300 text-amber-700 bg-amber-50 ml-1" :
                      "border-rose-300 text-rose-700 bg-rose-50 ml-1"
                    }>
                      AI risk: {report.humanAuthenticity.aiDetectionRisk}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2 text-sm">
                  {report.humanAuthenticity.aiLikeSections?.length > 0 && (
                    <div>
                      <strong>AI-like sections detected:</strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        {report.humanAuthenticity.aiLikeSections.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {report.humanAuthenticity.naturalAlternatives?.length > 0 && (
                    <div className="space-y-2">
                      <strong>Natural alternatives:</strong>
                      {report.humanAuthenticity.naturalAlternatives.map((alt, i) => (
                        <div key={i} className="border-l-2 border-cyan-300 pl-3 py-1 space-y-1">
                          <p className="text-rose-700 line-through">{alt.aiLike}</p>
                          <p className="text-emerald-700">→ {alt.natural}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Career Story */}
            {report.careerStory && (
              <AccordionItem value="story">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-emerald-600" />
                    Career Story
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pt-2 text-sm">
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className={report.careerStory.hasCompellingNarrative ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-rose-300 text-rose-700 bg-rose-50"}>
                      {report.careerStory.hasCompellingNarrative ? "✓ Compelling narrative" : "✗ Weak narrative"}
                    </Badge>
                  </div>
                  {report.careerStory.progression && <p><strong>Progression:</strong> {report.careerStory.progression}</p>}
                  {report.careerStory.stability && <p><strong>Stability:</strong> {report.careerStory.stability}</p>}
                  {report.careerStory.employmentGaps?.length > 0 && (
                    <p><strong>Employment gaps:</strong> {report.careerStory.employmentGaps.join(", ")}</p>
                  )}
                  {report.careerStory.industryTransitions?.length > 0 && (
                    <p><strong>Industry transitions:</strong> {report.careerStory.industryTransitions.join(", ")}</p>
                  )}
                  {report.careerStory.verdict && <p className="italic text-muted-foreground pt-1 border-t border-border">{report.careerStory.verdict}</p>}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Experience Quality */}
            {Array.isArray(report.experienceQuality) && report.experienceQuality.length > 0 && (
              <AccordionItem value="experience">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-amber-600" />
                    Experience Quality &mdash; {report.experienceQuality.length} role{report.experienceQuality.length === 1 ? "" : "s"}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2 text-sm">
                  {report.experienceQuality.map((r, i) => (
                    <div key={i} className="border-l-2 border-amber-300 pl-3 space-y-2">
                      <p className="font-semibold">{r.role} — {r.employer}</p>
                      {r.issues?.length > 0 && (
                        <div>
                          <strong className="text-rose-700 text-xs">Issues:</strong>
                          <ul className="list-disc pl-5 mt-1 space-y-1 text-xs">
                            {r.issues.map((iss, j) => <li key={j}>{iss}</li>)}
                          </ul>
                        </div>
                      )}
                      {r.improvedBullets?.length > 0 && (
                        <div className="space-y-2">
                          <strong className="text-xs">Improved bullets:</strong>
                          {r.improvedBullets.map((b, j) => (
                            <div key={j} className="text-xs space-y-1">
                              <p className="text-rose-700 line-through">{b.before}</p>
                              <p className="text-emerald-700">→ {b.after}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Keyword Intelligence */}
            {report.keywordIntelligence && (
              <AccordionItem value="keywords">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-blue-600" />
                    Keyword Intelligence
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2 text-sm">
                  {report.keywordIntelligence.missing?.critical?.length > 0 && (
                    <div>
                      <strong className="text-rose-700">Critical missing:</strong>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {report.keywordIntelligence.missing.critical.map((k, i) => (
                          <Badge key={i} variant="outline" className="border-rose-300 text-rose-700 bg-rose-50">{k}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.keywordIntelligence.missing?.important?.length > 0 && (
                    <div>
                      <strong className="text-amber-700">Important missing:</strong>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {report.keywordIntelligence.missing.important.map((k, i) => (
                          <Badge key={i} variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">{k}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.keywordIntelligence.missing?.optional?.length > 0 && (
                    <div>
                      <strong className="text-slate-700">Optional missing:</strong>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {report.keywordIntelligence.missing.optional.map((k, i) => (
                          <Badge key={i} variant="outline" className="border-slate-300 text-slate-700 bg-slate-50">{k}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.keywordIntelligence.explanations?.length > 0 && (
                    <div className="pt-2 border-t border-border space-y-1.5">
                      <strong>Why each keyword matters:</strong>
                      {report.keywordIntelligence.explanations.map((e, i) => (
                        <p key={i}><span className="font-mono font-semibold">{e.keyword}</span> — {e.whyItMatters}</p>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Industry Alignment */}
            {report.industryAlignment && (
              <AccordionItem value="industry">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-teal-600" />
                    Industry Alignment &mdash; {report.industryAlignment.alignmentScore}/100
                    {report.industryAlignment.detectedIndustry && (
                      <Badge variant="outline" className="ml-1">{report.industryAlignment.detectedIndustry}</Badge>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2 text-sm">
                  {report.industryAlignment.expectedVocabularyPresent?.length > 0 && (
                    <div>
                      <strong className="text-emerald-700">Expected vocabulary present:</strong>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {report.industryAlignment.expectedVocabularyPresent.map((k, i) => (
                          <Badge key={i} variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">{k}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.industryAlignment.expectedVocabularyMissing?.length > 0 && (
                    <div>
                      <strong className="text-rose-700">Expected vocabulary missing:</strong>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {report.industryAlignment.expectedVocabularyMissing.map((k, i) => (
                          <Badge key={i} variant="outline" className="border-rose-300 text-rose-700 bg-rose-50">{k}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Country Readiness */}
            {report.countryReadiness?.targetCountry && (
              <AccordionItem value="country">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Flag className="h-4 w-4 text-sky-600" />
                    Country Readiness &mdash; {report.countryReadiness.targetCountry}
                    {typeof report.countryReadiness.readinessScore === "number" && (
                      <span className={`font-mono font-bold ml-1 ${scoreColor(report.countryReadiness.readinessScore)}`}>
                        {report.countryReadiness.readinessScore}/100
                      </span>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pt-2 text-sm">
                  {report.countryReadiness.countrySpecificImprovements?.length > 0 && (
                    <div>
                      <strong>Country-specific improvements:</strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        {report.countryReadiness.countrySpecificImprovements.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* ATS Risk Report */}
            {Array.isArray(report.atsRiskReport) && report.atsRiskReport.length > 0 && (
              <AccordionItem value="risks">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                    ATS Risk Report &mdash; {report.atsRiskReport.length} issue{report.atsRiskReport.length === 1 ? "" : "s"}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2 text-sm">
                  {report.atsRiskReport.map((r, i) => (
                    <div key={i} className="border rounded-md p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={severityBadge(r.severity)}>
                          {r.severity}
                        </Badge>
                        {r.estimatedScoreLift > 0 && (
                          <span className="text-xs text-emerald-700 font-semibold">+{r.estimatedScoreLift} pts if fixed</span>
                        )}
                      </div>
                      <p className="font-semibold">{r.issue}</p>
                      <p className="text-xs text-muted-foreground">Why it matters: {r.whyItMatters}</p>
                      <p className="text-xs"><strong>How to fix:</strong> {r.howToFix}</p>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Strength Heat Map */}
            {Array.isArray(report.strengthHeatMap) && report.strengthHeatMap.length > 0 && (
              <AccordionItem value="strengths-heatmap">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-emerald-600" />
                    Strength Heat Map
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pt-2 text-sm">
                  {report.strengthHeatMap.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 border-b border-border pb-2 last:border-0">
                      <Badge variant="outline" className={`${severityBadge(s.level)} shrink-0`}>{s.level}</Badge>
                      <div>
                        <p className="font-semibold">{s.area}</p>
                        <p className="text-xs text-muted-foreground">{s.reasoning}</p>
                      </div>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Interview Readiness */}
            {report.interviewReadiness && (
              <AccordionItem value="interview">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-violet-600" />
                    Interview Readiness &mdash; {report.interviewReadiness.likelihood} likelihood
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2 text-sm">
                  {report.interviewReadiness.likelyQuestions?.length > 0 && (
                    <div className="space-y-2">
                      <strong>Likely recruiter questions:</strong>
                      {report.interviewReadiness.likelyQuestions.map((q, i) => (
                        <div key={i} className="border-l-2 border-violet-300 pl-3 py-1">
                          <p className="font-semibold text-xs">{q.question}</p>
                          <p className="text-xs text-muted-foreground italic">Prep: {q.prepHint}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {report.interviewReadiness.areasNeedingClarification?.length > 0 && (
                    <div>
                      <strong>Areas needing clarification:</strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        {report.interviewReadiness.areasNeedingClarification.map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                  {report.interviewReadiness.preparationRecommendations?.length > 0 && (
                    <div>
                      <strong>Preparation recommendations:</strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        {report.interviewReadiness.preparationRecommendations.map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Career Enhancement */}
            {report.careerEnhancement && (
              <AccordionItem value="enhancement">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-lime-600" />
                    Career Enhancement Recommendations
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2 text-sm">
                  {Object.entries(report.careerEnhancement).map(([category, items]) => (
                    Array.isArray(items) && items.length > 0 && (
                      <div key={category}>
                        <strong className="capitalize">{category.replace(/([A-Z])/g, " $1")}:</strong>
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                          {items.map((item: string, i: number) => <li key={i}>{item}</li>)}
                        </ul>
                      </div>
                    )
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Action Plan */}
            {report.actionPlan && (
              <AccordionItem value="action-plan">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-orange-600" />
                    Prioritised Action Plan
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2 text-sm">
                  {(["priority1", "priority2", "priority3"] as const).map((p) => {
                    const items = report.actionPlan?.[p];
                    if (!Array.isArray(items) || items.length === 0) return null;
                    const label = p === "priority1" ? "Priority 1 — Highest impact" : p === "priority2" ? "Priority 2 — Moderate" : "Priority 3 — Optional";
                    const border = p === "priority1" ? "border-l-rose-400" : p === "priority2" ? "border-l-amber-400" : "border-l-slate-400";
                    return (
                      <div key={p} className="space-y-2">
                        <strong>{label}</strong>
                        {items.map((it, i) => (
                          <div key={i} className={`border-l-4 ${border} pl-3 space-y-1`}>
                            <p className="font-semibold">{it.improve}</p>
                            <p className="text-xs"><strong>Why:</strong> {it.why}</p>
                            <p className="text-xs"><strong>How:</strong> {it.how}</p>
                            <p className="text-xs"><strong>Expected benefit:</strong> {it.expectedBenefit}</p>
                            <p className="text-xs"><strong>Interview impact:</strong> {it.impactOnInterview}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* One-Click Improvements */}
            {Array.isArray(report.oneClickImprovements) && report.oneClickImprovements.length > 0 && (
              <AccordionItem value="one-click">
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-pink-600" />
                    One-Click Sentence Improvements &mdash; {report.oneClickImprovements.length}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2 text-sm">
                  {report.oneClickImprovements.map((imp, i) => (
                    <div key={i} className="border rounded-md p-3 space-y-2">
                      <p className="text-rose-700 line-through text-xs">{imp.currentText}</p>
                      <p className="text-emerald-700 font-semibold text-xs">→ {imp.improved}</p>
                      <p className="text-xs text-muted-foreground italic">{imp.recommendation}</p>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

          </Accordion>
        </CardContent>
      </Card>

      {/* Final Verdict */}
      {report.verdict && (
        <Card className="border-2 border-blue-300 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gavel className="h-4 w-4 text-blue-600" />
              Final Professional Verdict
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed italic">{report.verdict}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
