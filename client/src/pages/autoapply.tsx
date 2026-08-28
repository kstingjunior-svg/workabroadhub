/**
 * /autoapply — AutoApply Agent config + inbox for a signed-in user.
 *
 * Two states:
 *   • No agent yet → onboarding form (target countries, roles, CV, prefs)
 *   • Agent exists → dashboard: settings summary + match inbox
 *
 * All actions call /api/autoapply/* which are auth-gated. Unauthenticated
 * visitors get bounced to /login by the wrapper route in App.tsx.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sparkles, RefreshCw, Star, Check, X, ExternalLink, Loader2,
  MapPin, Briefcase, DollarSign, Zap, Copy, Pause, Play,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────
interface Agent {
  id: string;
  target_countries: string[];
  target_roles: string[];
  min_salary_kes: number | null;
  visa_sponsorship_required: boolean;
  experience_years: number | null;
  is_active: boolean;
  max_matches_per_day: number;
  last_scan_at: string | null;
  total_matches_lifetime: number;
  total_applied_lifetime: number;
}

interface Match {
  id: string;
  source: string;
  job_title: string;
  employer: string | null;
  country: string | null;
  city: string | null;
  salary_display: string | null;
  salary_kes_monthly: number | null;
  posted_at: string | null;
  apply_url: string;
  description: string | null;
  match_score: number;
  match_reasons: string[] | null;
  cover_letter: string | null;
  status: "new" | "starred" | "applied" | "dismissed";
  created_at: string;
}

const COUNTRY_OPTIONS = [
  { code: "uk", label: "🇬🇧 United Kingdom" },
  { code: "canada", label: "🇨🇦 Canada" },
  { code: "usa", label: "🇺🇸 United States" },
  { code: "australia", label: "🇦🇺 Australia" },
  { code: "germany", label: "🇩🇪 Germany" },
  { code: "netherlands", label: "🇳🇱 Netherlands" },
  { code: "poland", label: "🇵🇱 Poland" },
  { code: "new-zealand", label: "🇳🇿 New Zealand" },
];

// ─── Component ────────────────────────────────────────────────────────
export default function AutoApplyPage() {
  usePageSeo({
    title:       "AutoApply Agent — AI that applies to overseas jobs while you sleep | WorkAbroad Hub",
    description: "Set your target countries and role. Every night our AI scans, matches, and drafts applications for you. Wake up to a curated inbox of overseas jobs with tailored cover letters ready to send.",
    path:        "/autoapply",
    keywords:    ["autoapply agent kenya", "ai job apply kenya", "automated job applications kenya"],
  });

  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"new" | "starred" | "applied" | "dismissed" | "all">("new");

  const { data: agentData, isLoading: agentLoading } = useQuery<{ agent: Agent | null }>({
    queryKey: ["/api/autoapply/agent"],
    staleTime: 30_000,
  });
  const agent = agentData?.agent ?? null;

  const { data: matchesData } = useQuery<{ matches: Match[] }>({
    queryKey: [`/api/autoapply/matches?status=${statusFilter === "all" ? "" : statusFilter}&limit=50`],
    enabled: !!agent,
    refetchInterval: 30_000,
  });
  const matches = matchesData?.matches ?? [];

  const scanNow = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/autoapply/agent/scan-now", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Scan failed");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Scan started", description: data?.message ?? "New matches in ~60s" });
      setTimeout(() => qc.invalidateQueries({ queryKey: [`/api/autoapply/matches?status=new&limit=50`] }), 60_000);
    },
    onError: (err: any) => toast({ title: "Scan failed", description: err.message, variant: "destructive" }),
  });

  const togglePause = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/autoapply/agent/pause", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: agent?.is_active }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/autoapply/agent"] }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Match["status"] }) => {
      const res = await fetch(`/api/autoapply/matches/${id}/status`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Status update failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/autoapply/matches?status=${statusFilter === "all" ? "" : statusFilter}&limit=50`] }),
  });

  if (agentLoading) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin inline mr-2" /> Loading your AutoApply agent…</div>;
  }

  if (!agent) {
    return <OnboardingForm onCreated={() => qc.invalidateQueries({ queryKey: ["/api/autoapply/agent"] })} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold flex items-center gap-2">
                <Sparkles className="h-7 w-7" /> AutoApply Agent
              </h1>
              <p className="text-blue-100/90 mt-1 text-sm">
                Hunting {agent.target_roles.length} role{agent.target_roles.length !== 1 ? "s" : ""} across {agent.target_countries.length} {agent.target_countries.length === 1 ? "country" : "countries"}
                {agent.last_scan_at ? ` · Last scan ${timeAgo(agent.last_scan_at)}` : " · No scans yet"}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20 gap-2"
                onClick={() => togglePause.mutate()}
                disabled={togglePause.isPending}
              >
                {agent.is_active ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Resume</>}
              </Button>
              <Button
                className="bg-white text-blue-950 hover:bg-blue-50 gap-2"
                onClick={() => scanNow.mutate()}
                disabled={scanNow.isPending}
              >
                {scanNow.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Scanning…</> : <><RefreshCw className="h-4 w-4" /> Scan now</>}
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Total matches" value={agent.total_matches_lifetime} />
            <StatTile label="Applied" value={agent.total_applied_lifetime} />
            <StatTile label="Daily cap" value={agent.max_matches_per_day} />
            <StatTile label="Status" value={agent.is_active ? "Active" : "Paused"} />
          </div>
        </div>
      </section>

      {/* Filter chips */}
      <section className="border-b bg-muted/30 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex gap-2 flex-wrap">
          {(["new", "starred", "applied", "dismissed", "all"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={statusFilter === f ? "default" : "outline"}
              onClick={() => setStatusFilter(f)}
              data-testid={`filter-${f}`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </section>

      {/* Match list */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-3">
        {matches.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            {statusFilter === "new"
              ? "No new matches yet. Your agent scans overnight — check back in the morning, or hit \"Scan now\"."
              : `No ${statusFilter} matches yet.`}
          </Card>
        ) : (
          matches.map((m) => (
            <MatchCard key={m.id} match={m} onStatus={(s) => setStatus.mutate({ id: m.id, status: s })} />
          ))
        )}
      </section>

      {/* ─── ToS-required attribution for the Adzuna free tier ─────────
          Adzuna Developer Terms §5 require any product using their API
          to display a "Powered by Adzuna" credit visible to end-users.
          Placed here (page footer + on every Adzuna-sourced match card)
          so we're compliant in both the aggregate and the individual
          record view. */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 pt-2 text-center">
        <p className="text-xs text-muted-foreground">
          Job data powered by{" "}
          <a
            href="https://www.adzuna.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline font-medium"
          >
            Adzuna
          </a>
          . WorkAbroad Hub is not affiliated with Adzuna Ltd.
        </p>
      </section>
    </div>
  );
}

// ─── Match card ───────────────────────────────────────────────────────
function MatchCard({ match, onStatus }: { match: Match; onStatus: (s: Match["status"]) => void }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  const copyLetter = () => {
    if (!match.cover_letter) return;
    navigator.clipboard.writeText(match.cover_letter);
    toast({ title: "Cover letter copied", description: "Paste it into the employer's application form." });
  };

  const scoreBadge = match.match_score >= 80 ? "bg-green-100 text-green-800 border-green-200" :
                     match.match_score >= 60 ? "bg-blue-100 text-blue-800 border-blue-200" :
                     "bg-amber-100 text-amber-800 border-amber-200";

  return (
    <Card className="hover:shadow-lg transition-shadow" data-testid={`match-card-${match.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg leading-tight">{match.job_title}</h3>
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              {match.employer && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {match.employer}</span>}
              {match.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {match.city}</span>}
              {match.country && <Badge variant="outline" className="text-xs">{match.country.toUpperCase()}</Badge>}
            </div>
          </div>
          <Badge className={`${scoreBadge} border font-semibold`}>{match.match_score}% match</Badge>
        </div>

        {(match.salary_display || match.salary_kes_monthly) && (
          <div className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm mb-2 flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            {match.salary_display}
            {match.salary_kes_monthly && <span className="text-muted-foreground font-normal ml-1">(~KES {match.salary_kes_monthly.toLocaleString()}/mo)</span>}
          </div>
        )}

        {match.match_reasons && match.match_reasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {match.match_reasons.map((r, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                ✓ {r}
              </span>
            ))}
          </div>
        )}

        {expanded && match.description && (
          <div className="text-sm text-muted-foreground bg-muted/40 rounded p-3 mb-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
            {match.description.slice(0, 1200)}{match.description.length > 1200 ? "…" : ""}
          </div>
        )}

        {expanded && match.cover_letter && (
          <div className="border rounded-lg p-3 mb-3 bg-purple-50/50 dark:bg-purple-950/20">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-purple-800 dark:text-purple-300">AI-DRAFTED COVER LETTER</span>
              <Button size="sm" variant="ghost" onClick={copyLetter} className="h-7 gap-1 text-xs">
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
            <div className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-200 max-h-64 overflow-y-auto">
              {match.cover_letter}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <a href={match.apply_url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="gap-1"><ExternalLink className="h-3 w-3" /> Apply on employer site</Button>
          </a>
          <Button size="sm" variant="outline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide details" : "Show details + cover letter"}
          </Button>
          {match.status !== "applied" && (
            <Button size="sm" variant="outline" className="gap-1 text-emerald-700" onClick={() => onStatus("applied")}>
              <Check className="h-3 w-3" /> Mark applied
            </Button>
          )}
          {match.status !== "starred" && (
            <Button size="sm" variant="outline" className="gap-1 text-amber-700" onClick={() => onStatus("starred")}>
              <Star className="h-3 w-3" /> Star
            </Button>
          )}
          {match.status !== "dismissed" && (
            <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground ml-auto" onClick={() => onStatus("dismissed")}>
              <X className="h-3 w-3" /> Dismiss
            </Button>
          )}
        </div>

        {/* Per-card attribution — Adzuna ToS §5. Keep tiny + visible. */}
        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-muted-foreground/70 flex items-center gap-1">
          {match.source === "adzuna" && (
            <>
              Job data via{" "}
              <a
                href="https://www.adzuna.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                Adzuna
              </a>
            </>
          )}
          {match.source !== "adzuna" && <>Source: {match.source}</>}
          {match.posted_at && (
            <span className="ml-auto">
              Posted {timeAgo(match.posted_at)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────
function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/10 border border-white/20 p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-blue-100/70">{label}</div>
    </div>
  );
}

// ─── Onboarding form (shown when no agent exists) ─────────────────────
function OnboardingForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [countries, setCountries] = useState<string[]>([]);
  const [rolesInput, setRolesInput] = useState("");
  const [minSalary, setMinSalary] = useState<string>("");
  const [experienceYrs, setExperienceYrs] = useState<string>("");
  const [visaReq, setVisaReq] = useState(true);
  const [cvText, setCvText] = useState("");

  const roles = useMemo(() => rolesInput.split(",").map((r) => r.trim()).filter(Boolean), [rolesInput]);

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/autoapply/agent", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_countries: countries,
          target_roles:     roles,
          min_salary_kes:   minSalary ? Number(minSalary) : null,
          experience_years: experienceYrs ? Number(experienceYrs) : null,
          visa_sponsorship_required: visaReq,
          cv_text:          cvText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Setup failed");
      return data;
    },
    onSuccess: () => {
      toast({ title: "AutoApply agent created", description: "Your first scan runs in ~5 minutes." });
      onCreated();
    },
    onError: (err: any) => toast({ title: "Setup failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-background">
      <section className="bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <div className="text-5xl mb-3">🤖</div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Set up your AutoApply Agent</h1>
          <p className="text-blue-100/90 max-w-xl mx-auto">
            Every night your agent scans real overseas job boards, ranks them against your CV, and
            drafts cover letters for the top matches. Wake up to a curated inbox — ready to apply
            with one click.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Card><CardContent className="p-6 space-y-5">

          <div>
            <Label className="text-base font-semibold">1. Target countries</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">Pick up to 5 countries where you want to work.</p>
            <div className="flex flex-wrap gap-2">
              {COUNTRY_OPTIONS.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setCountries((cs) => cs.includes(c.code) ? cs.filter((x) => x !== c.code) : [...cs, c.code].slice(0, 5))}
                  className={`px-3 py-1.5 rounded-full border text-sm transition ${
                    countries.includes(c.code)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-background hover:bg-muted border-input"
                  }`}
                  data-testid={`country-${c.code}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="roles" className="text-base font-semibold">2. Target roles / job titles</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">Comma-separated. Up to 5. Example: "registered nurse, staff nurse, ICU nurse"</p>
            <Input
              id="roles"
              value={rolesInput}
              onChange={(e) => setRolesInput(e.target.value)}
              placeholder="registered nurse, staff nurse"
              data-testid="input-roles"
            />
            {roles.length > 0 && <div className="text-xs text-muted-foreground mt-2">{roles.length} role{roles.length !== 1 ? "s" : ""} — {roles.slice(0, 3).join(" · ")}{roles.length > 3 ? "…" : ""}</div>}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="exp" className="text-base font-semibold">3. Years of experience</Label>
              <Input id="exp" type="number" min={0} max={50} value={experienceYrs} onChange={(e) => setExperienceYrs(e.target.value)} placeholder="e.g. 5" data-testid="input-exp" />
            </div>
            <div>
              <Label htmlFor="salary" className="text-base font-semibold">4. Min monthly salary (KES) — optional</Label>
              <Input id="salary" type="number" min={0} value={minSalary} onChange={(e) => setMinSalary(e.target.value)} placeholder="e.g. 250000" data-testid="input-salary" />
            </div>
          </div>

          <div className="flex items-start gap-2">
            <input
              id="visa"
              type="checkbox"
              checked={visaReq}
              onChange={(e) => setVisaReq(e.target.checked)}
              className="mt-1"
              data-testid="input-visa"
            />
            <label htmlFor="visa" className="text-sm">
              <b>I need visa sponsorship</b> — prioritise jobs that explicitly offer sponsorship for non-EU/non-Commonwealth nationals.
            </label>
          </div>

          <div>
            <Label htmlFor="cv" className="text-base font-semibold">5. Paste your CV (plain text)</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">Copy from your Word/PDF CV. Everything the agent uses to match jobs comes from here. Minimum 200 characters.</p>
            <Textarea
              id="cv"
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              placeholder="Paste your CV here..."
              rows={10}
              className="font-mono text-xs"
              data-testid="input-cv"
            />
            <div className="text-xs text-muted-foreground mt-1 text-right">{cvText.length.toLocaleString()} chars {cvText.length < 200 && `— need ${200 - cvText.length} more`}</div>
          </div>

          <Button
            size="lg"
            className="w-full gap-2"
            onClick={() => create.mutate()}
            disabled={create.isPending || countries.length === 0 || roles.length === 0 || cvText.length < 200}
            data-testid="btn-create-agent"
          >
            {create.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Setting up…</> : <><Sparkles className="h-4 w-4" /> Activate my AutoApply Agent</>}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            🔒 Your CV never leaves WorkAbroad Hub. Applications are prepared but always submitted by you — never automatically without your review.
          </p>
        </CardContent></Card>
      </section>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
