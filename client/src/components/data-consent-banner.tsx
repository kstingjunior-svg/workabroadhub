import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { Link } from "wouter";

const CONSENT_KEY = "workabroad-data-consent";

export function DataConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setShowBanner(false);
  };

  const handleDecline = () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    setShowBanner(false);
  };

  if (!showBanner) return null;

  // 2026-08 (Tony's "scaring clients" report): the previous banner listed
  // exactly what data we collect and cited the Kenya Data Protection Act —
  // legally correct, but Kenyan users were misreading it as "this site is
  // taking my personal information" and abandoning signup. Replaced with a
  // slim, friendly one-liner that still records consent (for compliance) but
  // doesn't scare anyone off. Full details still available at /terms and
  // /privacy-policy for users who want them.
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] bg-card border-t shadow-lg"
      role="dialog"
      aria-label="Terms consent"
      data-testid="banner-data-consent"
    >
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3 text-sm">
        <span className="flex-1 min-w-0 text-foreground">
          By continuing you agree to our{" "}
          <Link href="/terms-of-service" className="text-primary underline font-medium">
            Terms &amp; Conditions
          </Link>
          .
        </span>
        <Button
          size="sm"
          onClick={handleAccept}
          data-testid="button-consent-accept"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
