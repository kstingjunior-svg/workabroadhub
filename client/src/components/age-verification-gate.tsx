import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";

const AGE_VERIFIED_KEY = "workabroad-age-verified";

const EXEMPT_PATHS = ["/privacy-policy", "/terms-of-service", "/referral-terms", "/legal-disclaimer", "/refund-policy"];

export function useAgeVerification() {
  const [isVerified, setIsVerified] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(AGE_VERIFIED_KEY) === "true";
  });

  const verify = () => {
    localStorage.setItem(AGE_VERIFIED_KEY, "true");
    setIsVerified(true);
  };

  const decline = () => {
    setIsVerified(false);
  };

  return { isVerified, verify, decline };
}

interface AgeVerificationGateProps {
  children: React.ReactNode;
}

export function AgeVerificationGate({ children }: AgeVerificationGateProps) {
  const { isVerified, verify } = useAgeVerification();
  const [declined, setDeclined] = useState(false);
  const [location] = useLocation();

  const isExemptPath = EXEMPT_PATHS.some(path => location.startsWith(path));

  if (isVerified || isExemptPath) {
    return <>{children}</>;
  }

  if (declined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-bold" data-testid="text-age-declined-title">Access Restricted</h2>
            <p className="text-muted-foreground text-sm">
              You must be at least 18 years old to use WorkAbroad Hub. This service involves employment-related consultation and financial transactions that require users to be of legal age.
            </p>
            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={() => setDeclined(false)}
                data-testid="button-age-go-back"
              >
                Go Back
              </Button>
              <p className="text-xs text-muted-foreground">
                You can still view our{" "}
                <a href="/privacy-policy" className="text-primary underline">Privacy Policy</a>{" "}
                and{" "}
                <a href="/terms-of-service" className="text-primary underline">Terms of Service</a>.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-3">
            <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto">
              <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-xl font-bold" data-testid="text-age-verification-title">Age Verification Required</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              WorkAbroad Hub provides career consultation services involving financial transactions and employment-related guidance. You must be at least <strong>18 years of age</strong> to use this service.
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground leading-relaxed">
            <p>
              By confirming, you declare that you are 18 years of age or older and agree to our{" "}
              <a href="/terms-of-service" className="text-primary underline">Terms of Service</a>{" "}
              and{" "}
              <a href="/privacy-policy" className="text-primary underline">Privacy Policy</a>.
            </p>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={verify}
              data-testid="button-age-confirm"
            >
              I am 18 or older
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setDeclined(true)}
              data-testid="button-age-decline"
            >
              I am under 18
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
