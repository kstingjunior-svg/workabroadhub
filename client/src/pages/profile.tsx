import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatPhone } from "@/lib/phone";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  User,
  Phone,
  Globe,
  Save,
  Loader2,
  AlertTriangle,
  Crown,
  Star,
  Zap,
  CheckCircle2,
  Calendar,
  ArrowUpRight,
  Download,
  Trash2,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect, useCallback } from "react";
import { apiRequest, fetchCsrfToken, getQueryFn } from "@/lib/queryClient";
import type { User as UserType } from "@shared/models/auth";
import type { UserSubscription } from "@shared/schema";
import { AccessibilitySettings } from "@/components/accessibility-settings";

const countries = [
  { code: "KE", name: "Kenya" },
  { code: "UG", name: "Uganda" },
  { code: "TZ", name: "Tanzania" },
  { code: "RW", name: "Rwanda" },
  { code: "ET", name: "Ethiopia" },
  { code: "NG", name: "Nigeria" },
  { code: "GH", name: "Ghana" },
  { code: "ZA", name: "South Africa" },
  { code: "OTHER", name: "Other" },
];

// ── Plan metadata helpers ────────────────────────────────────────────────────
type PlanId = "free" | "basic" | "pro" | string;

function getPlanMeta(planId: PlanId) {
  switch (planId) {
    case "pro":
      return {
        label: "Pro",
        badge: "VIP Access",
        icon: <Crown className="h-5 w-5 text-amber-500" aria-hidden="true" />,
        badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700",
        cardClass: "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10",
        description: "Full-service career support & advisor access",
        features: ["AI CV Tools", "1-on-1 WhatsApp Consultation", "Priority Listings", "Unlimited Access"],
      };
    case "basic":
      return {
        label: "Pro",
        badge: null,
        icon: <Star className="h-5 w-5 text-blue-500" aria-hidden="true" />,
        badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-700",
        cardClass: "border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10",
        description: "Full access to all premium features",
        features: ["ATS CV Checker", "Verified Job Access", "Country Guides", "Application Tracker"],
      };
    default:
      return {
        label: "Free",
        badge: null,
        icon: <Zap className="h-5 w-5 text-gray-400" aria-hidden="true" />,
        badgeClass: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
        cardClass: "border-gray-200 dark:border-gray-700",
        description: "Explore the platform at no cost",
        features: ["Limited ATS Check", "Visa Info", "Country Guides"],
      };
  }
}

function formatExpiry(expiresAt: string | Date | null | undefined): string {
  if (!expiresAt) return "Never expires";
  const d = new Date(expiresAt);
  if (isNaN(d.getTime())) return "Never expires";
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
}

function isSubscriptionExpired(sub: UserSubscription | null | undefined): boolean {
  if (!sub) return false;
  if (sub.status !== "active") return true;
  if (!sub.endDate) return false;
  return new Date(sub.endDate) < new Date();
}

// ── Plan Status Card ─────────────────────────────────────────────────────────
function PlanStatusCard({ planId, subscription, isLoadingSub }: {
  planId: PlanId;
  subscription: UserSubscription | null | undefined;
  isLoadingSub: boolean;
}) {
  const meta = getPlanMeta(planId);
  const expired = isSubscriptionExpired(subscription);
  const effectivePlan = expired ? "free" : planId;
  const effectiveMeta = expired ? getPlanMeta("free") : meta;

  if (isLoadingSub) {
    return (
      <Card>
        <CardHeader><CardTitle>Your Plan</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-9 w-36" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={effectiveMeta.cardClass} data-testid="card-plan-status">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {effectiveMeta.icon}
            Your Plan
          </CardTitle>
          {expired && (
            <Badge variant="outline" className="text-red-600 border-red-300 dark:border-red-700 text-xs">
              Expired
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${effectiveMeta.badgeClass}`}
            data-testid="text-current-plan"
          >
            {effectiveMeta.icon}
            {effectiveMeta.label} Plan
          </span>
          {effectiveMeta.badge && !expired && (
            <Badge variant="outline" className={effectiveMeta.badgeClass}>
              {effectiveMeta.badge}
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground">{effectiveMeta.description}</p>

        <ul className="space-y-1">
          {effectiveMeta.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>

        {subscription && !expired && (effectivePlan === "basic" || effectivePlan === "pro") && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span data-testid="text-plan-expiry">
              Active until {formatExpiry(subscription.endDate)}
            </span>
          </div>
        )}

        {expired && (
          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Your subscription expired on {formatExpiry(subscription?.endDate)}. Renew to restore access.</span>
          </div>
        )}

        {(effectivePlan === "free" || effectivePlan === "basic" || expired) && (
          <Link href="/pricing">
            <Button size="sm" className="gap-1.5 mt-1" data-testid="button-upgrade-plan">
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              {expired ? "Renew Plan" : effectivePlan === "basic" ? "Upgrade to Pro" : "Get a Plan"}
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// ── Download My Data Card ─────────────────────────────────────────────────────
// Data portability is a legal right (GDPR / Kenya DPA) — available to ALL users
// regardless of their subscription plan.
function DownloadDataCard({ planId: _planId }: { planId: PlanId }) {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const res = await fetch("/api/account/export", { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to export data");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date().toISOString().split("T")[0];
      a.download = `workabroad-my-data-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Data exported", description: "Your data file has been downloaded." });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  }, [toast]);

  return (
    <Card data-testid="card-download-data">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" aria-hidden="true" />
          Download My Data
        </CardTitle>
        <CardDescription>
          Export a copy of everything WorkAbroad Hub holds about you — profile, payments, orders and more. This is your right under the Kenya Data Protection Act, 2019 and GDPR.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Downloads a JSON file with your profile, subscription, payments, orders, job alerts, applications, and more.
        </p>
        <Button
          onClick={handleDownload}
          disabled={isDownloading}
          variant="outline"
          className="gap-2"
          data-testid="button-download-data"
          aria-busy={isDownloading}
        >
          {isDownloading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Preparing export…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download my data (.json)
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Delete Account Card ───────────────────────────────────────────────────────
function DeleteAccountCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteText, setDeleteText] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const isValidWord = deleteText.trim().toUpperCase() === "DELETE";

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const csrfToken = await fetchCsrfToken();
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ confirmWord: deleteText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Deletion failed");
      return data;
    },
    onSuccess: () => {
      // Wipe all React Query cache first
      queryClient.clear();
      // Wipe all browser storage so nothing leaks to the next visitor
      try { localStorage.clear(); } catch { /* ignore */ }
      try { sessionStorage.clear(); } catch { /* ignore */ }
      // Hard full-page redirect to home — session is already destroyed server-side
      // Use replace() so the profile page is not in browser history
      window.location.replace("/?account_deleted=1");
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
      setConfirmed(false);
    },
  });

  return (
    <Card className="border-destructive" data-testid="card-delete-account">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 className="h-5 w-5" aria-hidden="true" />
          Delete Account
        </CardTitle>
        <CardDescription>
          Permanently delete your account and all associated data. This cannot be undone — you will need to sign up again to use the service.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        {!confirmed ? (
          <>
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                Warning — this is permanent
              </p>
              <p className="text-xs leading-relaxed">
                All your data, history, documents, payments and subscription access will be erased immediately from our entire system. You will be logged out and must create a new account to use the app.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-delete">
                Type <span className="font-mono font-bold tracking-widest">DELETE</span> to enable deletion
              </Label>
              <Input
                id="confirm-delete"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="Type DELETE here"
                autoComplete="off"
                data-testid="input-confirm-delete"
                className={isValidWord ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              <p className="text-xs text-muted-foreground">
                Accepted: DELETE, Delete, delete
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="destructive"
                onClick={() => setConfirmed(true)}
                disabled={!isValidWord}
                data-testid="button-proceed-delete"
              >
                <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                Delete My Account
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteText("")}
                data-testid="button-cancel-delete"
                className="text-muted-foreground"
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg bg-destructive/15 border border-destructive p-4 text-center space-y-2">
              <p className="font-bold text-destructive text-lg">Are you absolutely sure?</p>
              <p className="text-sm text-muted-foreground">
                This will <strong>permanently erase</strong> everything — your profile, history, documents and any active subscription. You will be signed out immediately and cannot undo this.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete"
                aria-busy={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />Erasing account…</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />Yes, permanently delete everything</>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setConfirmed(false); setDeleteText(""); }}
                disabled={deleteMutation.isPending}
                data-testid="button-cancel-confirm-delete"
                className="text-muted-foreground"
              >
                No, keep my account
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Profile Page ─────────────────────────────────────────────────────────
export default function Profile() {
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");

  const { data: profile, isLoading } = useQuery<UserType>({
    queryKey: ["/api/profile"],
  });

  const { data: subscription, isLoading: isLoadingSub } = useQuery<UserSubscription | null>({
    queryKey: ["/api/subscription"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    staleTime: 0,
  });

  useEffect(() => {
    if (profile) {
      setPhone(profile.phone || "");
      setCountry(profile.country || "");
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: async (data: { phone?: string; country?: string }) => {
      const response = await apiRequest("PATCH", "/api/profile", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Profile Updated", description: "Your profile has been updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message || "Failed to update profile.", variant: "destructive" });
    },
  });

  if (!authUser) return null;

  const isExpired = isSubscriptionExpired(subscription);
  const effectivePlanId: PlanId = (!isExpired && subscription?.status === "active" && subscription?.plan)
    ? subscription.plan as PlanId
    : (profile?.plan ?? "free");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b" role="banner">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back" aria-label="Go back to dashboard">
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <User className="h-6 w-6 text-primary" aria-hidden="true" />
                <h1 className="font-semibold">My Profile</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-bottom-nav" role="main">
        <div className="grid gap-6">

          {/* Account Information */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Your basic account details from Replit Auth</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-sm" id="name-label">Name</Label>
                  <p className="font-medium" data-testid="text-name" aria-labelledby="name-label">
                    {profile?.firstName} {profile?.lastName}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm" id="email-label">Email</Label>
                  <p className="font-medium" data-testid="text-email" aria-labelledby="email-label">
                    {profile?.email || "Not provided"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Plan Status */}
          <PlanStatusCard
            planId={effectivePlanId}
            subscription={subscription}
            isLoadingSub={isLoading || isLoadingSub}
          />

          {/* Contact Details */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Details</CardTitle>
              <CardDescription>
                Update your phone number and country for better communication
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="07XXXXXXXX or 254XXXXXXXXX"
                      value={phone}
                      onChange={(e) => setPhone(formatPhone(e.target.value))}
                      data-testid="input-phone"
                    />
                    <p className="text-xs text-muted-foreground">
                      Type 07XXXXXXXX — auto-formats to 254XXXXXXXXX.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="country" className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Country
                    </Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger data-testid="select-country">
                        <SelectValue placeholder="Select your country" />
                      </SelectTrigger>
                      <SelectContent>
                        {countries.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={() => updateMutation.mutate({ phone, country })}
                    disabled={updateMutation.isPending}
                    className="w-full sm:w-auto touch-target-min"
                    data-testid="button-save"
                    aria-busy={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />Saving…</>
                    ) : (
                      <><Save className="h-4 w-4 mr-2" aria-hidden="true" />Save Changes</>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <AccessibilitySettings />

          {/* Download My Data */}
          <DownloadDataCard planId={effectivePlanId} />

          {/* Delete Account */}
          <DeleteAccountCard />

        </div>
      </main>
    </div>
  );
}
