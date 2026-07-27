/**
 * /share/:token — public share landing page.
 *
 * Visitors arrive here from a friend's WhatsApp Status (or any social
 * platform). We:
 *   1. Capture the token as a referrer in localStorage (30-day TTL)
 *   2. Fetch the sanitized card data from /api/share/:token
 *   3. Render the identical ShareSuccessCard so the visitor sees the same
 *      thing the referrer posted
 *   4. Big CTAs: "Get YOURS for KES 99" → /services/order/cv_fix_lite
 *
 * SEO note: this page is deliberately no-index (via meta robots) — it's
 * a viral surface, not a canonical URL we want Google indexing 10,000
 * variations of.
 */

import { useEffect, useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, ShieldCheck, ArrowRight, AlertTriangle } from "lucide-react";
import { ShareSuccessCard, type ShareCardProps } from "@/components/share-success-card";
import { captureRef } from "@/lib/referral";

interface PublicCard {
  ok: true;
  card: Required<Pick<ShareCardProps, "firstName" | "serviceName" | "targetCountry" | "atsScore" | "variant">>;
}

export default function SharePage() {
  const [, params] = useRoute<{ token: string }>("/share/:token");
  const [, navigate] = useLocation();
  const token = params?.token || "";

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "loaded"; card: PublicCard["card"] }
    | { kind: "not_found" }
    | { kind: "error" }
  >({ kind: "loading" });

  // Capture the referrer token IMMEDIATELY on mount — even if the card
  // fetch fails, we want the attribution to survive if the visitor
  // eventually clicks the CTA and pays.
  useEffect(() => {
    if (token) captureRef(token);
  }, [token]);

  useEffect(() => {
    if (!token) { setState({ kind: "not_found" }); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(token)}`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (res.status === 404) { setState({ kind: "not_found" }); return; }
        if (!res.ok)             { setState({ kind: "error" });     return; }
        const data = (await res.json()) as PublicCard;
        if (!data?.ok || !data.card) { setState({ kind: "not_found" }); return; }
        setState({ kind: "loaded", card: data.card });
        // Fire-and-forget hit tracker (no await — don't block the render).
        fetch(`/api/share/${encodeURIComponent(token)}/hit`, { method: "POST", credentials: "include" }).catch(() => {});
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Set noindex on this page so we don't clutter Google with share URLs.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,follow";
    document.head.appendChild(meta);
    return () => { try { document.head.removeChild(meta); } catch { /* noop */ } };
  }, []);

  const cardProps = useMemo<ShareCardProps | null>(() => {
    if (state.kind !== "loaded") return null;
    return {
      firstName:     state.card.firstName ?? null,
      serviceName:   state.card.serviceName,
      targetCountry: state.card.targetCountry,
      atsScore:      state.card.atsScore,
      variant:       state.card.variant,
    };
  }, [state]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* ── Loading ─────────────────────────────────────────────── */}
        {state.kind === "loading" && (
          <div className="flex flex-col items-center py-16 text-white/70">
            <Loader2 className="h-10 w-10 animate-spin mb-3" />
            <p className="text-sm">Loading share card…</p>
          </div>
        )}

        {/* ── Not found ───────────────────────────────────────────── */}
        {state.kind === "not_found" && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-6 pb-6 text-center space-y-3">
              <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto" />
              <h2 className="text-lg font-semibold text-white">This share link isn't available</h2>
              <p className="text-sm text-white/70">
                It might have expired, been removed, or never existed. You can still get your own CV optimized below.
              </p>
              <Button
                onClick={() => navigate("/services/order/cv_fix_lite")}
                className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold"
                data-testid="button-not-found-cta"
              >
                Optimize my CV — KES 99
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Error ───────────────────────────────────────────────── */}
        {state.kind === "error" && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="pt-6 pb-6 text-center space-y-3">
              <AlertTriangle className="h-10 w-10 text-red-400 mx-auto" />
              <h2 className="text-lg font-semibold text-white">Couldn't load this card</h2>
              <p className="text-sm text-white/70">Please try refreshing. If it keeps failing, use the button below.</p>
              <Button onClick={() => navigate("/services/order/cv_fix_lite")} variant="secondary">
                Go to the CV service instead
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Loaded ──────────────────────────────────────────────── */}
        {state.kind === "loaded" && cardProps && (
          <>
            {/* Kicker */}
            <div className="text-center space-y-1">
              <p className="text-xs uppercase tracking-widest text-teal-400 font-semibold">Shared with you</p>
              <h1 className="text-2xl font-bold text-white">
                {cardProps.firstName ? `${cardProps.firstName} just optimized theirs.` : "Someone just optimized theirs."}
              </h1>
              <p className="text-sm text-white/60">Now it's your turn.</p>
            </div>

            {/* The card itself */}
            <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl">
              <ShareSuccessCard {...cardProps} />
            </div>

            {/* Primary CTA */}
            <div className="space-y-3">
              <Button
                onClick={() => navigate("/services/order/cv_fix_lite")}
                className="w-full h-14 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold text-lg shadow-lg"
                data-testid="button-primary-cta"
              >
                <Sparkles className="h-5 w-5 mr-2" />
                Get YOUR CV optimized — KES 99
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>

              <Button
                onClick={() => navigate("/services")}
                variant="outline"
                className="w-full h-11 border-white/20 text-white hover:bg-white/5"
                data-testid="button-see-services"
              >
                See all services
              </Button>
            </div>

            {/* Trust bar */}
            <div className="flex items-start gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-3">
              <ShieldCheck className="h-4 w-4 text-teal-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-white/70 leading-relaxed">
                <strong className="text-white font-semibold">Same-day delivery.</strong> Pay by M-Pesa,
                receive your optimized CV in minutes — plus a free re-check to prove it works.
              </p>
            </div>

            {/* Anti-scam note */}
            <p className="text-[11px] text-center text-white/50 leading-relaxed">
              WorkAbroadHub only charges you for the service. We never ask for visa fees, placement fees,
              or money to "secure" jobs. Real employers pay for your visa — they don't ask you to.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
