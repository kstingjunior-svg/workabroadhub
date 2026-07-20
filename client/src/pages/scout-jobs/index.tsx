/**
 * Scout Jobs — public listing page.
 *
 * Shows every active scout job with country + industry filters. Card taps
 * navigate to /scout-jobs/:id where the contact reveal happens (auth
 * required to see WhatsApp / email).
 *
 * "Post a scout job" button lands at /scout-jobs/post (auth + KES 200 fee).
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Globe, Search, Plus, Briefcase, MapPin, Info, Shield,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

interface ScoutJobSummary {
  id: string;
  scout_name: string;
  scout_country: string;
  job_title: string;
  job_country: string;
  job_city: string | null;
  job_industry: string;
  job_description: string;
  salary_text: string | null;
  view_count: number;
  approved_at: string | null;
  created_at: string;
}

const COUNTRIES = [
  "UK", "UAE", "Canada", "Australia", "Saudi Arabia", "Qatar", "Bahrain",
  "Germany", "USA", "Luxembourg", "Kuwait", "Oman", "Ireland", "Netherlands",
];
const INDUSTRIES = [
  "hospitality", "care", "nursing", "farming", "driving", "construction",
  "cleaning", "chef", "trade", "security", "office",
];

export default function ScoutJobsIndex() {
  const [country, setCountry]   = useState<string>("all");
  const [industry, setIndustry] = useState<string>("all");
  const [q, setQ]               = useState<string>("");

  const params = new URLSearchParams();
  if (country  !== "all") params.set("country",  country);
  if (industry !== "all") params.set("industry", industry);
  const qs = params.toString();

  const { data, isLoading, error } = useQuery<{ jobs: ScoutJobSummary[] }>({
    queryKey: ["/api/scout-jobs", qs],
    queryFn: () =>
      fetch(`/api/scout-jobs${qs ? "?" + qs : ""}`, { credentials: "include" })
        .then((r) => r.json()),
  });

  const filtered = useMemo(() => {
    const jobs = data?.jobs ?? [];
    if (!q.trim()) return jobs;
    const needle = q.toLowerCase();
    return jobs.filter((j) =>
      j.job_title.toLowerCase().includes(needle) ||
      j.job_description.toLowerCase().includes(needle) ||
      (j.job_city ?? "").toLowerCase().includes(needle),
    );
  }, [data, q]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6" data-testid="page-scout-jobs">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Globe className="h-6 w-6 text-teal-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Job Scouts</h1>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          Real jobs posted by individuals already living in destination countries.
          Not recruitment agents, real people who know of real openings and can
          connect you directly to the employer.
        </p>
      </div>

      {/* ── Trust banner ──────────────────────────────────────────────── */}
      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900">
        <CardContent className="pt-4 pb-4 flex gap-3">
          <Shield className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            <strong className="font-semibold">Before you contact any scout:</strong>{" "}
            never send money for job placement, visa, or "processing fees" to a
            scout. Real employers in the UK, UAE, Canada and Gulf countries pay
            for your visa, they don't ask you to. If a scout asks for money to
            secure the job, report the listing and walk away.
          </div>
        </CardContent>
      </Card>

      {/* ── Filters + Post button ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search job title, city, description..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
            data-testid="input-search-scouts"
          />
        </div>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger className="w-full sm:w-40" data-testid="select-country">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={industry} onValueChange={setIndustry}>
          <SelectTrigger className="w-full sm:w-40" data-testid="select-industry">
            <SelectValue placeholder="Industry" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All industries</SelectItem>
            {INDUSTRIES.map((i) => (
              <SelectItem key={i} value={i}>{i[0].toUpperCase() + i.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Link href="/scout-jobs/post">
        <Button
          className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold"
          data-testid="button-post-scout-job"
        >
          <Plus className="h-4 w-4 mr-2" />
          I have a job to post (KES 200)
        </Button>
      </Link>

      {/* ── Listings ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="text-sm text-gray-500 py-8 text-center">Loading scout jobs...</div>
      ) : error ? (
        <div className="text-sm text-red-500 py-8 text-center">Could not load listings. Please refresh.</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="pt-6 pb-6 text-center space-y-3">
            <Info className="h-8 w-8 text-gray-400 mx-auto" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No scout jobs match your filters yet. Try clearing filters, or be
              the first to post if you know of a real opening.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((j) => (
            <Link key={j.id} href={`/scout-jobs/${j.id}`}>
              <Card
                className="hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-md transition-all cursor-pointer"
                data-testid={`card-scout-${j.id}`}
              >
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Briefcase className="h-4 w-4 text-teal-500 flex-shrink-0" />
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                          {j.job_title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <MapPin className="h-3 w-3" />
                        <span>
                          {j.job_country}
                          {j.job_city ? `, ${j.job_city}` : ""}
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">·</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {j.job_industry}
                        </Badge>
                      </div>
                    </div>
                    {j.salary_text && (
                      <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {j.salary_text}
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
                    {j.job_description}
                  </p>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-2">
                    <span>Posted by {j.scout_name}, based in {j.scout_country}</span>
                    <span>·</span>
                    <span>{j.view_count} view{j.view_count === 1 ? "" : "s"}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
