/**
 * Kenyan Jobs hub (dashboard) — 2026-10 visual rebuild from Tony's reference.
 *
 * Replaces the two separate dashboard cards (DashboardKenyaCareersCard +
 * DashboardKaziKaribuCard) with one dark "Kenyan jobs marketplace" section:
 * section nav · hero · job search · Kenyan Jobs card · Kazi Karibu card ·
 * school hiring banner · trust strip.
 *
 * All numbers are live (/api/local-jobs/stats, /api/kazi-karibu/posts).
 * Only live employer postings are counted (no sample jobs), and "verified" is only
 * claimed when the verification process has actually verified someone.
 * Illustrations are inline SVG (no network cost, crisp on every screen).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Search, MapPin, ChevronDown, ChevronRight, ArrowRight, Briefcase, Home, School,
  ShieldCheck, Users, FileText, Building2, Loader2,
} from "lucide-react";
import { KenyaFlag } from "@/components/kenya-flag";
import { SchoolIllustration } from "@/components/school-recruitment-banner";
import { KENYA_COUNTIES } from "@/lib/school-constants";

interface HubStats {
  totalJobs: number; liveJobs: number;
  totalEmployers: number; verifiedEmployers: number; totalCounties: number;
  listedEmployers: number; listedCounties: number;
}

async function safeJson<T>(url: string, signal: AbortSignal): Promise<{ status: number; data: T | null }> {
  try {
    const res = await fetch(url, { signal, credentials: "include" });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || !ct.includes("application/json")) return { status: res.status, data: null };
    return { status: res.status, data: (await res.json()) as T };
  } catch { return { status: 0, data: null }; }
}

/* ── Illustrations ─────────────────────────────────────────────────────── */

export function NairobiSkyline() {
  // Stylised Nairobi CBD at dusk — KICC (cylinder + saucer), towers, acacias.
  return (
    <svg viewBox="0 0 520 300" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="kjh-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1638" />
          <stop offset="0.55" stopColor="#3b2a57" />
          <stop offset="0.8" stopColor="#c2633a" />
          <stop offset="1" stopColor="#f2a65a" />
        </linearGradient>
        <linearGradient id="kjh-bld" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2a4d" />
          <stop offset="1" stopColor="#0a142e" />
        </linearGradient>
      </defs>
      <rect width="520" height="300" fill="url(#kjh-dusk)" />
      {/* far towers */}
      <g fill="#24345d" opacity="0.85">
        <rect x="150" y="150" width="26" height="120" /><rect x="182" y="128" width="20" height="142" />
        <rect x="300" y="140" width="24" height="130" /><rect x="420" y="160" width="30" height="110" />
        <rect x="470" y="178" width="22" height="92" />
      </g>
      {/* main towers */}
      <g fill="url(#kjh-bld)">
        <rect x="210" y="82" width="34" height="188" /><polygon points="210,82 227,62 244,82" />
        <rect x="252" y="110" width="30" height="160" />
        <rect x="336" y="96" width="38" height="174" /><rect x="350" y="70" width="10" height="26" />
        <rect x="384" y="124" width="28" height="146" />
        {/* KICC */}
        <rect x="292" y="118" width="22" height="152" rx="3" />
        <ellipse cx="303" cy="116" rx="20" ry="5" />
        <rect x="301" y="96" width="4" height="16" />
      </g>
      {/* lit windows */}
      <g fill="#fcd34d" opacity="0.75">
        {[96, 112, 128, 144, 160, 176, 192, 208, 224].map((y, i) => (
          <g key={y}>
            <rect x={216 + (i % 3) * 8} y={y} width="3" height="5" />
            <rect x={342 + (i % 4) * 7} y={y + 8} width="3" height="5" />
            {i % 2 === 0 && <rect x={258 + (i % 3) * 8} y={y + 20} width="3" height="5" />}
            {i % 3 === 0 && <rect x={389 + (i % 2) * 9} y={y + 30} width="3" height="5" />}
          </g>
        ))}
      </g>
      {/* acacia tree line */}
      <g fill="#050c1f">
        <rect x="0" y="262" width="520" height="38" />
        {[20, 70, 120, 400, 455, 505].map((x, i) => (
          <g key={x}>
            <rect x={x - 2} y={238 - (i % 2) * 6} width="4" height="30" />
            <ellipse cx={x} cy={236 - (i % 2) * 6} rx={26 + (i % 3) * 5} ry="9" />
          </g>
        ))}
        <path d="M0 268 Q130 248 260 266 T520 262 V300 H0 Z" />
      </g>
    </svg>
  );
}

function NearbyMap() {
  return (
    <svg viewBox="0 0 300 220" className="absolute right-0 top-0 h-full w-[62%] max-w-[340px]" aria-hidden="true">
      <g stroke="#10b981" strokeOpacity="0.16" strokeWidth="1.2" fill="none">
        <path d="M0 40 L300 18" /><path d="M0 92 L300 70" /><path d="M0 150 L300 128" /><path d="M0 200 L300 182" />
        <path d="M40 0 L70 220" /><path d="M120 0 L140 220" /><path d="M200 0 L215 220" /><path d="M265 0 L280 220" />
        <path d="M0 120 Q90 100 160 140 T300 110" strokeOpacity="0.22" />
      </g>
      <path d="M40 190 C 90 170, 120 150, 150 120 S 200 70, 228 66" fill="none" stroke="#34d399" strokeWidth="2.5" strokeDasharray="5 7" strokeLinecap="round" opacity="0.8" />
      <circle cx="40" cy="190" r="4" fill="#34d399" opacity="0.8" />
      {/* pin with glow */}
      <circle cx="228" cy="92" r="30" fill="#10b981" opacity="0.12" />
      <path d="M228 34 C 246 34 258 47 258 63 C 258 84 228 112 228 112 C 228 112 198 84 198 63 C 198 47 210 34 228 34 Z" fill="#10b981" />
      <circle cx="228" cy="63" r="10" fill="#052e1f" />
    </svg>
  );
}

export function BackgroundCurves() {
  return (
    <svg viewBox="0 0 1200 800" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <g fill="none" stroke="#3b82f6" strokeOpacity="0.09" strokeWidth="2">
        <path d="M-50 200 C 300 80, 700 120, 1250 -40" />
        <path d="M-50 260 C 320 140, 720 190, 1250 30" strokeOpacity="0.06" />
        <path d="M600 900 C 820 600, 1000 520, 1260 470" strokeOpacity="0.12" />
        <path d="M680 900 C 880 640, 1040 580, 1260 540" strokeOpacity="0.07" />
      </g>
    </svg>
  );
}


/* ── Shared section nav (dashboard hub + /kenya-careers) ─────────────────
 * Per Tony's spec: ONLY Find Jobs · Kenyan Jobs Section · Kazi Karibu ·
 * For Schools · Post a Job. No brand name, logo or Login button. */
export function KenyaSectionNav({ onFindJobs }: { onFindJobs: () => void }) {
  const navItems = [
    { key: "find",    label: "Find Jobs",           icon: Search,  onClick: onFindJobs },
    { key: "kenya",   label: "Kenyan Jobs Section", icon: null,    href: "/kenya-careers", active: true },
    { key: "kazi",    label: "Kazi Karibu",         icon: Home,    href: "/kazi-karibu" },
    { key: "schools", label: "For Schools",         icon: School,  href: "/kenya-careers/schools" },
  ] as const;
  return (
      <nav aria-label="Kenyan jobs" className="relative border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-8 h-auto md:h-[76px] py-3 md:py-0">
          <ul className="grid grid-cols-4 md:flex md:flex-1 md:justify-center md:gap-5 lg:gap-10 w-full md:w-auto gap-1">
            {navItems.map((n) => {
              const inner = (
                <span className={`relative flex flex-col md:flex-row items-center gap-1 md:gap-2.5 py-2 md:py-0 md:h-[76px] text-[11px] md:text-[14px] lg:text-[16px] md:whitespace-nowrap font-medium text-center md:text-left leading-tight transition-colors ${"active" in n && n.active ? "text-white" : "text-slate-300 hover:text-white"}`}>
                  {n.icon ? <n.icon className="h-5 w-5 md:h-[22px] md:w-[22px]" aria-hidden="true" /> : <KenyaFlag width={26} animated={false} className="rounded-[2px] overflow-hidden" />}
                  <span>{n.label}</span>
                  {"active" in n && n.active && <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-blue-500 hidden md:block" aria-hidden="true" />}
                </span>
              );
              return (
                <li key={n.key} className="min-w-0">
                  {"href" in n ? (
                    <Link href={n.href} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" aria-current={"active" in n && n.active ? "page" : undefined}>{inner}</Link>
                  ) : (
                    <button type="button" onClick={n.onClick} className="block w-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{inner}</button>
                  )}
                </li>
              );
            })}
          </ul>
          <Link
            href="/employer/dashboard"
            className="hidden md:inline-flex shrink-0 items-center gap-2.5 h-[48px] lg:h-[52px] px-5 lg:px-7 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 text-[16px] font-semibold shadow-[0_8px_24px_-8px_rgba(37,99,235,0.7)] hover:brightness-110 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            data-testid="kjh-post-job"
          >
            <Briefcase className="h-5 w-5" aria-hidden="true" /> Post a Job
          </Link>
        </div>
        {/* Mobile: Post a Job as a full-width touch target under the 4 items */}
        <div className="md:hidden px-4 pb-3">
          <Link href="/employer/dashboard"
            className="flex items-center justify-center gap-2 h-11 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 text-[15px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            data-testid="kjh-post-job-mobile">
            <Briefcase className="h-5 w-5" aria-hidden="true" /> Post a Job
          </Link>
        </div>
      </nav>
  );
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function KenyaJobsHub() {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<HubStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [kaziAvailable, setKaziAvailable] = useState<boolean | null>(null);
  const [counties, setCounties] = useState<string[]>(KENYA_COUNTIES);
  const [keyword, setKeyword] = useState("");
  const [county, setCounty] = useState("");
  const [searching, setSearching] = useState(false);
  const keywordRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      const [s, f, k] = await Promise.all([
        safeJson<any>("/api/local-jobs/stats", ac.signal),
        safeJson<any>("/api/local-jobs/filters", ac.signal),
        safeJson<any>("/api/kazi-karibu/posts?limit=1", ac.signal),
      ]);
      if (ac.signal.aborted) return;
      if (s.data) {
        setStats({
          totalJobs: Number(s.data.totalJobs ?? 0), liveJobs: Number(s.data.liveJobs ?? 0),
          totalEmployers: Number(s.data.totalEmployers ?? 0),
          verifiedEmployers: Number(s.data.verifiedEmployers ?? 0), totalCounties: Number(s.data.totalCounties ?? 0),
          listedEmployers: Number(s.data.listedEmployers ?? s.data.totalEmployers ?? 0), listedCounties: Number(s.data.listedCounties ?? s.data.totalCounties ?? 0),
        });
      } else setStatsError(true);
      if (Array.isArray(f.data?.counties) && f.data.counties.length) setCounties(f.data.counties.map(String));
      // Kazi Karibu is feature-flagged: 404 = off (keep the old card's behaviour).
      setKaziAvailable(k.status === 404 ? false : true);
    })();
    return () => ac.abort();
  }, []);

  function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (searching) return;
    const q = keyword.replace(/\s+/g, " ").trim().slice(0, 80);
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (county && counties.includes(county)) params.set("county", county);
    setSearching(true);
    navigate(`/kenya-careers${params.toString() ? `?${params}` : ""}`);
  }

  function focusSearch() {
    searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => keywordRef.current?.focus({ preventScroll: true }), 300);
  }

  const jobsStat = useMemo(() => {
    if (!stats) return null;
    // Live employer postings only — shows 0 until employers post.
    return { n: stats.liveJobs, label: stats.liveJobs === 1 ? "job" : "jobs" };
  }, [stats]);


  const showKazi = kaziAvailable !== false;

  return (
    // 2026-10: the dashboard column is max-w-2xl (672px). Let this section
    // break out to the reference's desktop width (≤1240px, always 1.5rem
    // clear of each viewport edge → no horizontal scroll).
    <div className="w-full md:relative md:left-1/2 md:-translate-x-1/2 md:w-[min(1240px,calc(100vw-3rem))] md:max-w-none">
    <section
      aria-label="Kenyan jobs marketplace"
      className="kjh relative overflow-hidden rounded-[28px] border border-blue-950/60 bg-[#050b1f] text-white shadow-[0_20px_60px_-20px_rgba(2,6,23,0.8)]"
      style={{ backgroundImage: "radial-gradient(1200px 500px at 85% -10%, rgba(37,99,235,0.18), transparent 60%), radial-gradient(900px 500px at -10% 110%, rgba(16,185,129,0.10), transparent 60%), linear-gradient(180deg,#060d24 0%,#050b1f 100%)" }}
      data-testid="kenya-jobs-hub"
    >
      <BackgroundCurves />

      <KenyaSectionNav onFindJobs={focusSearch} />

      <div className="relative px-4 sm:px-8 pt-7 sm:pt-9 pb-6 sm:pb-8">
        {/* ── Hero ── */}
        <span className="inline-block rounded-full bg-[#0c1a3f]/90 ring-1 ring-blue-400/15 px-4 py-2 text-[11px] sm:text-[13px] font-semibold tracking-[0.14em] text-slate-200">
          KENYAN JOBS MARKETPLACE
        </span>
        <h2 className="mt-4 font-['Plus_Jakarta_Sans',sans-serif] font-extrabold tracking-[-0.03em] leading-[1.05] text-[34px] sm:text-[46px] lg:text-[58px]">
          Find your next{" "}
          <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">opportunity in Kenya</span>
        </h2>
        <p className="mt-2 text-[17px] sm:text-[22px] lg:text-[26px] font-medium text-[#5aa9ff]">
          Real local jobs. Trusted employers. Free to browse.
        </p>

        {/* ── Search panel ── */}
        <div ref={searchRef} className="mt-6">
          <form onSubmit={runSearch} role="search" className="grid grid-cols-1 md:grid-cols-[1.55fr_1fr_auto] gap-3 rounded-2xl bg-[#0a1430]/80 ring-1 ring-white/[0.07] p-2.5 sm:p-3 backdrop-blur" data-testid="kjh-search">
            <label className="flex items-center gap-4 rounded-xl bg-[#0b1736] ring-1 ring-white/[0.07] px-5 h-[68px] focus-within:ring-blue-500/60">
              <Search className="h-6 w-6 shrink-0 text-slate-300" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium text-slate-100">Job title or keyword</span>
                <input
                  ref={keywordRef}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value.slice(0, 80))}
                  placeholder="e.g. Teacher, Driver, Cook, Accountant"
                  className="w-full bg-transparent text-[14px] text-white placeholder:text-slate-400 outline-none"
                  enterKeyHint="search"
                  aria-label="Job title or keyword"
                />
              </span>
            </label>
            <label className="relative flex items-center gap-4 rounded-xl bg-[#0b1736] ring-1 ring-white/[0.07] px-5 h-[68px] focus-within:ring-blue-500/60">
              <MapPin className="h-6 w-6 shrink-0 text-blue-400" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium text-slate-100">County</span>
                <select
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                  className="w-full appearance-none bg-transparent text-[14px] outline-none pr-6 cursor-pointer"
                  style={{ color: county ? "#fff" : "#94a3b8" }}
                  aria-label="County"
                >
                  <option value="" className="text-slate-900">e.g. Nairobi, Mombasa, Kiambu</option>
                  {counties.map((c) => <option key={c} value={c} className="text-slate-900">{c}</option>)}
                </select>
              </span>
              <ChevronDown className="pointer-events-none absolute right-5 h-5 w-5 text-slate-300" aria-hidden="true" />
            </label>
            <button
              type="submit"
              disabled={searching}
              className="inline-flex items-center justify-center gap-3 h-[68px] px-10 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 text-[18px] sm:text-[20px] font-semibold shadow-[0_10px_30px_-10px_rgba(16,185,129,0.6)] hover:brightness-110 disabled:opacity-80 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              data-testid="kjh-search-btn"
            >
              {searching ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <Search className="h-6 w-6" aria-hidden="true" />}
              Search Jobs
            </button>
          </form>
        </div>

        {/* ── Two cards ── */}
        <div className={`mt-6 grid gap-5 ${showKazi ? "lg:grid-cols-2" : ""}`}>
          {/* Kenyan Jobs Section card */}
          <article className="relative overflow-hidden rounded-[22px] ring-1 ring-blue-500/35 bg-[#081331] min-h-[320px] shadow-[0_0_40px_-12px_rgba(37,99,235,0.45)]" data-testid="kjh-kenya-card">
            <div className="absolute inset-y-0 right-0 w-full sm:w-[62%]">
              <NairobiSkyline />
              <div className="absolute inset-0 bg-gradient-to-r from-[#081331] via-[#081331]/45 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#081331]/80 via-transparent to-transparent sm:hidden" />
            </div>
            <Link href="/kenya-careers" aria-label="Open Kenyan Jobs Section"
              className="absolute right-5 top-5 z-10 grid h-12 w-12 place-items-center rounded-full bg-[#14244f]/90 ring-1 ring-white/10 hover:bg-[#1c3166] transition">
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <div className="relative z-[1] p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-3 pr-14">
                <KenyaFlag width={54} animated={false} className="rounded-[4px] overflow-hidden ring-1 ring-white/20" />
                <span className="rounded-full bg-emerald-500/12 ring-1 ring-emerald-400/25 px-3.5 py-1.5 text-[11px] sm:text-[13px] font-semibold tracking-[0.06em] text-emerald-300">LOCAL OPPORTUNITIES</span>
              </div>
              <h3 className="mt-4 text-[28px] sm:text-[38px] font-bold tracking-tight leading-tight">Kenyan Jobs Section</h3>
              <p className="mt-1.5 max-w-[340px] text-[16px] sm:text-[18px] text-slate-200 leading-snug">Explore job opportunities from employers across Kenya.</p>

              <div className="mt-5 grid grid-cols-3 gap-2 max-w-[460px]" aria-live="polite">
                {stats ? (
                  <>
                    <StatChip icon={<Building2 className="h-7 w-7 text-blue-500" aria-hidden="true" />} n={stats.listedEmployers} label="employers" />
                    <StatChip icon={<Briefcase className="h-7 w-7 text-emerald-400" aria-hidden="true" />} n={jobsStat!.n} label={jobsStat!.label} />
                    <StatChip icon={<MapPin className="h-7 w-7 text-blue-400" aria-hidden="true" />} n={stats.listedCounties} label="counties" />
                  </>
                ) : statsError ? (
                  <p className="text-sm text-slate-400">Live numbers are unavailable right now.</p>
                ) : (
                  [0, 1, 2].map((i) => <div key={i} className="h-[58px] w-[118px] rounded-xl bg-white/[0.05] animate-pulse" />)
                )}
              </div>

              <Link href="/kenya-careers"
                className="mt-6 inline-flex items-center gap-3 h-[52px] px-6 sm:px-11 whitespace-nowrap rounded-full bg-blue-700 hover:bg-blue-600 text-[15px] sm:text-[17px] font-semibold shadow-[0_8px_24px_-8px_rgba(29,78,216,0.9)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                data-testid="kjh-explore">
                Explore Kenyan Jobs <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
          </article>

          {/* Kazi Karibu card */}
          {showKazi && (
            <article className="relative overflow-hidden rounded-[22px] ring-1 ring-emerald-500/35 bg-[#061a24] min-h-[320px]"
              style={{ backgroundImage: "radial-gradient(500px 300px at 90% 20%, rgba(16,185,129,0.12), transparent 70%), linear-gradient(135deg,#071a2a 0%,#06201f 100%)" }}
              data-testid="kjh-kazi-card">
              <NearbyMap />
              <Link href="/kazi-karibu" aria-label="Open Kazi Karibu"
                className="absolute right-5 top-5 z-10 grid h-12 w-12 place-items-center rounded-full bg-[#0f2a3c]/90 ring-1 ring-white/10 hover:bg-[#143650] transition">
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <div className="relative z-[1] p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-3 pr-14">
                  <Home className="h-10 w-10 text-emerald-400" strokeWidth={2.4} aria-hidden="true" />
                  <span className="rounded-full bg-emerald-500/12 ring-1 ring-emerald-400/25 px-3.5 py-1.5 text-[11px] sm:text-[13px] font-semibold tracking-[0.06em] text-emerald-300">NEARBY &amp; EVERYDAY WORK</span>
                </div>
                <h3 className="mt-4 text-[28px] sm:text-[38px] font-bold tracking-tight leading-tight">Kazi Karibu</h3>
                <p className="mt-1.5 max-w-[440px] text-[16px] sm:text-[18px] leading-snug text-slate-200">
                  <span className="text-emerald-400">Find nearby work in</span> hospitality, driving, home support, trades and more.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <InfoChip icon={<ShieldCheck className="h-6 w-6 text-emerald-400" aria-hidden="true" />} title="AI-moderated" text="Safe & trusted listings" />
                  <InfoChip icon={<Users className="h-6 w-6 text-emerald-400" aria-hidden="true" />} title="Free to apply" text="No fees to browse jobs" />
                </div>
                <Link href="/kazi-karibu"
                  className="mt-6 inline-flex items-center gap-3 h-[52px] px-6 sm:px-11 whitespace-nowrap rounded-full ring-1 ring-emerald-400/70 bg-[#06261f]/70 hover:bg-emerald-500/15 text-[15px] sm:text-[17px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                  data-testid="kjh-kazi">
                  Find Nearby Work <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
              </div>
            </article>
          )}
        </div>

        {/* ── School recruitment banner ── */}
        <div className="mt-5 rounded-[20px] p-[1px] bg-gradient-to-r from-blue-600/60 via-blue-500/30 to-emerald-500/60" data-testid="kjh-school-banner">
          <div className="relative overflow-hidden rounded-[19px] bg-gradient-to-r from-[#0b1d4a] via-[#0a1a44] to-[#0b2350] grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(240px,1fr)_auto_auto] items-center gap-x-6 gap-y-4 md:pr-6 pb-5 md:py-4 xl:py-0">
            <div className="relative h-[150px] md:h-full md:min-h-[150px] xl:h-[128px] xl:min-h-0 overflow-hidden md:row-span-2 xl:row-span-1 self-stretch">
              <SchoolIllustration className="absolute inset-0 h-full w-full object-cover scale-[1.35] origin-left" />
              <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-transparent via-transparent to-[#0b1d4a]" />
            </div>
            <div className="min-w-0 px-5 md:px-0">
              <span className="inline-block rounded-full bg-emerald-500/12 ring-1 ring-emerald-400/25 px-3 py-1 text-[11px] sm:text-[12px] font-semibold tracking-[0.08em] text-emerald-300 whitespace-nowrap">FOR SCHOOLS IN KENYA</span>
              <h3 className="mt-2 text-[22px] sm:text-[28px] font-bold tracking-tight leading-tight">Are you hiring for a school?</h3>
              <p className="mt-0.5 text-[14px] sm:text-[16px] text-slate-200">Reach qualified teachers and education professionals across Kenya.</p>
            </div>
            <div className="px-5 md:px-0 md:col-start-2 xl:col-start-auto flex flex-col gap-4 items-start xl:contents">
              <ul className="space-y-1.5 xl:border-l xl:border-r xl:border-white/10 xl:px-6 xl:py-6">
                {["Post teaching & non-teaching jobs", "Reach qualified candidates", "Manage applications easily"].map((b) => (
                  <li key={b} className="flex items-center gap-2.5 text-[14px] text-slate-100 xl:whitespace-nowrap">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-[#052e1f] text-[12px] font-bold" aria-hidden="true">✓</span>
                    {b}
                  </li>
                ))}
              </ul>
              <Link href="/kenya-careers/schools"
                className="inline-flex items-center justify-center gap-3 h-[60px] px-7 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 ring-1 ring-blue-300/30 text-[17px] font-semibold whitespace-nowrap shadow-[0_10px_30px_-10px_rgba(37,99,235,0.9)] hover:brightness-110 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 w-full sm:w-auto"
                data-testid="kjh-post-school-vacancy">
                <Briefcase className="h-5 w-5" aria-hidden="true" /> Post a School Vacancy <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>

        {/* ── Trust strip ── */}
        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-white/10 gap-4 sm:gap-0" aria-label="Why job-seekers trust Kenyan Jobs">
          <TrustItem icon={<ShieldCheck className="h-8 w-8 text-emerald-400" aria-hidden="true" />} title="Verified employers" text="Work with trusted organisations" href="/kenya-careers" />
          <TrustItem icon={<FileText className="h-8 w-8 text-emerald-400" aria-hidden="true" />} title="Clear job details" text="Know what to expect" href="/kenya-careers" />
          <TrustItem icon={<Users className="h-8 w-8 text-emerald-400" aria-hidden="true" />} title="Safe job-seeking tips" text="Practical guidance for job seekers" href="/guides" />
        </ul>

      </div>
    </section>
    </div>
  );
}

function StatChip({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-3 rounded-xl bg-[#0d1b40]/85 ring-1 ring-white/[0.07] px-3 sm:px-3.5 py-2.5 min-w-0">
      <span className="[&>svg]:h-6 [&>svg]:w-6 sm:[&>svg]:h-7 sm:[&>svg]:w-7">{icon}</span>
      <div className="leading-tight min-w-0">
        <p className="text-[18px] sm:text-[20px] font-semibold">{n.toLocaleString()}</p>
        <p className="text-[12px] sm:text-[13px] text-slate-300">{label}</p>
      </div>
    </div>
  );
}

function InfoChip({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#0a2a2a]/70 ring-1 ring-white/[0.06] px-4 py-3">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/15">{icon}</span>
      <div className="leading-tight">
        <p className="text-[15px] font-medium">{title}</p>
        <p className="text-[13px] text-slate-300">{text}</p>
      </div>
    </div>
  );
}

function TrustItem({ icon, title, text, href }: { icon: React.ReactNode; title: string; text: string; href: string }) {
  return (
    <li className="flex justify-center">
      <Link href={href} className="flex items-center gap-4 px-6 py-1 rounded-lg hover:bg-white/[0.03] transition">
        {icon}
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold text-white">{title}</span>
          <span className="block text-[13px] text-slate-400">{text}</span>
        </span>
      </Link>
    </li>
  );
}
