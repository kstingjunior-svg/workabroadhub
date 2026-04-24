import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, fetchCsrfToken } from "@/lib/queryClient";
import { formatPhone } from "@/lib/phone";
import {
  CheckCircle, Loader2, Shield, ArrowLeft,
  PhoneCall, Star, Zap, AlertCircle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceData {
  id: string;
  code: string;
  name: string;
  price: number;
  finalPrice: number;
  description: string;
  features: string[];
  category: string;
  badge: string | null;
  isFlashSale: boolean;
  discountPercent: number;
  savings: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function usePayParams(): { serviceCode: string; userId: string } {
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  return {
    serviceCode: params.get("service") ?? "",
    userId:      params.get("user")    ?? "",
  };
}

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_MS      = 65_000;

// ── Main component ────────────────────────────────────────────────────────────

export default function PayPage() {
  const { user }                    = useAuth();
  const [, navigate]                = useLocation();
  const { toast }                   = useToast();
  const { serviceCode, userId: urlUserId } = usePayParams();

  // Payment state
  const [paymentId, setPaymentId]       = useState<string | null>(null);
  const paymentIdRef                    = useRef<string | null>(null);
  useEffect(() => { paymentIdRef.current = paymentId; }, [paymentId]);
  const [isPolling, setIsPolling]       = useState(false);
  const [success, setSuccess]           = useState(false);
  const [fallbackPhone, setFallbackPhone] = useState(""); // shown only when profile phone missing
  const pollStart                       = useRef(0);
  const triggered                       = useRef(false);  // prevent double-fire

  // ── Fetch service ───────────────────────────────────────────────────────────
  const {
    data: serviceData, isLoading: svcLoading, isError: svcError,
  } = useQuery<{ success?: boolean; expired?: boolean; service?: ServiceData }>({
    queryKey: ["/api/pay-page", serviceCode, urlUserId],
    queryFn: async () => {
      const url = `/api/pay-page?service=${encodeURIComponent(serviceCode)}` +
                  (urlUserId ? `&user=${encodeURIComponent(urlUserId)}` : "");
      const res = await fetch(url);
      return res.json();
    },
    enabled: !!serviceCode,
    retry: false,
    staleTime: 30_000,
  });
  const linkExpired = !!serviceData?.expired;
  const service     = serviceData?.service;

  // ── Fetch user profile (to get saved phone) ─────────────────────────────────
  const { data: profile } = useQuery<{ phone?: string }>({
    queryKey: ["/api/profile"],
    enabled: !!user,
    staleTime: 60_000,
  });
  const userPhone = profile?.phone ?? "";

  // ── STK push mutation ───────────────────────────────────────────────────────
  const stkMutation = useMutation({
    mutationFn: async (payload: object) => {
      const csrf = await fetchCsrfToken();
      return apiRequest("POST", "/api/payments/mpesa/stk-push", payload, {
        "x-csrf-token": csrf,
      });
    },
    onSuccess: (res: any) => {
      const id = res?.paymentId ?? res?.payment_id;
      setPaymentId(id ?? null);
      setIsPolling(true);
      pollStart.current = Date.now();
    },
    onError: (err: any) => {
      triggered.current = false; // allow retry
      toast({
        title: "M-Pesa prompt failed",
        description: err.message ?? "Could not send STK push. Try again.",
        variant: "destructive",
      });
    },
  });

  // ── Core: initiate STK push ─────────────────────────────────────────────────
  const initiateSTKPush = useCallback(
    (phone: string, price: number, serviceId: string) => {
      const cleaned = formatPhone(phone.trim());
      if (!cleaned || !cleaned.startsWith("254") || cleaned.length !== 12) {
        toast({
          title: "Invalid phone number",
          description: "Enter a valid Safaricom number (07XX…).",
          variant: "destructive",
        });
        triggered.current = false;
        return;
      }
      stkMutation.mutate({
        phoneNumber:  cleaned,
        amount:       price,
        service_code: serviceId,
      });
    },
    [stkMutation, toast]
  );

  // ── Auto-fire on mount once service + phone are ready ────────────────────────
  useEffect(() => {
    if (!user || !service || triggered.current) return;
    if (linkExpired) return; // already purchased — do not fire
    if (!userPhone) return; // wait — profile still loading or phone absent
    triggered.current = true;
    initiateSTKPush(userPhone, service.finalPrice, service.code);
  }, [user, service, userPhone, linkExpired, initiateSTKPush]);

  // ── Polling for payment confirmation ────────────────────────────────────────
  useEffect(() => {
    if (!isPolling) return;
    const timer = setInterval(async () => {
      const id = paymentIdRef.current;
      if (!id) return;
      if (Date.now() - pollStart.current > POLL_MAX_MS) {
        setIsPolling(false);
        toast({
          title: "Payment timed out",
          description: "No confirmation received. If you paid, it will be processed shortly.",
          variant: "destructive",
        });
        clearInterval(timer);
        return;
      }
      try {
        const res = await fetch(`/api/payments/${id}/status`).then(r => r.json());
        if (res.status === "success") {
          setIsPolling(false);
          setSuccess(true);
          clearInterval(timer);
        } else if (res.status === "failed" || res.status === "cancelled") {
          setIsPolling(false);
          triggered.current = false; // allow retry
          toast({
            title: "Payment not completed",
            description: "Please enter your PIN on the M-Pesa prompt.",
            variant: "destructive",
          });
          clearInterval(timer);
        }
      } catch {}
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isPolling, toast]);

  // ── Redirect unauthenticated users ──────────────────────────────────────────
  function handleLoginRedirect() {
    const returnUrl = window.location.pathname + window.location.search;
    localStorage.setItem("auth_redirect", returnUrl);
    navigate("/");
  }

  // ── Manual fallback (no saved phone) ────────────────────────────────────────
  function handleManualPay() {
    if (!service) return;
    triggered.current = true;
    initiateSTKPush(fallbackPhone, service.finalPrice, service.code);
  }

  function handleRetry() {
    triggered.current = false;
    setPaymentId(null);
    setIsPolling(false);
    if (service && userPhone) {
      triggered.current = true;
      initiateSTKPush(userPhone, service.finalPrice, service.code);
    }
  }

  // ── Guard: link expired (already purchased) ──────────────────────────────────
  if (linkExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-sm w-full text-center shadow-lg">
          <CardContent className="pt-10 pb-8 space-y-4">
            <CheckCircle className="mx-auto text-green-500 w-16 h-16" />
            <h2 className="text-xl font-bold">Link expired</h2>
            <p className="text-muted-foreground text-sm">
              You've already purchased this service. Head to your dashboard to access it.
            </p>
            <Button
              className="w-full"
              data-testid="button-go-dashboard-expired"
              onClick={() => navigate("/dashboard")}
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Guard: no service code ───────────────────────────────────────────────────
  if (!serviceCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <AlertCircle className="mx-auto text-muted-foreground w-10 h-10" />
          <p className="font-medium">No service specified.</p>
          <p className="text-sm text-muted-foreground">Use a link like <code>/pay?service=cv_writing</code></p>
          <Link href="/services"><Button variant="outline" size="sm">Browse services</Button></Link>
        </div>
      </div>
    );
  }

  // ── Guard: loading ───────────────────────────────────────────────────────────
  if (svcLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground w-8 h-8" />
      </div>
    );
  }

  // ── Guard: not found ─────────────────────────────────────────────────────────
  if (svcError || !service) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <AlertCircle className="mx-auto text-destructive w-10 h-10" />
          <p className="font-medium">Service not found.</p>
          <Link href="/services"><Button variant="outline" size="sm">View all services</Button></Link>
        </div>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-sm w-full text-center shadow-lg">
          <CardContent className="pt-10 pb-8 space-y-4">
            <CheckCircle className="mx-auto text-green-500 w-16 h-16" />
            <h2 className="text-2xl font-bold">Payment Confirmed!</h2>
            <p className="text-muted-foreground text-sm">
              You've unlocked <strong>{service.name}</strong>. Access details will arrive on WhatsApp shortly.
            </p>
            <Button
              className="w-full"
              data-testid="button-go-dashboard"
              onClick={() => navigate("/dashboard")}
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main layout ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => history.back()}
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm">Secure Checkout</span>
          <Shield className="w-4 h-4 text-green-500 ml-auto" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Service summary */}
        <Card className="overflow-hidden border shadow-sm" data-testid="card-service">
          <div className="bg-primary/5 border-b px-5 py-4 flex items-start justify-between gap-3">
            <div className="space-y-1">
              {service.badge && <Badge variant="secondary" className="text-xs mb-1">{service.badge}</Badge>}
              <h1 className="text-xl font-bold" data-testid="text-service-name">{service.name}</h1>
              <p className="text-sm text-muted-foreground">{service.category}</p>
            </div>
            <div className="text-right shrink-0">
              {service.isFlashSale && service.savings > 0 ? (
                <>
                  <div className="text-xs line-through text-muted-foreground">
                    KES {service.price.toLocaleString()}
                  </div>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-final-price">
                    KES {service.finalPrice.toLocaleString()}
                  </div>
                  <Badge variant="destructive" className="text-xs mt-0.5">
                    {service.discountPercent}% OFF
                  </Badge>
                </>
              ) : (
                <div className="text-2xl font-bold" data-testid="text-final-price">
                  KES {service.finalPrice.toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {Array.isArray(service.features) && service.features.length > 0 && (
            <CardContent className="p-5 space-y-2">
              <ul className="space-y-2" data-testid="list-features">
                {service.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>

        {/* Payment panel */}
        <Card className="border shadow-sm">
          <CardContent className="p-5 space-y-5">

            {/* ── Not authenticated ── */}
            {!user && (
              <div className="text-center space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  Sign in to pay for <strong>{service.name}</strong> instantly.
                </p>
                <Button
                  className="w-full"
                  data-testid="button-login-to-pay"
                  onClick={handleLoginRedirect}
                >
                  Sign in &amp; Pay
                </Button>
              </div>
            )}

            {/* ── Authenticated: auto STK push in progress ── */}
            {user && (stkMutation.isPending || isPolling) && (
              <div className="text-center space-y-4 py-4" data-testid="status-pending">
                <div className="relative mx-auto w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-green-100 dark:border-green-900" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-green-500 animate-spin" />
                  <PhoneCall className="absolute inset-0 m-auto w-6 h-6 text-green-600" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">
                    {stkMutation.isPending ? "Sending M-Pesa prompt…" : "Waiting for your PIN…"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isPolling
                      ? `Check your phone — enter your M-Pesa PIN to pay KES ${service.finalPrice.toLocaleString()}`
                      : "Connecting to Safaricom…"}
                  </p>
                  {userPhone && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Prompt sent to <strong>{userPhone}</strong>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Authenticated: idle / retry (no pending, not polling, not success) ── */}
            {user && !stkMutation.isPending && !isPolling && !success && (
              <>
                {/* Has saved phone — show retry button */}
                {userPhone ? (
                  <div className="text-center space-y-3 py-2">
                    <p className="text-sm text-muted-foreground">
                      Sending STK push to <strong>{userPhone}</strong> for{" "}
                      <strong>KES {service.finalPrice.toLocaleString()}</strong>
                    </p>
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      data-testid="button-retry-stk"
                      onClick={handleRetry}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Resend M-Pesa Prompt
                    </Button>
                  </div>
                ) : (
                  /* No saved phone — manual fallback */
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      No phone number saved. Enter your Safaricom number to pay.
                    </p>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium" htmlFor="pay-phone">
                        Safaricom number
                      </label>
                      <div className="relative">
                        <PhoneCall className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="pay-phone"
                          data-testid="input-phone"
                          placeholder="07XX XXX XXX"
                          value={fallbackPhone}
                          onChange={e => setFallbackPhone(e.target.value)}
                          className="pl-9"
                          inputMode="tel"
                        />
                      </div>
                    </div>
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      data-testid="button-pay-mpesa"
                      disabled={!fallbackPhone.trim()}
                      onClick={handleManualPay}
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Pay KES {service.finalPrice.toLocaleString()} via M-Pesa
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Trust strip */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground py-2">
          <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-green-500" /> Secure payment</span>
          <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-yellow-500" /> 4.8 / 5 rating</span>
          <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-blue-500" /> Instant delivery</span>
        </div>

        <p className="text-xs text-center text-muted-foreground pb-4">
          Professional career service fee. WorkAbroad Hub does not guarantee employment or visa approval.{" "}
          <Link href="/refund-policy" className="underline hover:text-foreground">Refund policy</Link>
        </p>
      </main>
    </div>
  );
}
