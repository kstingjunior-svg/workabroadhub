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

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] bg-card border-t shadow-lg"
      role="dialog"
      aria-label="Data collection consent"
      data-testid="banner-data-consent"
    >
      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5 hidden sm:block" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">
              We collect personal data (name, email, phone number, usage analytics) to provide our career
              consultation services. Your data is processed in accordance with the{" "}
              <Link href="/privacy-policy" className="text-primary underline" data-testid="link-consent-privacy">
                Kenya Data Protection Act, 2019
              </Link>
              . By continuing, you consent to our data collection practices as described in our{" "}
              <Link href="/privacy-policy" className="text-primary underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDecline}
              data-testid="button-consent-decline"
            >
              Decline
            </Button>
            <Button
              size="sm"
              onClick={handleAccept}
              data-testid="button-consent-accept"
              className="flex-1 sm:flex-none"
            >
              Accept
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
