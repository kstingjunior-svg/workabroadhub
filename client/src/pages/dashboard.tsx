import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronRight, LogOut, Gift, Sparkles, FileText, Rocket,
  Globe, Briefcase, Shield, Settings, ClipboardList, Brain,
  GraduationCap, Lock, Bell, TrendingUp, MapPin, Search,
  Calendar, Star, Zap, CheckCircle, Clock, AlertCircle,
  ArrowRight, Users, BookOpen, BarChart3, MessageCircle, Flame,
  CreditCard, XCircle, Receipt, Trophy, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import type { UserSubscription } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { useEffect, useState, useRef } from "react";

import { FreePreviewJobs } from "@/components/free-preview-jobs";
import { DashboardJobRecommendations } from "@/components/dashboard-job-recommendations";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { trackDashboardAccess } from "@/lib/analytics";
import { useUpgradeModal } from "@/contexts/upgrade-modal-context";
import { LockedFeature } from "@/components/locked-feature";
import { UrgencyBanner } from "@/components/urgency-banner";
import { AgencyAlertBanner } from "@/components/agency-alert-banner";
import { LockedContentPreview } from "@/components/locked-content-preview";
import { pushSuccessStory } from "@/lib/firebase-success-stories";
import { useToast } from "@/hooks/use-toast";
import {
  trackPresence,
  useActiveVisitors,
  useRecentSignups,
  useTotalMembers,
  useLatestSignupFeed,
} from "@/lib/firebase-presence";
import {
  useUserCredits,
  useUserApplicationsFB,
  type CreditType,
} from "@/lib/firebase-credits";
import {
  useUserData,
  totalCommissionKES,
  completedPaymentsKES,
  activeServices,
} from "@/hooks/use-user-data";

interface ServiceOrder {
  id: string;
  serviceName: string;
  status: string;
  createdAt: string;
  totalAmount: number;
}

interface JobAlert {
  id: string;
  country: string;
  industry: string;
  isActive: boolean;
}

/**
 * Derives the best available display name for a user.
 * Priority: firstName → email prefix (stripped of trailing digits) → email prefix → "there"
 */
function getRecommendation(profile: { jobInterest: number; upgradeInterest: number }) {
  if (profile.upgradeInterest > 2) {
    return { type: "upgrade", message: "🔥 You're close! Unlock PRO to apply instantly" };
  }
  if (profile.jobInterest > 3) {
    return { type: "jobs", message: "🔥 New visa-sponsored jobs available for you" };
  }
  return { type: "default", message: "Explore jobs and opportunities" };
}

function getDisplayName(user: { firstName?: string | null; email?: string | null } | null | undefined): string {
  if (!user) return "there";
  const first = user.firstName?.trim();
  if (first) return first;
  if (user.email) {
    const prefix = user.email.split("@")[0]; // e.g. "anetteahmad8"
    // Strip trailing digits to recover a name (anetteahmad8 → anetteahmad)
    const stripped = prefix.replace(/\d+$/, "");
    const name = stripped.length > 1 ? stripped : prefix;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return "there";
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:         { label: "Pending",          color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300", icon: <Clock className="h-3.5 w-3.5" /> },
  pending_payment: { label: "Awaiting Payment", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300", icon: <Clock className="h-3.5 w-3.5" /> },
  paid:            { label: "Paid",             color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",         icon: <CheckCircle className="h-3.5 w-3.5" /> },
  processing:      { label: "Processing",       color: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",  icon: <Sparkles className="h-3.5 w-3.5" /> },
  in_review:       { label: "In Review",        color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",  icon: <Search className="h-3.5 w-3.5" /> },
  delivered:       { label: "Delivered",        color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",      icon: <CheckCircle className="h-3.5 w-3.5" /> },
  completed:       { label: "Completed",        color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",      icon: <CheckCircle className="h-3.5 w-3.5" /> },
  cancelled:       { label: "Cancelled",        color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",              icon: <AlertCircle className="h-3.5 w-3.5" /> },
};

function QuickAction({ icon, label, desc, href, color, badge, onClick, locked }: {
  icon: React.ReactNode; label: string; desc: string;
  href?: string; color: string; badge?: string;
  onClick?: () => void; locked?: boolean;
}) {
  const inner = (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer h-full ${locked ? "opacity-70" : ""}`} data-testid={`action-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color} ${locked ? "grayscale" : ""}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">{label}</span>
            {badge && <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 text-[10px] font-bold rounded-full">{badge}</span>}
            {locked && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-bold rounded-full flex items-center gap-0.5"><Lock className="h-2.5 w-2.5" /> PRO</span>}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{desc}</p>
        </div>
        {locked ? <Lock className="h-4 w-4 text-amber-500 flex-shrink-0 self-center" /> : <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 self-center" />}
      </div>
    </div>
  );

  if (onClick) return <div onClick={onClick}>{inner}</div>;
  if (href) {
    const isExternal = href.startsWith("http://") || href.startsWith("https://");
    if (isExternal) return <a href={href} target="_blank" rel="noopener noreferrer">{inner}</a>;
    return <Link href={href}>{inner}</Link>;
  }
  return <div>{inner}</div>;
}

/* ── Compact icon tile for the 4×2 quick-access grid ── */
function ActionTile({ icon, label, href, color, badge, locked, onClick }: {
  icon: React.ReactNode; label: string; href?: string;
  color: string; badge?: string; locked?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <div
      className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:scale-[1.04] active:scale-[0.96] transition-all duration-200 cursor-pointer relative ${locked ? "opacity-75" : ""}`}
      data-testid={`tile-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color} ${locked ? "grayscale" : ""}`}>
        {icon}
      </div>
      <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 text-center leading-tight px-0.5">{label}</span>
      {badge && (
        <span className="absolute top-1.5 right-1.5 text-[8px] font-bold bg-yellow-400 text-yellow-900 px-1 py-0.5 rounded-full leading-none">{badge}</span>
      )}
      {locked && (
        <span className="absolute top-1.5 right-1.5">
          <Lock className="h-3 w-3 text-amber-500" />
        </span>
      )}
    </div>
  );

  if (onClick) return <div onClick={onClick}>{inner}</div>;
  if (href) {
    const isExternal = href.startsWith("http://") || href.startsWith("https://");
    if (isExternal) return <a href={href} target="_blank" rel="noopener noreferrer">{inner}</a>;
    return <Link href={href}>{inner}</Link>;
  }
  return <div>{inner}</div>;
}

/* ── Rich Quick-Action Card (emoji + title + desc + badge) ── */
function QuickActionCard({ emoji, title, description, badgeText, badgeColor, href, locked, onClick }: {
  emoji: string; title: string; description: string;
  badgeText: string; badgeColor: string;
  href?: string; locked?: boolean; onClick?: () => void;
}) {
  const inner = (
    <div
      className={`relative bg-white dark:bg-gray-800 border border-[#EAE5DE] dark:border-gray-700 rounded-xl p-4 text-left hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer ${locked ? "opacity-80" : ""}`}
      data-testid={`qcard-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {locked && (
        <span className="absolute top-2 right-2">
          <Lock className="h-3 w-3 text-amber-400" />
        </span>
      )}
      <div className="text-[1.75rem] leading-none mb-2">{emoji}</div>
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5 leading-snug">{title}</h4>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed mb-2">{description}</p>
      <span
        className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full text-white leading-tight ${badgeColor}`}
        style={{ letterSpacing: "0.01em" }}
      >
        {badgeText}
      </span>
    </div>
  );

  if (onClick) return <div onClick={onClick}>{inner}</div>;
  if (href) {
    const isExternal = href.startsWith("http://") || href.startsWith("https://");
    if (isExternal) return <a href={href} target="_blank" rel="noopener noreferrer">{inner}</a>;
    return <Link href={href}>{inner}</Link>;
  }
  return <div>{inner}</div>;
}

/* ── Credits Widget ── */
const CREDIT_CONFIG: Record<CreditType, { label: string; icon: string; color: string }> = {
  job_applications:       { label: "Job Applications", icon: "📨", color: "#4A7C59" },
  cv_services:            { label: "CV Services",       icon: "📄", color: "#1A2530" },
  university_applications:{ label: "University Appl.",  icon: "🎓", color: "#5A6A7A" },
  employer_verification:  { label: "Employer Verify",   icon: "🛡️", color: "#E6A700" },
};

function CreditsWidget({ userId }: { userId: string | number | undefined }) {
  const credits = useUserCredits(userId);
  const apps = useUserApplicationsFB(userId);

  const creditEntries = Object.entries(credits) as [CreditType, NonNullable<typeof credits[CreditType]>][];
  if (creditEntries.length === 0) return null;

  return (
    <div
      className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-5"
      data-testid="section-credits"
    >
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-base font-semibold text-gray-900 dark:text-white">🎫 Your Credits</h4>
        <Link href="/my-account">
          <span className="text-xs text-primary font-semibold cursor-pointer hover:underline">
            View My Account →
          </span>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {creditEntries.map(([type, credit]) => {
          const cfg = CREDIT_CONFIG[type] || { label: type, icon: "🔑", color: "#4A7C59" };
          const pct = credit.total > 0 ? Math.round((credit.used / credit.total) * 100) : 0;
          const expired = credit.expiryDate && credit.expiryDate < Date.now();

          return (
            <div
              key={type}
              className="bg-[#F9F8F6] dark:bg-gray-700/50 rounded-xl p-4 border border-[#EAE5DE] dark:border-gray-600"
              data-testid={`card-credit-${type}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{cfg.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{cfg.label}</p>
                    {credit.packName && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{credit.packName}</p>
                    )}
                    {credit.serviceType && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{credit.serviceType}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold" style={{ color: expired ? "#9A9A9A" : cfg.color }}>
                    {credit.remaining}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 block">left</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: expired ? "#9A9A9A" : cfg.color }}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {credit.used}/{credit.total} used
                </span>
                {expired ? (
                  <span className="text-[10px] text-red-500 font-medium">Expired</span>
                ) : credit.expiryDate ? (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    Exp {new Date(credit.expiryDate).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent applications from Firebase */}
      {apps.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#EAE5DE] dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3">📋 Recent Submissions</p>
          <div className="space-y-2">
            {apps.slice(0, 3).map((app) => (
              <div key={app.id} className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{app.jobTitle}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{app.employer} · {app.country}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  app.status === "submitted" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
                  app.status === "accepted" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                  app.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" :
                  "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                }`}>
                  {app.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Real-Time Stats Bar ── */
function RealTimeStatsBar() {
  const visitors = useActiveVisitors();
  const feed = useLatestSignupFeed();

  // Use the real DB member count — same source the landing page uses.
  // Firebase `signups` feed only has recent events, not the full member roster.
  // activeNow uses the same in-memory session tracker as the admin dashboard.
  const { data: publicStats } = useQuery<{ totalUsers: number; activeNow?: number }>({
    queryKey: ["/api/public/stats"],
    staleTime: 30_000,          // refresh every 30 s so the live count stays current
    refetchInterval: 30_000,
  });
  const totalMembers = publicStats?.totalUsers ?? 0;

  // Prefer the server-side session count (unified with admin dashboard).
  // Fall back to Firebase visitor list (which is browser-side only) then to 1.
  const onlineCount = Math.max(publicStats?.activeNow ?? visitors.length, 1);

  return (
    <div
      className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
      data-testid="section-realtime-stats"
    >
      {/* Left: LIVE badge + online count */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded-full">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full bg-green-500"
            style={{ animation: "pulse 2s infinite" }}
          />
          <span className="text-[11px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wide">LIVE</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-2xl font-bold text-gray-900 dark:text-white"
            data-testid="text-online-count"
          >
            {onlineCount}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {onlineCount === 1 ? "person" : "people"} browsing now
          </span>
        </div>
      </div>

      {/* Centre: latest signup feed */}
      <div className="bg-[#F9F8F6] dark:bg-gray-700/50 px-4 py-1.5 rounded-full text-sm flex items-center gap-2 flex-1 min-w-0 max-w-xs">
        <span className="text-[#4A7C59] dark:text-green-400 shrink-0">🆕</span>
        <span className="truncate text-gray-700 dark:text-gray-200 text-xs" data-testid="text-signup-feed">
          {feed}
        </span>
      </div>

      {/* Right: total members — from DB, same as landing page */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 shrink-0">
        <Users className="h-4 w-4" />
        <span>
          {totalMembers > 0 ? (
            <>
              Total members:{" "}
              <strong className="text-gray-900 dark:text-white" data-testid="text-total-members">
                {totalMembers.toLocaleString()}
              </strong>
            </>
          ) : (
            <span className="text-gray-400 dark:text-gray-500" data-testid="text-total-members">
              Members
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/* ── Active Visitors Mini ── */
function ActiveVisitorsMini() {
  const visitors = useActiveVisitors();
  if (visitors.length === 0) return null;

  const shown = visitors.slice(0, 5);
  const extra = visitors.length - 5;

  return (
    <div
      className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap"
      data-testid="section-active-visitors"
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300">
        <span>👤</span>
        <span>People here now:</span>
      </div>

      <div className="flex items-center">
        {shown.map((v, i) => (
          <div
            key={v.id}
            title={v.firstName || "Member"}
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-[#1A2530] border-2 border-white dark:border-gray-800"
            style={{
              background: "#D8CFC0",
              marginLeft: i === 0 ? 0 : -8,
              zIndex: shown.length - i,
              position: "relative",
            }}
          >
            {(v.initial || "?").toUpperCase()}
          </div>
        ))}
        {extra > 0 && (
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">+{extra} more</span>
        )}
      </div>

      <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
        ⚡ Real people · Updates live
      </span>
    </div>
  );
}

/* ── Recent Signups Panel ── */
function RecentSignupsPanel() {
  const signups = useRecentSignups(5);

  if (signups.length === 0) return null;

  return (
    <div
      className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-5"
      data-testid="section-recent-signups"
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#EAE5DE] dark:border-gray-700">
        <h4 className="text-base font-semibold text-gray-900 dark:text-white">
          📋 Recently Joined
        </h4>
        <span className="text-xs text-gray-400 dark:text-gray-500">Real members · Updated live</span>
      </div>

      <ul className="space-y-3">
        {signups.map((s) => {
          const initial = (s.firstName || "?").charAt(0).toUpperCase();
          const timeStr = s.joined
            ? new Date(s.joined).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })
            : "Just now";
          return (
            <li key={s.id} className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-[#1A2530] shrink-0"
                style={{ background: "#EDE9E2" }}
              >
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-none mb-0.5">
                  {s.firstName || "Member"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  from {s.location || "Kenya"}{s.destination ? ` → ${s.destination}` : ""}
                </p>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{timeStr}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Support Team ── */
const ADVISORS = [
  {
    initials: "GM",
    name: "Grace M.",
    role: "UK NHS Specialist",
    statusLabel: "🟢 Available now",
    statusColor: "#4CAF50",
    waQuery: "Hi Grace, I need guidance on NHS healthcare jobs in the UK.",
  },
  {
    initials: "JK",
    name: "James K.",
    role: "Gulf & UAE Expert",
    statusLabel: "🟡 Available at 2 PM",
    statusColor: "#E6A700",
    waQuery: "Hi James, I need guidance on jobs in the Gulf/UAE.",
  },
  {
    initials: "SW",
    name: "Sarah W.",
    role: "Canada Express Entry",
    statusLabel: "🟢 Available now",
    statusColor: "#4CAF50",
    waQuery: "Hi Sarah, I need guidance on Canada Express Entry and jobs in Canada.",
  },
];

function SupportTeamSection({ isPro, onUpgrade }: { isPro: boolean; onUpgrade: () => void }) {
  const waBase = import.meta.env.VITE_SUPPORT_WHATSAPP || "254742619777";
  return (
    <div
      className="rounded-2xl border border-[#E2DDD5] dark:border-gray-700 bg-white dark:bg-gray-800 p-5"
      data-testid="section-support-team"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          👋 Your Support Team
        </h4>
        {isPro && (
          <a
            href={`https://wa.me/${waBase}?text=${encodeURIComponent("Hi, I need career guidance.")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            Message all →
          </a>
        )}
      </div>

      {/* 3-column horizontal grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {ADVISORS.map((a) => (
          <div key={a.initials} className="flex items-start gap-3">
            {/* Avatar */}
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-base font-bold text-[#1A2530] shrink-0"
              style={{ background: "#D8CFC0" }}
            >
              {a.initials}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{a.name}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">{a.role}</p>
              <p className="text-[11px] font-medium mb-2" style={{ color: a.statusColor }}>{a.statusLabel}</p>
              {isPro ? (
                <a
                  href={`https://wa.me/${waBase}?text=${encodeURIComponent(a.waQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-[11px] font-semibold px-3 py-1 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors"
                  data-testid={`btn-chat-${a.initials.toLowerCase()}`}
                >
                  Chat →
                </a>
              ) : (
                <button
                  onClick={onUpgrade}
                  className="inline-block text-[11px] font-semibold px-3 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors"
                  data-testid={`btn-chat-locked-${a.initials.toLowerCase()}`}
                >
                  🔒 PRO
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Note */}
      <p className="mt-5 text-xs text-gray-500 dark:text-gray-400 bg-[#F9F8F6] dark:bg-gray-700/50 rounded-lg px-3 py-2.5 leading-relaxed">
        💬 <strong className="text-gray-700 dark:text-gray-300">Need immediate help?</strong> Your advisors are real professionals who understand the Kenyan overseas job market.
      </p>
    </div>
  );
}

/* ── Bottom Services Grid ── */
const BOTTOM_SERVICES = [
  {
    badge: "MOST POPULAR",
    badgeColor: "bg-[#1A2530] text-white",
    icon: "📨",
    title: "Bulk Apply to Jobs",
    desc: "AI-generated cover letters for multiple jobs in minutes. Apply to 8 jobs with one click.",
    meta: ["🎯 Pro Plan included", "⚡ 2 min setup"],
    href: "/bulk-apply",
    cta: "Start bulk applying →",
  },
  {
    badge: "3 FREE / DAY",
    badgeColor: "bg-[#4A7C59] text-white",
    icon: "🤖",
    title: "AI Visa Assistant",
    desc: "Ask any visa or immigration question — get instant AI-powered answers.",
    meta: ["💬 1,200+ questions answered", "🇰🇪 Kenya-specific"],
    href: "/visa-assistant",
    cta: "Ask a question →",
  },
  {
    badge: "NEW",
    badgeColor: "bg-amber-400 text-[#1A2530]",
    icon: "🎓",
    title: "Study Abroad",
    desc: "Scholarships, student visas & university guides for 6 countries.",
    meta: ["📚 50+ university guides", "💰 Scholarship finder"],
    href: "/student-visas",
    cta: "Explore study options →",
  },
  {
    badge: "5 COUNTRIES",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    icon: "📋",
    title: "Visa & Immigration Guides",
    desc: "Step-by-step guides for Canada, UK, USA, Germany & UAE — costs, steps & official links.",
    meta: ["📖 Updated weekly", "🔗 Official sources"],
    href: "/country/uk",
    cta: "View guides →",
  },
];

function BottomServicesGrid() {
  return (
    <div data-testid="section-bottom-services">
      {/* Section header */}
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          ⚡ Tools to Accelerate Your Search
        </h2>
        <Link href="/services">
          <span className="text-xs font-semibold text-[#1A2530] dark:text-gray-200 border-b-2 border-[#8B7A66] pb-0.5 hover:opacity-80 transition-opacity cursor-pointer">
            Browse all services →
          </span>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {BOTTOM_SERVICES.map((s) => (
          <Link key={s.title} href={s.href}>
            <div className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl p-5 hover:border-[#8B7A66] hover:shadow-md transition-all duration-200 cursor-pointer h-full flex gap-4 items-start">
              <div className="text-2xl flex-shrink-0 mt-0.5">{s.icon}</div>
              <div className="flex-1 min-w-0">
                <span className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full mb-2 tracking-wide ${s.badgeColor}`}>
                  {s.badge}
                </span>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1 leading-snug">
                  {s.title}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2.5 leading-relaxed">{s.desc}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400 dark:text-gray-500 mb-2.5">
                  {s.meta.map((m) => <span key={m}>{m}</span>)}
                </div>
                <span className="text-xs font-semibold text-[#1A2530] dark:text-gray-200">{s.cta}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Quick Access Row ── */
const QUICK_ACCESS = [
  { icon: "🟢", title: "Green Card Guide",  desc: "DV Lottery • FREE eligibility check", href: "/country/usa" },
  { icon: "🛡️", title: "NEA Agencies",      desc: "1,200+ verified recruiters",          href: "/nea-agencies" },
  { icon: "📄", title: "CV Services",        desc: "ATS optimization • Country-specific", href: "/services" },
  { icon: "🤝", title: "Interview Prep",    desc: "Mock interviews • STAR method",       href: "/services" },
];

function QuickAccessRow() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="section-quick-access">
      {QUICK_ACCESS.map((item) => (
        <Link key={item.title} href={item.href}>
          <div className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-xl p-4 text-center hover:border-[#8B7A66] hover:shadow-sm transition-all duration-200 cursor-pointer">
            <div className="text-2xl mb-2">{item.icon}</div>
            <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-1 leading-snug">{item.title}</h5>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">{item.desc}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ── Referral Banner (prominent dark) ── */
function ReferralBannerSection({ refCode }: { refCode?: string }) {
  const [copied, setCopied] = useState(false);
  const code = refCode || "SHARE2EARN";

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div
      className="rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5"
      style={{ background: "linear-gradient(135deg, #1A2530 0%, #2A3A4A 100%)" }}
      data-testid="section-referral-banner"
    >
      <div className="text-white">
        <h3 className="text-xl font-semibold mb-1">🎁 Invite friends. Earn KES 450.</h3>
        <p className="text-sm" style={{ color: "#B8C5D0" }}>
          Share your referral code. When they sign up, you get KES 450 via M-Pesa.
        </p>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0 flex-wrap">
        <div
          className="rounded-xl px-5 py-3 text-center"
          style={{ background: "rgba(255,255,255,0.1)", border: "1px dashed rgba(255,255,255,0.3)" }}
        >
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#B8C5D0" }}>Your referral code</div>
          <code className="text-white text-xl font-bold tracking-widest">{code}</code>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={copyCode}
            className="bg-[#4A7C59] hover:bg-[#3A6A4A] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            data-testid="button-copy-referral-code"
          >
            {copied ? "✅ Copied!" : "📋 Copy Code"}
          </button>
          <Link href="/referrals">
            <span className="text-[11px] text-center block" style={{ color: "#B8C5D0" }}>
              View earnings →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── NEA Trust Banner ── */
function TrustBanner() {
  const { data: stats } = useQuery<{ expiredAgencies: number; totalAgencies: number }>({
    queryKey: ["/api/public/stats"],
    staleTime: 5 * 60 * 1000,
  });

  const expired  = stats?.expiredAgencies;
  const total    = stats?.totalAgencies;
  const active   = (total != null && expired != null) ? total - expired : null;

  return (
    <div
      className="bg-white dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-700 rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap"
      data-testid="section-trust-banner"
    >
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white text-base mb-0.5">
          🛡️ Government-Verified Agencies Only
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Every recruiter is checked against the official NEA database
        </p>
      </div>

      <div className="flex gap-6">
        {[
          { n: active != null ? active.toLocaleString() : "—",  label: "Active Licenses" },
          { n: expired != null ? expired.toLocaleString() : "—", label: "Expired / Avoid" },
          { n: total != null ? total.toLocaleString() : "—",   label: "Total Tracked" },
        ].map(({ n, label }) => (
          <div key={label} className="text-center">
            <div className="text-xl font-bold text-gray-900 dark:text-white">{n}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      <Link href="/nea-agencies">
        <span className="bg-[#1A2530] dark:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity cursor-pointer">
          Verify Agency →
        </span>
      </Link>
    </div>
  );
}


/* ── AI Match Box ── */
const SAMPLE_MATCHES: Record<string, { title: string; location: string; flag: string; score: number }[]> = {
  nurse: [
    { title: "Registered Nurse — NHS",        location: "Manchester, UK",  flag: "🇬🇧", score: 94 },
    { title: "ICU Staff Nurse",               location: "London, UK",      flag: "🇬🇧", score: 89 },
    { title: "Clinical Nurse Specialist",     location: "Sydney, AU",      flag: "🇦🇺", score: 85 },
  ],
  engineer: [
    { title: "Civil Site Engineer",           location: "Dubai, UAE",      flag: "🇦🇪", score: 91 },
    { title: "Structural Engineer",           location: "Calgary, CA",     flag: "🇨🇦", score: 87 },
    { title: "Project Engineer",              location: "Frankfurt, DE",   flag: "🇩🇪", score: 82 },
  ],
  accountant: [
    { title: "Senior Accountant",            location: "London, UK",      flag: "🇬🇧", score: 90 },
    { title: "Management Accountant",        location: "Toronto, CA",     flag: "🇨🇦", score: 84 },
    { title: "Financial Analyst",            location: "Dubai, UAE",      flag: "🇦🇪", score: 79 },
  ],
  teacher: [
    { title: "Primary School Teacher",       location: "Dubai, UAE",      flag: "🇦🇪", score: 93 },
    { title: "Secondary Maths Teacher",      location: "London, UK",      flag: "🇬🇧", score: 88 },
    { title: "ESL Teacher",                  location: "Riyadh, KSA",     flag: "🇸🇦", score: 83 },
  ],
  driver: [
    { title: "CDL Truck Driver",             location: "Toronto, CA",     flag: "🇨🇦", score: 92 },
    { title: "HGV Driver",                   location: "Manchester, UK",  flag: "🇬🇧", score: 87 },
    { title: "Bus Driver",                   location: "Dubai, UAE",      flag: "🇦🇪", score: 80 },
  ],
};

function getSampleMatches(query: string) {
  const q = query.toLowerCase();
  for (const [key, matches] of Object.entries(SAMPLE_MATCHES)) {
    if (q.includes(key)) return matches;
  }
  return null;
}

function AiMatchBox() {
  const [profession, setProfession] = useState("");
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const charLen = profession.length;
  const previewMatches = charLen > 2 ? getSampleMatches(profession) : null;

  const handleFind = () => {
    const trimmed = profession.trim();
    if (trimmed) sessionStorage.setItem("dashboard_profession", trimmed);
    setLocation("/career-match");
  };

  return (
    <div
      className="rounded-2xl border border-[#E2DDD5] dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm"
      data-testid="section-ai-match-box"
    >
      {/* Badge row */}
      <div className="flex items-center gap-2 mb-4">
        <span className="bg-[#1A2530] dark:bg-gray-100 text-white dark:text-gray-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full tracking-widest uppercase">
          AI-Powered
        </span>
        <span className="text-gray-500 dark:text-gray-400 text-xs">⚡ Instant matching from 1,200+ live jobs</span>
      </div>

      {/* Two-column inner layout */}
      <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr] gap-5">

        {/* ── LEFT: input area ── */}
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1 leading-snug">
            Find jobs that actually fit you
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
            Tell us your profession and we'll show you the overseas jobs where you're most likely to succeed.
          </p>

          {/* Input wrapper */}
          <div className="bg-[#F9F8F6] dark:bg-gray-800 border border-[#E2DDD5] dark:border-gray-600 rounded-xl p-3 mb-3">
            <label className="text-xs font-semibold text-gray-800 dark:text-gray-200 block mb-2">
              📋 What do you do?
            </label>
            <input
              ref={inputRef}
              type="text"
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFind()}
              placeholder="e.g., Registered Nurse, Site Engineer, Accountant…"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#D1CEC8] dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A2530]/20 dark:focus:ring-gray-100/20 transition"
              data-testid="input-profession"
            />
            <div className="flex items-center justify-between mt-2 flex-wrap gap-1">
              <Link href="/services">
                <span className="text-[11px] text-gray-700 dark:text-gray-300 underline underline-offset-2 cursor-pointer font-medium">
                  📎 Or upload your CV for better matches
                </span>
              </Link>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{charLen} / 50</span>
            </div>
          </div>

          <button
            onClick={handleFind}
            className="w-full bg-[#1A2530] dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold py-3 rounded-lg hover:bg-[#2A3A4A] dark:hover:bg-white active:scale-[0.98] transition-all duration-150"
            data-testid="button-find-matching-jobs"
          >
            Find Matching Jobs →
          </button>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-center">
            🔒 Your information is never shared with recruiters.
          </p>
        </div>

        {/* ── RIGHT: preview panel ── */}
        <div className="bg-[#F9F8F6] dark:bg-gray-800 rounded-xl p-4">
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-3">
            📊 Jobs that typically match your profile
          </p>
          {previewMatches ? (
            <div className="flex flex-col gap-2">
              {previewMatches.map((m) => (
                <div key={m.title} className="bg-white dark:bg-gray-700 rounded-lg p-2.5 border border-[#EAE5DE] dark:border-gray-600">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1 leading-snug">{m.title}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{m.flag} {m.location}</span>
                    <span className="text-[11px] font-bold text-[#4A7C59]">{m.score}% match</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Skeleton placeholders */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white dark:bg-gray-700 rounded-lg p-2.5 border border-[#EAE5DE] dark:border-gray-600 mb-2">
                  <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-3/4 mb-2 animate-pulse" />
                  <div className="h-2.5 bg-gray-100 dark:bg-gray-500 rounded w-1/2 animate-pulse" />
                </div>
              ))}
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-2">
                Enter your profession to see personalized matches
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Profile active card (left column) ── */
function CareerReadinessCard({ isPaid, totalOrders }: { isPaid: boolean; totalOrders: number }) {
  const cvUploaded   = totalOrders > 0 || isPaid;
  const planActive   = isPaid;
  const readyToApply = isPaid;

  const allActive = cvUploaded && planActive && readyToApply;

  const pill = (done: boolean, label: string) => (
    <span
      key={label}
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${
        done
          ? "text-green-700 dark:text-green-400"
          : "text-gray-400 dark:text-gray-500"
      }`}
    >
      {done ? "✅" : "⬜"} {label}
    </span>
  );

  return (
    <div
      className="rounded-2xl p-4 shadow-sm border-l-4 border-green-600 bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900/40 h-full flex flex-col"
      data-testid="card-career-readiness"
    >
      <div className="flex items-start gap-3 flex-1">
        <span className="text-3xl leading-none mt-0.5" role="img" aria-label="seedling">🌱</span>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-green-900 dark:text-green-100 leading-tight m-0">
            {allActive ? "Your Profile is Active" : "Complete Your Profile"}
          </h4>
          <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1.5">
            {pill(cvUploaded,   "CV uploaded")}
            {pill(planActive,   "Plan active")}
            {pill(readyToApply, "Ready to apply")}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-green-800 dark:text-green-300 mt-3 leading-snug border-t border-green-200 dark:border-green-800/50 pt-2">
        <strong>Next step:</strong>{" "}
        {allActive
          ? "Use AI Match below to find jobs that fit your profile."
          : "Activate a plan to unlock all job portals and apply."}
      </p>
    </div>
  );
}

/* ── Active order mini-card (right column) ── */
function ActiveOrderMiniCard({ order }: { order: ServiceOrder | undefined }) {
  if (!order) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col items-center justify-center text-center" data-testid="card-active-order-empty">
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-2">
          <ClipboardList className="h-5 w-5 text-gray-400" />
        </div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Active Order</p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-tight">No active orders yet</p>
        <Link href="/services">
          <button className="mt-3 text-[11px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-0.5 hover:underline">
            Browse services <ArrowRight className="h-3 w-3" />
          </button>
        </Link>
      </div>
    );
  }

  /* ── Awaiting payment: friendly action pill ── */
  if (order.status === "pending_payment") {
    return (
      <Link href={`/order/${order.id}`}>
        <div
          className="h-full flex flex-col items-start justify-center gap-2 rounded-2xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200"
          data-testid="card-active-order"
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Active Order</p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50 w-full">
            <span className="text-base shrink-0" role="img" aria-label="clipboard">📋</span>
            <span className="text-[12px] leading-snug text-gray-700 dark:text-gray-300 min-w-0">
              <span className="font-medium">{order.serviceName}</span> ready —{" "}
              <span className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                Complete payment →
              </span>
            </span>
          </div>
        </div>
      </Link>
    );
  }

  /* ── All other statuses ── */
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const progressPct = order.status === "processing" ? 60 : order.status === "in_review" ? 80 : order.status === "completed" ? 100 : 40;

  return (
    <Link href={`/order/${order.id}`}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col cursor-pointer hover:shadow-md transition-all duration-200" data-testid="card-active-order">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Active Order</p>

        <div className="flex items-start gap-2 mb-2 flex-1">
          <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="font-semibold text-gray-900 dark:text-white text-xs leading-snug line-clamp-2">{order.serviceName}</p>
        </div>

        <span className={`self-start flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium mb-3 ${cfg.color}`}>
          {cfg.icon}
          {cfg.label}
        </span>

        <div className="mt-auto">
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-0.5">
            View details <ArrowRight className="h-2.5 w-2.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [placementJobTitle, setPlacementJobTitle] = useState("");
  const [placementDestination, setPlacementDestination] = useState("");
  const [placementSubmitting, setPlacementSubmitting] = useState(false);
  const [placementSubmitted, setPlacementSubmitted] = useState(false);
  const [recMessage, setRecMessage] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleReportPlacement(e: React.FormEvent) {
    e.preventDefault();
    if (!placementJobTitle.trim() || !placementDestination.trim()) return;
    setPlacementSubmitting(true);
    try {
      await pushSuccessStory(user ?? {}, placementJobTitle.trim(), placementDestination.trim());
      setPlacementSubmitted(true);
      setPlacementJobTitle("");
      setPlacementDestination("");
      toast({ title: "🎉 Thank you!", description: "Your success story has been submitted and will appear on the site once verified." });
    } catch {
      toast({ title: "Submission failed", description: "Please try again shortly.", variant: "destructive" });
    } finally {
      setPlacementSubmitting(false);
    }
  }

  useEffect(() => { trackDashboardAccess(); }, []);

  useEffect(() => {
    fetch("/api/check-hot-user", { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.isHot) {
          alert("⚠️ 87 users applied for this job. Upgrade now to secure your chance!");
        }
      });
  }, []);

  useEffect(() => {
    fetch("/api/recommendation", { credentials: "include" })
      .then(res => res.json())
      .then(data => { setRecMessage(data.message); });
  }, []);

  const queryClient = useQueryClient();

  const { data: subscription, isLoading: subLoading } = useQuery<UserSubscription | null>({
    queryKey: ["/api/subscription"],
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    staleTime: 0,
  });

  const { data: userPlan } = useQuery<{ planId: string; plan: any; subscription: any } | null>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    staleTime: 0,
  });

  const { data: adminStats, error: adminError, isSuccess: adminCheckSuccess } = useQuery<{ totalUsers?: number }>({
    queryKey: ["/api/admin/stats"],
    retry: false,
    staleTime: 1000 * 60 * 10,
    enabled: !!user,
  });

  const { data: ordersData } = useQuery<ServiceOrder[]>({
    queryKey: ["/api/service-orders"],
    enabled: !!user,
  });

  const { data: alertsData } = useQuery<JobAlert[]>({
    queryKey: ["/api/job-alerts"],
    enabled: !!user,
  });

  const { data: paymentHistory } = useQuery<{
    id: string; paymentId: string | null; amount: number; currency: string;
    status: string; gateway: string; type: string;
    planId: string | null; serviceId: string | null;
    gatewayRef: string | null; createdAt: string;
  }[]>({
    queryKey: ["/api/payments/history"],
    staleTime: 1000 * 60 * 5,
  });

  const { data: referralData } = useQuery<{ pendingCommission: number; paidCommission: number; totalReferrals: number; refCode: string }>({
    queryKey: ["/api/my-referrals"],
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  // Parallel Supabase snapshot — payments, user_services, service_requests, commissions
  const { data: userData } = useUserData(user?.id);

  const isAdmin = adminCheckSuccess && !adminError && typeof adminStats?.totalUsers === "number";
  const currentPlanId = userPlan?.planId || "free";
  const isPro = currentPlanId === "pro";
  const isPaid = currentPlanId === "pro" || currentPlanId === "basic";
  const { openUpgradeModal } = useUpgradeModal();

  const orders = ordersData || [];
  const totalOrders = orders.length;
  const activeOrder = orders.find(o => !["delivered", "completed", "cancelled"].includes(o.status));
  const activeAlerts = (alertsData || []).filter(a => a.isActive).length;

  /* "Active since" label from subscription startDate */
  const activeSinceLabel = (() => {
    const raw = subscription?.startDate ?? (userPlan?.subscription as any)?.startDate;
    if (!raw) return null;
    return new Date(raw).toLocaleDateString("en-KE", { month: "short", year: "numeric" });
  })();

  /* Track this user as an active visitor in Firebase */
  useEffect(() => {
    if (!user?.id) return;
    const stop = trackPresence(user.id, getDisplayName(user));
    return stop;
  }, [user?.id, user?.firstName, user?.email]);

  /* Referral earnings — prefer direct Supabase commission sum, fall back to REST */
  const commissionKES = userData?.referrals.length
    ? totalCommissionKES(userData.referrals)
    : referralData
      ? referralData.pendingCommission + referralData.paidCommission
      : null;
  const referralDisplay = commissionKES && commissionKES > 0
    ? `KES ${commissionKES.toLocaleString()}`
    : "KES 450";
  const referralSub = commissionKES && commissionKES > 0 ? "Earned so far" : "Per referral";

  /* Activity stats from parallel Supabase snapshot */
  const totalSpentKES  = userData ? completedPaymentsKES(userData.payments)  : null;
  const activeCount    = userData ? activeServices(userData.purchases).length : null;
  const requestsCount  = userData ? userData.services.length                  : null;


  if (subLoading) {
    return (
      <section className="min-h-screen bg-gray-50 dark:bg-gray-950" role="status" aria-busy="true" aria-label="Loading dashboard">
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 px-5 py-4">
          <Skeleton className="h-6 w-40 bg-blue-800/60" />
          <Skeleton className="h-4 w-32 mt-2 bg-blue-800/60" />
        </div>
        <div className="px-4 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
        <span className="sr-only">Loading your dashboard, please wait</span>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-gray-50 dark:bg-gray-950" aria-labelledby="dashboard-heading">

      {/* ── TOP BAR ────────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white px-5 py-4 sticky top-0 z-30 shadow-lg" role="banner">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-10 w-10 rounded-xl object-cover shadow-md" aria-hidden="true" />
            <div>
              <h1 id="dashboard-heading" className="text-lg font-bold leading-tight">WorkAbroad Hub</h1>
              <p className="text-xs text-blue-200 flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${isPaid ? "bg-green-400" : "bg-yellow-400"}`} />
                {isPaid ? "Account Active" : "Free Account"}
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-1" aria-label="Dashboard actions">
            <NotificationBell />
            <ThemeToggle />
            {isAdmin && (
              <Link href="/admin" data-testid="link-admin-panel">
                <button className="p-2 hover:bg-white/10 rounded-lg transition-colors" aria-label="Admin panel" data-testid="button-admin-panel">
                  <Settings className="h-5 w-5" />
                </button>
              </Link>
            )}
            <button onClick={() => logout()} className="p-2 hover:bg-white/10 rounded-lg transition-colors" data-testid="button-logout" aria-label="Log out">
              <LogOut className="h-5 w-5" />
            </button>
          </nav>
        </div>
      </header>

      {/* ── MAIN CONTENT ───────────────────────────────────────────────── */}
      <div className="px-4 py-5 space-y-5 pb-28 max-w-2xl mx-auto">

        {/* Agency alert + urgency banners for free users */}
        {!isPaid && (
          <div className="space-y-2">
            <AgencyAlertBanner dismissable showLink />
            <UrgencyBanner />
            {recMessage && (
              <div className="bg-yellow-100 p-3 rounded">
                {recMessage}
              </div>
            )}
          </div>
        )}

        {/* ── REAL-TIME STATS BAR ──────────────────────────────────────── */}
        <RealTimeStatsBar />
        <ActiveVisitorsMini />

        {/* ── HERO WELCOME ─────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl shadow-lg bg-gradient-to-br from-blue-700 via-indigo-700 to-purple-800" data-testid="card-hero-welcome">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/4 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
          <div className="relative z-10 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-white leading-tight">
                  Welcome back, {getDisplayName(user)}!
                </h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {isPaid ? (
                    <span className="inline-flex items-center gap-1.5 bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-bold px-2.5 py-1 rounded-full">
                      <Star className="h-3 w-3 fill-amber-300" />
                      {currentPlanId === "pro" ? "Pro Plan" : "Basic Plan"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 bg-white/10 text-blue-200 text-xs font-semibold px-2.5 py-1 rounded-full">
                      Free Plan
                    </span>
                  )}
                  {activeSinceLabel && (
                    <span className="text-blue-300 text-xs flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Active since {activeSinceLabel}
                    </span>
                  )}
                </div>
                {!isPaid && (
                  <p className="text-blue-200 text-xs mt-2 leading-relaxed">
                    Unlock personalized career guidance, 30+ verified job portals, and 1-on-1 WhatsApp consultation.
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {!isPaid && (
                  <button
                    onClick={() => openUpgradeModal("consultation_locked", "WhatsApp Consultation", "pro")}
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-blue-900 font-bold py-2 px-4 rounded-xl transition-all duration-200 shadow hover:shadow-md text-xs whitespace-nowrap"
                    data-testid="button-unlock"
                  >
                    🔓 Upgrade
                  </button>
                )}
                <Link href="/my-overview">
                  <button
                    className="bg-white/15 hover:bg-white/25 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200 whitespace-nowrap"
                    data-testid="link-my-overview"
                  >
                    My Overview →
                  </button>
                </Link>
                <Link href="/my-account">
                  <button
                    className="bg-white/10 hover:bg-white/20 text-blue-200 text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200 whitespace-nowrap"
                    data-testid="link-my-account"
                  >
                    Account
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── CAREER READINESS + ACTIVE ORDER (side by side) ─────────── */}
        <div className="grid grid-cols-2 gap-3" style={{ minHeight: "160px" }}>
          <CareerReadinessCard isPaid={isPaid} totalOrders={totalOrders} />
          <ActiveOrderMiniCard order={activeOrder} />
        </div>

        {/* ── AI MATCH BOX ─────────────────────────────────────────────── */}
        <AiMatchBox />

        {/* ── QUICK STAT CARDS (3 across) ─────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2.5" data-testid="section-quick-stats">
          {[
            {
              icon: <Globe className="h-5 w-5 text-teal-600 dark:text-teal-300" />,
              value: "9",
              label: "Countries",
              sub: "View destinations",
              bg: "bg-teal-50 dark:bg-teal-900/30",
              accent: "text-teal-700 dark:text-teal-300",
              href: "/global-opportunities",
            },
            {
              icon: <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-300" />,
              value: "30+",
              label: "Portals",
              sub: "Verified boards",
              bg: "bg-blue-50 dark:bg-blue-900/30",
              accent: "text-blue-700 dark:text-blue-300",
              href: undefined,
            },
            {
              icon: <Gift className="h-5 w-5 text-orange-600 dark:text-orange-300" />,
              value: referralDisplay,
              label: "Referral",
              sub: referralSub,
              bg: "bg-orange-50 dark:bg-orange-900/30",
              accent: "text-orange-700 dark:text-orange-300",
              href: "/referrals",
            },
          ].map(chip => {
            const inner = (
              <div key={chip.label} className={`${chip.bg} rounded-2xl p-3 flex flex-col items-center text-center border border-transparent shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer`} data-testid={`stat-${chip.label.toLowerCase()}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 bg-white/60 dark:bg-black/20`}>{chip.icon}</div>
                <div className={`text-2xl font-bold leading-none ${chip.accent}`}>{chip.value}</div>
                <div className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 mt-1">{chip.label}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{chip.sub}</div>
              </div>
            );
            return chip.href ? <Link key={chip.label} href={chip.href}>{inner}</Link> : <div key={chip.label}>{inner}</div>;
          })}
        </div>

        {/* ── ACTIVITY SNAPSHOT (from Supabase parallel fetch) ─────────── */}
        {userData && (
          <div className="grid grid-cols-3 gap-2.5" data-testid="section-activity-stats">
            {[
              {
                icon: <CreditCard className="h-4 w-4 text-green-600 dark:text-green-300" />,
                value: totalSpentKES != null && totalSpentKES > 0
                  ? `KES ${totalSpentKES.toLocaleString()}`
                  : "—",
                label: "Total Paid",
                sub: `${userData.payments.filter(p => p.status === "completed" || p.status === "success").length} payment${userData.payments.filter(p => p.status === "completed" || p.status === "success").length !== 1 ? "s" : ""}`,
                bg: "bg-green-50 dark:bg-green-900/20",
                accent: "text-green-700 dark:text-green-300",
                href: "/my-payments",
              },
              {
                icon: <Zap className="h-4 w-4 text-purple-600 dark:text-purple-300" />,
                value: activeCount != null ? String(activeCount) : "—",
                label: "Services",
                sub: "Unlocked",
                bg: "bg-purple-50 dark:bg-purple-900/20",
                accent: "text-purple-700 dark:text-purple-300",
                href: "/my-documents",
              },
              {
                icon: <ClipboardList className="h-4 w-4 text-sky-600 dark:text-sky-300" />,
                value: requestsCount != null ? String(requestsCount) : "—",
                label: "Requests",
                sub: requestsCount === 1 ? "In progress" : "Submitted",
                bg: "bg-sky-50 dark:bg-sky-900/20",
                accent: "text-sky-700 dark:text-sky-300",
                href: "/my-orders",
              },
            ].map(chip => {
              const inner = (
                <div
                  key={chip.label}
                  className={`${chip.bg} rounded-2xl p-3 flex flex-col items-center text-center border border-transparent shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer`}
                  data-testid={`stat-${chip.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 bg-white/60 dark:bg-black/20">{chip.icon}</div>
                  <div className={`text-xl font-bold leading-none ${chip.accent}`}>{chip.value}</div>
                  <div className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 mt-1">{chip.label}</div>
                  <div className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{chip.sub}</div>
                </div>
              );
              return <Link key={chip.label} href={chip.href}>{inner}</Link>;
            })}
          </div>
        )}

        {/* ── JOB DESTINATION COUNTRIES ────────────────────────────────── */}
        <div data-testid="section-destinations">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Job Destinations</h3>
            <Link href="/global-opportunities" className="text-[11px] text-teal-600 dark:text-teal-400 font-medium hover:underline">View all →</Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
            {[
              { flag: "🇬🇧", name: "UK",          desc: "NHS hiring" },
              { flag: "🇦🇪", name: "UAE",         desc: "Tax-free" },
              { flag: "🇨🇦", name: "Canada",      desc: "PR pathway" },
              { flag: "🇦🇺", name: "Australia",   desc: "Skilled visa" },
              { flag: "🇸🇦", name: "Saudi",       desc: "Vision 2030" },
              { flag: "🇩🇪", name: "Germany",     desc: "EU Blue Card" },
              { flag: "🇺🇸", name: "USA",         desc: "H-1B / EB-3" },
              { flag: "🇶🇦", name: "Qatar",       desc: "Tax-free Gulf" },
            ].map(c => (
              <Link
                key={c.name}
                href="/global-opportunities"
                data-testid={`dest-${c.name.toLowerCase()}`}
                className="flex-shrink-0 flex flex-col items-center gap-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 shadow-sm hover:shadow-md hover:scale-[1.04] active:scale-[0.97] transition-all duration-150 min-w-[68px]"
              >
                <span className="text-2xl leading-none">{c.flag}</span>
                <span className="text-[11px] font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap">{c.name}</span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500 whitespace-nowrap">{c.desc}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── QUICK ACTIONS — rich 2×2 cards ────────────────────────── */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3" data-testid="heading-quick-actions">Quick Actions</h3>

          {/* Primary 4-card rich grid */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {isPro ? (
              <QuickActionCard
                emoji="💬"
                title="WhatsApp"
                description="Chat with your advisor"
                badgeText="Online now"
                badgeColor="bg-green-500"
                href={`https://wa.me/${import.meta.env.VITE_SUPPORT_WHATSAPP || '254742619777'}?text=${encodeURIComponent("Hi, I need career guidance on WorkAbroad Hub.")}`}
              />
            ) : (
              <QuickActionCard
                emoji="💬"
                title="WhatsApp"
                description="Chat with your advisor"
                badgeText="PRO only"
                badgeColor="bg-amber-500"
                locked
                onClick={() => openUpgradeModal("consultation_locked", "WhatsApp Consultation", "pro")}
              />
            )}
            <QuickActionCard
              emoji="🧠"
              title="AI Job Match"
              description="Get personalized job picks"
              badgeText="AI powered"
              badgeColor="bg-indigo-500"
              href="/career-match"
            />
            <QuickActionCard
              emoji="📄"
              title="CV Services"
              description="Boost your application"
              badgeText="Expert review"
              badgeColor="bg-blue-500"
              href="/services"
            />
            <QuickActionCard
              emoji="🛡️"
              title="Verify Agency"
              description="Check before you sign"
              badgeText="Free check"
              badgeColor="bg-emerald-600"
              href="/nea-agencies"
            />
          </div>

          {/* Secondary compact tile row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <ActionTile
              icon={<FileText className="h-5 w-5 text-white" />}
              label="My Documents"
              color="bg-teal-600"
              href="/my-documents"
              badge="NEW"
            />
            <ActionTile
              icon={<Rocket className="h-5 w-5 text-white" />}
              label="Assisted Apply"
              color="bg-purple-500"
              href="/assisted-apply"
            />
            <ActionTile
              icon={<Flame className="h-5 w-5 text-white" />}
              label="Scam Wall"
              color="bg-red-500"
              href="/scam-wall"
            />
            <ActionTile
              icon={<Search className="h-5 w-5 text-white" />}
              label="Scam Check"
              color="bg-rose-600"
              href="/scam-lookup"
            />
          </div>
        </div>

        {/* ── RECENT SIGNUPS (LIVE) ────────────────────────────────────── */}
        <RecentSignupsPanel />

        {/* ── SUPPORT TEAM ─────────────────────────────────────────────── */}
        <SupportTeamSection
          isPro={isPro}
          onUpgrade={() => openUpgradeModal("consultation_locked", "WhatsApp Consultation", "pro")}
        />

        {/* ── CREDITS WIDGET (Firebase live) ───────────────────────────── */}
        <CreditsWidget userId={user?.id} />

        {/* ── PAYMENT HISTORY ──────────────────────────────────────────── */}
        {paymentHistory && paymentHistory.length > 0 && (
          <div data-testid="section-payment-history">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" />
                Payment History
              </h3>
              <span className="text-[10px] text-muted-foreground">{paymentHistory.length} record{paymentHistory.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
              {paymentHistory.slice(0, 3).map((p) => {
                const isOk = p.status === "completed" || p.status === "success";
                const isFail = p.status === "failed";
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3" data-testid={`payment-row-${p.id}`}>
                    {/* Status icon */}
                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      isOk  ? "bg-green-100 dark:bg-green-900/30" :
                      isFail ? "bg-red-100 dark:bg-red-900/30" :
                               "bg-amber-100 dark:bg-amber-900/30"
                    }`}>
                      {isOk   && <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />}
                      {isFail && <XCircle     className="h-4 w-4 text-red-600 dark:text-red-400" />}
                      {!isOk && !isFail && <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                    </div>

                    {/* Label + receipt */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {p.planId ? `${p.planId.charAt(0).toUpperCase() + p.planId.slice(1)} Plan` :
                         p.serviceId ? "Service Payment" : "Payment"}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {p.gatewayRef
                          ? `Receipt: ${p.gatewayRef}`
                          : p.gateway === "mpesa" ? "M-Pesa" : "PayPal"
                        }
                        {" · "}
                        {new Date(p.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>

                    {/* Amount + status badge */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                        KES {p.amount.toLocaleString()}
                      </p>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 mt-0.5 ${
                        isOk  ? "text-green-700 border-green-300 dark:text-green-400 dark:border-green-700" :
                        isFail ? "text-red-700 border-red-300 dark:text-red-400 dark:border-red-700" :
                                 "text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700"
                      }`} data-testid={`badge-payment-status-${p.id}`}>
                        {isOk ? "Paid" : isFail ? "Failed" : "Pending"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* View all link */}
            <Link href="/my-payments">
              <button
                className="mt-2 w-full text-center text-[11px] font-medium text-primary hover:underline py-1"
                data-testid="link-view-all-payments"
              >
                View all payments →
              </button>
            </Link>
          </div>
        )}

        {/* FREE USER URGENCY BANNER */}
        {user && !isPaid && (
          <div
            onClick={() => openUpgradeModal("limit_hit", undefined, "pro")}
            className="cursor-pointer bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
            data-testid="banner-free-urgency"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl flex-shrink-0" aria-hidden="true">🚀</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-sm leading-tight">Unlock Premium Opportunities</p>
                <p className="text-white/80 text-xs mt-0.5">1,000+ users upgraded this month · Full access for 365 days</p>
              </div>
              <div className="flex-shrink-0 bg-white text-orange-600 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">Upgrade ✨</div>
            </div>
          </div>
        )}

        {/* FREE USER UPGRADE PROMPT */}
        {user && !isPaid && totalOrders === 0 && (
          <UpgradePrompt
            triggerType="action_complete"
            title="Boost your chances by 3x"
            description="Pro members get access to unlimited AI tools, the full ATS CV checker, and 1-on-1 WhatsApp support."
            compact
          />
        )}

        {/* AI JOB RECOMMENDATIONS */}
        <DashboardJobRecommendations />

        {/* LOCKED JOBS PREVIEW — free users only */}
        {!isPaid && (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Exclusive Verified Jobs
            </h3>
            <LockedContentPreview
              title="🔒 Unlock Verified Jobs"
              description="47 exclusive high-demand overseas jobs are hidden from free accounts. Upgrade to see and apply."
              plan="pro"
              jobCount={4}
            />
          </div>
        )}


        {/* FREE PREVIEW JOBS (unpaid only) */}
        {!isPaid && <FreePreviewJobs />}

        {/* STUDY ABROAD */}
        <Link href="/student-visas">
          <div className="bg-gradient-to-br from-cyan-600 to-blue-700 rounded-2xl p-5 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-200" data-testid="card-study-abroad">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-white">Study Abroad</span>
                  <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 text-[10px] font-bold rounded-full">NEW</span>
                </div>
                <p className="text-sm text-cyan-100">Scholarships, student visas &amp; university guides for 6 countries</p>
              </div>
              <ArrowRight className="h-5 w-5 text-white/70 flex-shrink-0" />
            </div>
          </div>
        </Link>

        {/* BULK APPLY */}
        <Link href="/tools/visa-sponsorship-jobs">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-200" data-testid="card-bulk-apply">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-white">Bulk Apply to Jobs</span>
                  <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 text-[10px] font-bold rounded-full">NEW</span>
                  <span className="px-2 py-0.5 bg-white/20 text-white text-[10px] font-bold rounded-full">BASIC/PRO</span>
                </div>
                <p className="text-sm text-blue-100">AI cover letters for multiple jobs in minutes</p>
              </div>
              <ArrowRight className="h-5 w-5 text-white/70 flex-shrink-0" />
            </div>
          </div>
        </Link>

        {/* AI VISA ASSISTANT */}
        <Link href="/visa-assistant">
          <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-5 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-200" data-testid="card-visa-assistant">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-white">AI Visa Assistant</span>
                  <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 text-[10px] font-bold rounded-full">NEW</span>
                  <span className="px-2 py-0.5 bg-white/20 text-white text-[10px] font-bold rounded-full">3 FREE/day</span>
                </div>
                <p className="text-sm text-violet-100">Ask any visa or immigration question — AI-powered answers</p>
              </div>
              <ArrowRight className="h-5 w-5 text-white/70 flex-shrink-0" />
            </div>
          </div>
        </Link>

        {/* VISA GUIDES */}
        <Link href="/visa-guides">
          <div className="bg-gradient-to-br from-teal-600 to-cyan-700 rounded-2xl p-5 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-200" data-testid="card-visa-guides">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Globe className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-white">Visa &amp; Immigration Guides</span>
                  <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 text-[10px] font-bold rounded-full">5 Countries</span>
                </div>
                <p className="text-sm text-teal-100">Canada, UK, USA, Germany &amp; UAE — steps, costs &amp; official links</p>
              </div>
              <ArrowRight className="h-5 w-5 text-white/70 flex-shrink-0" />
            </div>
          </div>
        </Link>

        {/* GREEN CARD GUIDE */}
        <Link href="/green-card">
          <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-5 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-200" data-testid="card-green-card-guide">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl" aria-hidden="true">🇺🇸</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-white">Green Card (DV Lottery) Guide</span>
                  <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 text-[10px] font-bold rounded-full">FREE</span>
                </div>
                <p className="text-sm text-indigo-100">Eligibility, steps &amp; dates for the USA Diversity Visa program</p>
              </div>
              <ArrowRight className="h-5 w-5 text-white/70 flex-shrink-0" />
            </div>
          </div>
        </Link>

        {/* NEA AGENCIES */}
        <Link href="/nea-agencies">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-500 dark:border-green-700 rounded-2xl p-4 cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all duration-200" data-testid="link-nea-agencies">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-sm">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-green-800 dark:text-green-200">NEA Licensed Agencies</span>
                  <span className="px-2 py-0.5 bg-green-600 text-white text-[10px] font-bold rounded-full">1,200+</span>
                </div>
                <p className="text-sm text-green-700 dark:text-green-400">Government-verified recruitment agencies</p>
              </div>
              <ArrowRight className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Link>

        {/* REFERRAL PROGRAM — prominent dark banner with live code */}
        <ReferralBannerSection refCode={referralData?.refCode} />

        {/* CAREER SERVICES UPSELL (paid users only) */}
        {isPaid && (
          <div className="bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-700 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-yellow-300" />
              <span className="text-xs font-bold text-white/80 uppercase tracking-wider">Premium Services</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Professional Career Support</h3>
            <p className="text-purple-200 text-sm mb-4">Expert-crafted CVs, interview prep, and full application management.</p>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/services" className="block">
                <Button className="w-full bg-white text-purple-700 hover:bg-purple-50 font-semibold text-sm h-9" data-testid="button-view-services">
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  CV Services
                </Button>
              </Link>
              <Link href="/assisted-apply" className="block">
                <Button variant="outline" className="w-full border-white/40 text-white hover:bg-white/10 font-semibold text-sm h-9" data-testid="button-assisted-apply">
                  <Rocket className="h-3.5 w-3.5 mr-1.5" />
                  We Apply
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* REPORT PLACEMENT */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-2xl p-5 shadow-sm border border-emerald-200/60 dark:border-emerald-800/40">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Report Your Placement</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
            Got a job abroad? Share it — verified stories are displayed on our landing page to inspire others.
          </p>
          {placementSubmitted ? (
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-sm py-2" data-testid="text-placement-submitted">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              Submitted! We'll verify and publish it soon.
            </div>
          ) : (
            <form onSubmit={handleReportPlacement} className="space-y-2">
              <input
                type="text"
                placeholder="Job title (e.g. Registered Nurse)"
                value={placementJobTitle}
                onChange={e => setPlacementJobTitle(e.target.value)}
                maxLength={80}
                className="w-full px-3 py-2 text-sm rounded-lg border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                data-testid="input-placement-job-title"
              />
              <input
                type="text"
                placeholder="Destination (e.g. NHS UK, Saudi Arabia)"
                value={placementDestination}
                onChange={e => setPlacementDestination(e.target.value)}
                maxLength={80}
                className="w-full px-3 py-2 text-sm rounded-lg border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                data-testid="input-placement-destination"
              />
              <Button
                type="submit"
                disabled={placementSubmitting || !placementJobTitle.trim() || !placementDestination.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm gap-2"
                data-testid="button-submit-placement"
              >
                <Send className="h-3.5 w-3.5" />
                {placementSubmitting ? "Submitting…" : "Submit Story"}
              </Button>
            </form>
          )}
        </div>

        {/* ── BOTTOM SERVICES GRID ─────────────────────────────────────── */}
        <BottomServicesGrid />

        {/* ── QUICK ACCESS ROW ─────────────────────────────────────────── */}
        <QuickAccessRow />

        {/* ── NEA TRUST BANNER ─────────────────────────────────────────── */}
        <TrustBanner />

        {/* GUIDANCE TIPS */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Guidance &amp; Safety Tips</h3>
          </div>
          <ul className="space-y-2.5">
            {[
              "How to identify and avoid job scams",
              "How to apply safely on official portals",
              "CV & interview preparation essentials",
              "Visa application process overview",
            ].map(tip => (
              <li key={tip} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                {tip}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2">
            <Link href="/report-scam">
              <button className="w-full py-2 border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center justify-center gap-2" data-testid="button-report-scam-agency">
                <AlertCircle className="h-4 w-4" />
                ⚠️ Report a Scam Agency
              </button>
            </Link>
            <Link href="/report-fraud">
              <button className="w-full py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2" data-testid="button-report-fraud">
                <AlertCircle className="h-4 w-4" />
                Report Fraud / Payment Issue
              </button>
            </Link>
          </div>
        </div>

        {/* DISCLAIMER */}
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center px-2 pb-2 leading-relaxed">
          WorkAbroad Hub is a career consultation service providing 1-on-1 WhatsApp guidance, personalized recommendations, and curated job resources.
          We are not a recruitment agency and do not guarantee employment, jobs, or visas.
        </p>
      </div>
    </section>
  );
}
