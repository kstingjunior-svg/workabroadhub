import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  ShieldAlert,
  ShieldCheck,
  Briefcase,
  Download,
  ArrowRight,
  Sparkles,
  Lock,
  ArrowLeft,
  Gift,
  Copy,
  Check,
  Users,
  Banknote,
  Share2,
  ChevronRight,
  Bot,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const TOOLS = [
  {
    id: "ats-cv-checker",
    href: "/tools/ats-cv-checker",
    icon: FileText,
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
    label: "ATS CV Checker",
    badge: "AI Powered",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    description: "Upload your CV and get an instant ATS compatibility score, keyword analysis, and AI-powered improvement suggestions tailored for international job applications.",
    cta: "Check My CV",
    requiresAuth: false,
  },
  {
    id: "job-scam-checker",
    href: "/tools/job-scam-checker",
    icon: ShieldAlert,
    iconBg: "bg-red-100 dark:bg-red-900/30",
    iconColor: "text-red-600 dark:text-red-400",
    label: "Job Scam Checker",
    badge: "Free",
    badgeColor: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    description: "Paste any job advert and our engine will scan for scam signals — fake fees, suspicious contacts, and high-risk phrases used by fraudulent recruiters.",
    cta: "Check a Job Advert",
    requiresAuth: false,
  },
  {
    id: "bulk-agency-verify",
    href: "/tools/bulk-agency-verify",
    icon: ShieldCheck,
    iconBg: "bg-teal-100 dark:bg-teal-900/30",
    iconColor: "text-teal-600 dark:text-teal-400",
    label: "Bulk Agency Verifier",
    badge: "NEA Database",
    badgeColor: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    description: "Paste a list of NEA license numbers (RA/YYYY/MM/N) and verify all of them in one shot. See live status — Valid, Expired, Blacklisted, or Not Found — with CSV export.",
    cta: "Verify Agencies",
    requiresAuth: false,
  },
  {
    id: "visa-sponsorship-jobs",
    href: "/tools/visa-sponsorship-jobs",
    icon: Briefcase,
    iconBg: "bg-teal-100 dark:bg-teal-900/30",
    iconColor: "text-teal-600 dark:text-teal-400",
    label: "Visa Sponsorship Jobs",
    badge: "Live Feed",
    badgeColor: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    description: "Browse verified overseas jobs offering visa sponsorship. Filter by country and job category. All listings are curated to include Kenyan-qualified workers.",
    cta: "Browse Jobs",
    requiresAuth: false,
  },
  {
    id: "cv-templates",
    href: "/tools/cv-templates",
    icon: Download,
    iconBg: "bg-purple-100 dark:bg-purple-900/30",
    iconColor: "text-purple-600 dark:text-purple-400",
    label: "Free CV Templates",
    badge: "Download",
    badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    description: "Download country-specific CV and resume templates for UK, Canada, Dubai, and Australia. Formatted to the standards expected by employers in each country.",
    cta: "Get Templates",
    requiresAuth: false,
  },
  {
    id: "job-application-assistant",
    href: "/tools/job-application-assistant",
    icon: Sparkles,
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    label: "AI Job Application Assistant",
    badge: "AI — 1 Free",
    badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    description: "Generate a tailored cover letter, rewrite your CV with ATS keywords, or craft strong application answers — all powered by AI and personalised to the specific job.",
    cta: "Start Applying",
    requiresAuth: true,
  },
  {
    id: "auto-apply",
    href: "/tools/auto-apply",
    icon: Bot,
    iconBg: "bg-violet-100 dark:bg-violet-900/30",
    iconColor: "text-violet-600 dark:text-violet-400",
    label: "AI Auto-Apply",
    badge: "New — Automated",
    badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    description: "Set your job profile once. AI scans all available visa-sponsored jobs, ranks the best matches, and auto-generates tailored cover letters for each one — ready to review and submit.",
    cta: "Auto-Apply Now",
    requiresAuth: true,
  },
];

const HOW_IT_WORKS = [
  { icon: Share2, label: "Share your link", desc: "Send your unique referral link to friends & family" },
  { icon: Users, label: "They sign up & upgrade", desc: "When they upgrade to Pro via the secure payment page" },
  { icon: Banknote, label: "You earn KES 450", desc: "10% commission paid directly to your M-Pesa" },
];

export default function ToolsHub() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: referralData } = useQuery<{
    refCode: string;
    totalReferrals: number;
    pendingCommission: number;
    paidCommission: number;
  }>({
    queryKey: ["/api/my-referrals"],
    enabled: !!user,
  });

  const baseUrl = window.location.origin;
  const referralLink = referralData?.refCode
    ? `${baseUrl}/?ref=${referralData.refCode}`
    : null;

  const handleCopy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      toast({ title: "Copied!", description: "Referral link copied to clipboard." });
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleShare = () => {
    if (!referralLink) return;
    if (navigator.share) {
      navigator.share({
        title: "WorkAbroad Hub – Free Career Tools",
        text: "Use my referral link to get expert help finding overseas jobs 🌍",
        url: referralLink,
      });
    } else {
      handleCopy();
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 to-teal-500 px-4 pt-10 pb-8 text-white">
        <div className="max-w-2xl mx-auto">
          <Link href={user ? "/dashboard" : "/"}>
            <button className="flex items-center gap-1 text-blue-100 text-sm mb-4 hover:text-white" data-testid="link-back-home">
              <ArrowLeft className="h-4 w-4" /> {user ? "Dashboard" : "Home"}
            </button>
          </Link>
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1 text-sm font-medium mb-4">
              <Sparkles className="h-4 w-4" />
              Growth Tools Suite
            </div>
            <h1 className="text-2xl font-bold mb-2" data-testid="text-tools-title">Free Career Tools</h1>
            <p className="text-blue-100 text-sm max-w-md mx-auto">
              Practical tools to help you land an overseas job — AI CV analysis, scam detection, sponsored job listings, and ready-to-use CV templates.
            </p>
          </div>
        </div>
      </div>

      {/* Legal disclaimer */}
      <div className="max-w-2xl mx-auto px-4 mt-4">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300">
          <strong>Important:</strong> WorkAbroad Hub provides career consultation tools only. We do not guarantee employment, place workers in jobs, or act as a recruitment agency. Always verify employers independently.
        </div>
      </div>

      {/* Tool cards */}
      <div className="max-w-2xl mx-auto px-4 mt-6 space-y-4">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Card key={tool.id} className="overflow-hidden hover:shadow-md transition-shadow" data-testid={`card-tool-${tool.id}`}>
              <CardContent className="p-0">
                <div className="p-4 flex gap-4 items-start">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${tool.iconBg}`}>
                    <Icon className={`h-6 w-6 ${tool.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h2 className="font-semibold text-sm">{tool.label}</h2>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tool.badgeColor}`}>
                        {tool.badge}
                      </span>
                      {tool.requiresAuth && !user && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Lock className="h-3 w-3" /> Sign in for full access
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">{tool.description}</p>
                    <Link href={tool.href}>
                      <Button size="sm" variant="default" className="h-8 text-xs gap-1" data-testid={`button-open-${tool.id}`}>
                        {tool.cta}
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Referral Section ── */}
      <div className="max-w-2xl mx-auto px-4 mt-8">
        <div className="rounded-2xl overflow-hidden border border-emerald-200 dark:border-emerald-800 shadow-sm">
          {/* Banner */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-5 text-white">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Gift className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Free to Join</div>
                <h2 className="text-lg font-bold leading-tight">Earn KES 450 Per Referral</h2>
              </div>
            </div>
            <p className="text-emerald-50 text-sm leading-relaxed">
              Share WorkAbroad Hub with friends. Every time someone you refer buys a consultation, you earn <strong>KES 450</strong> — paid directly to your M-Pesa. No limits.
            </p>
          </div>

          {/* How it works */}
          <div className="bg-emerald-50 dark:bg-emerald-950/30 px-5 py-4 border-b border-emerald-100 dark:border-emerald-900">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-3">How it works</p>
            <div className="grid grid-cols-3 gap-3">
              {HOW_IT_WORKS.map((step, i) => {
                const StepIcon = step.icon;
                return (
                  <div key={i} className="text-center">
                    <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mx-auto mb-2">
                      <StepIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <p className="text-[10px] font-semibold text-foreground leading-tight mb-0.5">{step.label}</p>
                    <p className="text-[9px] text-muted-foreground leading-tight">{step.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Referral link — logged in */}
          {user && referralData && (
            <div className="bg-background px-5 py-4">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 bg-muted rounded-xl" data-testid="stat-total-referrals">
                  <div className="text-lg font-bold text-foreground">{referralData.totalReferrals}</div>
                  <div className="text-[10px] text-muted-foreground">Referrals</div>
                </div>
                <div className="text-center p-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl" data-testid="stat-pending-commission">
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    KES {referralData.pendingCommission.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Pending</div>
                </div>
                <div className="text-center p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl" data-testid="stat-paid-commission">
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    KES {referralData.paidCommission.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Paid Out</div>
                </div>
              </div>

              {/* Link box */}
              <p className="text-xs font-medium text-foreground mb-2">Your referral link</p>
              <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2 mb-3">
                <span className="text-xs text-muted-foreground flex-1 truncate" data-testid="text-referral-link">
                  {referralLink}
                </span>
                <button
                  onClick={handleCopy}
                  className="shrink-0 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                  data-testid="button-copy-referral"
                  aria-label="Copy referral link"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-xs gap-1 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400"
                  data-testid="button-copy-link"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
                <Button
                  onClick={handleShare}
                  size="sm"
                  className="flex-1 h-9 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 border-0"
                  data-testid="button-share-referral"
                >
                  <Share2 className="h-3 w-3" />
                  Share
                </Button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {user && !referralData && (
            <div className="bg-background px-5 py-6 text-center">
              <div className="h-8 w-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Loading your referral link…</p>
            </div>
          )}

          {/* Not logged in — guest CTA */}
          {!user && (
            <div className="bg-background px-5 py-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 mt-0.5">
                  <Gift className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground mb-0.5">Get your free referral link</p>
                  <p className="text-xs text-muted-foreground">
                    Create a free account to receive your unique link. Share it on WhatsApp, Facebook, or anywhere — you earn every time someone pays for a consultation.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <a href="/api/login" className="flex-1">
                  <Button
                    size="sm"
                    className="w-full h-9 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 border-0"
                    data-testid="button-referral-signup"
                  >
                    Sign Up Free
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </a>
                <a href="/api/login" className="flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-9 text-xs gap-1"
                    data-testid="button-referral-login"
                  >
                    Log In
                  </Button>
                </a>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-3">
                Free to join · No monthly fees · KES 450 per referral · M-Pesa payout
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom spacing */}
      <div className="h-8" />
    </div>
  );
}
