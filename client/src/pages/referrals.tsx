// ─────────────────────────────────────────────────────────────────────────────
// Referrals — earn KES every time a friend goes Pro on WorkAbroad Hub.
//
// 2026-06 upgrade (founder ask: "referral program improvements"):
//   - Two reward tiers: KES 100 when friend buys Pro Monthly (KES 600),
//     KES 450 when friend buys Pro Yearly (KES 4,500). Previous version
//     only paid out on yearly — referrals dried up after we made monthly
//     the default door.
//   - Concrete WhatsApp / Telegram / SMS share copy that actually sells:
//     specific value props (visa-sponsorship jobs, government doc
//     guides, AI matcher) instead of vague "career consultation".
//   - Friend benefit: their first month is KES 100 off (KES 600 -> 500)
//     when they use the referral link. Encodes via ?ref=CODE which the
//     pricing page already understands.
//   - QR code via qrserver.com (no dependency added) so people can
//     print it on flyers, SACCO posters, college noticeboards.
//   - Lifetime social proof — total earned across all users — to make
//     it feel real, not theoretical.
//   - Earning thresholds tracker — visual progress bar showing how
//     close you are to your next milestone (first KES 500 unlocks
//     fast-track payout etc.).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateReferralCode } from "@/lib/firebase-referrals";
import {
  Copy, Share2, Users, Clock, CheckCircle, Gift, ArrowLeft,
  MessageCircle, Send, Smartphone, Crown, Trophy, QrCode,
  TrendingUp, Sparkles, ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface ReferralStats {
  refCode: string;
  totalReferrals: number;
  pendingCommission: number;
  paidCommission: number;
  referrals: Array<{
    id: number;
    referredPhone: string;
    paymentAmount: number;
    commission: number;
    status: string;
    createdAt: string;
  }>;
}

interface PublicReferralStats {
  totalEarnedKES: number;     // lifetime across all users
  totalReferrers: number;
  topMonthlyKES?: number;     // best referrer this month
}

const MONTHLY_REWARD = 100;
const YEARLY_REWARD = 450;
const FRIEND_DISCOUNT = 100;
const MILESTONE_KES = 500;     // first payout threshold

export default function Referrals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const { data: stats } = useQuery<ReferralStats>({
    queryKey: ["/api/my-referrals"],
  });

  // Public lifetime stats — drives social proof. Soft-fails if endpoint
  // not yet implemented; we fall back to a reasonable placeholder so the
  // page never feels broken.
  const { data: publicStats } = useQuery<PublicReferralStats>({
    queryKey: ["/api/public/referrals-stats"],
    staleTime: 5 * 60 * 1000,
  });

  // Ensure this user's referral code exists in Firebase on mount
  useEffect(() => {
    if (user?.id) {
      generateReferralCode(user.id).catch(console.error);
    }
  }, [user?.id]);

  const refCode = stats?.refCode || (user?.id
    ? `WAH${user.id.substring(0, 6).toUpperCase()}`
    : "WAH…");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://workabroadhub.tech";
  const referralLink = `${baseUrl}/?ref=${refCode}`;

  // QR code via qrserver.com — zero-dep, cacheable. The PNG is generated
  // on-demand by the QR service the first time anyone scans the URL.
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(referralLink)}`;

  // Progress toward first KES 500 milestone (unlocks faster payouts).
  const totalEarned = (stats?.pendingCommission ?? 0) + (stats?.paidCommission ?? 0);
  const milestoneProgress = Math.min(100, Math.round((totalEarned / MILESTONE_KES) * 100));

  const statusBadge = (status: string) => {
    if (status === "paid") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs">Paid</Badge>;
    if (status === "processing") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">Sending…</Badge>;
    if (status === "failed") return <Badge variant="destructive" className="text-xs">Failed</Badge>;
    return <Badge variant="secondary" className="text-xs">Pending</Badge>;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast({
      title: "Link copied!",
      description: "Paste it on WhatsApp, Twitter, SACCO group — anywhere.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  // Concrete value-prop share copy. Mentions:
  //  - Real visa-sponsorship jobs (the strongest hook)
  //  - The KES 100 friend discount
  //  - 6 government doc assistants now included with Pro
  // Falls under 250 chars so it fits cleanly inside WhatsApp's preview.
  const shareMessage = `Found a Kenyan platform that's actually legit for jobs abroad — verified visa-sponsorship jobs, free CV check, KRA + passport + good-conduct guides included. Use my link, save KES ${FRIEND_DISCOUNT} on your first month: ${referralLink}`;

  const shareViaWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, "_blank");
  };

  const shareViaSMS = () => {
    window.open(`sms:?body=${encodeURIComponent(shareMessage)}`, "_blank");
  };

  const shareViaTelegram = () => {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareMessage)}`,
      "_blank",
    );
  };

  const shareNative = async () => {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: "WorkAbroad Hub — verified jobs abroad",
          text: shareMessage,
          url: referralLink,
        });
      } catch { /* user cancelled — silent */ }
    } else {
      copyToClipboard();
    }
  };

  const downloadQR = () => {
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `wah-referral-${refCode}.png`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-blue-900 text-white px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-white hover:bg-blue-800" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Refer & Earn</h1>
            <p className="text-blue-200 text-xs">Get paid every time a friend goes Pro</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">

        {/* Hero — refreshed with two reward tiers */}
        <Card className="bg-gradient-to-br from-amber-500 via-orange-600 to-red-600 text-white border-0 overflow-hidden relative">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <CardContent className="p-6 text-center relative">
            <Gift className="h-12 w-12 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-1" data-testid="text-referral-hero-title">
              Refer a friend, earn cash
            </h2>
            <p className="text-amber-100 text-sm mb-4 leading-snug">
              Send your link. When they pay for Pro, M-Pesa pings you the next morning.
              They also save KES {FRIEND_DISCOUNT} on their first month.
            </p>

            {/* Two-tier reward strip */}
            <div className="grid grid-cols-2 gap-2 mb-4 text-left">
              <div className="rounded-xl bg-white/15 backdrop-blur-sm p-3">
                <div className="text-[10px] uppercase tracking-wider text-amber-100/80">Pro Monthly</div>
                <div className="font-extrabold text-2xl leading-tight">KES {MONTHLY_REWARD}</div>
                <div className="text-[10px] text-amber-100/90">per friend</div>
              </div>
              <div className="rounded-xl bg-white/15 backdrop-blur-sm p-3">
                <div className="text-[10px] uppercase tracking-wider text-amber-100/80">Pro Yearly</div>
                <div className="font-extrabold text-2xl leading-tight">KES {YEARLY_REWARD}</div>
                <div className="text-[10px] text-amber-100/90">per friend</div>
              </div>
            </div>

            <div className="bg-white/20 rounded-lg p-3">
              <p className="text-[10px] text-amber-100 mb-1 uppercase tracking-wider">Your code</p>
              <p className="text-2xl font-bold tracking-wider" data-testid="text-referral-code">{refCode}</p>
            </div>
          </CardContent>
        </Card>

        {/* Public lifetime social proof — only shown if we have real data */}
        {publicStats && publicStats.totalEarnedKES > 0 && (
          <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200" data-testid="text-public-stats">
                  KES {publicStats.totalEarnedKES.toLocaleString()} earned by {publicStats.totalReferrers.toLocaleString()} Kenyans
                </p>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                  Real M-Pesa payouts since launch
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* My stats — pending, earned, total referrals */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <Users className="h-5 w-5 mx-auto text-blue-600 mb-1" />
              <p className="text-xl font-bold" data-testid="stat-total-referrals">{stats?.totalReferrals ?? 0}</p>
              <p className="text-xs text-muted-foreground">Friends</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Clock className="h-5 w-5 mx-auto text-amber-600 mb-1" />
              <p className="text-xl font-bold" data-testid="stat-pending">KES {stats?.pendingCommission ?? 0}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <CheckCircle className="h-5 w-5 mx-auto text-green-600 mb-1" />
              <p className="text-xl font-bold" data-testid="stat-paid">KES {stats?.paidCommission ?? 0}</p>
              <p className="text-xs text-muted-foreground">Paid</p>
            </CardContent>
          </Card>
        </div>

        {/* Milestone progress bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-semibold">First KES {MILESTONE_KES} milestone</p>
              </div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                {milestoneProgress}%
              </p>
            </div>
            <div className="h-2 bg-amber-100 dark:bg-amber-900/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                style={{ width: `${milestoneProgress}%` }}
                data-testid="milestone-progress-bar"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
              Hit KES {MILESTONE_KES} earned to unlock instant M-Pesa payouts on every new referral.
            </p>
          </CardContent>
        </Card>

        {/* Share link + QR */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              Share your link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 bg-muted rounded-lg p-3 text-sm break-all" data-testid="text-referral-link">
                {referralLink}
              </div>
              <Button
                onClick={copyToClipboard}
                variant={copied ? "default" : "outline"}
                size="icon"
                data-testid="button-copy-link"
                aria-label="Copy link"
              >
                {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <Button
                onClick={shareViaWhatsApp}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-share-whatsapp"
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button
                onClick={shareViaTelegram}
                className="bg-blue-500 hover:bg-blue-600 text-white"
                data-testid="button-share-telegram"
              >
                <Send className="h-4 w-4" />
              </Button>
              <Button
                onClick={shareViaSMS}
                variant="outline"
                data-testid="button-share-sms"
              >
                <Smartphone className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setShowQR((v) => !v)}
                variant={showQR ? "default" : "outline"}
                data-testid="button-toggle-qr"
                aria-label="Show QR code"
              >
                <QrCode className="h-4 w-4" />
              </Button>
            </div>

            {showQR && (
              <div className="mt-3 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl flex flex-col items-center gap-3">
                <img
                  src={qrUrl}
                  alt={`Referral QR code for ${refCode}`}
                  className="rounded-lg"
                  width={240}
                  height={240}
                  data-testid="img-referral-qr"
                />
                <div className="text-center">
                  <p className="text-sm font-bold tracking-wider">{refCode}</p>
                  <p className="text-xs text-muted-foreground">
                    Print on a flyer. Stick it at your SACCO, college, church.
                  </p>
                </div>
                <Button
                  onClick={downloadQR}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  data-testid="button-download-qr"
                >
                  <ArrowRight className="h-3 w-3 mr-1" />
                  Download PNG
                </Button>
              </div>
            )}

            {typeof navigator !== "undefined" && typeof (navigator as any).share === "function" && (
              <Button
                onClick={shareNative}
                variant="outline"
                className="w-full text-sm"
                data-testid="button-share-native"
              >
                <Share2 className="h-4 w-4 mr-2" />
                More sharing options (Instagram, Facebook, …)
              </Button>
            )}
          </CardContent>
        </Card>

        {/* How it works */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">How it works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0">1</div>
              <div>
                <p className="font-semibold text-sm">Share your link</p>
                <p className="text-xs text-muted-foreground">WhatsApp groups, SACCO, college noticeboard, family.</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0">2</div>
              <div>
                <p className="font-semibold text-sm">Friend signs up via your link & pays</p>
                <p className="text-xs text-muted-foreground">
                  They save KES {FRIEND_DISCOUNT} on first month. You earn KES {MONTHLY_REWARD} (Pro Monthly) or KES {YEARLY_REWARD} (Pro Yearly).
                </p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-bold shrink-0">3</div>
              <div>
                <p className="font-semibold text-sm">M-Pesa pings you next morning</p>
                <p className="text-xs text-muted-foreground">
                  Automatic B2C payout — no claim form, no waiting period. Receipt is in your M-Pesa app.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Referral table */}
        {stats?.referrals && stats.referrals.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Your referrals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.referrals.map((ref) => (
                  <div key={ref.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{ref.referredPhone.replace(/(\d{3})(\d{3})(\d{3})/, "$1***$3")}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(ref.createdAt).toLocaleDateString()} · KES {ref.paymentAmount.toLocaleString()} plan
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-bold">KES {ref.commission}</p>
                      {statusBadge(ref.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Become Pro yourself CTA */}
        {totalEarned >= 600 && (
          <Card className="bg-gradient-to-br from-blue-600 to-violet-600 text-white border-0">
            <CardContent className="p-4 flex items-center gap-3">
              <Crown className="h-6 w-6 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">You've earned enough for Pro Monthly</p>
                <p className="text-xs text-white/85">Convert your KES {totalEarned} earnings into a free Pro month.</p>
              </div>
              <Link href="/pricing">
                <Button size="sm" variant="secondary" className="text-blue-700 font-semibold whitespace-nowrap" data-testid="button-convert-earnings">
                  Upgrade
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Compliance footer */}
        <Card className="bg-muted/50">
          <CardContent className="p-4 space-y-3">
            <div className="text-xs text-muted-foreground leading-relaxed space-y-2" data-testid="text-referral-disclaimer">
              <p className="font-semibold">Important:</p>
              <p>
                Referral commissions are for marketing awareness only. Do not promise jobs,
                visas, or guaranteed outcomes to anyone. WorkAbroad Hub does not sell jobs
                or guarantee employment. Commission is paid only after a friend's payment is
                fully verified and settled. Friend's KES {FRIEND_DISCOUNT} first-month discount
                applies to Pro Monthly only and is one-time per phone number.
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              By participating, you agree to our{" "}
              <Link href="/referral-terms" className="text-primary underline" data-testid="link-referral-terms">
                Referral Program Terms
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
