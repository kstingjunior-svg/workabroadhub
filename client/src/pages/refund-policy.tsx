import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Shield, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

export default function RefundPolicy() {
  return (
    <div className="min-h-screen bg-background" data-testid="page-refund-policy">
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
            <h1 className="text-3xl font-serif font-bold" data-testid="text-refund-policy-title">Refund Policy</h1>
            <p className="text-muted-foreground" data-testid="text-last-updated">Last updated: February 2026</p>
          </div>

          <Card className="border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-800 dark:text-amber-200" data-testid="text-disclaimer-heading">Important Disclaimer</h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1" data-testid="text-disclaimer-body">
                    WorkAbroad Hub is a career consultation service. We do not sell jobs, visas, or guarantee employment.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-8 prose prose-sm max-w-none dark:prose-invert">
              <h2>1. Scope</h2>
              <p>
                This Refund Policy applies to the KES 4,500 one-time career consultation service fee
                charged by WorkAbroad Hub. This fee covers a 1-on-1 WhatsApp consultation session with
                a career advisor, personalized country and job recommendations, and access to curated
                career resources.
              </p>

              <h2>2. Eligibility for Refunds</h2>
              <p>
                You may request a refund of the KES 4,500 career consultation service fee if:
              </p>
              <ul>
                <li>Your refund request is submitted within <strong>7 days</strong> of your payment date</li>
                <li>No WhatsApp consultation session has been conducted, initiated, or scheduled on your behalf</li>
              </ul>

              <h2>3. Non-Refundable Conditions</h2>
              <p>
                The KES 4,500 career consultation service fee is <strong>non-refundable</strong> under the
                following circumstances:
              </p>
              <ul>
                <li>A WhatsApp consultation session has already been initiated or scheduled</li>
                <li>A WhatsApp consultation session has been conducted (partially or fully)</li>
                <li>The 7-day refund request window has elapsed</li>
              </ul>

              <h2>4. Premium Services</h2>
              <p>
                Premium career services, including but not limited to CV writing, cover letter preparation,
                interview coaching, and LinkedIn profile optimization, are <strong>non-refundable</strong> once
                work has begun on the deliverables. If a premium service order has been placed but work has
                not yet started, you may request cancellation by contacting our support team.
              </p>

              <h2>5. Assisted Apply Packs</h2>
              <p>
                Assisted Apply packs are <strong>non-refundable</strong> once document preparation has started.
                This includes any research, drafting, or customization of application materials undertaken on
                your behalf. If no document preparation has commenced, you may request a cancellation.
              </p>

              <h2>6. How to Request a Refund</h2>
              <p>
                To request a refund, send an email to{" "}
                <a href="mailto:support@workabroadhub.tech" data-testid="link-support-email">support@workabroadhub.tech</a>{" "}
                with the following information:
              </p>
              <ul>
                <li>Your M-Pesa payment reference or transaction code</li>
                <li>The phone number used for payment</li>
                <li>The date of payment</li>
                <li>The reason for your refund request</li>
              </ul>

              <h2>7. Processing Time</h2>
              <p>
                Approved refunds will be processed within <strong>14 business days</strong> via M-Pesa to the
                phone number used for the original payment. You will receive a confirmation once the refund
                has been issued.
              </p>

              <h2>8. Changes to This Policy</h2>
              <p>
                We may update this Refund Policy from time to time. Any changes will be posted on this page
                with an updated revision date. Continued use of our services after changes constitutes
                acceptance of the revised policy.
              </p>

              <h2>9. Contact</h2>
              <p>
                For refund inquiries or questions about this policy, please contact us at:{" "}
                <a href="mailto:support@workabroadhub.tech" data-testid="link-contact-email">support@workabroadhub.tech</a>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
