import { useQuery } from "@tanstack/react-query";
import { fetchCsrfToken, clearCsrfToken } from "@/lib/queryClient";
import { trackServerEvent } from "@/lib/analytics";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ConsultationBookingModal from "@/components/consultation-booking-modal";
import { useToast } from "@/hooks/use-toast";
import {
  Globe,
  ArrowLeft,
  FileEdit,
  MessageSquare,
  Compass,
  Linkedin,
  Headphones,
  FileCheck,
  ShieldCheck,
  BellRing,
  Briefcase,
  MapPin,
  Check,
  Star,
  Flame,
  Sparkles,
  RefreshCw,
  Search,
  PhoneCall,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { useLocation } from "wouter";
import type { Service } from "@shared/schema";
import { getServiceSLA } from "@shared/sla-config";
import { loadServices, getCachedServices, clearServicesCache } from "@/lib/services";

const CATEGORIES = [
  { key: "All", label: "All Services" },
  { key: "CV & Documents", label: "CV & Docs" },
  { key: "Interview & Profile", label: "Interview" },
  { key: "Legal & Verification", label: "Legal" },
  { key: "Job Search Tools", label: "Job Tools" },
  { key: "Support Plans", label: "Support" },
];

const SERVICE_ICONS: Record<string, any> = {
  "CV Health Check": Search,
  "CV Fix Lite": FileEdit,
  "ATS CV Optimization": FileEdit,
  "Country-Specific CV Rewrite": FileCheck,
  "Cover Letter Writing": FileEdit,
  "ATS + Cover Letter Bundle": FileCheck,
  "SOP / Statement of Purpose": FileEdit,
  "Motivation Letter Writing": FileEdit,
  "Interview Coaching": MessageSquare,
  "Interview Preparation Pack": MessageSquare,
  "Visa Guidance Session": Compass,
  "LinkedIn Profile Optimization": Linkedin,
  "Employment Contract Review": ShieldCheck,
  "Employer Verification Report": Search,
  "Premium WhatsApp Support": Headphones,
  "Premium Job Alerts": BellRing,
  "Abroad Worker Emergency Support": PhoneCall,
  "Pre-Departure Orientation Pack": MapPin,
  "Guided Apply Mode": Briefcase,
  "Job Pack — 5 Applications": Briefcase,
  "Assisted Apply Lite": Briefcase,
  "Application Tracking Pro": RefreshCw,
  "Reminder & Deadline Alerts": BellRing,
};

const BADGE_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  Popular: {
    label: "Popular",
    className: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300",
    icon: Flame,
  },
  "Most Popular": {
    label: "🔥 Most Popular",
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300",
    icon: Flame,
  },
  "Best Value": {
    label: "Best Value",
    className: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300",
    icon: Star,
  },
  New: {
    label: "New",
    className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
    icon: Sparkles,
  },
  Premium: {
    label: "Premium",
    className: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300",
    icon: Star,
  },
};

function formatPrice(price: number, isSubscription?: boolean, period?: string | null) {
  if (price === 0) return "FREE";
  const formatted = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
  }).format(price);
  if (isSubscription && period) return `${formatted}/${period === "monthly" ? "mo" : "yr"}`;
  return formatted;
}

function ServiceCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <Skeleton className="h-10 w-10 rounded-xl mb-3" />
        <Skeleton className="h-5 w-3/4 mb-1" />
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-5/6 mb-4" />
        <div className="space-y-1 mb-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-3 w-full" />)}
        </div>
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}

export default function Services() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  async function startPayment(service: Service) {
    trackServerEvent("click_service", { serviceId: service.id });
    setPaying(service.id);
    try {
      // Resolve the canonical price via the pricing engine before initiating payment.
      // This applies country PPP adjustments and any active promo codes.
      // Falls back to service.price if the service has no matching plan entry.
      const priceRes = await fetch("/api/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: service.id }),
      });
      const pricing = priceRes.ok ? await priceRes.json() : null;
      const amount = typeof pricing?.finalPrice === "number" ? pricing.finalPrice : service.price;

      const csrfToken = await fetchCsrfToken();
      const res = await fetch("/api/pay", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: JSON.stringify({
          amount,
          service_id: service.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "NO_PHONE") {
          toast({
            title: "Phone number required",
            description: "Please add your M-Pesa number in your profile first.",
            variant: "destructive",
          });
          navigate("/profile");
          return;
        }
        if (res.status === 403) {
          // Stale CSRF token — clear cache so next attempt fetches a fresh one
          clearCsrfToken();
          toast({
            title: "Security token refreshed",
            description: "Please tap 'Get Started' once more to continue.",
            variant: "destructive",
          });
          return;
        }
        if (data.code === "SESSION_EXPIRED" || data.code === "UNAUTHENTICATED" || res.status === 401) {
          clearCsrfToken();
          toast({
            title: "Please sign in to continue",
            description: data.message ?? "Your session is not active.",
            variant: "destructive",
          });
          navigate("/auth");
          return;
        }
        toast({ title: "Payment failed", description: data.message, variant: "destructive" });
        return;
      }

      toast({
        title: "✅ STK push sent",
        description: data.message,
      });

      // Navigate to service-order to show the waiting / confirmation UI
      navigate(`/service-order/${service.id}?paymentId=${data.paymentId}`);
    } catch {
      toast({ title: "Network error", description: "Could not reach the server. Please try again.", variant: "destructive" });
    } finally {
      setPaying(null);
    }
  }

  const { data: services, isLoading, isError, refetch } = useQuery<Service[]>({
    queryKey:        ["/api/services"],
    queryFn:         loadServices,
    placeholderData: getCachedServices() ?? undefined,
    staleTime:       0,
    retry:           2,
  });

  const filtered = (services ?? []).filter(
    (s) => s && s.code && s.name && s.category &&
      (activeCategory === "All" || s.category === activeCategory)
  );

  const subscriptionServices = filtered.filter((s) => s.isSubscription);
  const oneTimeServices = filtered.filter((s) => !s.isSubscription);

  function renderCard(service: Service) {
    const Icon = SERVICE_ICONS[service.name] || FileEdit;
    const badge = service.badge ? BADGE_CONFIG[service.badge] : null;
    const BadgeIcon = badge?.icon;
    const sla = getServiceSLA(service.name);
    const features: string[] = Array.isArray(service.features)
      ? (service.features as string[])
      : [];

    return (
      <Card
        key={service.id}
        data-testid={`card-service-${service.id}`}
        className="flex flex-col border hover:shadow-md transition-shadow duration-200"
      >
        <CardContent className="p-5 flex flex-col flex-1">
          <div className="flex items-start justify-between mb-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            {badge && (
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${badge.className}`}
              >
                {BadgeIcon && <BadgeIcon className="h-3 w-3" />}
                {badge.label}
              </span>
            )}
          </div>

          <h3 className="font-semibold text-base mb-1 leading-snug">{service.name}</h3>
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed line-clamp-2">
            {service.description}
          </p>

          {features.length > 0 && (
            <ul className="space-y-1 mb-4 flex-1">
              {features.slice(0, 5).map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Check className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto pt-3 border-t space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xl font-bold ${service.price === 0 ? "text-green-600 dark:text-green-400" : "text-foreground"}`}>
                  {formatPrice(service.price, service.isSubscription, service.subscriptionPeriod)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {service.price === 0
                    ? "No payment required"
                    : service.isSubscription
                    ? "Recurring subscription · cancel anytime"
                    : "⚡ Instant AI Delivery"}
                </div>
              </div>
              {service.isSubscription ? (
                <Badge variant="secondary" className="text-xs">Subscribe</Badge>
              ) : null}
            </div>
            <Button
              className="w-full"
              variant={service.price === 0 ? "outline" : "default"}
              data-testid={`button-service-${service.id}`}
              disabled={paying === service.id}
              onClick={() => startPayment(service)}
            >
              {paying === service.id
                ? "Sending STK push…"
                : service.price === 0
                ? "Use Free"
                : service.isSubscription
                ? "Subscribe Now"
                : "Get Started"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" />
              <span className="font-semibold text-lg">Career Services</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
        {/* Conversion banners */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
            <span className="text-2xl">🔥</span>
            <div>
              <p className="font-semibold text-sm">Start with just Ksh 99</p>
              <p className="text-xs text-muted-foreground">No hidden charges</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3">
            <span className="text-2xl">🚀</span>
            <div>
              <p className="font-semibold text-sm">No agents. Apply yourself.</p>
              <p className="text-xs text-muted-foreground">You stay in control</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3">
            <span className="text-2xl">💯</span>
            <div>
              <p className="font-semibold text-sm">Trusted by Kenyan job seekers</p>
              <p className="text-xs text-muted-foreground">Affordable for every Kenyan</p>
            </div>
          </div>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-serif font-bold mb-3">
            Boost Your Job Application Success
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base">
            Expert career services for Kenyans seeking overseas opportunities — from CV
            writing to employer verification and ongoing support.
          </p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-8 scrollbar-hide">
          {CATEGORIES.map((cat) => {
            const count = cat.key === "All"
              ? (services?.length ?? 0)
              : (services?.filter((s) => s.category === cat.key).length ?? 0);
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                data-testid={`tab-category-${cat.key}`}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-colors duration-150 ${
                  activeCategory === cat.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                {cat.label} {!isLoading && <span className="opacity-60">({count})</span>}
              </button>
            );
          })}
        </div>

        {isError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-base mb-1">Could not load services</p>
              <p className="text-sm text-muted-foreground mb-4">Check your connection and try again.</p>
              <Button
                variant="outline"
                onClick={() => { clearServicesCache(); refetch(); }}
                data-testid="button-retry-services"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => <ServiceCardSkeleton key={i} />)}
          </div>
        ) : (
          <>
            {oneTimeServices.length > 0 && (
              <section className="mb-10">
                {activeCategory === "All" && (
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-primary" />
                    One-Time Services
                  </h2>
                )}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {oneTimeServices.map(renderCard)}
                </div>
              </section>
            )}

            {subscriptionServices.length > 0 && (
              <section>
                {activeCategory === "All" && (
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-primary" />
                    Monthly Subscriptions
                  </h2>
                )}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {subscriptionServices.map(renderCard)}
                </div>
              </section>
            )}

            {filtered.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <p className="text-muted-foreground">No services found in this category.</p>
                {activeCategory !== "All" && (
                  <Button variant="ghost" size="sm" onClick={() => setActiveCategory("All")}>
                    Show all services
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        <section className="mt-16">
          <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-0">
            <CardContent className="p-8 text-center">
              <h2 className="text-2xl font-serif font-bold mb-3">Need a Custom Package?</h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                Not sure which service fits your needs? Our career advisors can build a
                custom package tailored to your target country, industry, and budget.
              </p>
              <Button size="lg" data-testid="button-contact" onClick={() => setBookingOpen(true)}>
                <Headphones className="h-4 w-4 mr-2" />
                Book a Free Consultation
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <ConsultationBookingModal open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  );
}
