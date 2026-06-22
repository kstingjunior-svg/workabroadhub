/**
 * /employer/dashboard — list of companies the signed-in user can manage.
 *
 * 2026-06 Phase 4: entry point for HR managers / recruiters after they
 * claim a profile or register a new company. Shows each company they
 * have access to with quick stats and a CTA to open the manage page.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Building2, Briefcase, Loader2, ChevronRight, Plus, AlertCircle,
  BadgeCheck, Users, Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/kenya-careers-company-logo";

interface ManagedCompany {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  industry: string | null;
  county: string | null;
  verified: boolean;
  status: string;
  role: string;
  openJobs: number;
  realJobs: number;
  applications: number;
}

export default function EmployerDashboard() {
  const [companies, setCompanies] = useState<ManagedCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needSignin, setNeedSignin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/employer/me", { credentials: "include" });
        if (res.status === 401) {
          if (!cancelled) { setNeedSignin(true); setLoading(false); }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setCompanies(Array.isArray(data?.companies) ? data.companies : []);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Could not load your dashboard.");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="bg-gradient-to-br from-slate-900 to-slate-700 text-white px-4 pt-4 pb-8">
        <div className="max-w-3xl mx-auto">
          <Link href="/employers">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 -ml-2 mb-2">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to employers
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Employer dashboard</h1>
          <p className="text-sm text-slate-300 mt-0.5">
            Manage your company profile, post jobs, and review applications.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 mt-4 space-y-3">
        {loading && (
          <Card><CardContent className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </CardContent></Card>
        )}

        {!loading && needSignin && (
          <Card>
            <CardContent className="p-8 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Sign in to manage your company</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Sign in with the email you used to register or claim your company.
              </p>
              <Link href="/login?redirect=/employer/dashboard">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">Sign in</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {!loading && !needSignin && error && (
          <Card className="border-rose-200 bg-rose-50 dark:bg-rose-900/10">
            <CardContent className="p-4 text-sm text-rose-700 dark:text-rose-300">{error}</CardContent>
          </Card>
        )}

        {!loading && !needSignin && !error && companies.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="font-semibold mb-1">No companies linked yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Claim an existing company profile, or register your business if it's not yet on the platform.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Link href="/kenya-careers">
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">Find your company</Button>
                </Link>
                <Link href="/employer/register-company">
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-1.5" /> Register a new company
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && !needSignin && companies.map((c) => (
          <Card key={c.id} className="hover:border-emerald-300 transition-colors" data-testid={`employer-card-${c.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <CompanyLogo name={c.name} logoUrl={c.logoUrl} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <h2 className="font-semibold text-base leading-tight">{c.name}</h2>
                    {c.verified && (
                      <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50">
                        <BadgeCheck className="h-3 w-3 mr-0.5" /> Verified
                      </Badge>
                    )}
                    {c.status === "pending" && (
                      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                        Pending verification
                      </Badge>
                    )}
                    {c.role !== "admin" && (
                      <Badge variant="outline" className="text-[10px]">{c.role}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[c.industry, c.county].filter(Boolean).join(" · ") || "—"}
                  </p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      <strong className="text-foreground">{c.openJobs}</strong> open
                      {c.realJobs > 0 && c.realJobs !== c.openJobs && (
                        <span> ({c.realJobs} real)</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <strong className="text-foreground">{c.applications}</strong> application{c.applications === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
              </div>

              {c.status === "pending" && (
                <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800 p-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Your company is awaiting verification by our team. We'll email you within 1-2 business days. You can still set up your profile in the meantime.</span>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                <Link href={`/employer/companies/${c.id}/manage`}>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Manage company
                  </Button>
                </Link>
                <Link href={`/kenya-careers/company/${c.slug ?? c.id}`}>
                  <Button size="sm" variant="outline">View public profile</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}

        {!loading && !needSignin && companies.length > 0 && (
          <Card className="border-dashed bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-sm">Manage another company?</p>
                <p className="text-xs text-muted-foreground">Register a new business or claim another existing profile.</p>
              </div>
              <Link href="/employer/register-company">
                <Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5 mr-1.5" /> Register new</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
