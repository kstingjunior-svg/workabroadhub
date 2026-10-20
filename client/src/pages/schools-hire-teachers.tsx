/**
 * /kenya-careers/schools (alias /schools) — School Recruitment landing page.
 *
 * 2026-10: explains how Kenyan schools hire through WorkAbroad Hub, with
 * Register / Post-a-vacancy CTAs, recently published school vacancies and a
 * clear route for teachers looking for jobs. Free for schools (no new fees).
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  CheckCircle2, Users, MapPin, ClipboardList, ShieldCheck, ArrowRight, Loader2, GraduationCap, Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { SchoolIllustration } from "@/components/school-recruitment-banner";

interface RecentJob {
  id: string; title: string; county: string | null; town: string | null; deadline: string | null;
  subjects?: string[] | null; company: { name: string; verified: boolean };
}

export default function SchoolsHireTeachers() {
  const { user } = useAuth() as any;
  const [mySchoolId, setMySchoolId] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentJob[] | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/local-jobs?institution=school&limit=6", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((d) => setRecent(Array.isArray(d?.jobs) ? d.jobs : []))
      .catch(() => setRecent([]));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!user) { setMySchoolId(null); return; }
    fetch("/api/employer/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const school = d?.companies?.find((c: any) => c.institutionType === "school");
        setMySchoolId(school?.id ?? null);
      })
      .catch(() => setMySchoolId(null));
  }, [user]);

  const registerHref = user ? "/employer/register-school" : "/signup?redirect=%2Femployer%2Fregister-school";
  const postHref = mySchoolId ? `/employer/companies/${mySchoolId}/manage` : registerHref;

  const steps = [
    { icon: ClipboardList, title: "Register your school", text: "School name, type, county and an authorised contact. About 3 minutes." },
    { icon: ShieldCheck,   title: "We verify the school", text: "Usually within 1 business day. Only verified schools get the Verified badge." },
    { icon: Briefcase,     title: "Post vacancies",       text: "Teaching and non-teaching roles — subjects, level, TSC requirement, pay and deadline." },
    { icon: Users,         title: "Manage applicants",    text: "Review CVs, shortlist, and update each candidate's status from one dashboard." },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background pb-16">
      {/* Hero */}
      <section className="bg-white dark:bg-slate-900 border-b">
        <div className="max-w-5xl mx-auto px-4 py-10 sm:py-14 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-emerald-700">WORKABROAD HUB · SCHOOL RECRUITMENT</p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-blue-950 dark:text-white">Hire teachers and school staff across Kenya</h1>
            <p className="mt-3 text-base sm:text-lg text-slate-600 dark:text-slate-300">
              Publish your vacancies free and reach more than 14,000 registered job-seekers — teachers,
              administrators, support staff and education professionals.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link href={registerHref} className="inline-flex items-center justify-center gap-1.5 h-12 px-6 rounded-full bg-blue-700 hover:bg-blue-800 text-white font-semibold shadow-sm" data-testid="btn-register-school">
                Register Your School <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href={postHref} className="inline-flex items-center justify-center h-12 px-6 rounded-full border border-blue-700 text-blue-800 dark:text-blue-200 font-semibold hover:bg-blue-50 dark:hover:bg-blue-950/40" data-testid="btn-post-vacancy">
                Post a Vacancy
              </Link>
            </div>
            <p className="mt-3 text-xs text-slate-500">Free for schools · No contract · You stay in control of every vacancy</p>
          </div>
          <SchoolIllustration className="w-full h-auto max-w-md mx-auto" />
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4">
        {/* Benefits */}
        <section className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Benefits">
          {[
            { t: "Reach qualified candidates", d: "Your vacancy is shown to job-seekers searching by county, subject and school type." },
            { t: "A school employer profile", d: "Logo, description and location — and a Verified badge once we've confirmed your school." },
            { t: "Teaching & non-teaching roles", d: "From teachers and HODs to bursars, librarians, nurses, cooks and drivers." },
            { t: "Applications in one place", d: "CVs and certificates arrive privately in your dashboard. Only your school can see them." },
          ].map((b) => (
            <Card key={b.t} className="rounded-2xl"><CardContent className="p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mb-2" aria-hidden="true" />
              <p className="font-semibold text-sm">{b.t}</p>
              <p className="text-sm text-muted-foreground mt-1">{b.d}</p>
            </CardContent></Card>
          ))}
        </section>

        {/* How it works */}
        <section className="mt-8" aria-labelledby="how-heading">
          <Card className="rounded-2xl"><CardContent className="p-5 sm:p-6">
            <h2 id="how-heading" className="font-semibold text-lg mb-4">How it works</h2>
            <ol className="grid sm:grid-cols-2 gap-4">
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-blue-50 text-blue-800 flex items-center justify-center font-semibold">{i + 1}</div>
                  <div>
                    <p className="font-medium flex items-center gap-1.5"><s.icon className="h-4 w-4 text-emerald-600" aria-hidden="true" />{s.title}</p>
                    <p className="text-sm text-muted-foreground">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent></Card>
        </section>

        {/* Recent vacancies */}
        <section className="mt-8" aria-labelledby="recent-heading">
          <div className="flex items-end justify-between gap-3 mb-3">
            <h2 id="recent-heading" className="font-semibold text-lg">Recently published school vacancies</h2>
            <Link href="/kenya-careers?institution=school" className="text-sm font-medium text-emerald-700 hover:underline">See all →</Link>
          </div>
          {recent === null ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" /></div>
          ) : recent.length === 0 ? (
            <Card className="rounded-2xl"><CardContent className="p-6 text-center text-sm text-muted-foreground">
              No school vacancies are live yet. Register your school and be the first to post.
            </CardContent></Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {recent.map((j) => (
                <Link key={j.id} href={`/kenya-careers/job/${j.id}`} className="block rounded-2xl border bg-white dark:bg-slate-900 p-4 hover:border-emerald-400 transition-colors">
                  <p className="font-semibold text-sm">{j.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {j.company.name}{j.company.verified ? " · ✓ Verified school" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                    {(j.town || j.county) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{[j.town, j.county].filter(Boolean).join(", ")}</span>}
                    {j.deadline && <span>Apply by {new Date(j.deadline).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</span>}
                  </p>
                  {j.subjects && j.subjects.length > 0 && <p className="text-xs mt-1.5 line-clamp-1">Subjects: {j.subjects.join(" · ")}</p>}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Candidates */}
        <section className="mt-8">
          <Card className="rounded-2xl border-emerald-200"><CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
            <div className="flex items-start gap-3">
              <GraduationCap className="h-6 w-6 text-emerald-700 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Looking for a teaching job?</p>
                <p className="text-sm text-muted-foreground">Browse school vacancies by county, subject and school type.</p>
              </div>
            </div>
            <Link href="/kenya-careers?institution=school" className="inline-flex items-center justify-center h-11 px-5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm">
              Browse School Jobs
            </Link>
          </CardContent></Card>
        </section>

        <p className="text-xs text-muted-foreground text-center mt-8">
          Questions? WhatsApp +254 111 467 601 or email support@workabroadhub.tech
        </p>
      </div>
    </div>
  );
}
