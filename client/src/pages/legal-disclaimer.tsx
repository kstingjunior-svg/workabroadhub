import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, AlertTriangle, Shield } from "lucide-react";
import { Link } from "wouter";

export default function LegalDisclaimer() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="WorkAbroad Hub" className="h-8 w-8 rounded-lg object-cover" />
              <span className="font-semibold text-lg">WorkAbroad Hub</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-8">
          <div className="text-center space-y-4">
            <Shield className="h-12 w-12 text-primary mx-auto" />
            <h1 className="text-3xl font-serif font-bold" data-testid="text-disclaimer-title">Legal Disclaimer & Limitation of Responsibility</h1>
            <p className="text-muted-foreground">Last updated: February 2026</p>
          </div>

          <Card className="border-red-500/20 bg-red-50/50 dark:bg-red-950/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-800 dark:text-red-200" data-testid="text-important-notice">Important Notice - Please Read Carefully</h3>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    This disclaimer applies to WorkAbroad Hub, operated by Exovia Connect, a company registered in Kenya.
                    By accessing, registering, or making any payment on this platform, you acknowledge, understand, and agree to the following.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-8 prose prose-sm max-w-none dark:prose-invert">
              <h2>1. No Guarantees, Promises, or Assurances</h2>
              <p>WorkAbroad Hub <strong>does NOT guarantee:</strong></p>
              <ul>
                <li>Employment, jobs, visas, work permits, or overseas placement</li>
                <li>Approval by any employer, agent, embassy, government, or third party</li>
                <li>Financial gain, income, or return on payment made</li>
                <li>Accuracy, reliability, or outcomes of third-party information</li>
              </ul>
              <p>
                Any examples, testimonials, success stories, or illustrations do NOT constitute a promise
                or guarantee and should not be relied upon as such.
              </p>

              <h2>2. Platform Role & Limitation</h2>
              <p>WorkAbroad Hub is a <strong>digital information and access platform only</strong>.</p>
              <p>We are <strong>NOT:</strong></p>
              <ul>
                <li>A recruitment agency</li>
                <li>A migration or visa consultancy</li>
                <li>An employer or contractor</li>
                <li>A financial institution or payment service provider</li>
              </ul>
              <p>
                Payments made on the platform are strictly for access to digital services or platform
                features only.
              </p>

              <h2>3. Payment Disclaimer (M-Pesa)</h2>
              <p>Payments are processed exclusively via <strong>Safaricom M-Pesa</strong> (Paybill 4153025). We do not store M-Pesa PINs or any payment credentials.</p>
              <p>We:</p>
              <ul>
                <li>Do <strong>NOT</strong> control Safaricom M-Pesa systems</li>
                <li>Do <strong>NOT</strong> store your PIN or payment credentials</li>
                <li>Do <strong>NOT</strong> hold or escrow user funds</li>
              </ul>
              <p>Once payment is made:</p>
              <ul>
                <li>It is deemed voluntary and informed</li>
                <li>It is non-refundable, except where required by law or proven system failure (see our <a href="/refund-policy">Refund Policy</a>)</li>
              </ul>

              <h2>4. Third-Party Risks & User Responsibility</h2>
              <p>
                The platform may reference or connect users to third parties, including agents, recruiters,
                or service providers.
              </p>
              <p>We:</p>
              <ul>
                <li>Do <strong>NOT</strong> endorse, verify, or supervise third parties</li>
                <li>Are <strong>NOT</strong> responsible for their conduct, promises, or actions</li>
                <li>Are <strong>NOT</strong> liable for losses, fraud, or disputes involving third parties</li>
              </ul>
              <p>Users are solely responsible for:</p>
              <ul>
                <li>Conducting due diligence</li>
                <li>Verifying legitimacy of third parties</li>
                <li>Making independent decisions</li>
              </ul>

              <h2>5. Assumption of Risk</h2>
              <p>You expressly acknowledge that:</p>
              <ul>
                <li>You use the platform at your own risk</li>
                <li>You understand the risks associated with online services and third parties</li>
                <li>You assume full responsibility for decisions made using information from the platform</li>
              </ul>

              <h2>6. Limitation of Liability (Maximum Protection)</h2>
              <p>
                To the maximum extent permitted under Kenyan law, Exovia Connect, its directors, officers,
                employees, and partners shall <strong>NOT</strong> be liable for:
              </p>
              <ul>
                <li>Direct or indirect losses</li>
                <li>Loss of income, opportunity, or employment</li>
                <li>Emotional distress or expectations</li>
                <li>Consequential or incidental damages</li>
              </ul>
              <p>
                Our total liability, if any, shall <strong>NOT exceed</strong> the amount paid by the
                user to access the platform.
              </p>

              <h2>7. No Legal, Financial, or Immigration Advice</h2>
              <p>Information provided on the platform is general in nature.</p>
              <p>It does <strong>NOT</strong> constitute:</p>
              <ul>
                <li>Legal advice</li>
                <li>Financial advice</li>
                <li>Immigration or travel advice</li>
              </ul>
              <p>Users are advised to seek independent professional advice where necessary.</p>

              <h2>8. Fraud Warnings & User Awareness</h2>
              <p>We do <strong>NOT</strong> request:</p>
              <ul>
                <li>Payments outside the app</li>
                <li>Cash, gift cards, or crypto</li>
                <li>Personal M-Pesa PINs or OTPs</li>
              </ul>
              <p>
                Any person claiming to represent WorkAbroad Hub outside official channels should be treated
                as a potential fraudster. Report suspicious activity immediately via our{" "}
                <a href="/report-abuse">abuse reporting page</a>.
              </p>

              <h2>9. Regulatory & Compliance Notice</h2>
              <p>
                WorkAbroad Hub is not licensed by the Central Bank of Kenya as a payment service provider.
                We operate as a digital platform using third-party payment services (Safaricom M-Pesa).
              </p>
              <p>
                We process personal data in accordance with the Kenya Data Protection Act, 2019.
                Full details are outlined in our <a href="/privacy-policy">Privacy Policy</a>.
              </p>

              <h2>10. Acceptance & Legal Effect</h2>
              <p>By using this platform, you:</p>
              <ul>
                <li>Confirm you have read and understood this disclaimer</li>
                <li>Waive claims based on unmet expectations</li>
                <li>Agree that this disclaimer is legally binding</li>
              </ul>
              <p>
                These terms are governed by the laws of the Republic of Kenya. For full terms, see our{" "}
                <a href="/terms-of-service">Terms of Service</a>.
              </p>
            </CardContent>
          </Card>

          <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-amber-800 dark:text-amber-200" data-testid="text-final-warning">Final Warning</h3>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mt-1">
                    Do not make any payment on this platform expecting guaranteed results.
                    If you do not agree with this disclaimer, do not use the app.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground space-y-2">
            <p>
              <a href="/terms-of-service" className="text-primary underline" data-testid="link-terms">Terms of Service</a>
              {" | "}
              <a href="/privacy-policy" className="text-primary underline" data-testid="link-privacy">Privacy Policy</a>
              {" | "}
              <a href="/refund-policy" className="text-primary underline" data-testid="link-refund">Refund Policy</a>
            </p>
            <p>Operated by Exovia Connect, Kenya</p>
          </div>
        </div>
      </main>
    </div>
  );
}
