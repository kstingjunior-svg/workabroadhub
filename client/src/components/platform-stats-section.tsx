import { useEffect, useRef, useState } from "react";
import { Users, Globe, BadgeCheck, Star, MessageSquare, CalendarCheck } from "lucide-react";

interface Stats {
  totalUsers?: number;
  countriesServed?: number;
  activePortals?: number;
  successStories?: number;
  agencyReviews?: number;
  consultationsCompleted?: number;
}

function useCountUp(target: number | undefined, duration = 1600, enabled = false) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!enabled || target === undefined || target === 0) return;
    let startTime: number | null = null;
    const start = 0;

    function step(timestamp: number) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(start + eased * target));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }, [target, duration, enabled]);

  return value;
}

function StatCard({
  icon: Icon,
  label,
  sublabel,
  target,
  suffix = "+",
  color,
  animationEnabled,
}: {
  icon: any;
  label: string;
  sublabel: string;
  target: number | undefined;
  suffix?: string;
  color: string;
  animationEnabled: boolean;
}) {
  const count = useCountUp(target, 1400, animationEnabled);
  const display = target === undefined ? null : target === 0 ? "—" : count;

  return (
    <div className="flex flex-col items-center text-center gap-2 px-4 py-6" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className={`h-12 w-12 rounded-2xl ${color} flex items-center justify-center mb-1 shadow-sm`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div className="space-y-0.5">
        <p className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
          {display === null ? (
            <span className="inline-block w-16 h-9 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
          ) : display === "—" ? (
            <span className="text-2xl text-slate-400">—</span>
          ) : (
            <>
              {(display as number).toLocaleString()}
              <span className="text-teal-500 text-2xl">{suffix}</span>
            </>
          )}
        </p>
        <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-xs text-muted-foreground max-w-[110px] mx-auto leading-snug">{sublabel}</p>
      </div>
    </div>
  );
}

export function PlatformStatsSection({ stats }: { stats?: Stats }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [animationEnabled, setAnimationEnabled] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animationEnabled) {
          setAnimationEnabled(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animationEnabled]);

  const metrics = [
    {
      icon: Users,
      label: "Members",
      sublabel: "Kenyans on the platform",
      target: stats?.totalUsers,
      color: "bg-blue-500",
      suffix: "+",
    },
    {
      icon: Globe,
      label: "Countries Served",
      sublabel: "Destinations with verified jobs",
      target: stats?.countriesServed,
      color: "bg-teal-500",
      suffix: "",
    },
    {
      icon: BadgeCheck,
      label: "Verified Portals",
      sublabel: "Curated, scam-free job sources",
      target: stats?.activePortals,
      color: "bg-indigo-500",
      suffix: "+",
    },
    {
      icon: Star,
      label: "Success Stories",
      sublabel: "Verified overseas placements",
      target: stats?.successStories,
      color: "bg-amber-500",
      suffix: "+",
    },
    {
      icon: MessageSquare,
      label: "Agency Reviews",
      sublabel: "Community-submitted agency reports",
      target: stats?.agencyReviews,
      color: "bg-orange-500",
      suffix: "+",
    },
    {
      icon: CalendarCheck,
      label: "Consultations Done",
      sublabel: "1-on-1 career guidance sessions",
      target: stats?.consultationsCompleted,
      color: "bg-emerald-500",
      suffix: "+",
    },
  ];

  return (
    <section
      ref={sectionRef}
      aria-label="Platform statistics"
      className="py-14 sm:py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-slate-950 border-y border-slate-100 dark:border-slate-800"
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-600 dark:text-teal-400">
            Live Platform Data
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Trusted by thousands of Kenyan job seekers
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Real numbers, updated every 5 minutes directly from our database. No inflated figures.
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {metrics.map((m) => (
            <StatCard key={m.label} {...m} animationEnabled={animationEnabled} />
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Stats refresh every 5 minutes · Figures sourced directly from our PostgreSQL database
        </p>
      </div>
    </section>
  );
}
