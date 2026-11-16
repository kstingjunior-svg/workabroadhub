/**
 * Live activity — REAL platform usage, newest first.
 *
 * 2026-11 (Tony): replaces every invented ticker ("someone in Kisumu just…").
 * Data comes from GET /api/public/live-activity (server/lib/live-activity.ts):
 * real payments for tools/services/plans (initials + country) and anonymous
 * real tool use ("Someone"). Nothing here is generated or randomised — if
 * nothing happened, nothing is shown.
 *
 * Exports:
 *   <LiveActivityFeed />          rotating toast (bottom-left) — used app-wide
 *   <LiveActivityFeed inline />   rotating single line — pricing page etc.
 *   <LiveActivityPanel />         list + live counters — landing / dashboard
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Globe2, FileText, ShieldAlert, GraduationCap, Crown, Sparkles, Flag, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LiveActivityItem {
  id: string;
  who: string;
  where: string | null;
  action: string;
  kind: "visa" | "offer" | "scam" | "ielts" | "cv" | "plan" | "service" | "report";
  at: string;
}
interface LiveActivityResponse {
  items: LiveActivityItem[];
  counts: Partial<Record<"cvChecks" | "scamChecks" | "visaScreens" | "offerScreens" | "last24h", number>>;
  generatedAt: string;
}

const KIND_META: Record<LiveActivityItem["kind"], { icon: any; tone: string; href: string; cta: string }> = {
  visa:    { icon: Globe2,        tone: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300",       href: "/tools/visa-check",          cta: "Screen a visa" },
  offer:   { icon: FileText,      tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300", href: "/tools/offer-check",   cta: "Screen an offer letter" },
  scam:    { icon: ShieldAlert,   tone: "text-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300", href: "/tools/job-scam-checker",  cta: "Check a job ad" },
  ielts:   { icon: GraduationCap, tone: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-300", href: "/tools/ielts-verify",     cta: "Check an IELTS result" },
  cv:      { icon: FileCheck2,    tone: "text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-300",    href: "/tools/ats-cv-checker",     cta: "Check my CV free" },
  plan:    { icon: Crown,         tone: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300",    href: "/pricing",                  cta: "See plans" },
  service: { icon: Sparkles,      tone: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300",        href: "/services",                 cta: "See services" },
  report:  { icon: Flag,          tone: "text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-300",           href: "/report-scam",              cta: "Report an agency" },
};

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 90) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function sentence(i: LiveActivityItem) {
  return (
    <>
      <strong className="font-semibold text-foreground">{i.who}</strong>
      {i.where ? <span className="text-muted-foreground"> · {i.where}</span> : null}{" "}
      <span>{i.action}</span>
    </>
  );
}

/** Shared data hook: polls the public endpoint every 60s. */
export function useLiveActivity() {
  const queryClient = useQueryClient();
  const q = useQuery<LiveActivityResponse>({
    queryKey: ["/api/public/live-activity"],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // 2026-11 SECURITY: this used to open /ws/analytics for every visitor —
  // an admin channel that carried paying users' contact details. The feed
  // now simply polls the public, privacy-safe endpoint every minute.
  void queryClient;

  // re-render every 30s so "x min ago" stays true
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  return q;
}

/* ── Rotating toast / inline line ─────────────────────────────────────── */
const SHOW_DELAY_MS = 5000;
const DISPLAY_MS = 6500;
const CYCLE_MS = 14000;

export function LiveActivityFeed({ className, inline = false }: { className?: string; inline?: boolean }) {
  const { data } = useLiveActivity();
  const items = data?.items ?? [];
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!items.length) return;
    const t = setTimeout(() => setStarted(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [items.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Newest first, then round and round.
  useEffect(() => {
    if (!started || !items.length) return;
    setVisible(true);
    const hide = inline ? null : setTimeout(() => setVisible(false), DISPLAY_MS);
    const next = setTimeout(() => setIdx((i) => (i + 1) % items.length), inline ? 6000 : CYCLE_MS);
    return () => { if (hide) clearTimeout(hide); clearTimeout(next); };
  }, [started, idx, items.length, inline]);

  if (!started || !items.length) return null;
  const item = items[idx % items.length];
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;

  if (inline) {
    return (
      <div className={cn("flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-background text-xs transition-opacity duration-500", visible ? "opacity-100" : "opacity-0", className)}
        role="status" aria-live="polite" data-testid="activity-feed-inline">
        <span className="relative flex h-2 w-2 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>
        <span className="min-w-0 truncate">{sentence(item)}</span>
        <span className="ml-auto pl-2 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{timeAgo(item.at)}</span>
      </div>
    );
  }

  return (
    <a href={meta.href}
      className={cn(
        "fixed bottom-24 left-4 z-[var(--z-modal)] max-w-[calc(100vw-2rem)] sm:max-w-sm",
        "flex items-center gap-3 px-3.5 py-3 rounded-2xl border bg-background shadow-lg text-xs",
        "transition-all duration-500 ease-out",
        visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8 pointer-events-none",
        className,
      )}
      role="status" aria-live="polite" data-testid="activity-feed-toast">
      <span className={cn("h-9 w-9 rounded-full flex items-center justify-center shrink-0", meta.tone)}><Icon className="h-4 w-4" /></span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="leading-snug">{sentence(item)}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{timeAgo(item.at)} · real activity</span>
      </span>
    </a>
  );
}

/* ── Panel: live list + counters ──────────────────────────────────────── */
function fmt(n?: number) { return n == null ? "—" : n.toLocaleString("en-KE"); }

export function LiveActivityPanel({ className, title = "Happening right now on WorkAbroad Hub", max = 7 }: { className?: string; title?: string; max?: number }) {
  const { data, isLoading } = useLiveActivity();
  const items = data?.items ?? [];
  const [offset, setOffset] = useState(0);

  // Slowly roll the list so it feels alive; the newest item always leads.
  useEffect(() => {
    if (items.length <= max) return;
    const t = setInterval(() => setOffset((o) => (o + 1) % items.length), 5000);
    return () => clearInterval(t);
  }, [items.length, max]);

  const visible = useMemo(() => {
    if (items.length <= max) return items;
    const rest = items.slice(1);
    const rolled = rest.slice(offset % rest.length).concat(rest.slice(0, offset % rest.length));
    return [items[0], ...rolled].slice(0, max);
  }, [items, offset, max]);

  if (!isLoading && !items.length) return null;
  const c = data?.counts ?? {};

  return (
    <section className={cn("rounded-2xl border bg-card shadow-sm overflow-hidden", className)} aria-label="Live activity" data-testid="live-activity-panel">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" /></span>
          <h3 className="font-semibold text-sm sm:text-base truncate">{title}</h3>
        </div>
        {c.last24h != null && <span className="text-[11px] text-muted-foreground whitespace-nowrap"><Activity className="inline h-3 w-3 mr-1" />{fmt(c.last24h)} in the last 24h</span>}
      </div>

      <ul className="divide-y">
        {(isLoading ? Array.from({ length: 4 }) : visible).map((raw, i) => {
          if (!raw) return <li key={i} className="h-14 animate-pulse bg-muted/30" />;
          const item = raw as LiveActivityItem;
          const meta = KIND_META[item.kind];
          const Icon = meta.icon;
          return (
            <li key={item.id} className={cn("flex items-center gap-3 px-4 sm:px-5 py-3 text-sm transition-colors", i === 0 && "bg-emerald-50/50 dark:bg-emerald-950/20")}>
              <span className={cn("h-9 w-9 rounded-full flex items-center justify-center shrink-0", meta.tone)}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1 leading-snug">{sentence(item)}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">{timeAgo(item.at)}</span>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-2 sm:grid-cols-4 border-t text-center">
        {[
          { k: "cvChecks", label: "CVs checked", href: "/tools/ats-cv-checker" },
          { k: "scamChecks", label: "Scam checks", href: "/tools/job-scam-checker" },
          { k: "visaScreens", label: "Visas screened", href: "/tools/visa-check" },
          { k: "offerScreens", label: "Offer letters screened", href: "/tools/offer-check" },
        ].map((s) => (
          <a key={s.k} href={s.href} className="px-2 py-3 hover:bg-muted/40 transition-colors border-r border-b sm:border-b-0 last:border-r-0">
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmt((c as any)[s.k])}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </a>
        ))}
      </div>
      <p className="px-4 py-2 text-[10px] text-muted-foreground border-t">
        Real activity from our records. Initials and country only — never names, documents or results. You can hide yourself in My Account.
      </p>
    </section>
  );
}
