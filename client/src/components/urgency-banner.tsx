import { useState, useEffect } from "react";
import { AlertTriangle, Shield, TrendingUp, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "wah_urgency_dismissed";

interface PublicStats {
  scamReportsThisMonth: number;
  expiredAgencies: number;
  recentUpgradesThisWeek: number;
  totalUsers: number;
}

interface UrgencyBannerProps {
  className?: string;
}

export function UrgencyBanner({ className }: UrgencyBannerProps) {
  const { user } = useAuth();
  const [idx, setIdx] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  const { data: stats } = useQuery<PublicStats>({
    queryKey: ["/api/public/stats"],
    staleTime: 5 * 60 * 1000,
    enabled: !!user && (user as any).plan === "free",
  });

  useEffect(() => {
    if (!user || (user as any).plan !== "free") return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, [user]);

  useEffect(() => {
    if (!visible || !stats) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % messages.length), 6000);
    return () => clearInterval(t);
  }, [visible, stats]);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, "1");
  };

  if (!visible || dismissed || !stats) return null;

  const messages = [
    stats.scamReportsThisMonth > 0
      ? {
          icon: AlertTriangle,
          text: `⚠️ ${stats.scamReportsThisMonth} scam ${stats.scamReportsThisMonth === 1 ? "report" : "reports"} verified this month — stay protected`,
          color: "text-red-600 dark:text-red-400",
          bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
        }
      : null,
    stats.expiredAgencies > 0
      ? {
          icon: Shield,
          text: `🛡️ ${stats.expiredAgencies.toLocaleString()} agencies with expired licences in our database — verify before paying`,
          color: "text-blue-600 dark:text-blue-400",
          bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
        }
      : null,
    stats.recentUpgradesThisWeek > 0
      ? {
          icon: TrendingUp,
          text: `🔥 ${stats.recentUpgradesThisWeek} ${stats.recentUpgradesThisWeek === 1 ? "person" : "people"} upgraded to Pro this week`,
          color: "text-purple-600 dark:text-purple-400",
          bg: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800",
        }
      : null,
  ].filter(Boolean) as NonNullable<typeof messages[number]>[];

  if (messages.length === 0) return null;

  const msg = messages[idx % messages.length];
  const Icon = msg.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium animate-slide-up",
        msg.bg,
        className
      )}
      role="status"
      aria-live="polite"
      data-testid="urgency-banner"
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", msg.color)} aria-hidden="true" />
      <span className={cn("flex-1", msg.color)}>{msg.text}</span>
      <button
        onClick={handleDismiss}
        className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
        data-testid="btn-dismiss-urgency"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
