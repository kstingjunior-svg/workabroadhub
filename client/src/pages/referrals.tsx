import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateReferralCode } from "@/lib/firebase-referrals";
import { 
  Copy, 
  Share2, 
  Users, 
  DollarSign, 
  Clock, 
  CheckCircle,
  Gift,
  ArrowLeft,
  MessageCircle,
  Send,
  Smartphone
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

export default function Referrals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: stats } = useQuery<ReferralStats>({
    queryKey: ["/api/my-referrals"],
  });

  // Ensure this user's referral code exists in Firebase on mount
  useEffect(() => {
    if (user?.id) {
      generateReferralCode(user.id).catch(console.error);
    }
  }, [user?.id]);

  // Use server-provided refCode or derive from userId using the WAH prefix format
  const refCode = stats?.refCode || (user?.id
    ? `WAH${user.id.substring(0, 6).toUpperCase()}`
    : "WAH…");
  
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://workabroadhub.tech";
  const referralLink = `${baseUrl}/?ref=${refCode}`;
  const COMMISSION_RATE = 450; // KES 450 per referral (10% of 4,500)

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
      title: "Link Copied!",
      description: "Share it with your friends. You may earn a referral bonus when they sign up.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const shareViaWhatsApp = () => {
    const message = encodeURIComponent(
      `Check out WorkAbroad Hub - a career consultation service for verified overseas job resources. Learn more: ${referralLink}`
    );
    window.open(`https://wa.me/?text=${message}`, "_blank");
  };

  const shareViaSMS = () => {
    const message = encodeURIComponent(
      `Check out WorkAbroad Hub for career consultation & verified job resources: ${referralLink}`
    );
    window.open(`sms:?body=${message}`, "_blank");
  };

  const shareViaTelegram = () => {
    const message = encodeURIComponent(
      `Check out WorkAbroad Hub - a career consultation service for verified overseas job resources. Learn more: ${referralLink}`
    );
    window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${message}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-blue-900 text-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-white hover:bg-blue-800" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Referral Program</h1>
            <p className="text-blue-200 text-sm">Referral bonus program</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0">
          <CardContent className="p-6 text-center">
            <Gift className="h-12 w-12 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2" data-testid="text-referral-hero-title">Refer a Friend</h2>
            <p className="text-amber-100 text-sm mb-4">
              When a friend signs up and pays using your link, you may earn a <span className="font-bold">KES 450</span> referral bonus
            </p>
            <div className="bg-white/20 rounded-lg p-3 mb-4">
              <p className="text-xs text-amber-100 mb-1">Your Referral Code</p>
              <p className="text-xl font-bold tracking-wider" data-testid="text-referral-code">{refCode}</p>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <Users className="h-5 w-5 mx-auto text-blue-600 mb-1" />
              <p className="text-xl font-bold">{stats?.totalReferrals || 0}</p>
              <p className="text-xs text-muted-foreground">Referrals</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Clock className="h-5 w-5 mx-auto text-amber-600 mb-1" />
              <p className="text-xl font-bold">KES {stats?.pendingCommission || 0}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <CheckCircle className="h-5 w-5 mx-auto text-green-600 mb-1" />
              <p className="text-xl font-bold">KES {stats?.paidCommission || 0}</p>
              <p className="text-xs text-muted-foreground">Earned</p>
            </CardContent>
          </Card>
        </div>

        {/* Share Link */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              Share Your Link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 bg-muted rounded-lg p-3 text-sm break-all">
                {referralLink}
              </div>
              <Button 
                onClick={copyToClipboard} 
                variant={copied ? "default" : "outline"}
                size="icon"
                data-testid="button-copy-link"
              >
                {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <Button 
                onClick={shareViaWhatsApp} 
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-share-whatsapp"
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                WhatsApp
              </Button>
              <Button 
                onClick={shareViaTelegram}
                className="bg-blue-500 hover:bg-blue-600 text-white"
                data-testid="button-share-telegram"
              >
                <Send className="h-4 w-4 mr-1" />
                Telegram
              </Button>
              <Button 
                onClick={shareViaSMS}
                variant="outline"
                data-testid="button-share-sms"
              >
                <Smartphone className="h-4 w-4 mr-1" />
                SMS
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* How It Works */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3 items-start">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0">1</div>
              <div>
                <p className="font-medium text-sm">Share Your Link</p>
                <p className="text-xs text-muted-foreground">Send your unique referral link to friends interested in career guidance</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0">2</div>
              <div>
                <p className="font-medium text-sm">Friend Signs Up & Pays</p>
                <p className="text-xs text-muted-foreground">When they upgrade to Pro via secure checkout</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-bold shrink-0">3</div>
              <div>
                <p className="font-medium text-sm">KES 450 Sent to Your M-Pesa Automatically</p>
                <p className="text-xs text-muted-foreground">Once their payment is confirmed, your commission is sent directly to your M-Pesa — no manual request needed.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Referrals */}
        {stats?.referrals && stats.referrals.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your Referrals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.referrals.map((ref) => (
                  <div key={ref.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{ref.referredPhone.replace(/(\d{3})(\d{3})(\d{3})/, "$1***$3")}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(ref.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">KES {ref.commission}</p>
                      {statusBadge(ref.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-muted/50">
          <CardContent className="p-4 space-y-3">
            <div className="text-xs text-muted-foreground leading-relaxed space-y-2" data-testid="text-referral-disclaimer">
              <p className="font-semibold">Important:</p>
              <p>Referral commissions are for marketing awareness only. Do not promise jobs, visas, or guaranteed outcomes to anyone. WorkAbroad Hub does not sell jobs or guarantee employment. Commission amounts are subject to verification and are paid at our discretion. Commission is not guaranteed until verified and processed.</p>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              By participating in the referral program, you agree to our{" "}
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
