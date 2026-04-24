import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { clearServicesCache } from "@/lib/services";
import AdminLayout from "@/components/admin-layout";
import { DollarSign, Save, Loader2, Clock, Zap, X } from "lucide-react";
import type { Service } from "@shared/schema";
import { calcFinalPrice } from "@/lib/price-engine";

const ALLOWED_PRICES = [99, 149, 199, 299, 499, 699, 999, 1299, 1499, 1999, 2500];
const SLIDER_MIN = ALLOWED_PRICES[0];
const SLIDER_MAX = ALLOWED_PRICES[ALLOWED_PRICES.length - 1];
const DISCOUNT_STEPS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80];

function snapPrice(value: number): number {
  return ALLOWED_PRICES.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

interface FlashSaleState {
  enabled:    boolean;
  discount:   number;   // percent
  endsIn:     string;   // "1h" | "2h" | "4h" | "8h" | "24h" | "custom" | ""
  customEnd:  string;   // ISO string
}

const QUICK_DURATIONS: { label: string; hours: number }[] = [
  { label: "1h",  hours: 1  },
  { label: "2h",  hours: 2  },
  { label: "4h",  hours: 4  },
  { label: "8h",  hours: 8  },
  { label: "24h", hours: 24 },
];

function computeSaleEnd(state: FlashSaleState): string | null {
  if (!state.enabled) return null;
  if (state.endsIn === "custom") return state.customEnd || null;
  const dur = QUICK_DURATIONS.find(d => d.label === state.endsIn);
  if (!dur) return null;
  return new Date(Date.now() + dur.hours * 3600 * 1000).toISOString();
}

export default function AdminPricing() {
  const { toast } = useToast();
  const [overrides, setOverrides]   = useState<Record<string, number>>({});
  const [pending,   setPending]     = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [flashStates, setFlashStates] = useState<Record<string, FlashSaleState>>({});

  const { data, isLoading } = useQuery<{ services: Service[] }>({
    queryKey: ["/api/services"],
  });

  const services: Service[] = data?.services ?? [];

  const updateMutation = useMutation({
    mutationFn: ({ code, price }: { code: string; price: number }) =>
      apiRequest("POST", "/api/admin/update-service", { code, price }),
    onSuccess: (_res, { code, price }) => {
      clearServicesCache();
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({ title: "Price updated", description: `${code} → KES ${price.toLocaleString()}` });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message ?? "Could not save price", variant: "destructive" });
    },
  });

  const flashMutation = useMutation({
    mutationFn: (payload: {
      code: string; flash_sale: boolean; discount_percent: number;
      sale_start: string | null; sale_end: string | null;
    }) => apiRequest("POST", "/api/admin/flash-sale", payload),
    onSuccess: (_res, vars) => {
      clearServicesCache();
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({
        title: vars.flash_sale ? "🔥 Flash sale activated!" : "Flash sale ended",
        description: vars.flash_sale
          ? `${vars.code}: ${vars.discount_percent}% off`
          : `${vars.code}: price restored`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Flash sale update failed", description: err?.message ?? "Try again", variant: "destructive" });
    },
  });

  function getFlashState(code: string, svc: Service): FlashSaleState {
    if (flashStates[code]) return flashStates[code];
    return {
      enabled:   (svc as any).flashSale ?? false,
      discount:  (svc as any).discountPercent ?? 20,
      endsIn:    "2h",
      customEnd: "",
    };
  }

  function setFlash(code: string, patch: Partial<FlashSaleState>) {
    setFlashStates(prev => ({ ...prev, [code]: { ...getFlashState(code, {} as any), ...patch } }));
  }

  function handleFlashSave(svc: Service) {
    const code  = svc.code ?? svc.slug ?? "";
    const state = getFlashState(code, svc);
    const saleEnd = computeSaleEnd(state);
    flashMutation.mutate({
      code,
      flash_sale:       state.enabled,
      discount_percent: state.enabled ? state.discount : 0,
      sale_start:       state.enabled ? new Date().toISOString() : null,
      sale_end:         state.enabled ? saleEnd : null,
    });
  }

  function getPrice(svc: Service): number {
    return overrides[svc.code ?? svc.slug ?? ""] ?? svc.price;
  }

  function handleSlider(svc: Service, e: React.ChangeEvent<HTMLInputElement>) {
    const newPrice = snapPrice(Number(e.target.value));
    const key = svc.code ?? svc.slug ?? svc.id;
    setOverrides(prev => ({ ...prev, [key]: newPrice }));
    clearTimeout(timers.current[key]);
    setPending(prev => ({ ...prev, [key]: true }));
    timers.current[key] = setTimeout(() => {
      updateMutation.mutate({ code: svc.code ?? svc.slug ?? "", price: newPrice });
      setPending(prev => ({ ...prev, [key]: false }));
    }, 800);
  }

  function handlePreset(svc: Service, price: number) {
    const key = svc.code ?? svc.slug ?? svc.id;
    clearTimeout(timers.current[key]);
    setPending(prev => ({ ...prev, [key]: false }));
    setOverrides(prev => ({ ...prev, [key]: price }));
    updateMutation.mutate({ code: svc.code ?? svc.slug ?? "", price });
  }

  function handleSave(svc: Service) {
    const key = svc.code ?? svc.slug ?? svc.id;
    clearTimeout(timers.current[key]);
    setPending(prev => ({ ...prev, [key]: false }));
    updateMutation.mutate({ code: svc.code ?? svc.slug ?? "", price: getPrice(svc) });
  }

  const isSaving    = (svc: Service) => updateMutation.isPending && (updateMutation.variables as any)?.code === (svc.code ?? svc.slug);
  const isPending   = (svc: Service) => pending[svc.code ?? svc.slug ?? svc.id] ?? false;
  const isFlashSaving = (svc: Service) => flashMutation.isPending && (flashMutation.variables as any)?.code === (svc.code ?? svc.slug);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-4">
          <h1 className="text-2xl font-bold">Pricing Control</h1>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
      </AdminLayout>
    );
  }

  const groups = services.reduce<Record<string, Service[]>>((acc, svc) => {
    const cat = svc.category ?? "General";
    (acc[cat] ??= []).push(svc);
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-8" data-testid="admin-pricing-page">
        <div className="flex items-center gap-3">
          <DollarSign className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Pricing Control</h1>
        </div>

        {Object.entries(groups).map(([category, svcs]) => (
          <section key={category}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              {category}
            </h2>

            <div className="space-y-4">
              {svcs.map(svc => {
                const currentPrice  = getPrice(svc);
                const code          = svc.code ?? svc.slug ?? svc.id;
                const dirty         = currentPrice !== svc.price;
                const sliderValue   = ALLOWED_PRICES.includes(currentPrice) ? currentPrice : snapPrice(currentPrice);
                const flashState    = getFlashState(code, svc);
                const salePreview   = calcFinalPrice({
                  price:           currentPrice,
                  flashSale:       flashState.enabled,
                  discountPercent: flashState.discount,
                  saleStart:       null,
                  saleEnd:         computeSaleEnd(flashState),
                });

                return (
                  <Card key={code} data-testid={`card-service-${code}`}>
                    <CardHeader className="pb-2 flex flex-row items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-base">{svc.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">{code}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {svc.badge && <Badge variant="secondary">{svc.badge}</Badge>}
                        {(svc as any).flashSale && (
                          <Badge className="bg-red-500 text-white text-xs">🔥 FLASH SALE</Badge>
                        )}
                        {!(svc as any).isActive && <Badge variant="destructive">Inactive</Badge>}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* ── Price slider ── */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            DB price:{" "}
                            <span className="font-medium text-foreground">
                              {svc.price === 0 ? "Free" : `KES ${svc.price.toLocaleString()}`}
                            </span>
                          </span>
                          <div className={`p-2 rounded ${currentPrice < 200 ? "bg-green-100 dark:bg-green-900/40" : currentPrice < 1000 ? "bg-yellow-100 dark:bg-yellow-900/40" : "bg-red-100 dark:bg-red-900/40"}`}>
                            <span className={`font-bold text-lg ${dirty ? "text-primary" : "text-foreground"}`} data-testid={`text-price-${code}`}>
                              {currentPrice === 0 ? "Free" : `KES ${currentPrice.toLocaleString()}`}
                            </span>
                          </div>
                        </div>

                        <input
                          type="range" min={SLIDER_MIN} max={SLIDER_MAX} step={1} value={sliderValue}
                          onChange={e => handleSlider(svc, e)}
                          className="w-full accent-primary" data-testid={`slider-price-${code}`}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground select-none">
                          {ALLOWED_PRICES.map(p => (
                            <span key={p} className={p === sliderValue ? "text-primary font-semibold" : ""}>
                              {p >= 1000 ? `${p / 1000}k` : p}
                            </span>
                          ))}
                        </div>

                        <div className="flex gap-2" data-testid={`presets-${code}`}>
                          {[{ label: "🔥 Cheap", price: 99, cls: "bg-green-100 hover:bg-green-200 dark:bg-green-900/40 dark:hover:bg-green-800/60 text-green-800 dark:text-green-300" },
                            { label: "⚡ Standard", price: 499, cls: "bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:hover:bg-yellow-800/60 text-yellow-800 dark:text-yellow-300" },
                            { label: "💎 Premium", price: 999, cls: "bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-800/60 text-red-800 dark:text-red-300" },
                          ].map(preset => (
                            <button
                              key={preset.price}
                              onClick={() => handlePreset(svc, preset.price)}
                              disabled={isSaving(svc)}
                              data-testid={`button-preset-${preset.label.split(" ")[1].toLowerCase()}-${code}`}
                              className={`flex-1 text-sm py-1.5 px-2 rounded font-medium transition-colors disabled:opacity-50 ${preset.cls}`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        <Button
                          size="sm" disabled={(!dirty && !isPending(svc)) || isSaving(svc)}
                          onClick={() => handleSave(svc)} data-testid={`button-save-${code}`} className="w-full"
                        >
                          {isSaving(svc) ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                          : isPending(svc) ? <><Clock className="mr-2 h-4 w-4 animate-pulse" />{`Auto-saving — KES ${currentPrice.toLocaleString()}`}</>
                          : <><Save className="mr-2 h-4 w-4" />{dirty ? `Save — KES ${currentPrice.toLocaleString()}` : "No changes"}</>}
                        </Button>
                      </div>

                      {/* ── Flash Sale panel ── */}
                      <div className={`rounded-lg border-2 transition-colors ${flashState.enabled ? "border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-950/20" : "border-dashed border-muted-foreground/30"} p-3 space-y-3`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold flex items-center gap-1.5">
                            <Zap className={`h-4 w-4 ${flashState.enabled ? "text-red-500" : "text-muted-foreground"}`} />
                            Flash Sale
                          </span>
                          <button
                            data-testid={`toggle-flash-${code}`}
                            onClick={() => setFlash(code, { enabled: !flashState.enabled })}
                            className={`relative inline-flex h-6 w-11 rounded-full transition-colors focus:outline-none ${flashState.enabled ? "bg-red-500" : "bg-muted"}`}
                            aria-label={flashState.enabled ? "Disable flash sale" : "Enable flash sale"}
                          >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${flashState.enabled ? "translate-x-5.5" : "translate-x-0.5"}`} />
                          </button>
                        </div>

                        {flashState.enabled && (
                          <>
                            {/* Discount percent */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Discount</span>
                                <span className="font-bold text-red-600 dark:text-red-400 text-sm">{flashState.discount}% OFF</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {DISCOUNT_STEPS.map(pct => (
                                  <button
                                    key={pct}
                                    data-testid={`button-discount-${pct}-${code}`}
                                    onClick={() => setFlash(code, { discount: pct })}
                                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${flashState.discount === pct ? "bg-red-500 text-white border-red-500" : "border-muted-foreground/30 hover:border-red-400 hover:text-red-600"}`}
                                  >
                                    {pct}%
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Duration */}
                            <div className="space-y-1.5">
                              <span className="text-xs text-muted-foreground">Duration</span>
                              <div className="flex flex-wrap gap-1.5">
                                {QUICK_DURATIONS.map(d => (
                                  <button
                                    key={d.label}
                                    data-testid={`button-duration-${d.label}-${code}`}
                                    onClick={() => setFlash(code, { endsIn: d.label })}
                                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${flashState.endsIn === d.label ? "bg-orange-500 text-white border-orange-500" : "border-muted-foreground/30 hover:border-orange-400"}`}
                                  >
                                    {d.label}
                                  </button>
                                ))}
                                <button
                                  data-testid={`button-duration-custom-${code}`}
                                  onClick={() => setFlash(code, { endsIn: "custom" })}
                                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${flashState.endsIn === "custom" ? "bg-orange-500 text-white border-orange-500" : "border-muted-foreground/30 hover:border-orange-400"}`}
                                >
                                  Custom
                                </button>
                              </div>
                              {flashState.endsIn === "custom" && (
                                <input
                                  type="datetime-local"
                                  value={flashState.customEnd ? flashState.customEnd.slice(0, 16) : ""}
                                  onChange={e => setFlash(code, { customEnd: e.target.value ? new Date(e.target.value).toISOString() : "" })}
                                  className="text-xs border rounded px-2 py-1 w-full"
                                  data-testid={`input-custom-end-${code}`}
                                />
                              )}
                            </div>

                            {/* Preview */}
                            <div className="rounded bg-white dark:bg-background border px-3 py-2 text-xs space-y-0.5">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Original</span>
                                <span className="line-through text-muted-foreground">KES {currentPrice.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-red-600 dark:text-red-400">Flash price</span>
                                <span className="font-bold text-red-600 dark:text-red-400 text-sm">KES {salePreview.finalPrice.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Savings</span>
                                <span className="font-semibold text-green-600 dark:text-green-400">KES {salePreview.savings.toLocaleString()}</span>
                              </div>
                            </div>
                          </>
                        )}

                        <Button
                          size="sm"
                          onClick={() => handleFlashSave(svc)}
                          disabled={isFlashSaving(svc)}
                          data-testid={`button-flash-save-${code}`}
                          className={`w-full ${flashState.enabled ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
                          variant={flashState.enabled ? "default" : "outline"}
                        >
                          {isFlashSaving(svc)
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                            : flashState.enabled
                              ? <><Zap className="mr-2 h-4 w-4" />Activate Flash Sale</>
                              : <><X className="mr-2 h-4 w-4" />End Flash Sale</>}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </AdminLayout>
  );
}
