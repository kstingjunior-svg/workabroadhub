import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRO_FEATURES } from "@/lib/plan-features";
import { Globe, Shield, FileCheck, CheckCircle, AlertTriangle, ExternalLink, Briefcase, GraduationCap, Building2, Sparkles, ArrowRight, BadgeCheck, TrendingUp, Users, HelpCircle, ChevronDown, CreditCard, ClipboardList, MessageCircle, Mail, Phone, MapPin, BarChart3, FileText, ShieldAlert, Download, Wrench, Smartphone, Headphones } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/language-selector";
import { SuccessStoriesSection } from "@/components/success-stories-section";
import { AdvisorsSection } from "@/components/advisors-section";
import { PlatformStatsSection } from "@/components/platform-stats-section";
import { trackLandingView, trackButtonClick } from "@/lib/analytics";
import { AuthModal } from "@/components/auth-modal";
import { useToast } from "@/hooks/use-toast";
import { useFirebasePresence } from "@/hooks/use-firebase-presence";
import { useVerifiedSuccessStories } from "@/lib/firebase-success-stories";
import SubmitForReviewModal from "@/components/submit-for-review-modal";

export default function Landing() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<"login" | "signup">("signup");
  const [authRedirectPath, setAuthRedirectPath] = useState<string | undefined>(undefined);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);

  const openSignUp = () => { setAuthModalTab("signup"); setAuthModalOpen(true); };
  const openLogin = () => { setAuthModalTab("login"); setAuthModalOpen(true); };

  const { data: agencyStats } = useQuery<{ total: number; valid: number; expired: number; lastUpdated: string }>({
    queryKey: ["/api/agencies/stats"],
    staleTime: 55_000,
    refetchInterval: 60_000,
  });

  const agencyTotal = agencyStats?.total?.toLocaleString() ?? "…";
  const agencyValid = agencyStats?.valid?.toLocaleString() ?? "…";
  const agencyExpired = agencyStats?.expired?.toLocaleString() ?? "…";
  const agencyLastUpdated = agencyStats?.lastUpdated
    ? new Date(agencyStats.lastUpdated).toLocaleString("en-KE", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  const { data: publicStats } = useQuery<{
    totalUsers: number;
    activeVisitors: number;
    expiredAgencies: number;
    activePortals: number;
    successStories: number;
    consultationsCompleted: number;
    agencyReviews: number;
    countriesServed: number;
  }>({
    queryKey: ["/api/public/stats"],
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  const { data: recentActivity } = useQuery<Array<{
    id: number;
    type: string;
    location: string | null;
    createdAt: string;
  }>>({
    queryKey: ["/api/notifications/recent"],
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  const { activeVisitors: fbVisitors, visitorList, myVisitorId, recentSignups: fbSignups } = useFirebasePresence();
  const verifiedPlacements = useVerifiedSuccessStories(10);

  // Track landing page view, capture referral code, and detect post-deletion redirect
  useEffect(() => {
    trackLandingView();
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get("ref");
    if (ref) {
      localStorage.setItem("ref", ref);
    }
    if (urlParams.get("account_deleted") === "1") {
      // Clean the param from the URL without a reload
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
      // Show confirmation toast
      toast({
        title: "Account deleted",
        description: "Your account and all data have been permanently erased. Create a new account to get started again.",
        duration: 8000,
      });
      // Open the sign-up modal automatically
      setAuthModalTab("signup");
      setAuthModalOpen(true);
    }
    // Auto-open login modal when redirected from a protected page
    const redirect = urlParams.get("redirect");
    if (redirect && redirect !== "/" && redirect !== "/dashboard") {
      setAuthRedirectPath(redirect);
      setAuthModalTab("login");
      setAuthModalOpen(true);
      // Clean the redirect param from the URL bar
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  
  const features = [
    {
      icon: BadgeCheck,
      title: "Verified Job Portals",
      subtitle: "Apply with confidence",
      description: "No more guessing which sites are real. We've hand-picked verified job portals from official sources — curated and regularly reviewed for authenticity.",
      gradient: "from-emerald-500 to-teal-600",
      bgGradient: "from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/40 dark:to-teal-950/40",
      iconBg: "bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/60 dark:to-teal-900/60",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      stat: "30+ portals"
    },
    {
      icon: GraduationCap,
      title: "Expert Career Guidance",
      subtitle: "Land interviews faster",
      description: "From CV formatting to interview prep, get country-specific tips that actually work. Our guides are built by professionals who know what employers want.",
      gradient: "from-blue-500 to-indigo-600",
      bgGradient: "from-blue-50/80 to-indigo-50/80 dark:from-blue-950/40 dark:to-indigo-950/40",
      iconBg: "bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/60 dark:to-indigo-900/60",
      iconColor: "text-blue-600 dark:text-blue-400",
      stat: "6 countries"
    },
    {
      icon: Shield,
      title: "Scam Protection Tools",
      subtitle: "Stay safe, stay smart",
      description: "Before you pay any agency or recruiter, verify their license in our database. We expose expired licenses and fake recruiters so you never get scammed.",
      gradient: "from-amber-500 to-orange-600",
      bgGradient: "from-amber-50/80 to-orange-50/80 dark:from-amber-950/40 dark:to-orange-950/40",
      iconBg: "bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/60 dark:to-orange-900/60",
      iconColor: "text-amber-600 dark:text-amber-400",
      stat: `${agencyTotal} agencies`
    }
  ];

  const countries = [
    { 
      code: "US", 
      name: "United States", 
      tagline: "Federal & private sector jobs",
      portals: "3+ verified portals",
      demand: "High demand",
      gradient: "from-blue-600 to-red-600"
    },
    { 
      code: "CA", 
      name: "Canada", 
      tagline: "Skilled worker programs",
      portals: "5+ verified portals",
      demand: "Express Entry",
      gradient: "from-red-500 to-red-600"
    },
    { 
      code: "UK", 
      name: "United Kingdom", 
      tagline: "NHS & skilled migration",
      portals: "5+ verified portals",
      demand: "Tier 2 Visa",
      gradient: "from-blue-700 to-red-700"
    },
    { 
      code: "AU", 
      name: "Australia", 
      tagline: "Points-based migration",
      portals: "5+ verified portals",
      demand: "Skilled visas",
      gradient: "from-blue-600 to-yellow-500"
    },
    { 
      code: "AE", 
      name: "UAE / Gulf States", 
      tagline: "Tax-free opportunities",
      portals: "5+ verified portals",
      demand: "High salaries",
      gradient: "from-green-600 to-red-600"
    },
    { 
      code: "EU", 
      name: "Europe", 
      tagline: "7 countries covered",
      portals: "14+ verified portals",
      demand: "EU Blue Card",
      gradient: "from-blue-600 to-yellow-500"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav 
        className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="" className="h-9 w-9 rounded-xl object-cover" aria-hidden="true" />
              <span className="font-bold text-lg" aria-label="WorkAbroad Hub - Home">WorkAbroad Hub</span>
            </div>
            <div className="hidden md:flex items-center gap-8" role="menubar">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium touch-target-min flex items-center" data-testid="link-features" role="menuitem">Features</a>
              <a href="#countries" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium touch-target-min flex items-center" data-testid="link-countries" role="menuitem">Countries</a>
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium touch-target-min flex items-center" data-testid="link-how-it-works-nav" role="menuitem">How It Works</a>
              <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium touch-target-min flex items-center" data-testid="link-pricing" role="menuitem">Pricing</a>
              <a href="/faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium touch-target-min flex items-center" data-testid="link-faq" role="menuitem">FAQ</a>
              <a href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium touch-target-min flex items-center" data-testid="link-about" role="menuitem">About</a>
              <a href="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium touch-target-min flex items-center" data-testid="link-contact-nav" role="menuitem">Contact</a>
              <a href="/visa-guides" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium touch-target-min flex items-center" data-testid="link-visa-guides-nav" role="menuitem">Visa Guides</a>
              <a href="/visa-assistant" className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors touch-target-min flex items-center gap-1" data-testid="link-visa-assistant-nav" role="menuitem">✨ AI Assistant</a>
              <a href="/green-card" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium touch-target-min flex items-center" data-testid="link-green-card-nav" role="menuitem">🇺🇸 Green Card</a>
            </div>
            <div className="flex items-center gap-3">
              <LanguageSelector />
              <Button variant="ghost" size="sm" onClick={openLogin} data-testid="button-login" aria-label="Log in to your account">
                {t("common.login")}
              </Button>
              <Button size="sm" onClick={openSignUp} data-testid="button-get-started" aria-label="Sign up for a new account">
                {t("common.signUp")}
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-16" role="main">
        {/* Hero Section - Human Centered Trust Panel */}
        <section
          id="hero"
          aria-labelledby="hero-heading"
          style={{ backgroundColor: '#F4F2EE' }}
          className="px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:pb-16"
        >
          <div className="max-w-6xl mx-auto">

            {/* Live feed bar — real data */}
            <div
              className="bg-white px-3 sm:px-5 pt-3 pb-4 mb-6"
              style={{ border: '1px solid #E2DDD5', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
              data-testid="live-feed-bar"
            >
              {/* Stats rows — stack on mobile, inline on sm+ */}
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-y-2 sm:gap-x-6 text-sm mb-3">

                {/* LIVE badge + visitor count — full-width row on mobile */}
                <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 font-semibold text-xs uppercase tracking-widest" style={{ color: '#4A6A5E' }}>
                      <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: '#4A6A5E' }} />
                      LIVE
                    </div>
                    <span style={{ color: '#2A3A4A' }}>
                      <strong style={{ color: '#1A2530' }} data-testid="visitor-count">
                        {fbVisitors ?? publicStats?.activeVisitors ?? '…'}
                      </strong>{' '}
                      {(fbVisitors ?? publicStats?.activeVisitors ?? 0) === 1 ? 'person' : 'people'} browsing now
                    </span>
                  </div>

                  {/* Total members — right-aligned on mobile, separate item on sm+ */}
                  <span className="text-xs sm:hidden" style={{ color: '#5C6A7A' }}>
                    <strong style={{ color: '#1A2530' }}>
                      {publicStats?.totalUsers?.toLocaleString() ?? '…'}
                    </strong>{' '}members
                  </span>
                </div>

                {/* Latest signup activity — full-width on mobile */}
                {(() => {
                  const latest = fbSignups[0] ?? (recentActivity?.[0] ? { type: recentActivity[0].type, location: recentActivity[0].location ?? 'Kenya' } : null);
                  return latest ? (
                    <div className="px-2.5 py-1 text-xs w-full sm:w-auto" style={{ background: '#F9F8F6', color: '#2A3A4A' }}>
                      {latest.type === 'signup'
                        ? <>Someone from <strong>{latest.location}</strong> just joined</>
                        : <>Someone from <strong>{latest.location}</strong> just upgraded to Pro</>}
                    </div>
                  ) : null;
                })()}

                {/* Total members — hidden on mobile (shown inline above), visible sm+ */}
                <span className="hidden sm:inline text-xs" style={{ color: '#5C6A7A' }}>
                  Total members:{' '}
                  <strong style={{ color: '#1A2530' }}>
                    {publicStats?.totalUsers?.toLocaleString() ?? '…'}
                  </strong>
                </span>
              </div>

              {/* Visitor location chips — fewer on mobile */}
              {visitorList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {visitorList.slice(0, typeof window !== 'undefined' && window.innerWidth < 640 ? 6 : 12).map((v) => {
                    const isMe = v.id === myVisitorId;
                    const location = v.city ? `${v.city}, ${v.country}` : v.country;
                    return (
                      <div
                        key={v.id}
                        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 text-[0.7rem] sm:text-xs"
                        style={{
                          background: isMe ? '#E3EDE9' : '#F4F2EE',
                          border: `1px solid ${isMe ? '#4A6A5E' : '#E2DDD5'}`,
                          color: '#2A3A4A',
                        }}
                        data-testid={`visitor-chip-${v.id}`}
                      >
                        <span className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: '#4A6A5E' }} />
                        📍 {location}
                        {v.currentPage && v.currentPage !== 'Home' && (
                          <span className="hidden sm:inline" style={{ color: '#7A8A9A' }}>· {v.currentPage}</span>
                        )}
                        {isMe && <span style={{ color: '#4A6A5E', fontWeight: 600 }}>(You)</span>}
                      </div>
                    );
                  })}
                  {visitorList.length > 12 && (
                    <div
                      className="flex items-center px-2 sm:px-2.5 py-1 text-[0.7rem] sm:text-xs"
                      style={{ background: '#F4F2EE', border: '1px solid #E2DDD5', color: '#5C6A7A' }}
                    >
                      +{visitorList.length - 12} more
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Two-column trust panel — sharp corners, ministry look */}
            <div
              className="grid md:grid-cols-[1fr_1.2fr] gap-0 bg-white"
              style={{ border: '1px solid #E2DDD5' }}
            >
              {/* LEFT: Human message */}
              <div className="p-7 sm:p-9" style={{ borderRight: '1px solid #E2DDD5' }}>
                <h1
                  id="hero-heading"
                  className="leading-tight mb-3"
                  style={{
                    fontFamily: "'Crimson Pro', serif",
                    fontWeight: 600,
                    fontSize: 'clamp(2rem, 4vw, 2.8rem)',
                    color: '#1A2530',
                    letterSpacing: '-0.01em',
                  }}
                  data-testid="hero-heading"
                >
                  Your career abroad.<br />Guided by professionals.
                </h1>

                <p className="text-base mb-1" style={{ color: '#3A4A5A' }}>
                  Curated portals. No recruitment fees. No fake promises.
                </p>

                {/* Official disclaimer */}
                <div
                  className="my-6 p-5 text-sm leading-relaxed"
                  style={{
                    background: '#EDE9E2',
                    borderLeft: '6px solid #8B7A66',
                    color: '#3A4A5A',
                  }}
                  data-testid="disclaimer-box"
                >
                  <strong className="block mb-2 text-xs uppercase tracking-wider" style={{ color: '#1A2530' }}>
                    Official Disclaimer — Please Read
                  </strong>
                  WorkAbroad Hub is NOT a recruitment agency. We do not charge for job placements, visas, or interviews. Your KES 4,500 consultation fee covers personalized guidance, access to our verified portal database, and NEA verification tools. All job applications are made directly by you on official employer websites.
                </div>

                {/* Consultation includes */}
                <div>
                  <p className="font-semibold text-sm mb-3" style={{ color: '#1A2530' }}>Consultation Includes:</p>
                  <ul className="space-y-2 text-sm" style={{ color: '#3A4A5A' }}>
                    {[
                      '1-on-1 WhatsApp session with advisor',
                      'Access to 30+ verified job portals',
                      'NEA license verification database',
                      'CV templates for 6 countries',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#4A6A5E' }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA */}
                <button
                  onClick={openSignUp}
                  className="mt-8 w-full sm:w-auto px-8 py-4 font-semibold text-base bg-yellow-400 hover:bg-yellow-300 transition-colors"
                  style={{ color: '#1A2530' }}
                  data-testid="button-hero-cta"
                >
                  Get Started Free – Create Your Account
                </button>

                <div className="mt-3">
                  <a
                    href="#how-it-works"
                    className="text-sm underline underline-offset-2"
                    style={{ color: '#5C6A7A' }}
                    data-testid="link-how-it-works"
                  >
                    See How It Works
                  </a>
                </div>
              </div>

              {/* RIGHT: NEA database */}
              <div className="p-7 sm:p-9">
                <h2
                  className="text-2xl mb-1"
                  style={{
                    fontFamily: "'Crimson Pro', serif",
                    fontWeight: 600,
                    color: '#1A2530',
                    borderBottom: '2px solid #D1CEC8',
                    paddingBottom: '0.75rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  NEA License Verification
                </h2>
                <p className="text-sm mb-5" style={{ color: '#5C6A7A' }}>
                  Official database of registered employment agencies. Updated weekly.
                </p>

                {/* Counters */}
                <div className="flex gap-10 mb-3 text-center">
                  <div data-testid="counter-valid">
                    <div
                      className="leading-none mb-1"
                      data-stat="valid"
                      style={{ fontFamily: "'Crimson Pro', serif", fontWeight: 600, fontSize: '3rem', color: '#1A2530' }}
                    >{agencyValid}</div>
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#5C6A7A' }}>Active Licenses</div>
                  </div>
                  <div data-testid="counter-expired">
                    <div
                      className="leading-none mb-1"
                      data-stat="expired"
                      style={{ fontFamily: "'Crimson Pro', serif", fontWeight: 600, fontSize: '3rem', color: '#1A2530' }}
                    >{agencyExpired}</div>
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#5C6A7A' }}>Expired / Revoked</div>
                  </div>
                </div>

                {/* Last updated + total */}
                <p className="mb-5 text-xs" style={{ color: '#7A8A9A' }}>
                  📅 Updated:{" "}
                  <span data-stat="lastUpdated">
                    {agencyLastUpdated ?? "…"}
                  </span>
                  {" · "}Total:{" "}
                  <span data-stat="total">{agencyTotal}</span> agencies
                </p>

                {/* Agency sample card */}
                <div
                  className="p-5 text-sm"
                  style={{ background: '#F9F8F6', border: '1px solid #E2DDD5' }}
                  data-testid="sample-agency-card"
                >
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-semibold" style={{ color: '#1A2530' }}>ABC Recruitment Ltd.</span>
                    <span
                      className="px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                      style={{ background: '#E3E8E0', color: '#2F4F4F' }}
                    >
                      Active &amp; Licensed
                    </span>
                  </div>
                  {[
                    ['License No.', 'RA/2024/01/123'],
                    ['Issued', '15 Jan 2024'],
                    ['Expires', '15 Jan 2026'],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex justify-between py-2"
                      style={{ borderBottom: '1px dashed #D1CEC8', color: '#5A6A7A' }}
                    >
                      <span style={{ color: '#2A3A4A' }}>{label}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                  <div
                    className="mt-4 py-2 text-center text-xs font-semibold uppercase tracking-wide"
                    style={{ background: '#E3E8E0', color: '#2F4F4F' }}
                  >
                    ✅ Safe to Work With — Verified by WorkAbroad Hub
                  </div>
                </div>

                {/* Search link */}
                <p className="mt-4 text-sm" style={{ color: '#5C6A7A' }}>
                  <a
                    href="/nea-agencies"
                    className="underline underline-offset-2"
                    style={{ color: '#1A2530' }}
                  >
                    Search all <span data-stat="total">{agencyTotal}</span> agencies →
                  </a>
                </p>

                {/* Testimonial */}
                <div
                  className="mt-6 p-5 italic text-sm"
                  style={{ background: '#FFFFFF', border: '1px solid #E2DDD5' }}
                  data-testid="hero-testimonial"
                >
                  <p
                    className="leading-relaxed"
                    style={{ fontFamily: "'Crimson Pro', serif", fontSize: '1.05rem', color: '#3A4A5A' }}
                  >
                    "I was about to pay an agency in Mombasa KES 85,000 for a 'visa processing fee.' I checked their license number here and discovered it expired in 2022. This service saved my family's savings."
                  </p>
                  <p className="mt-3 font-semibold not-italic" style={{ color: '#1A2530' }}>
                    — John K., Registered Nurse (Mombasa → NHS UK)
                  </p>
                </div>
              </div>
            </div>

            {/* Recently Joined — Firebase real-time (falls back to REST API) */}
            {(() => {
              const fbItems = fbSignups.slice(0, 8);
              const apiItems = (recentActivity ?? []).slice(0, 8);
              const items = fbItems.length > 0 ? fbItems.map(ev => ({
                key: ev.id,
                type: ev.type,
                location: ev.location,
                timeAgo: (() => {
                  const mins = Math.floor((Date.now() - ev.joined) / 60000);
                  return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
                })(),
              })) : apiItems.map(ev => ({
                key: String(ev.id),
                type: ev.type,
                location: ev.location ?? 'Kenya',
                timeAgo: (() => {
                  const mins = Math.floor((Date.now() - new Date(ev.createdAt).getTime()) / 60000);
                  return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
                })(),
              }));

              if (items.length === 0) return null;

              return (
                <div
                  className="mt-4 bg-white p-5"
                  style={{ border: '1px solid #E2DDD5' }}
                  data-testid="recent-activity-panel"
                >
                  <div className="flex justify-between items-center pb-3 mb-4" style={{ borderBottom: '1px solid #E2DDD5' }}>
                    <h3
                      className="text-base font-semibold"
                      style={{ fontFamily: "'Crimson Pro', serif", color: '#1A2530' }}
                    >
                      Recently Joined
                    </h3>
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: '#4A6A5E' }}>
                      <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#4A6A5E' }} />
                      Live
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((ev) => (
                      <div
                        key={ev.key}
                        className="flex items-center gap-2 px-3 py-2 text-xs"
                        style={{ background: '#EDE9E2', color: '#2A3A4A' }}
                        data-testid={`activity-chip-${ev.key}`}
                      >
                        <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ background: '#4A6A5E' }} />
                        <span>
                          {ev.type === 'signup' ? 'Joined' : 'Upgraded'} from{' '}
                          <strong>{ev.location}</strong>
                        </span>
                        <span style={{ color: '#7A8A9A' }}>{ev.timeAgo}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs" style={{ color: '#7A8A9A' }}>
                    ⚡ Real registrations updated live. No fake data.
                  </p>
                </div>
              );
            })()}
          </div>
        </section>

        {/* Why Choose Us Section - PREMIUM REDESIGN */}
        <section id="features" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
          {/* Soft gradient background - light blue to white */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 via-background to-slate-50/50 dark:from-blue-950/20 dark:via-background dark:to-slate-950/20" />
          
          <div className="relative max-w-7xl mx-auto">
            {/* Section Header */}
            <div className="text-center mb-12 sm:mb-20 space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100/80 dark:bg-blue-900/40 rounded-full mx-auto border border-blue-200/50 dark:border-blue-800/50">
                <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Why Choose WorkAbroad Hub</span>
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
                {t("landing.whyChooseUs")}
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Thousands of Africans trust us to guide their overseas job search. Here's what makes us different.
              </p>
            </div>
            
            {/* Feature Cards Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {features.map((feature, index) => (
                <Card 
                  key={index} 
                  className={`group relative overflow-hidden rounded-2xl border border-white/50 dark:border-white/10 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 bg-gradient-to-br ${feature.bgGradient} backdrop-blur-sm`}
                >
                  <CardContent className="p-6 sm:p-8 space-y-5">
                    {/* Icon with gradient background */}
                    <div className={`h-14 w-14 rounded-2xl ${feature.iconBg} flex items-center justify-center shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300`}>
                      <feature.icon className={`h-7 w-7 ${feature.iconColor}`} />
                    </div>
                    
                    {/* Content */}
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold">{feature.title}</h3>
                      <p className="text-sm font-medium text-muted-foreground/80">{feature.subtitle}</p>
                    </div>
                    
                    <p className="text-muted-foreground leading-relaxed text-sm sm:text-base">
                      {feature.description}
                    </p>
                    
                    {/* Stat badge */}
                    <div className="flex items-center justify-between pt-2">
                      <Badge variant="secondary" className={`text-xs font-semibold border-0 bg-gradient-to-r ${feature.gradient} text-white`}>
                        {feature.stat}
                      </Badge>
                      <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${feature.gradient} opacity-50 group-hover:w-20 group-hover:opacity-100 transition-all duration-300`} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {/* CTA after features */}
            <div className="mt-12 sm:mt-16 text-center space-y-4">
              <Button 
                size="lg" 
                className="text-base px-8 py-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/25 hover:shadow-xl transition-all duration-300" 
                onClick={openSignUp}
                data-testid="button-features-cta"
              >
                Start Your Overseas Job Search
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <p className="text-sm text-muted-foreground">Start your overseas career journey today</p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* PLATFORM STATS SECTION                                         */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <PlatformStatsSection stats={publicStats} />

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* FREE TOOLS SECTION                                              */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="free-tools" className="py-20 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 via-blue-50/40 to-teal-50/40 dark:from-slate-900 dark:via-blue-950/30 dark:to-teal-950/20 border-y border-blue-100 dark:border-blue-900/40">
          <div className="max-w-6xl mx-auto">

            {/* Section header */}
            <div className="text-center mb-12 space-y-3">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full text-sm font-semibold border border-blue-200 dark:border-blue-700">
                <Wrench className="h-4 w-4" />
                Free Tools for Overseas Job Seekers
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white">
                Everything you need to <span className="text-blue-600 dark:text-blue-400">land your overseas job</span>
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
                Four free tools built specifically for Kenyans applying for jobs abroad — no sign-in required to get started.
              </p>
            </div>

            {/* Tool cards */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-10">

              {/* 1 — ATS CV Checker */}
              <a href="/tools/ats-cv-checker" data-testid="link-tool-ats" className="group">
                <div className="h-full bg-white dark:bg-slate-800 rounded-2xl border border-blue-100 dark:border-slate-700 p-5 shadow-sm hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-300 flex flex-col">
                  <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900/50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1.5">
                    <Sparkles className="h-3 w-3" /> AI Powered
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2 leading-tight">Check ATS CV</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">
                    Upload your CV and get an instant ATS compatibility score, missing keywords, and AI suggestions for international employers.
                  </p>
                  <div className="flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400 group-hover:gap-2 transition-all">
                    Check My CV <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </a>

              {/* 2 — Job Scam Checker */}
              <a href="/tools/job-scam-checker" data-testid="link-tool-scam" className="group">
                <div className="h-full bg-white dark:bg-slate-800 rounded-2xl border border-red-100 dark:border-slate-700 p-5 shadow-sm hover:shadow-lg hover:border-red-300 dark:hover:border-red-700 transition-all duration-300 flex flex-col">
                  <div className="h-12 w-12 bg-red-100 dark:bg-red-900/40 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <ShieldAlert className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400 mb-1.5">
                    <CheckCircle className="h-3 w-3" /> Always Free
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2 leading-tight">Check Job Scams</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">
                    Paste any job advert and detect scam signals instantly — fake fees, suspicious contacts, and high-risk phrases used by fraudsters.
                  </p>
                  <div className="flex items-center gap-1 text-sm font-semibold text-red-600 dark:text-red-400 group-hover:gap-2 transition-all">
                    Scan Advert <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </a>

              {/* 3 — Visa Sponsorship Jobs */}
              <a href="/tools/visa-sponsorship-jobs" data-testid="link-tool-jobs" className="group">
                <div className="h-full bg-white dark:bg-slate-800 rounded-2xl border border-teal-100 dark:border-slate-700 p-5 shadow-sm hover:shadow-lg hover:border-teal-300 dark:hover:border-teal-700 transition-all duration-300 flex flex-col">
                  <div className="h-12 w-12 bg-teal-100 dark:bg-teal-900/40 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Briefcase className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400 mb-1.5">
                    <BadgeCheck className="h-3 w-3" /> Visa Sponsored
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2 leading-tight">Find Visa Sponsorship Jobs</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">
                    Browse curated overseas jobs offering visa sponsorship across UK, Canada, UAE, Australia, and more — filtered for Kenyan qualifications.
                  </p>
                  <div className="flex items-center gap-1 text-sm font-semibold text-teal-600 dark:text-teal-400 group-hover:gap-2 transition-all">
                    Browse Jobs <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </a>

              {/* 4 — CV Templates */}
              <a href="/tools/cv-templates" data-testid="link-tool-templates" className="group">
                <div className="h-full bg-white dark:bg-slate-800 rounded-2xl border border-purple-100 dark:border-slate-700 p-5 shadow-sm hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300 flex flex-col">
                  <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900/40 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Download className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-1.5">
                    <Download className="h-3 w-3" /> Instant Download
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2 leading-tight">Download CV Templates</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1 mb-4">
                    Country-specific CV templates for UK, Canada, Dubai, and Australia — formatted exactly how employers in each country expect.
                  </p>
                  <div className="flex items-center gap-1 text-sm font-semibold text-purple-600 dark:text-purple-400 group-hover:gap-2 transition-all">
                    Get Templates <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </a>

            </div>

            {/* Bottom CTA strip */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <a href="/tools" data-testid="link-all-tools">
                <Button size="lg" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 shadow-md shadow-blue-200 dark:shadow-blue-900/30">
                  <Wrench className="h-4 w-4" />
                  Explore All Free Tools
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <p className="text-xs text-muted-foreground">No sign-up required · 100% free</p>
            </div>

          </div>
        </section>

        {/* Explore Countries Section - PREMIUM REDESIGN */}
        <section id="countries" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
          {/* Gradient background - navy to soft gray */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900" />
          
          <div className="relative max-w-7xl mx-auto">
            {/* Section Header */}
            <div className="text-center mb-12 sm:mb-20 space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full mx-auto border border-white/20">
                <Globe className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-semibold text-white">Global Opportunities</span>
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
                Explore Target Countries
              </h2>
              <p className="text-base sm:text-lg text-blue-100/80 max-w-2xl mx-auto leading-relaxed">
                Access verified job portals, visa guidance, and career resources for the world's top destinations.
              </p>
            </div>
            
            {/* Country Cards Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {countries.map((country, index) => (
                <Card 
                  key={index}
                  className="group relative overflow-hidden rounded-2xl border-0 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 cursor-pointer bg-white/5 backdrop-blur-sm hover:bg-white/10"
                  data-testid={`country-card-${country.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {/* Decorative top gradient bar */}
                  <div className={`h-1 bg-gradient-to-r ${country.gradient}`} />
                  
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    {/* Country code badge and name */}
                    <div className="flex items-center gap-4">
                      <div className={`h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-gradient-to-br ${country.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                        <span className="text-white font-bold text-sm sm:text-base">{country.code}</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-white">{country.name}</h3>
                        <p className="text-sm text-blue-200/70">{country.tagline}</p>
                      </div>
                    </div>
                    
                    {/* Badges row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium">
                        <BadgeCheck className="h-3 w-3 mr-1" />
                        {country.portals}
                      </Badge>
                      <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-medium">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {country.demand}
                      </Badge>
                    </div>
                    
                    {/* Hover reveal CTA */}
                    <div className="flex items-center text-cyan-400 font-medium text-sm pt-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                      <span>Explore opportunities</span>
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {/* CTA after countries */}
            <div className="mt-12 sm:mt-16 text-center space-y-4">
              <Button 
                size="lg" 
                className="text-base px-8 py-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 border-0 shadow-lg shadow-cyan-500/25 hover:shadow-xl transition-all duration-300" 
                onClick={openSignUp}
                data-testid="button-countries-cta"
              >
                Access Verified Job Portals
                <ExternalLink className="ml-2 h-5 w-5" />
              </Button>
              <p className="text-sm text-blue-200/60">
                Career consultation fee of <span className="font-semibold text-white">KES 4,500</span> includes WhatsApp guidance + ongoing resource access
              </p>
            </div>
          </div>
        </section>

        {/* NEA Licensed Agencies Section */}
        <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50/50 to-amber-50 dark:from-amber-950/20 dark:via-orange-950/10 dark:to-amber-950/20" />
          
          <div className="relative max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left Content */}
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/50 rounded-full">
                  <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Scam Protection</span>
                </div>
                
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
                  Verify NEA Licensed{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">
                    Employment Agencies
                  </span>
                </h2>
                
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Before you pay any agency, verify their license status with our comprehensive database 
                  of <strong>{agencyTotal} NEA-registered agencies</strong>. Know who's legitimate and who's expired.
                </p>
                
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-4 bg-card rounded-xl border">
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-emerald-600 dark:text-emerald-400">{agencyValid} Valid</div>
                      <div className="text-sm text-muted-foreground">Licensed agencies</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-card rounded-xl border">
                    <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/50 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-red-600 dark:text-red-400">{agencyExpired} Expired</div>
                      <div className="text-sm text-muted-foreground">Avoid these agencies</div>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <Button size="lg" className="text-base px-8 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 border-0 shadow-lg" asChild data-testid="button-verify-agencies">
                    <a href="/nea-agencies">
                      <Shield className="mr-2 h-5 w-5" />
                      Verify an Agency
                    </a>
                  </Button>
                </div>
              </div>
              
              {/* Right Visual - Agency Card Preview */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent rounded-3xl blur-2xl" />
                <div className="relative bg-card rounded-2xl border shadow-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg">Sample Agency Verification</h3>
                    <Badge className="bg-emerald-500 text-white border-0">Valid</Badge>
                  </div>
                  
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Agency Name</span>
                      <span className="font-medium">ABC Recruitment Ltd</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">License No.</span>
                      <code className="px-2 py-1 bg-muted rounded text-xs">RA/2024/01/123</code>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Issued</span>
                      <span className="font-medium">15 Jan 2024</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Expires</span>
                      <span className="font-medium text-emerald-600">15 Jan 2026</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-muted-foreground">Status</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-medium text-emerald-600">Active & Licensed</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-emerald-700 dark:text-emerald-300">Safe to Work With</div>
                        <div className="text-sm text-emerald-600 dark:text-emerald-400">This agency has a valid NEA license</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Agency Portal CTA Section - Revenue Stronghold */}
        <section className="py-20 sm:py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-900" />
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.3), transparent 50%), radial-gradient(circle at 80% 50%, rgba(139, 92, 246, 0.2), transparent 50%)' }} />

          <div className="relative max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 border border-blue-400/30 rounded-full animate-pulse">
                  <Building2 className="h-4 w-4 text-blue-300" />
                  <span className="text-sm font-semibold text-blue-300">For Licensed Agencies</span>
                </div>

                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
                  Are You a Licensed{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400">
                    Recruitment Agency?
                  </span>
                </h2>

                <p className="text-lg text-blue-100/80 leading-relaxed max-w-xl">
                  Claim your verified NEA profile, boost your visibility to thousands of job seekers,
                  and access premium tools to grow your agency with WorkAbroad Hub.
                </p>

                <div className="grid sm:grid-cols-3 gap-4 py-2">
                  <div className="flex flex-col items-center text-center p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
                    <BadgeCheck className="h-8 w-8 text-emerald-400 mb-2" />
                    <span className="text-sm font-semibold text-white">Verified Badge</span>
                    <span className="text-xs text-blue-200/60 mt-1">Build instant trust</span>
                  </div>
                  <div className="flex flex-col items-center text-center p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
                    <TrendingUp className="h-8 w-8 text-cyan-400 mb-2" />
                    <span className="text-sm font-semibold text-white">Priority Listing</span>
                    <span className="text-xs text-blue-200/60 mt-1">Top search results</span>
                  </div>
                  <div className="flex flex-col items-center text-center p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
                    <BarChart3 className="h-8 w-8 text-violet-400 mb-2" />
                    <span className="text-sm font-semibold text-white">Analytics</span>
                    <span className="text-xs text-blue-200/60 mt-1">Track your reach</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 pt-2">
                  <Button size="lg" className="text-base px-8 bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 hover:from-blue-400 hover:via-cyan-400 hover:to-teal-400 border-0 shadow-lg shadow-blue-500/25 font-semibold" asChild data-testid="button-agency-portal-cta">
                    <a href="/agency-portal">
                      <Building2 className="mr-2 h-5 w-5" />
                      Open Agency Portal
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </a>
                  </Button>
                </div>
              </div>

              <div className="relative hidden lg:block">
                <div className="absolute -inset-4 bg-gradient-to-br from-blue-500/20 via-cyan-500/10 to-violet-500/20 rounded-3xl blur-2xl" />
                <div className="relative space-y-4">
                  <Card className="border-white/10 bg-white/5 backdrop-blur-sm shadow-2xl">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                          <Building2 className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <div className="font-bold text-white">Premium Agency Profile</div>
                          <div className="text-sm text-blue-200/60">Verified & Featured</div>
                        </div>
                        <Badge className="ml-auto bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                          <BadgeCheck className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      </div>
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center gap-3 py-2 border-b border-white/10">
                          <BadgeCheck className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                          <span className="text-blue-100/80">NEA license verified &amp; publicly displayed</span>
                        </div>
                        <div className="flex items-center gap-3 py-2 border-b border-white/10">
                          <TrendingUp className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                          <span className="text-blue-100/80">Priority listing in agency directory</span>
                        </div>
                        <div className="flex items-center gap-3 py-2">
                          <BarChart3 className="h-4 w-4 text-violet-400 flex-shrink-0" />
                          <span className="text-blue-100/80">Reach job seekers across Kenya</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-2 gap-4">
                    <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-white">{agencyTotal}</div>
                        <div className="text-xs text-blue-200/60">Agencies Listed</div>
                      </CardContent>
                    </Card>
                    <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-cyan-400">6</div>
                        <div className="text-xs text-blue-200/60">Countries Covered</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16 space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-full mx-auto">
                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Simple Pricing</span>
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
                Career Consultation Service
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                Professional career guidance with personalized support. One-time consultation fee, ongoing resource access.
              </p>
            </div>
            
            <Card className="overflow-hidden border-2 border-primary/20 shadow-2xl">
              <div className="h-2 bg-gradient-to-r from-primary via-accent to-primary" />
              <CardContent className="p-8 sm:p-12">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-10">
                  <div className="space-y-6 text-center lg:text-left">
                    <div>
                      <div className="flex items-baseline gap-2 justify-center lg:justify-start">
                        <span className="text-5xl sm:text-6xl font-bold">KES 4,500</span>
                        <span className="text-xl text-muted-foreground">consultation fee</span>
                      </div>
                      <p className="text-muted-foreground mt-2">Professional career consultation with ongoing resource access</p>
                    </div>
                    <ul className="space-y-3 text-left">
                      {PRO_FEATURES.map((item, i) => (
                        <li key={i} className="flex items-center gap-3">
                          <div className="h-5 w-5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0">
                            <CheckCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex-shrink-0 w-full lg:w-auto">
                    <Button size="lg" className="w-full lg:w-auto min-w-[240px] text-lg py-6 shadow-lg shadow-primary/25" asChild data-testid="button-pricing-cta">
                      <a href="/api/login">
                        Get Started Now
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </a>
                    </Button>
                    <p className="text-center text-sm text-muted-foreground mt-4">
                      Secure payment via M-Pesa
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Trust Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-muted/30 to-background border-t">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-4 p-6 bg-card rounded-2xl border shadow-sm">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">Our Commitment to You</h3>
                <p className="text-muted-foreground leading-relaxed">
                  WorkAbroad Hub is a professional career consultation service. Your payment covers personalized 1-on-1 guidance 
                  via WhatsApp, country-specific recommendations, and access to our curated job portal resources for as long as the service remains available. 
                  We provide expert career advice and tools - we do not sell jobs, handle recruitments, or process visas.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Success Stories Section - Dynamic from Database */}
        <SuccessStoriesSection />

        {/* Live Firebase-Verified Placements Strip */}
        {verifiedPlacements.length > 0 && (
          <section className="py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-emerald-50 dark:from-emerald-950/20 dark:via-teal-950/10 dark:to-emerald-950/20 border-y border-emerald-100 dark:border-emerald-900/30">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-center gap-2 justify-center mb-6">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                  Confirmed Placements — Community Reported
                </h3>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {verifiedPlacements.map((p) => (
                  <div
                    key={p.id}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-full border border-emerald-200 dark:border-emerald-700 shadow-sm text-sm"
                    data-testid={`placement-chip-${p.id}`}
                  >
                    <span className="font-bold text-gray-800 dark:text-gray-100">{p.initials}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500 dark:text-gray-400">{p.from}</span>
                    <span className="text-emerald-500">→</span>
                    <span className="font-medium text-gray-700 dark:text-gray-200">{p.jobTitle}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-teal-600 dark:text-teal-400">{p.to}</span>
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-5">
                Admin-verified success reports from our community. Got a job abroad?{" "}
                <button onClick={() => setSubmitModalOpen(true)} className="text-emerald-600 hover:underline font-medium" data-testid="button-share-story">
                  Share your story
                </button>{" "}— it may inspire others!
              </p>
            </div>
          </section>
        )}

        {/* Meet Your Advisors Section */}
        <AdvisorsSection />

        {/* How It Works Section - SEO Rich */}
        <section id="how-it-works" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-50/30 via-background to-slate-50/30 dark:from-blue-950/10 dark:via-background dark:to-slate-950/10" />
          
          <div className="relative max-w-7xl mx-auto">
            <div className="text-center mb-12 sm:mb-20 space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100/80 dark:bg-blue-900/40 rounded-full mx-auto border border-blue-200/50 dark:border-blue-800/50">
                <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Simple Process</span>
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
                How to Start Working Abroad in 4 Steps
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                From sign-up to job applications, we guide you through every step of your overseas career journey
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
              {[
                {
                  step: "1",
                  icon: Smartphone,
                  title: "Sign Up & Pay",
                  description: "Create your account and complete checkout on the secure payment page. Instant access to all resources.",
                  gradient: "from-blue-500 to-indigo-600"
                },
                {
                  step: "2", 
                  icon: Headphones,
                  title: "Get WhatsApp Consultation",
                  description: "Connect with a career advisor via WhatsApp for personalized guidance on the best countries and job types for your skills and experience.",
                  gradient: "from-emerald-500 to-teal-600"
                },
                {
                  step: "3",
                  icon: Globe,
                  title: "Access Verified Portals",
                  description: "Browse our curated list of 30+ verified job portals across USA, Canada, UK, Australia, UAE, and Europe. All links verified and regularly updated.",
                  gradient: "from-purple-500 to-violet-600"
                },
                {
                  step: "4",
                  icon: Briefcase,
                  title: "Apply Directly",
                  description: "Apply directly on official government and employer portals. No middlemen, no agents - you control your application process from start to finish.",
                  gradient: "from-amber-500 to-orange-600"
                }
              ].map((item, index) => (
                <Card key={index} className="relative overflow-hidden border bg-card hover:shadow-lg transition-all duration-300" data-testid={`step-card-${item.step}`}>
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${item.gradient}`} />
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-lg`}>
                        <item.icon className="h-6 w-6 text-white" />
                      </div>
                      <div className={`text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${item.gradient}`}>
                        Step {item.step}
                      </div>
                    </div>
                    <h3 className="font-bold text-lg">{item.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <div className="mt-12 text-center">
              <Button size="lg" className="text-base px-8 py-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg" asChild data-testid="button-how-it-works-cta">
                <a href="/api/login">
                  Start Your Journey Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* Success Stats Section - SEO Rich */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 space-y-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                Trusted by Job Seekers Across Kenya
              </h2>
              <p className="text-blue-100/70 max-w-xl mx-auto">
                Join thousands who have used WorkAbroad Hub to find verified overseas employment opportunities
              </p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
              {[
                { value: "30+", label: "Verified Job Portals", sublabel: "Curated & updated regularly", id: "portals" },
                { value: "6", label: "Countries Covered", sublabel: "USA, Canada, UK, UAE, Australia, Europe", id: "countries" },
                { value: agencyTotal, label: "NEA Agencies Verified", sublabel: "Check before you pay", id: "agencies" },
                { value: "24/7", label: "WhatsApp Support", sublabel: "Career guidance when you need it", id: "support" }
              ].map((stat, index) => (
                <div key={index} className="text-center p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm" data-testid={`stat-${stat.id}`}>
                  <div className="text-3xl sm:text-4xl font-bold text-white mb-2">{stat.value}</div>
                  <div className="text-sm font-medium text-blue-200">{stat.label}</div>
                  <div className="text-xs text-blue-300/60 mt-1">{stat.sublabel}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section - SEO Rich */}
        <section id="faq" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12 sm:mb-16 space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-full mx-auto">
                <HelpCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Got Questions?</span>
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
                Frequently Asked Questions
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
                Everything you need to know about finding overseas jobs through WorkAbroad Hub
              </p>
            </div>
            
            <Accordion type="single" collapsible className="space-y-4" data-testid="faq-accordion">
              <AccordionItem value="item-1" className="bg-card border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  What exactly am I paying for with the KES 4,500 fee?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  The KES 4,500 is a one-time career consultation fee that includes: (1) A personalized 1-on-1 WhatsApp consultation with our career advisors who will assess your skills, experience, and goals to recommend the best countries and job types for you, (2) Access to our curated database of 30+ verified job portals across 6 countries (USA, Canada, UK, Australia, UAE, and Europe) for as long as the service remains available, (3) Country-specific CV templates and application guidance, (4) Access to our NEA agency verification database to protect you from scams, and (5) Regular updates as we add new resources and job portals. Access to online resources continues for as long as the service is operational.
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-2" className="bg-card border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  Is WorkAbroad Hub a recruitment agency?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  No, WorkAbroad Hub is NOT a recruitment agency. We are a career consultation service that provides expert guidance and verified resources to help you apply for overseas jobs independently. We do not sell jobs, guarantee employment, process visas, or act as intermediaries between you and employers. All job applications are made directly by you on official government and employer portals.
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-3" className="bg-card border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  How do you verify the job portals are legitimate?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  We only include job portals from official government employment agencies, recognized employer associations, and well-established job boards. Our team regularly reviews each portal to ensure they are still active and legitimate. We verify that portals are: (1) operated by government entities or licensed organizations, (2) free to apply on or clearly disclose any fees, (3) not associated with known scam operations, and (4) actively updated with current job listings.
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-4" className="bg-card border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  Can I get a job in the USA, Canada, or UK without experience?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  It depends on the type of job and visa program. Many countries have specific visa categories for different skill levels. For example, the USA has H-2B visas for seasonal workers, Canada has various Provincial Nominee Programs (PNP), and the UK has Health and Care Worker visas with lower salary thresholds. During your WhatsApp consultation, our advisors will assess your qualifications and recommend countries and programs that match your experience level.
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-5" className="bg-card border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  How long does it take to find a job abroad?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  The timeline varies significantly based on your skills, the country you're targeting, and market conditions. Generally, it can take 3-12 months from starting your search to receiving a job offer. Factors that speed up the process include: having in-demand skills (nursing, IT, engineering), proper documentation, a strong CV tailored to international standards, and consistent applications. Our consultation helps you optimize your approach to reduce the time to hire.
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-6" className="bg-card border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  What is the NEA agency verification feature?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  The National Employment Authority (NEA) of Kenya licenses private employment agencies that recruit Kenyans for overseas jobs. We maintain a database of {agencyTotal}+ NEA-registered agencies showing their license status (valid or expired). Before you pay any recruitment agency, you can check our database to verify they have a valid NEA license. This protects you from unlicensed operators and scams.
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-7" className="bg-card border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  Do I need to speak the local language to work abroad?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  For English-speaking countries (USA, UK, Canada, Australia), English proficiency is usually sufficient. For UAE and Gulf countries, English is widely used in business, though Arabic is helpful. European countries (Germany, France, Netherlands, etc.) may require or prefer local language skills, though many international companies operate in English. Our country guides include language requirements and resources for language testing (IELTS, TOEFL, etc.).
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="item-8" className="bg-card border rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  Is my payment secure? What payment methods do you accept?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  Yes, all payments are processed securely. We accept M-Pesa (Kenya's most trusted mobile money platform) and card payments. Your payment information is encrypted and never stored on our servers. After successful payment, you receive instant access to all resources and can schedule your WhatsApp consultation.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>
      </main>

      {/* Footer - SEO Enhanced */}
      <footer className="py-16 px-4 sm:px-6 lg:px-8 border-t bg-slate-900 dark:bg-slate-950 text-slate-300">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12 mb-12">
            {/* Company Info */}
            <div className="col-span-2 md:col-span-1 space-y-4">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="WorkAbroad Hub" className="h-10 w-10 rounded-xl object-cover" />
                <span className="font-bold text-white text-lg">WorkAbroad Hub</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Professional career consultation service helping Kenyans find verified overseas employment opportunities across USA, Canada, UK, Australia, UAE, and Europe.
              </p>
              <div className="flex items-center gap-4 pt-2">
                <a href="https://wa.me/254742619777" target="_blank" rel="noopener noreferrer" className="h-9 w-9 rounded-lg bg-slate-800 flex items-center justify-center hover:bg-emerald-600 transition-colors" data-testid="link-whatsapp-footer">
                  <MessageCircle className="h-4 w-4" />
                </a>
                <a href="mailto:support@workabroadhub.tech" className="h-9 w-9 rounded-lg bg-slate-800 flex items-center justify-center hover:bg-blue-600 transition-colors" data-testid="link-email-footer">
                  <Mail className="h-4 w-4" />
                </a>
              </div>
            </div>
            
            {/* Countries */}
            <div className="space-y-4">
              <h4 className="font-semibold text-white">Countries</h4>
              <ul className="space-y-2 text-sm">
                <li><span className="text-slate-400 hover:text-white cursor-default">Jobs in USA</span></li>
                <li><span className="text-slate-400 hover:text-white cursor-default">Jobs in Canada</span></li>
                <li><span className="text-slate-400 hover:text-white cursor-default">Jobs in UK</span></li>
                <li><span className="text-slate-400 hover:text-white cursor-default">Jobs in Australia</span></li>
                <li><span className="text-slate-400 hover:text-white cursor-default">Jobs in UAE</span></li>
                <li><span className="text-slate-400 hover:text-white cursor-default">Jobs in Europe</span></li>
              </ul>
            </div>
            
            {/* Resources */}
            <div className="space-y-4">
              <h4 className="font-semibold text-white">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/nea-agencies" className="text-slate-400 hover:text-white transition-colors" data-testid="link-footer-nea">NEA Agency Verification</a></li>
                <li><a href="/student-visas" className="text-slate-400 hover:text-white transition-colors" data-testid="link-footer-student-visas">Student Visa Guide</a></li>
                <li><a href="/visa-assistant" className="text-slate-400 hover:text-white transition-colors" data-testid="link-footer-visa-assistant">✨ AI Visa Assistant</a></li>
                <li><a href="/visa-guides" className="text-slate-400 hover:text-white transition-colors" data-testid="link-footer-visa-guides">Visa &amp; Immigration Guides</a></li>
                <li><a href="/green-card" className="text-slate-400 hover:text-white transition-colors" data-testid="link-footer-green-card">🇺🇸 Green Card (DV Lottery) Guide</a></li>
                <li><a href="/faq" className="text-slate-400 hover:text-white transition-colors" data-testid="link-footer-faq">Frequently Asked Questions</a></li>
                <li><a href="/about" className="text-slate-400 hover:text-white transition-colors" data-testid="link-footer-about">About Us</a></li>
                <li><a href="/contact" className="text-slate-400 hover:text-white transition-colors" data-testid="link-footer-contact">Contact & Support</a></li>
              </ul>
            </div>
            
            {/* Contact */}
            <div className="space-y-4">
              <h4 className="font-semibold text-white">Contact Us</h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <MessageCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-slate-400">WhatsApp Support</div>
                    <a href="https://wa.me/254742619777" target="_blank" rel="noopener noreferrer" className="text-white hover:text-emerald-400 transition-colors" data-testid="link-footer-whatsapp-number">+254 742 619777</a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-slate-400">Email</div>
                    <a href="mailto:support@workabroadhub.tech" className="text-white hover:text-blue-400 transition-colors" data-testid="link-footer-email-address">support@workabroadhub.tech</a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-slate-400">Office</div>
                    <span className="text-white" data-testid="text-footer-address">Nairobi, Kenya</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
          
          {/* Legal Links & Copyright */}
          <div className="pt-8 border-t border-slate-800">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm text-slate-400">
                <a href="/about" className="hover:text-white transition-colors" data-testid="link-footer-about-legal">About Us</a>
                <a href="/contact" className="hover:text-white transition-colors" data-testid="link-footer-contact-legal">Contact</a>
                <a href="/faq" className="hover:text-white transition-colors" data-testid="link-footer-faq-legal">FAQ</a>
                <a href="/terms-of-service" className="hover:text-white transition-colors" data-testid="link-terms">Terms of Service</a>
                <a href="/privacy-policy" className="hover:text-white transition-colors" data-testid="link-privacy">Privacy Policy</a>
                <a href="/refund-policy" className="hover:text-white transition-colors" data-testid="link-refund-policy">Refund Policy</a>
                <a href="/legal-disclaimer" className="hover:text-white transition-colors" data-testid="link-legal-disclaimer">Legal Disclaimer</a>
                <a href="/data-safety" className="hover:text-white transition-colors" data-testid="link-data-safety">Data Safety</a>
                <a href="/report-abuse" className="hover:text-white transition-colors" data-testid="link-report-abuse">Report Abuse</a>
                <a href="/agency-portal" className="hover:text-white transition-colors" data-testid="link-agency-portal-footer">Agency Portal</a>
              </div>
              <p className="text-sm text-slate-500">
                © {new Date().getFullYear()} WorkAbroad Hub. All rights reserved.
              </p>
            </div>
            
            {/* Trust & Legal Note */}
            <div className="mt-4 text-center">
              <p className="text-xs text-slate-500" data-testid="text-footer-operator">
                WorkAbroad Hub is operated by <span className="text-slate-400 font-medium">Exovia Connect</span> — a registered business in Kenya.
              </p>
            </div>

            {/* Legal Disclaimer */}
            <div className="mt-4 p-4 bg-slate-800/50 rounded-xl">
              <p className="text-xs text-slate-500 text-center leading-relaxed">
                <strong className="text-slate-400">Disclaimer:</strong> WorkAbroad Hub is a career consultation service. We are not a recruitment agency, do not sell jobs or guarantee employment, and do not process visas. All job applications are made independently by users on third-party platforms. The KES 4,500 fee covers career consultation and access to curated resources.
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Auth Modal — shared Login + Sign Up */}
      <SubmitForReviewModal
        open={submitModalOpen}
        onOpenChange={setSubmitModalOpen}
        defaultType="testimonial"
      />
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultTab={authModalTab}
        redirectPath={authRedirectPath}
      />
    </div>
  );
}
