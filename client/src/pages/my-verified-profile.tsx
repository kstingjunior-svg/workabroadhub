// /my-profile — private builder for the Verified Migration Profile
// (Phase 2 of the "Direct Hire Exchange" concept). Authenticated only.
//
// This page assembles and displays the worker's own profile (always the
// full, unfiltered view — sharing gates only apply to the PUBLIC page),
// lets them fill gaps with CTAs into existing tools, and lets them control
// what a stranger sees at /verified/:token.
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BadgeCheck, ChevronLeft, Copy, Share2, RefreshCw, GraduationCap,
  FileText, Phone, Mail, Calendar, MapPin, ShieldCheck, Circle,
} from "lucide-react";

interface ProfileData {
  identity: {
    firstName: string | null;
    lastName: string | null;
    country: string | null;
    memberSince: string | null;
    phone: string | null;
    phoneVerified: boolean;
    email: string | null;
    emailVerified: boolean;
  };
  ielts: {
    overallBand: string | null;
    listeningBand: string | null;
    readingBand: string | null;
    writingBand: string | null;
    speakingBand: string | null;
    testDate: string | null;
    testType: string | null;
    verified: true;
    verifiedVia: string;
  } | null;
  cv: { hasCv: true; verified: false; label: string; preview: string } | null;
  ats: { score: number | null; grade: string | null; verified: false; label: string } | null;
  settings: {
    isPublic: boolean;
    showPhone: boolean;
    showEmail: boolean;
    shareToken: string;
  };
}

function VerifiedBadge({ label = "Verified" }: { label?: string }) {
  return (
    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-100 gap-1" data-testid="badge-verified">
      <ShieldCheck className="h-3 w-3" /> {label}
    </Badge>
  );
}

function SelfReportedBadge({ label = "Self-reported" }: { label?: string }) {
  return (
    <Badge variant="secondary" className="gap-1" data-testid="badge-self-reported">
      <Circle className="h-2.5 w-2.5 fill-current" /> {label}
    </Badge>
  );
}

export default function MyVerifiedProfile() {
  usePageSeo({
    title: "My Verified Migration Profile — WorkAbroad Hub",
    description: "Your reusable, shareable worker credential — verified IELTS score, CV, and identity in one link.",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["/api/verified-profile/me"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/verified-profile/me");
      return res.json();
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (patch: Partial<{ isPublic: boolean; showPhone: boolean; showEmail: boolean; regenerateShareToken: boolean }>) => {
      const res = await apiRequest("PATCH", "/api/verified-profile/me", patch);
      return res.json();
    },
    onSuccess: (settings) => {
      queryClient.setQueryData<ProfileData | undefined>(["/api/verified-profile/me"], (old) =>
        old ? { ...old, settings } : old
      );
    },
    onError: () => {
      toast({ title: "Couldn't update your settings", description: "Please try again.", variant: "destructive" });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  const { identity, ielts, cv, ats, settings } = data;
  const shareUrl = `${window.location.origin}/verified/${settings.shareToken}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      toast({ title: "Link copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareOnWhatsApp = () => {
    const msg = `🌍 My verified WorkAbroad Hub migration profile — IELTS score, CV & identity in one link:\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" data-testid="heading-my-profile">
            <BadgeCheck className="h-5 w-5 text-primary" /> My Verified Migration Profile
          </h1>
          <p className="text-sm text-muted-foreground">One link, built once, shareable with any employer or agent.</p>
        </div>
      </div>

      {/* Identity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">{[identity.firstName, identity.lastName].filter(Boolean).join(" ") || "—"}</span>
          </div>
          {identity.country && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {identity.country}
            </div>
          )}
          {identity.memberSince && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> Member since {new Date(identity.memberSince).toLocaleDateString("en-KE", { month: "long", year: "numeric" })}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{identity.phone || "Not added"}</span>
            {identity.phone && (identity.phoneVerified ? <VerifiedBadge /> : <SelfReportedBadge />)}
          </div>
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{identity.email || "Not added"}</span>
            {identity.email && (identity.emailVerified ? <VerifiedBadge /> : <SelfReportedBadge />)}
          </div>
        </CardContent>
      </Card>

      {/* IELTS */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-4 w-4" /> IELTS Score
          </CardTitle>
          {ielts && <VerifiedBadge label="TRF Verified" />}
        </CardHeader>
        <CardContent className="text-sm">
          {ielts ? (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
              <div>
                <p className="text-xl font-bold">{ielts.overallBand ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">Overall</p>
              </div>
              <div>
                <p className="font-semibold">{ielts.listeningBand ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">Listening</p>
              </div>
              <div>
                <p className="font-semibold">{ielts.readingBand ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">Reading</p>
              </div>
              <div>
                <p className="font-semibold">{ielts.writingBand ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">Writing</p>
              </div>
              <div>
                <p className="font-semibold">{ielts.speakingBand ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">Speaking</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">No genuinely-verified IELTS score on file yet.</p>
              <Link href="/tools/ielts-verify">
                <Button size="sm" variant="outline" data-testid="button-add-ielts">Verify my TRF</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CV / ATS */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> CV &amp; ATS Score
          </CardTitle>
          {(cv || ats) && <SelfReportedBadge label="AI-reviewed" />}
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {ats && (
            <p>ATS score: <span className="font-semibold">{ats.score ?? "—"}</span> {ats.grade ? `(${ats.grade})` : ""}</p>
          )}
          {cv ? (
            <p className="text-muted-foreground line-clamp-3">{cv.preview}…</p>
          ) : !ats ? (
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">No CV on file yet.</p>
              <Link href="/tools/ats-cv-checker">
                <Button size="sm" variant="outline" data-testid="button-add-cv">Check my CV</Button>
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Sharing settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Share2 className="h-4 w-4" /> Sharing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Make my profile public</p>
              <p className="text-muted-foreground text-xs">Off by default. Turn on so your share link works for employers and agents.</p>
            </div>
            <Switch
              checked={settings.isPublic}
              onCheckedChange={(checked) => updateSettings.mutate({ isPublic: checked })}
              data-testid="switch-is-public"
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="font-medium">Show phone number</p>
            <Switch
              checked={settings.showPhone}
              onCheckedChange={(checked) => updateSettings.mutate({ showPhone: checked })}
              data-testid="switch-show-phone"
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="font-medium">Show email</p>
            <Switch
              checked={settings.showEmail}
              onCheckedChange={(checked) => updateSettings.mutate({ showEmail: checked })}
              data-testid="switch-show-email"
            />
          </div>

          {settings.isPublic && (
            <div className="pt-2 border-t space-y-3">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 text-xs bg-muted rounded-md px-3 py-2 truncate"
                  data-testid="input-share-url"
                />
                <Button size="icon" variant="outline" onClick={copyLink} data-testid="button-copy-share-link">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="bg-[#25D366] hover:bg-[#20B558] text-white gap-2" onClick={shareOnWhatsApp} data-testid="button-share-whatsapp">
                  <Share2 className="h-4 w-4" /> Share via WhatsApp
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    if (confirm("Regenerating your link will break any copies you've already shared. Continue?")) {
                      updateSettings.mutate({ regenerateShareToken: true });
                    }
                  }}
                  data-testid="button-regenerate-link"
                >
                  <RefreshCw className="h-4 w-4" /> Regenerate link
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
