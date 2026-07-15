// ─────────────────────────────────────────────────────────────────────────────
// /tools/job-match — paste your CV, see the 10 jobs that match best.
//
// Semantic similarity via OpenAI embeddings. Server already has every job
// in the catalogue pre-embedded; we embed the user's CV once per request
// and compute cosine similarity against the cache.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import {
  Sparkles, ArrowLeft, ArrowRight, Loader2, MapPin, Briefcase,
  Star, ExternalLink, Lock,
} from "lucide-react";

interface MatchResult {
  id: string;
  title: string;
  employer: string;
  country: string;
  countryFlag?: string;
  city?: string;
  salary?: string;
  visaType?: string;
  category?: string;
  applyUrl?: string;
  scorePct: number;
}

interface MatchResponse {
  matches: MatchResult[];
  signedIn: boolean;
}

const PLACEHOLDER = `Paste your full CV here — name, summary, work experience with dates and achievements, education, skills.

Example:
"Catherine Mbaja
Nurse, 5 years post-NCK experience at Aga Khan Hospital Nairobi…
- Triage, IV therapy, paediatric ward
- IELTS Academic 7.0
- Looking to relocate to UK NHS"

The more concrete detail you paste, the better the match.`;

export default function JobMatchPage() {
  const { toast } = useToast();
  const [cvText, setCvText] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<MatchResponse | null>(null);

  async function runMatch() {
    if (cvText.trim().length < 100) {
      toast({
        title: "Need a bit more CV",
        description: "Paste at least 100 characters so we can match you accurately.",
        variant: "destructive",
      });
      return;
    }
    setRunning(true);
    setResults(null);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/jobs/match-my-cv", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ cvText: cvText.trim(), limit: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Match failed");
      setResults(data as MatchResponse);
    } catch (err: any) {
      toast({ title: "Couldn't run match", description: err?.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <header className="sticky top-0 z-30 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
          <Link href="/tools">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Tools
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <AiDisclaimer className="mb-4" />
        {/* ── Intro ─────────────────────────────────────────────────────── */}
        <div className="text-center">
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 mb-3">
            <Sparkles className="h-3.5 w-3.5 mr-1" /> AI-powered match
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 tracking-tight">
            See which overseas jobs you actually fit
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            Paste your CV. We semantically compare it to every visa-sponsored
            job in our catalogue and show you the 10 best matches — ranked, with
            a match score for each.
          </p>
        </div>

        {/* ── CV input ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Your CV</CardTitle>
            <CardDescription>
              Paste your full CV text. Nothing is saved — we use it once to compute the match.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={10}
              className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 font-mono"
              data-testid="textarea-cv"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{cvText.length.toLocaleString()} characters</span>
              <span>{cvText.length < 100 ? `${100 - cvText.length} more for a good match` : "ready"}</span>
            </div>
            <Button
              onClick={runMatch}
              disabled={running || cvText.trim().length < 100}
              className="w-full"
              size="lg"
              data-testid="button-run-match"
            >
              {running ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Embedding your CV + scoring jobs…</>
              ) : (
                <>Find my best matches <ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* ── Results ───────────────────────────────────────────────────── */}
        {results && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500" />
                Your top {results.matches.length} matches
              </CardTitle>
              <CardDescription>
                {results.matches[0]?.scorePct >= 60
                  ? "Strong fits at the top — these are worth applying to right now."
                  : "Best available matches. To rank higher, expand the achievements section of your CV."}
                {!results.signedIn && (
                  <span className="block mt-1 text-amber-700 dark:text-amber-400 text-xs">
                    <Lock className="h-3 w-3 inline mr-1" />
                    Sign in to see direct apply links.
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {results.matches.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No matches yet — try again with a longer or more detailed CV.
                </p>
              )}
              {results.matches.map((m, i) => (
                <div
                  key={m.id}
                  className="rounded-xl border bg-white dark:bg-slate-900/40 p-4 space-y-2"
                  data-testid={`match-${i}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-primary tabular-nums">
                          #{i + 1}
                        </span>
                        {m.countryFlag && <span className="text-base">{m.countryFlag}</span>}
                        <Badge variant="secondary" className="text-[10px]">{m.country}</Badge>
                        {m.category && <Badge variant="outline" className="text-[10px]">{m.category}</Badge>}
                      </div>
                      <h3 className="font-bold text-base leading-tight">{m.title}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">
                        <Briefcase className="h-3 w-3 inline mr-1" />
                        {m.employer}{m.city ? ` · ${m.city}` : ""}
                      </p>
                      {m.salary && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mt-1">
                          {m.salary}
                        </p>
                      )}
                      {m.visaType && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          <MapPin className="h-3 w-3 inline mr-0.5" /> {m.visaType}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-2xl font-bold tabular-nums text-primary">
                        {m.scorePct}<span className="text-sm">%</span>
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">match</div>
                    </div>
                  </div>
                  <Progress value={m.scorePct} className="h-1.5" />
                  {m.applyUrl ? (
                    <a href={m.applyUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="w-full">
                        Open application <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </a>
                  ) : (
                    <Link href="/login">
                      <Button size="sm" variant="outline" className="w-full">
                        <Lock className="h-3 w-3 mr-1" /> Sign in to apply
                      </Button>
                    </Link>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="text-xs text-muted-foreground text-center">
          Scores show semantic similarity between your CV and each job posting.
          60% and above is a strong fit. Lower scores still apply — they're just less specific.
        </div>
      </main>
    </div>
  );
}
