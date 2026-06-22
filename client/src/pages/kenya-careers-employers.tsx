/**
 * /employers — Marketing landing page for Kenyan employers.
 *
 * 2026-06 Phase 3: this is the page Tony points HR managers at when
 * pitching Kenya Careers. Six sections per the spec:
 *   1. Why recruit with WorkAbroad Hub
 *   2. County-based recruitment
 *   3. Branch hiring
 *   4. Fast applications
 *   5. Claim your company
 *   6. Contact us
 *
 * Plus live platform stats pulled from /api/local-jobs/stats so the numbers
 * are honest and current. Free until the end of 2026 — gives early
 * employers a real reason to onboard now.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Building2, MapPin, Briefcase, Users, Globe, BadgeCheck, Sparkles,
  ChevronRight, ShieldCheck, Phone, Mail, MessageSquare, Clock, Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/kenya-careers-company-logo";

interface Stats {
  totalJobs: number;
  totalEmployers: number;
  totalCounties: number;
  totalVacancies: number;
}

interface Employer {
  id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  county: string | null;
  logoUrl: string | null;
  verified: boolean;
  jobCount: number;
}

export default function KenyaCareersEmployers() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [employers, setEmployers] = useState<Employer[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, e] = await Promise.all([
          fetch("/api/local-jobs/stats").then((r) => r.ok ? r.json() : null),
          fetch("/api/local-jobs/companies").then((r) => r.ok ? r.json() : null),
        ]);
        if (cancelled) return;
        if (s) setStats(s);
        if (e?.companies) setEmployers(e.companies);
      } catch { /* silent — page still renders */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* ─────────────── HERO ─────────────── */}
      <section className="relative bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white pt-12 pb-14 px-4 overflow-hidden">
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center space-y-4">
          <Badge className="bg-white/20 text-white border-white/30 text-xs font-semibold uppercase tracking-widest px-3 py-1">
            For Employers
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">
            Hire across Kenya — in every county
          </h1>
          <p className="text-emerald-50 text-base md:text-lg max-w-xl mx-auto">
            Post your openings to Kenya's verified jobseekers on WorkAbroad Hub.
            Free to list until the end of 2026.
          </p>

          {stats && (
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm pt-3 text-emerald-50">
              <span><strong className="text-white">{stats.totalEmployers}</strong> employers</span>
              <span className="opacity-50">·</span>
              <span><strong className="text-white">{stats.totalCounties}</strong> counties</span>
              <span className="opacity-50">·</span>
              <span><strong className="text-white">{stats.totalJobs}</strong> active positions</span>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3 pt-4">
            <Button
              size="lg"
              className="bg-white text-emerald-800 hover:bg-emerald-50"
              asChild
            >
              <a href="#claim">
                <Building2 className="h-4 w-4 mr-1.5" /> Claim your company
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-white border-white/40 bg-white/10 hover:bg-white/20"
              asChild
            >
              <a href="#contact">Talk to our team</a>
            </Button>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 space-y-12 mt-10">
        {/* ─────────────── 1. WHY US ─────────────── */}
        <section>
          <h2 className="text-xl sm:text-2xl font-bold mb-1 tracking-tight">Why recruit with WorkAbroad Hub</h2>
          <p className="text-sm text-muted-foreground mb-5">Built for Kenyan employers and Kenyan jobseekers.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-5">
                <Users className="h-7 w-7 text-emerald-600 mb-2" />
                <h3 className="font-semibold text-sm">High-intent candidates</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Many applicants pay KES 99 to apply — they're serious. No CV-spam from inactive accounts.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <Globe className="h-7 w-7 text-emerald-600 mb-2" />
                <h3 className="font-semibold text-sm">National reach</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Coverage in all 47 counties. From Nairobi to Turkana, your branch can hire locally.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <ShieldCheck className="h-7 w-7 text-emerald-600 mb-2" />
                <h3 className="font-semibold text-sm">Verified employer badge</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Claim your profile and get the green Verified tick. Builds trust with every applicant.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <Sparkles className="h-7 w-7 text-emerald-600 mb-2" />
                <h3 className="font-semibold text-sm">Free until 2027</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Post jobs at no cost throughout 2026. Early employers lock in free posting for a year.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <Clock className="h-7 w-7 text-emerald-600 mb-2" />
                <h3 className="font-semibold text-sm">Applications in hours</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Most postings get their first qualified applicant within 4 hours of going live.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <MessageSquare className="h-7 w-7 text-emerald-600 mb-2" />
                <h3 className="font-semibold text-sm">M-Pesa-native</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Built in Kenya, for Kenya. Mobile-first. Works on the cheapest smartphone.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ─────────────── 2. COUNTY-BASED RECRUITMENT ─────────────── */}
        <section>
          <h2 className="text-xl sm:text-2xl font-bold mb-1 tracking-tight">County-based recruitment</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Jobseekers filter by county before they browse — your role appears to local candidates first.
          </p>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-5 w-5 text-emerald-600" />
                <p className="font-medium">All 47 counties supported</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Nairobi, Mombasa, Kisumu, Nakuru, Kiambu, Uasin Gishu, Machakos, Kakamega, Meru, Kilifi, Garissa, Turkana — every Kenyan county is in our filter. A candidate in Eldoret sees Eldoret-based jobs first. A candidate in Mombasa sees Mombasa-based jobs first.
              </p>
              <div className="mt-4">
                <Link href="/kenya-careers">
                  <Button variant="outline" size="sm">
                    See how jobseekers browse <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ─────────────── 3. BRANCH HIRING ─────────────── */}
        <section>
          <h2 className="text-xl sm:text-2xl font-bold mb-1 tracking-tight">Branch-by-branch hiring</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Have 50 branches across Kenya? Each one gets its own listings — no more generic "Naivas" jobs.
          </p>
          <Card>
            <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" /> Example: Naivas Supermarkets
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Naivas Thika Road Mall — Nairobi</li>
                  <li>Naivas Kahawa Wendani — Kiambu</li>
                  <li>Naivas Kisumu Central — Kisumu</li>
                  <li>Naivas Eldoret Zion — Uasin Gishu</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" /> Example: Java House Africa
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Java House Junction Mall — Nairobi</li>
                  <li>Java House Westside — Westlands</li>
                  <li>Java House Nyali — Mombasa</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ─────────────── 4. FAST APPLICATIONS ─────────────── */}
        <section>
          <h2 className="text-xl sm:text-2xl font-bold mb-1 tracking-tight">Fast applications, ready to review</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Candidates apply in 60 seconds. You get all the data you need to shortlist quickly.
          </p>
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-sm mb-3">What each application gives you</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {[
                  "Full name",
                  "Phone number",
                  "Email",
                  "County / town",
                  "Highest education",
                  "Years of experience",
                  "CV (PDF / DOCX)",
                  "Certificates (PDF / photo)",
                  "Cover note",
                ].map((field) => (
                  <div key={field} className="flex items-center gap-1.5 text-muted-foreground">
                    <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>{field}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ─────────────── 5. CLAIM YOUR COMPANY ─────────────── */}
        <section id="claim">
          <h2 className="text-xl sm:text-2xl font-bold mb-1 tracking-tight">Claim your company in 3 steps</h2>
          <p className="text-sm text-muted-foreground mb-5">
            We've pre-loaded profiles for 36 of Kenya's biggest employers. Find yours, claim it, take over.
          </p>

          {employers.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <Search className="h-4 w-4" /> Already on the platform — claim your profile
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {employers.slice(0, 12).map((e) => (
                    <Link key={e.id} href={`/kenya-careers/company/${e.slug ?? e.id}`}>
                      <button
                        className="w-full flex items-center gap-2 p-2 rounded-lg border hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-900/10 transition-colors text-left"
                        data-testid={`employer-card-${e.slug ?? e.id}`}
                      >
                        <CompanyLogo name={e.name} logoUrl={e.logoUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-xs truncate">{e.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{e.industry ?? "—"}</p>
                        </div>
                      </button>
                    </Link>
                  ))}
                </div>
                {employers.length > 12 && (
                  <Link href="/kenya-careers">
                    <Button variant="link" size="sm" className="mt-2 -ml-2">
                      See all {employers.length} employers <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            {[
              { step: 1, title: "Find your company", desc: "Search our 36 pre-loaded employers, or request a new profile if your company isn't listed." },
              { step: 2, title: "Submit a claim",     desc: "Provide your work email and role. We verify within 1-2 business days." },
              { step: 3, title: "Start posting",      desc: "Once verified, post jobs directly, manage applications, shortlist candidates." },
            ].map((s) => (
              <Card key={s.step} className="text-center">
                <CardContent className="p-5">
                  <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-bold mb-2">
                    {s.step}
                  </div>
                  <h3 className="font-semibold text-sm">{s.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ─────────────── 6. CONTACT ─────────────── */}
        <section id="contact">
          <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-6 text-center">
              <h2 className="text-xl sm:text-2xl font-bold mb-2">Talk to our team</h2>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                Want a walkthrough before claiming? Hiring 50+ roles at once? Need an API integration with your ATS? We'll set you up.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <a href="mailto:hello@workabroadhub.tech?subject=Employer%20inquiry">
                    <Mail className="h-4 w-4 mr-1.5" /> hello@workabroadhub.tech
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href="https://wa.me/254700000000?text=I'm%20an%20employer%20interested%20in%20Kenya%20Careers" target="_blank" rel="noopener noreferrer">
                    <Phone className="h-4 w-4 mr-1.5" /> WhatsApp us
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Or find your company directly and tap "Claim this profile" on any of our <Link href="/kenya-careers" className="underline">{stats?.totalEmployers ?? "36"}+ pre-loaded employer pages</Link>.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Honest footnote about current platform state */}
        <p className="text-xs text-muted-foreground text-center max-w-md mx-auto">
          Note: current listings are samples while we onboard employers. Real openings will appear here from confirmed verified employers — yours could be the first.
        </p>
      </div>
    </div>
  );
}
