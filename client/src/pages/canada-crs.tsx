/**
 * /canada/crs — Working CRS calculator.
 *
 * Uses the OFFICIAL IRCC formula (mirrored in shared/canada-immigration.ts and
 * server/routes/canada.ts). Sends inputs to POST /api/canada/crs which returns
 * the score breakdown, a verdict (likely / borderline / long shot), and
 * targeted boost suggestions.
 *
 * Not a mockup — math matches IRCC's published grid.
 * Source: canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/criteria-comprehensive-ranking-system/grid.html
 *
 * 2026-06: production Canada hub.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Calculator, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, TrendingUp,
  Sparkles, Loader2, Trophy, Target, Lightbulb, FileText, ExternalLink,
} from "lucide-react";
import { EDUCATION_LABELS, type EducationLevel } from "@shared/canada-immigration";

const CLB_LABEL: Record<number, string> = {
  4: "CLB 4 (IELTS 4.0)",
  5: "CLB 5 (IELTS 5.0)",
  6: "CLB 6 (IELTS 5.5)",
  7: "CLB 7 (IELTS 6.0)",
  8: "CLB 8 (IELTS 6.5)",
  9: "CLB 9 (IELTS 7.0)",
  10: "CLB 10 (IELTS 7.5+)",
};

interface CrsResponse {
  total: number;
  breakdown: Record<string, number>;
  verdict: "likely" | "borderline" | "long_shot";
  recentByProgram: Record<string, number>;
  lowestRecentCutoff: number;
  boostSuggestions: Array<{ action: string; potentialGain: string; effort: "low" | "medium" | "high" }>;
}

export default function CanadaCrsPage() {
  // ── Form state — sensible Kenyan-applicant defaults ──────────────────────
  const [age, setAge] = useState(28);
  const [maritalStatus, setMaritalStatus] = useState<"single" | "married">("single");
  const [spouseImmigratingWithYou, setSpouseImmigratingWithYou] = useState(true);
  const [education, setEducation] = useState<EducationLevel>("bachelor");
  const [firstLangClb, setFirstLangClb] = useState(7);
  const [secondLangClb, setSecondLangClb] = useState(0);  // 0 = no second language
  const [canadianWorkYears, setCanadianWorkYears] = useState(0);
  const [foreignWorkYears, setForeignWorkYears] = useState(2);
  const [hasProvincialNomination, setPnp] = useState(false);
  const [hasArrangedJobOffer, setJobOffer] = useState(false);
  const [arrangedJobIsSeniorManager, setJobSenior] = useState(false);
  const [siblingInCanada, setSibling] = useState(false);
  const [canadianStudyCredential, setCanadianStudy] = useState<"none" | "one_two_year" | "three_plus_or_graduate">("none");
  const [frenchClb, setFrenchClb] = useState(0);

  const [result, setResult] = useState<CrsResponse | null>(null);

  const calc = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/canada/crs", {
        age, maritalStatus, spouseImmigratingWithYou, education,
        firstLangClb, secondLangClb: secondLangClb || undefined,
        canadianWorkYears, foreignWorkYears,
        hasProvincialNomination, hasArrangedJobOffer, arrangedJobIsSeniorManager,
        siblingInCanada, canadianStudyCredential,
        frenchClb, englishClb: firstLangClb,
      });
      return (await res.json()) as CrsResponse;
    },
    onSuccess: (data) => {
      setResult(data);
      // Scroll to result
      setTimeout(() => {
        document.getElementById("crs-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    },
  });

  const verdictMeta = {
    likely:     { label: "Likely to get an ITA",  color: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300", icon: Trophy },
    borderline: { label: "Borderline — category-based draws are your best shot", color: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border-amber-300", icon: Target },
    long_shot:  { label: "Long shot — focus on boosting your score first",       color: "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border-rose-300", icon: AlertCircle },
  } as const;

  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="bg-gradient-to-br from-red-600 to-rose-700 text-white">
        <div className="max-w-3xl mx-auto px-4 py-5">
          <Link href="/canada">
            <a className="text-xs text-red-100 hover:text-white inline-flex items-center gap-1 mb-2">
              <ArrowLeft className="h-3 w-3" /> Back to Canada hub
            </a>
          </Link>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            CRS Calculator
          </h1>
          <p className="text-xs md:text-sm text-red-50 mt-1">
            Official IRCC formula. Same math you'd see at canada.ca — but with
            verdict, recent draw cutoffs, and what to improve.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {/* ──── Section 1: Personal ──────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <h2 className="font-bold text-sm">1. About you</h2>

            <div>
              <label className="text-xs font-medium block mb-1">
                Age: <span className="font-bold tabular-nums">{age}</span>
              </label>
              <Slider
                value={[age]}
                min={18}
                max={50}
                step={1}
                onValueChange={(v) => setAge(v[0])}
                data-testid="slider-age"
              />
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Peak points are at 20-29 (110 pts). Drops sharply after 35.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMaritalStatus("single")}
                className={`p-2 rounded-md border text-xs font-medium transition-colors ${
                  maritalStatus === "single" ? "border-red-500 bg-red-50 dark:bg-red-950/30" : ""
                }`}
                data-testid="marital-single"
              >
                Single / Not bringing spouse
              </button>
              <button
                onClick={() => setMaritalStatus("married")}
                className={`p-2 rounded-md border text-xs font-medium transition-colors ${
                  maritalStatus === "married" ? "border-red-500 bg-red-50 dark:bg-red-950/30" : ""
                }`}
                data-testid="marital-married"
              >
                Married — bringing spouse
              </button>
            </div>

            {maritalStatus === "married" && (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={spouseImmigratingWithYou}
                  onChange={(e) => setSpouseImmigratingWithYou(e.target.checked)}
                />
                My spouse is immigrating with me (uncheck if they're a Canadian PR/citizen already)
              </label>
            )}
          </CardContent>
        </Card>

        {/* ──── Section 2: Education ─────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="font-bold text-sm">2. Highest education completed</h2>
            <select
              value={education}
              onChange={(e) => setEducation(e.target.value as EducationLevel)}
              className="w-full text-sm rounded-md border border-input bg-background px-2.5 py-2"
              data-testid="select-education"
            >
              {(Object.keys(EDUCATION_LABELS) as EducationLevel[]).map((k) => (
                <option key={k} value={k}>{EDUCATION_LABELS[k]}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Your Kenyan credential must be assessed by an IRCC-designated ECA body (WES is the most common).
            </p>
          </CardContent>
        </Card>

        {/* ──── Section 3: Language ──────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <h2 className="font-bold text-sm">3. Language ability</h2>

            <div>
              <label className="text-xs font-medium block mb-1">
                English or French — your strongest official language
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[4, 5, 6, 7, 8, 9, 10].map((clb) => (
                  <button
                    key={clb}
                    onClick={() => setFirstLangClb(clb)}
                    className={`p-2 rounded-md border text-[11px] font-medium transition-colors ${
                      firstLangClb === clb ? "border-red-500 bg-red-50 dark:bg-red-950/30" : ""
                    }`}
                    data-testid={`firstlang-${clb}`}
                  >
                    {CLB_LABEL[clb] || `CLB ${clb}`}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                Don't have IELTS yet? CLB 7 (IELTS 6.0) is the minimum for FSW.
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">
                French as a second language (if applicable)
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[0, 5, 6, 7, 8, 9].map((clb) => (
                  <button
                    key={clb}
                    onClick={() => setFrenchClb(clb)}
                    className={`p-2 rounded-md border text-[11px] font-medium transition-colors ${
                      frenchClb === clb ? "border-red-500 bg-red-50 dark:bg-red-950/30" : ""
                    }`}
                    data-testid={`french-${clb}`}
                  >
                    {clb === 0 ? "None" : CLB_LABEL[clb] || `CLB ${clb}`}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                French CLB 7+ unlocks French-speaker draws — cutoffs as low as 380. Big deal.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ──── Section 4: Work experience ───────────────────────────────── */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <h2 className="font-bold text-sm">4. Skilled work experience</h2>

            <div>
              <label className="text-xs font-medium block mb-1">
                Foreign skilled work: <span className="font-bold tabular-nums">{foreignWorkYears} years</span>
              </label>
              <Slider
                value={[foreignWorkYears]}
                min={0}
                max={10}
                step={1}
                onValueChange={(v) => setForeignWorkYears(v[0])}
                data-testid="slider-foreign-work"
              />
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Full-time work in NOC TEER 0/1/2/3 — your Kenyan job experience.
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">
                Canadian skilled work: <span className="font-bold tabular-nums">{canadianWorkYears} years</span>
              </label>
              <Slider
                value={[canadianWorkYears]}
                min={0}
                max={5}
                step={1}
                onValueChange={(v) => setCanadianWorkYears(v[0])}
                data-testid="slider-canadian-work"
              />
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Most Kenyans starting from home have 0 years here.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ──── Section 5: Boosters ──────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="font-bold text-sm">5. Score boosters</h2>

            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={hasProvincialNomination}
                onChange={(e) => setPnp(e.target.checked)}
                className="mt-0.5"
                data-testid="check-pnp"
              />
              <div>
                <strong>Provincial Nomination</strong> (+600 pts) — Saskatchewan, Manitoba, and Alberta have streams open to Kenyans without a job offer.
              </div>
            </label>

            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={hasArrangedJobOffer}
                onChange={(e) => setJobOffer(e.target.checked)}
                className="mt-0.5"
                data-testid="check-job-offer"
              />
              <div>
                <strong>Arranged Canadian job offer</strong> (LMIA-backed, TEER 0/1/2/3) (+50 pts)
              </div>
            </label>

            {hasArrangedJobOffer && (
              <label className="flex items-start gap-2 text-xs cursor-pointer ml-6">
                <input
                  type="checkbox"
                  checked={arrangedJobIsSeniorManager}
                  onChange={(e) => setJobSenior(e.target.checked)}
                  className="mt-0.5"
                />
                <div>It's a senior manager role (NOC TEER 0 major group 00) (+200 instead of +50)</div>
              </label>
            )}

            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={siblingInCanada}
                onChange={(e) => setSibling(e.target.checked)}
                className="mt-0.5"
                data-testid="check-sibling"
              />
              <div>
                <strong>Sibling in Canada</strong> who is a PR or citizen (+15 pts)
              </div>
            </label>

            <div>
              <label className="text-xs font-medium block mb-1">Canadian post-secondary education</label>
              <select
                value={canadianStudyCredential}
                onChange={(e) => setCanadianStudy(e.target.value as any)}
                className="w-full text-sm rounded-md border border-input bg-background px-2.5 py-2"
                data-testid="select-canadian-study"
              >
                <option value="none">None</option>
                <option value="one_two_year">1- or 2-year Canadian credential (+15)</option>
                <option value="three_plus_or_graduate">3+ year or Master's/PhD from Canada (+30)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full bg-red-600 hover:bg-red-700 text-white"
          onClick={() => calc.mutate()}
          disabled={calc.isPending}
          data-testid="button-calculate-crs"
        >
          {calc.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Calculate my CRS score
        </Button>

        {calc.isError && (
          <div className="text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/20 p-3 rounded-md">
            Couldn't calculate — please try again.
          </div>
        )}

        {/* ──── Result ───────────────────────────────────────────────────── */}
        {result && (
          <div id="crs-result" className="space-y-3 pt-4 border-t-2 border-dashed">
            <Card className={`border-2 ${verdictMeta[result.verdict].color}`}>
              <CardContent className="p-5 text-center">
                <div className="text-xs uppercase tracking-wider font-bold mb-1">Your CRS score</div>
                <div className="text-5xl font-bold tabular-nums mb-2">{result.total}</div>
                <div className="text-xs font-medium">out of 1200 maximum</div>

                <div className="mt-4 pt-4 border-t border-current/20">
                  <div className="text-xs uppercase tracking-wider font-bold mb-1">Verdict</div>
                  <div className="text-base font-bold">{verdictMeta[result.verdict].label}</div>
                </div>
              </CardContent>
            </Card>

            {/* Breakdown */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-bold mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Where your points came from
                </h3>
                <div className="space-y-2">
                  {([
                    ["age", "Age"],
                    ["education", "Education"],
                    ["firstLanguage", "First language (English/French)"],
                    ["secondLanguage", "Second language"],
                    ["canadianWork", "Canadian work experience"],
                    ["skillTransferability", "Skill transferability"],
                    ["additional", "Additional (PNP, sibling, French, job offer)"],
                  ] as const).map(([key, label]) => {
                    const pts = result.breakdown[key] || 0;
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <div className="text-xs flex-1">{label}</div>
                        <div className="w-32 bg-muted rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-red-500"
                            style={{ width: `${Math.min(100, (pts / 200) * 100)}%` }}
                          />
                        </div>
                        <div className="text-xs font-bold tabular-nums w-12 text-right">{pts}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Recent cutoffs */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-bold mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Recent draw cutoffs by category
                </h3>
                <div className="space-y-1.5">
                  {Object.entries(result.recentByProgram).map(([prog, cutoff]) => {
                    const passes = result.total >= cutoff;
                    return (
                      <div key={prog} className="flex items-center justify-between text-xs gap-2">
                        <div className="flex-1 truncate">{prog}</div>
                        <Badge className={`text-[10px] ${passes ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"}`}>
                          {passes ? "✓ You'd pass" : `Need ${cutoff - result.total}+ more`}
                        </Badge>
                        <div className="font-bold tabular-nums w-12 text-right">{cutoff}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Boost suggestions */}
            {result.boostSuggestions.length > 0 && (
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20">
                <CardContent className="p-4">
                  <h3 className="font-bold mb-2 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-700 dark:text-amber-300" /> How to boost your score
                  </h3>
                  <div className="space-y-2">
                    {result.boostSuggestions.map((s, i) => (
                      <div key={i} className="text-xs border-l-2 border-amber-400 pl-3 py-1">
                        <div className="font-bold">{s.action}</div>
                        <div className="flex gap-2 mt-0.5">
                          <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                            {s.potentialGain}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            Effort: {s.effort}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-wrap gap-2">
              <Link href="/canada/jobs">
                <Button variant="outline" size="sm">
                  Find a Canadian job <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
              <Link href="/journey/CA">
                <Button variant="outline" size="sm">
                  Open Canada roadmap <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
              <a
                href="https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/submit-profile.html"
                target="_blank" rel="noopener noreferrer"
              >
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white">
                  Submit Express Entry profile <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
