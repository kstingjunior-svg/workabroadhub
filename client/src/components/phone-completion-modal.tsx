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
import { Phone, ShieldCheck, AlertCircle } from "lucide-react";

// Kenya E.164 without "+": exactly 12 digits starting with 254
const KENYA_RE = /^254\d{9}$/;

// Only suppress on the admin panel; /profile stays blocked (user can update there)
const SUPPRESSED_PATHS = ["/admin"];

/** Strip non-digits, convert leading 0 or +254 to 254, cap at 12 digits */
function normalizeKenya(raw: string): string {
  let v = raw.replace(/[^\d]/g, "");
  if (v.startsWith("0"))   v = "254" + v.slice(1);
  if (v.startsWith("254")) v = v.slice(0, 12);  // cap full number
  else                      v = v.slice(0, 9);   // cap subscriber part only
  return v;
}

/** Given raw input return the formatted display value and the stored E.164 value */
function parseInput(raw: string): { display: string; stored: string } {
  const v = normalizeKenya(raw);
  // If they typed the full number including 254
  if (v.startsWith("254")) {
    const subscriber = v.slice(3); // up to 9 digits
    return { display: subscriber, stored: v };
  }
  return { display: v, stored: v.length === 9 ? "254" + v : "" };
}

export function PhoneCompletionModal() {
  const { user, isLoading: authLoading } = useAuth();
  const [location] = useLocation();
  const [subscriber, setSubscriber] = useState(""); // the 9 digits after +254
  const [error, setError] = useState("");

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
      setError(err?.message || "Failed to save number. Please try again.");
    },
  });

  const isSuppressed = SUPPRESSED_PATHS.some(
    (p) => location === p || location.startsWith(p + "/")
  );

  if (authLoading || profileLoading || !user) return null;
  if (profile?.phone) return null;
  if (isSuppressed) return null;

  /** digits after stripping +254 / 254 / 0 prefix */
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    const raw = e.target.value.replace(/[^\d]/g, "").slice(0, 9);
    setSubscriber(raw);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const stored = "254" + subscriber;
    if (!KENYA_RE.test(stored)) {
      setError("Enter a valid Kenyan number: 9 digits after +254 (e.g. 712 345 678)");
      return;
    }
    saveMutation.mutate(stored);
  }

  const isFull = subscriber.length === 9;

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
            A Kenya (+254) WhatsApp number is required to access services. This is used for
            M-Pesa payment prompts and service delivery.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="phone-input" className="font-semibold">WhatsApp Number (Kenya)</Label>

            {/* Prefix + input side-by-side */}
            <div className="flex items-stretch rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <span
                className="flex items-center px-3 bg-muted text-muted-foreground text-sm font-mono font-semibold border-r border-input select-none shrink-0"
                aria-hidden="true"
              >
                🇰🇪 +254
              </span>
              <Input
                id="phone-input"
                data-testid="input-phone-completion"
                type="tel"
                inputMode="numeric"
                placeholder="712 345 678"
                value={subscriber}
                onChange={handleChange}
                disabled={saveMutation.isPending}
                autoFocus
                className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-base tracking-wider"
                maxLength={9}
              />
            </div>

            {/* Progress dots */}
            <div className="flex gap-1 mt-1">
              {Array.from({ length: 9 }).map((_, i) => (
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
              Kenya numbers only — e.g. <span className="font-mono">+254 712 345 678</span>
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
        </form>
      </DialogContent>
    </Dialog>
  );
}
