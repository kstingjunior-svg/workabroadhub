import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, ShieldCheck, AlertCircle, LogOut } from "lucide-react";

// E.164 without "+", per country
const KENYA_RE = /^254\d{9}$/;
const SA_RE    = /^27\d{9}$/;

// 2026-07: South Africa (+27) added alongside Kenya so SA users can complete
// signup. Each country carries the flag, prefix, subscriber-length and the
// regex the submit handler validates against.
type CountryKey = "KE" | "ZA";
const COUNTRIES: Record<CountryKey, {
  flag: string;
  prefix: string;
  name: string;
  subscriberLength: number;
  regex: RegExp;
  placeholder: string;
}> = {
  KE: { flag: "🇰🇪", prefix: "254", name: "Kenya",        subscriberLength: 9, regex: KENYA_RE, placeholder: "712 345 678" },
  ZA: { flag: "🇿🇦", prefix: "27",  name: "South Africa", subscriberLength: 9, regex: SA_RE,    placeholder: "82 123 4567" },
};

// Only suppress on the admin panel; /profile stays blocked (user can update there)
const SUPPRESSED_PATHS = ["/admin"];

export function PhoneCompletionModal() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const [location] = useLocation();
  const [country, setCountry] = useState<CountryKey>("KE");
  const [subscriber, setSubscriber] = useState(""); // digits after the country prefix
  const [error, setError] = useState("");
  const c = COUNTRIES[country];

  const { data: profile, isLoading: profileLoading } = useQuery<{ phone?: string | null }>({
    queryKey: ["/api/profile"],
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: (phoneNumber: string) =>
      apiRequest("PATCH", "/api/profile", { phone: phoneNumber }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      // 2026-06 FIX: if the server says we're unauthenticated, the user has a
      // stale React Query / browser cache that tells us they're logged in but
      // the actual session is gone (deploy, idle timeout, cookie cleared).
      // Auto-logout + redirect to the homepage so they can sign back in fresh
      // rather than getting trapped in the modal with no way out.
      const looksUnauthenticated =
        msg.toLowerCase().includes("authentication required") ||
        msg.toLowerCase().includes("unauthorized") ||
        msg.toLowerCase().includes("not authenticated") ||
        msg.startsWith("401");
      if (looksUnauthenticated) {
        setError("Your session expired. Signing you out…");
        // Use the existing logout flow — clears query cache + redirects to /
        setTimeout(() => logout(), 800);
        return;
      }
      setError(msg || "Failed to save number. Please try again.");
    },
  });

  const isSuppressed = SUPPRESSED_PATHS.some(
    (p) => location === p || location.startsWith(p + "/")
  );

  if (authLoading || profileLoading || !user) return null;
  if (profile?.phone) return null;
  if (isSuppressed) return null;

  /** digits after stripping the country prefix / leading 0 */
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    const raw = e.target.value.replace(/[^\d]/g, "").slice(0, c.subscriberLength);
    setSubscriber(raw);
  }

  function handleCountryChange(next: CountryKey) {
    setError("");
    setCountry(next);
    setSubscriber("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const stored = c.prefix + subscriber;
    if (!c.regex.test(stored)) {
      setError(
        `Enter a valid ${c.name} number: ${c.subscriberLength} digits after +${c.prefix} ` +
        `(e.g. ${c.placeholder})`,
      );
      return;
    }
    saveMutation.mutate(stored);
  }

  const isFull = subscriber.length === c.subscriberLength;

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-sm"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2.5 rounded-full bg-green-100 dark:bg-green-900/30">
              <Phone className="h-5 w-5 text-green-600" />
            </div>
            <DialogTitle className="text-lg font-bold">Enter WhatsApp Number to Continue</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            A WhatsApp number is required to access services. This is used for
            payment prompts, service delivery and account recovery.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Country picker — Kenya default, South Africa also supported */}
          <div className="space-y-1.5">
            <Label className="font-semibold">Country</Label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Country">
              {(Object.keys(COUNTRIES) as CountryKey[]).map((k) => {
                const opt = COUNTRIES[k];
                const active = country === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => handleCountryChange(k)}
                    className={`flex items-center justify-center gap-2 rounded-md border py-2 text-sm font-semibold transition-colors ${
                      active
                        ? "border-green-500 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200"
                        : "border-input bg-background hover:bg-muted/60"
                    }`}
                    data-testid={`country-${k.toLowerCase()}`}
                  >
                    <span aria-hidden="true">{opt.flag}</span>
                    <span>{opt.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">+{opt.prefix}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone-input" className="font-semibold">
              WhatsApp Number ({c.name})
            </Label>

            {/* Prefix + input side-by-side */}
            <div className="flex items-stretch rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <span
                className="flex items-center px-3 bg-muted text-muted-foreground text-sm font-mono font-semibold border-r border-input select-none shrink-0"
                aria-hidden="true"
              >
                {c.flag} +{c.prefix}
              </span>
              <Input
                id="phone-input"
                data-testid="input-phone-completion"
                type="tel"
                inputMode="numeric"
                placeholder={c.placeholder}
                value={subscriber}
                onChange={handleChange}
                disabled={saveMutation.isPending}
                autoFocus
                className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-base tracking-wider"
                maxLength={c.subscriberLength}
              />
            </div>

            {/* Progress dots */}
            <div className="flex gap-1 mt-1">
              {Array.from({ length: c.subscriberLength }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i < subscriber.length ? "bg-green-500" : "bg-muted"
                  }`}
                />
              ))}
            </div>

            {error && (
              <div className="flex items-start gap-1.5 text-xs text-red-600" data-testid="text-phone-error">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              e.g. <span className="font-mono">+{c.prefix} {c.placeholder}</span>
              {country === "ZA" && (
                <> — payments go through Kenyan M-Pesa; a family or friend's number works.</>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="font-medium">No phone number = no access to services</span>
          </div>

          <Button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
            disabled={saveMutation.isPending || !isFull}
            data-testid="btn-save-phone"
          >
            {saveMutation.isPending ? "Saving…" : "Continue →"}
          </Button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
            <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
            <span>Used only for M-Pesa payment prompts and service notifications. Never shared.</span>
          </div>

          {/* Escape hatch — if the user is somehow stuck (stale session,
              wrong account, etc.) they can always sign out and re-login. */}
          <button
            type="button"
            onClick={() => logout()}
            data-testid="btn-phone-modal-logout"
            className="w-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 py-1"
          >
            <LogOut className="h-3 w-3" />
            Not your account, or stuck? Sign out
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
