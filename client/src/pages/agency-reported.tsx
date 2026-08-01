/**
 * /agencies-reported/:slug — public community warning page.
 *
 * Tony's founder brief: "Every reported agency receives a dedicated page.
 * Display: agency name, licence status, known contacts, risk level, number
 * of reports, timeline, evidence summary, community warning banner. Do NOT
 * expose victims' private information."
 *
 * Backend: /api/agency-profiles/:slug
 */

import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2, ShieldAlert, AlertTriangle, Building2, Globe, Phone, Mail,
  Info, ExternalLink, Calendar, DollarSign, FileWarning, ArrowLeft, Flag,
  Bell, BellOff, Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { fetchCsrfToken } from "@/lib/queryClient";

interface AgencyProfile {
  slug: string;
  displayName: string;
  country: string | null;
  officeLocation: string | null;
  licenceStatus: string | null;
  licenceNumber: string | null;
  licenceExpiresAt: string | null;
  reportCount: number;
  approvedReportCount: number;
  totalReportedLossKes: number;
  riskBand: "low" | "medium" | "high" | "critical";
  firstReportAt: string | null;
  lastReportAt: string | null;
  knownWebsites: string[];
  knownPhones: string[];
  knownEmails: string[];
  knownWhatsapp: string[];
  knownBankAccounts: string[];
  knownMpesaNumbers: string[];
}

interface RecentReport {
  id: string;
  incidentDate: string | null;
  destinationCountry: string | null;
  jobApplied: string | null;
  amountLost: number | null;
  currency: string | null;
  descriptionExcerpt: string;
  createdAt: string;
}

const RISK_STYLES = {
  low:      { bg: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", accent: "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20",   label: "Low community risk"     },
  medium:   { bg: "bg-amber-500",   text: "text-amber-700 dark:text-amber-400",     accent: "border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20",         label: "Needs verification"    },
  high:     { bg: "bg-orange-500",  text: "text-orange-700 dark:text-orange-400",   accent: "border-orange-300 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20",     label: "Multiple reports"      },
  critical: { bg: "bg-red-600",     text: "text-red-700 dark:text-red-400",         accent: "border-red-400 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20",                 label: "High community risk"   },
} as const;

export default function AgencyReportedPage() {
  const [, params] = useRoute<{ slug: string }>("/agencies-reported/:slug");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const slug = params?.slug || "";

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "loaded"; profile: AgencyProfile; recent: RecentReport[]; disclaimer: string }
    | { kind: "not_found" }
    | { kind: "error" }
  >({ kind: "loading" });

  useEffect(() => {
    if (!slug) { setState({ kind: "not_found" }); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/agency-profiles/${encodeURIComponent(slug)}`);
        if (cancelled) return;
        if (res.status === 404) { setState({ kind: "not_found" }); return; }
        if (!res.ok) { setState({ kind: "error" }); return; }
        const data = await res.json();
        if (!data?.ok) { setState({ kind: "not_found" }); return; }
        setState({ kind: "loaded", profile: data.profile, recent: data.recentReports, disclaimer: data.disclaimer });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <button
          onClick={() => navigate("/agencies-reported")}
          className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          data-testid="link-back-to-agencies"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to reported-agencies directory
        </button>

        {state.kind === "loading" && (
          <div className="flex flex-col items-center py-16 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-10 w-10 animate-spin mb-3" />
            <p className="text-sm">Loading community reports…</p>
          </div>
        )}

        {state.kind === "not_found" && (
          <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900">
            <CardContent className="pt-8 pb-8 text-center space-y-3">
              <Building2 className="h-10 w-10 text-emerald-500 mx-auto" />
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                No community reports for this agency yet.
              </h1>
              <p className="text-sm text-gray-700 dark:text-gray-300 max-w-md mx-auto leading-relaxed">
                That doesn't mean they're safe — just that no one has reported them to WorkAbroadHub yet.
                Always verify agencies through the National Employment Authority before paying anything.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                <a href="https://neaims.nea.go.ke" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline">Check NEA licence</Button>
                </a>
                <Button onClick={() => navigate("/report-scam")} className="bg-red-600 hover:bg-red-700 text-white">
                  <Flag className="h-4 w-4 mr-2" /> Report this agency
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {state.kind === "error" && (
          <Card className="border-red-300 dark:border-red-900">
            <CardContent className="pt-6 pb-6 text-center">
              <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-gray-700 dark:text-gray-300">Couldn't load this profile. Please refresh.</p>
            </CardContent>
          </Card>
        )}

        {state.kind === "loaded" && (
          <ProfileView profile={state.profile} recent={state.recent} disclaimer={state.disclaimer} onNavigate={navigate} />
        )}
      </div>
    </div>
  );
}

function ProfileView({
  profile, recent, disclaimer, onNavigate,
}: { profile: AgencyProfile; recent: RecentReport[]; disclaimer: string; onNavigate: (path: string) => void }) {
  const risk = RISK_STYLES[profile.riskBand];
  return (
    <div className="space-y-4">
      {/* ── Verdict banner ────────────────────────────────────── */}
      <Card className={`border-2 ${risk.accent}`}>
        <CardContent className="pt-6 pb-6 space-y-3">
          <div className="flex items-start gap-3">
            <div className={`h-12 w-12 rounded-full ${risk.bg} flex items-center justify-center flex-shrink-0`}>
              <ShieldAlert className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs uppercase tracking-widest font-bold ${risk.text}`}>{risk.label}</p>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight mt-0.5">
                {profile.displayName}
              </h1>
              {(profile.country || profile.officeLocation) && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                  {[profile.officeLocation, profile.country].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-current/10">
            <div className="text-center">
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{profile.approvedReportCount || profile.reportCount}</p>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Community reports</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-extrabold text-red-600 dark:text-red-400">
                {profile.totalReportedLossKes > 0 ? `KES ${(profile.totalReportedLossKes / 1000).toFixed(0)}k` : "—"}
              </p>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Total reported loss</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {profile.licenceStatus === "active" ? "✓ Licensed" :
                 profile.licenceStatus === "expired" ? "⚠ Expired" :
                 profile.licenceStatus === "unlicensed" ? "✗ None" : "?"}
              </p>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Licence status</p>
            </div>
          </div>

          {/* Follow — get notified when new reports for this agency are approved */}
          <div className="pt-3 border-t border-current/10">
            <FollowButton slug={profile.slug} onNavigate={onNavigate} />
          </div>
        </CardContent>
      </Card>

      {/* ── Known contact fingerprints ────────────────────────── */}
      {(profile.knownWebsites.length > 0 || profile.knownPhones.length > 0 || profile.knownEmails.length > 0 ||
        profile.knownWhatsapp.length > 0 || profile.knownBankAccounts.length > 0 || profile.knownMpesaNumbers.length > 0) && (
        <Card>
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-amber-500" />
              <p className="text-sm font-bold text-gray-900 dark:text-white">Known contact fingerprints</p>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              If a recruiter contacts you using ANY of these, treat it as a strong warning sign — masked so we don't help scammers know we're watching.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-gray-200 dark:border-gray-800 text-xs">
              {profile.knownWebsites.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1"><Globe className="h-3 w-3" /> Websites</p>
                  {profile.knownWebsites.map((s, i) => <p key={i} className="text-gray-900 dark:text-white font-mono truncate">{s}</p>)}
                </div>
              )}
              {profile.knownPhones.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1"><Phone className="h-3 w-3" /> Phones</p>
                  {profile.knownPhones.map((s, i) => <p key={i} className="text-gray-900 dark:text-white font-mono">{s}</p>)}
                </div>
              )}
              {profile.knownWhatsapp.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1"><Phone className="h-3 w-3" /> WhatsApp</p>
                  {profile.knownWhatsapp.map((s, i) => <p key={i} className="text-gray-900 dark:text-white font-mono">{s}</p>)}
                </div>
              )}
              {profile.knownEmails.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1"><Mail className="h-3 w-3" /> Emails</p>
                  {profile.knownEmails.map((s, i) => <p key={i} className="text-gray-900 dark:text-white font-mono truncate">{s}</p>)}
                </div>
              )}
              {profile.knownMpesaNumbers.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1"><DollarSign className="h-3 w-3" /> M-Pesa numbers</p>
                  {profile.knownMpesaNumbers.map((s, i) => <p key={i} className="text-gray-900 dark:text-white font-mono">{s}</p>)}
                </div>
              )}
              {profile.knownBankAccounts.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1"><DollarSign className="h-3 w-3" /> Bank accounts</p>
                  {profile.knownBankAccounts.map((s, i) => <p key={i} className="text-gray-900 dark:text-white font-mono">{s}</p>)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent reports timeline ────────────────────────────── */}
      {recent.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              <p className="text-sm font-bold text-gray-900 dark:text-white">Recent community reports</p>
            </div>
            <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-800">
              {recent.map((r) => (
                <div key={r.id} className="bg-gray-50 dark:bg-gray-900 rounded-md p-3 space-y-1">
                  <div className="flex items-start justify-between text-xs">
                    <div>
                      {r.destinationCountry && <span className="font-semibold text-gray-900 dark:text-white">{r.destinationCountry}</span>}
                      {r.jobApplied && <span className="text-gray-600 dark:text-gray-400"> · {r.jobApplied}</span>}
                    </div>
                    {r.amountLost != null && (
                      <span className="text-red-600 dark:text-red-400 font-semibold">
                        Lost {r.currency || "KES"} {r.amountLost.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{r.descriptionExcerpt}{r.descriptionExcerpt.length >= 300 && "…"}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                    {r.incidentDate ? new Date(r.incidentDate).toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" }) : "Date not specified"}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Official verification links ─────────────────────────── */}
      <Card className="border-teal-200 dark:border-teal-900 bg-teal-50/40 dark:bg-teal-950/10">
        <CardContent className="pt-5 pb-5 space-y-3">
          <p className="text-xs uppercase tracking-widest text-teal-700 dark:text-teal-400 font-bold">Verify officially before deciding</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Community reports are a warning signal — not a legal verdict. Always cross-check with official sources.
          </p>
          <div className="grid gap-1.5 pt-2 border-t border-teal-200 dark:border-teal-900">
            <a href="https://neaims.nea.go.ke" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-teal-700 dark:text-teal-400 hover:underline">
              <Globe className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">Kenya National Employment Authority — licence lookup</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
            </a>
            <a href="https://www.mfa.go.ke" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-teal-700 dark:text-teal-400 hover:underline">
              <Globe className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">Kenya Ministry of Foreign Affairs — overseas jobs desk</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
            </a>
            <a href="mailto:reportscam@dci.go.ke" className="flex items-center gap-2 text-sm text-teal-700 dark:text-teal-400 hover:underline">
              <Mail className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">Kenya DCI Cybercrime Unit — report suspected fraud</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => onNavigate(`/report-scam?agency=${encodeURIComponent(profile.displayName)}`)}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold"
          data-testid="button-report-this-agency"
        >
          <Flag className="h-4 w-4 mr-2" /> Report a new case
        </Button>
        <Button
          variant="outline"
          onClick={() => onNavigate(`/agencies-reported`)}
        >
          Browse other reports
        </Button>
      </div>

      {/* ── Legal disclaimer ────────────────────────────────────── */}
      <div className="bg-gray-100 dark:bg-gray-900 rounded-md p-3 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">{disclaimer}</p>
      </div>
    </div>
  );
}

/**
 * Follow / unfollow toggle. Auth required — logged-out users see a
 * friendly "sign in to get alerts" nudge instead of an unusable button.
 * Backend: POST/DELETE/GET /api/agency-profiles/:slug/follow.
 */
function FollowButton({ slug, onNavigate }: { slug: string; onNavigate: (path: string) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [following, setFollowing] = useState<boolean | null>(null); // null = loading
  const [busy, setBusy] = useState(false);

  // Load current follow state on mount / user change
  useEffect(() => {
    if (!user) { setFollowing(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/agency-profiles/${encodeURIComponent(slug)}/follow`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setFollowing(!!data.following);
        } else {
          setFollowing(false);
        }
      } catch {
        if (!cancelled) setFollowing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug, user]);

  const toggle = async () => {
    if (!user) {
      // Not logged in — nudge them to sign in, preserving where to return.
      toast({
        title: "Sign in to get alerts",
        description: "We'll email you the moment a new report for this agency is published.",
      });
      onNavigate(`/login?redirect=${encodeURIComponent(`/agencies-reported/${slug}`)}`);
      return;
    }
    setBusy(true);
    try {
      const csrf = await fetchCsrfToken();
      const method = following ? "DELETE" : "POST";
      const res = await fetch(`/api/agency-profiles/${encodeURIComponent(slug)}/follow`, {
        method,
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(err.message || "Could not update your subscription.");
      }
      setFollowing(!following);
      toast({
        title: following ? "Unfollowed" : "You're subscribed",
        description: following
          ? "You won't get alerts about this agency anymore."
          : "We'll email you when a new community report is approved.",
      });
    } catch (e: any) {
      toast({
        title: "Couldn't update",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (following === null) {
    return (
      <Button variant="outline" size="sm" disabled className="w-full">
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Loading…
      </Button>
    );
  }

  return (
    <Button
      variant={following ? "outline" : "default"}
      size="sm"
      onClick={toggle}
      disabled={busy}
      className={`w-full ${following ? "border-green-400 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30" : "bg-teal-600 hover:bg-teal-700 text-white"}`}
      data-testid="button-follow-agency"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
      ) : following ? (
        <Check className="h-3.5 w-3.5 mr-2" />
      ) : (
        <Bell className="h-3.5 w-3.5 mr-2" />
      )}
      {following ? "Following — you'll get alerts" : "Get alerts about new reports"}
    </Button>
  );
}
