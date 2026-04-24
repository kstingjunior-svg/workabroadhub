import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Globe, FileText, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

export default function TermsOfService() {
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
            <FileText className="h-12 w-12 text-primary mx-auto" />
            <h1 className="text-3xl font-serif font-bold">Terms of Service</h1>
            <p className="text-muted-foreground">Last updated: February 2026</p>
          </div>

          <Card className="border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-800 dark:text-amber-200">Important Legal Notice</h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    WorkAbroad Hub is a professional career consultation service. We do NOT sell jobs, visas, or guarantee employment. 
                    We provide personalized career guidance, 1-on-1 consultation via WhatsApp, and access to curated job portal resources.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-8 prose prose-sm max-w-none dark:prose-invert">
              <h2>1. Nature of the Platform & Service Description</h2>
              <p>
                These Terms and Conditions ("Terms") govern your access to and use of WorkAbroad Hub ("the Platform"),
                operated in Kenya. By accessing, registering, or using this application, you agree to be legally bound
                by these Terms. If you do not agree, do not use the app.
              </p>
              <p>
                WorkAbroad Hub is a digital platform that provides career consultation services, information,
                and facilitation services including:
              </p>
              <ul>
                <li><strong>1-on-1 WhatsApp consultation</strong> with a career advisor</li>
                <li><strong>Personalized country and job recommendations</strong> based on your profile</li>
                <li>Curated links to official, third-party job portals</li>
                <li>Career guidance resources and educational content</li>
                <li>NEA Licensed Agency verification information</li>
                <li>Optional premium career services (CV writing, interview coaching, etc.)</li>
              </ul>
              <p>
                <strong>We are NOT:</strong>
              </p>
              <ul>
                <li>A bank or financial institution</li>
                <li>A money remittance service</li>
                <li>An employer, recruiter, or job agency</li>
              </ul>
              <p>
                <strong>We explicitly do NOT:</strong>
              </p>
              <ul>
                <li>Operate as a recruitment agency</li>
                <li>Guarantee job placement or employment</li>
                <li>Process visa applications</li>
                <li>Make hiring decisions on behalf of employers</li>
                <li>Guarantee admission to educational institutions</li>
              </ul>
              <p>
                Payments made through the app are service/access fees only and do not guarantee outcomes,
                approvals, employment, visas, or services from third parties.
              </p>

              <h2>2. User Eligibility</h2>
              <p>You must be:</p>
              <ul>
                <li>At least <strong>18 years of age</strong></li>
                <li>Legally capable of entering a binding contract under Kenyan law</li>
              </ul>
              <p>
                You confirm that all information you provide is true, accurate, and complete.
                We do not knowingly provide services to individuals under 18 years of age. If we learn
                that a user is under 18, we reserve the right to terminate their account and delete their data.
              </p>

              <h2>3. User Accounts & Responsibilities</h2>
              <p>You are responsible for:</p>
              <ul>
                <li>Maintaining the confidentiality of your account</li>
                <li>All activity conducted under your account</li>
                <li>Providing accurate information when using our services</li>
                <li>Applying to jobs directly on third-party platforms at your own discretion</li>
                <li>Verifying all opportunities independently before proceeding</li>
                <li>Reporting suspicious activities or potential scams</li>
              </ul>

              <h2>4. Career Consultation Service Fee</h2>
              <ul>
                <li>The consultation service fee is a one-time payment of KES 4,500</li>
                <li>This fee covers: (a) 1-on-1 WhatsApp consultation session with a career advisor, (b) Personalized country and job recommendations, (c) Access to all country dashboards and job portal resources for as long as the service remains available</li>
                <li>Your WhatsApp consultation session will be scheduled within 24-48 hours of payment</li>
                <li>Premium career services (CV writing, interview coaching) are charged separately</li>
                <li>All payments are non-refundable once consultation services are initiated</li>
                <li>Refund requests may be considered within 7 days if no consultation session was conducted</li>
              </ul>

              <h2>5. Payments & Payment Disclaimer</h2>
              <p>
                Payments are processed exclusively via <strong>M-Pesa</strong> (Safaricom Paybill 4153025).
                These payments are for real-world professional services delivered
                outside the app (e.g., via WhatsApp), and are <strong>not</strong> processed through Google Play
                or any in-app purchase system.
              </p>
              <p><strong>We:</strong></p>
              <ul>
                <li>Do <strong>NOT</strong> store your M-Pesa PIN or payment credentials</li>
                <li>Do <strong>NOT</strong> access your M-Pesa account directly</li>
                <li>Do <strong>NOT</strong> hold customer funds</li>
              </ul>
              <p><strong>All payments are:</strong></p>
              <ul>
                <li>Final and non-refundable, unless explicitly stated otherwise in our <a href="/refund-policy">Refund Policy</a></li>
                <li>Subject to Safaricom M-Pesa terms and conditions</li>
              </ul>
              <p>By making a payment, you acknowledge and agree that:</p>
              <ul>
                <li>The payment is processed directly by M-Pesa (Safaricom), not by Google Play</li>
                <li>Payment confirms access to platform services only</li>
                <li>Payment does not guarantee results or third-party actions</li>
                <li>This payment covers a professional consultation service, not digital content or in-app features</li>
                <li>The consultation service is delivered via WhatsApp, outside of this application</li>
                <li>Access to online resources is provided as a supplementary benefit of the consultation service</li>
              </ul>

              <h2>5a. Refunds & Disputes</h2>
              <p>
                Refunds are not automatic and will only be considered if:
              </p>
              <ul>
                <li>A proven system error occurred</li>
                <li>Payment was debited without service access being granted</li>
                <li>Your request is submitted within 7 days and no consultation was initiated (see <a href="/refund-policy">Refund Policy</a>)</li>
              </ul>
              <p>
                Payment disputes must be reported within 48 hours of payment. Any decision on refunds
                by WorkAbroad Hub shall be final. For full details, see our <a href="/refund-policy">Refund Policy</a>.
              </p>

              <h2>6. Third-Party Links and Content</h2>
              <p>
                The Platform contains links to external job portals, government websites, and other 
                third-party resources. We are not responsible for:
              </p>
              <ul>
                <li>The accuracy of job listings on third-party sites</li>
                <li>The hiring practices of employers</li>
                <li>Changes to external websites or their availability</li>
                <li>Any transactions or agreements made on external platforms</li>
              </ul>

              <h2>7. NEA Agency Information</h2>
              <p>
                We provide information about NEA-licensed employment agencies for verification purposes only. 
                Users should independently verify agency credentials with the National Employment Authority 
                before engaging their services.
              </p>

              <h2>8. Assisted Apply Mode</h2>
              <p>
                Our Assisted Apply service helps prepare application materials. However:
              </p>
              <ul>
                <li>Users submit applications themselves to third-party platforms</li>
                <li>We do not submit applications on behalf of users</li>
                <li>We do not guarantee application success or job offers</li>
                <li>Users are responsible for all information in their applications</li>
              </ul>

              <h2>9. Student Visa Information</h2>
              <p>
                Student visa information is provided for educational purposes only. We do not:
              </p>
              <ul>
                <li>Process visa applications</li>
                <li>Guarantee visa approval</li>
                <li>Guarantee admission to educational institutions</li>
                <li>Provide legal immigration advice</li>
              </ul>

              <h2>10. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by Kenyan law, WorkAbroad Hub shall not be liable for:
              </p>
              <ul>
                <li>Job application outcomes or rejections</li>
                <li>Visa denials or immigration issues</li>
                <li>Financial losses from job scams encountered elsewhere</li>
                <li>Actions of employers, agencies, or third parties</li>
                <li>Indirect, incidental, special, or consequential damages</li>
                <li>Loss of profits, data, or business opportunities</li>
              </ul>
              <p>
                In no event shall WorkAbroad Hub's total aggregate liability to you for all claims arising out of or 
                relating to these terms or the use of our services exceed the amount you paid to WorkAbroad Hub 
                in the twelve (12) months preceding the event giving rise to the claim. This limitation applies 
                regardless of the form of action, whether in contract, tort, strict liability, or otherwise.
              </p>

              <h2>10a. Indemnification</h2>
              <p>
                You agree to indemnify, defend, and hold harmless WorkAbroad Hub, its officers, directors, 
                employees, and agents from and against any claims, liabilities, damages, losses, and expenses 
                (including reasonable legal fees) arising out of or in connection with: (a) your use of the 
                Platform; (b) your violation of these Terms; (c) your violation of any rights of a third party; 
                or (d) any information you provide through the Platform.
              </p>

              <h2>11. User Conduct Policy</h2>
              <p>Users of WorkAbroad Hub must adhere to the following standards of conduct:</p>
              <ul>
                <li>Do not use the platform to promote, facilitate, or engage in fraudulent schemes, scams, or deceptive practices</li>
                <li>Do not impersonate any person, organization, or government entity</li>
                <li>Do not post, share, or distribute misleading job offers, fake visa opportunities, or fraudulent recruitment content</li>
                <li>Do not harass, threaten, or abuse other users, staff, or career advisors</li>
                <li>Do not attempt to circumvent payment systems, exploit referral programs, or engage in unauthorized commercial activity</li>
                <li>Do not upload malicious content, viruses, or harmful code</li>
                <li>Do not use automated tools, bots, or scrapers to access the platform</li>
                <li>Do not collect, harvest, or store other users' personal information without consent</li>
              </ul>
              <p>
                Violation of this conduct policy may result in immediate suspension or permanent termination of your account without prior notice or refund.
              </p>

              <h2>12. Content Moderation</h2>
              <p>
                WorkAbroad Hub reserves the right to review, moderate, and remove any user-generated content that violates these terms or applicable law. Our content moderation practices include:
              </p>
              <ul>
                <li>All job portal links are curated and regularly reviewed by our team for accuracy and legitimacy</li>
                <li>User-submitted reports of fraudulent agencies or job listings are investigated promptly</li>
                <li>NEA agency data is verified against official records and updated periodically</li>
                <li>Career service deliverables undergo quality review before final delivery</li>
                <li>We remove or flag content that is misleading, harmful, or violates our policies</li>
              </ul>
              <p>
                To report content that violates our policies, contact us at support@workabroadhub.tech or use the in-app abuse reporting feature.
              </p>

              <h2>13. Abuse Reporting</h2>
              <p>
                If you encounter scams, fraudulent job offers, suspicious agencies, or any abuse on or related to our platform, you can report it through the following channels:
              </p>
              <ul>
                <li>Email: support@workabroadhub.tech (subject line: "Abuse Report")</li>
                <li>WhatsApp: +254 742 619777</li>
              </ul>
              <p>
                All reports are reviewed within 48 business hours. We take user safety seriously and will take appropriate action, including content removal, account suspension, and reporting to relevant authorities where applicable.
              </p>

              <h2>14. Suspension & Account Termination</h2>
              <p>
                We may suspend or terminate your access:
              </p>
              <ul>
                <li><strong>Without notice</strong> for serious violations (fraud, scams, harassment, illegal activity)</li>
                <li><strong>With notice</strong> for general policy breaches</li>
              </ul>
              <p>
                Termination does not waive any accrued obligations. We reserve the right to suspend or terminate accounts that:
              </p>
              <ul>
                <li>Violate these terms of service or user conduct policy</li>
                <li>Engage in fraudulent activities</li>
                <li>Attempt to manipulate or abuse the platform</li>
                <li>Provide false information</li>
              </ul>

              <h2>15. Modifications</h2>
              <p>
                We may modify these terms at any time. Continued use of the Platform after changes 
                constitutes acceptance of the new terms.
              </p>

              <h2>16. Governing Law & Dispute Resolution</h2>
              <p>
                These terms are governed by and construed in accordance with the laws of the Republic of Kenya.
              </p>
              <p>
                <strong>Dispute Resolution:</strong> Any dispute, controversy, or claim arising out of or relating 
                to these Terms shall be resolved through the following process:
              </p>
              <ul>
                <li><strong>Step 1 - Direct Resolution:</strong> Contact our support team at support@workabroadhub.tech. We will endeavor to resolve your complaint within 14 business days.</li>
                <li><strong>Step 2 - Mediation:</strong> If the dispute cannot be resolved directly, either party may refer the matter to mediation under the Mediation Act, 2012 of Kenya, administered by the Chartered Institute of Arbitrators (Kenya Branch) or a mutually agreed mediator.</li>
                <li><strong>Step 3 - Courts:</strong> If mediation fails, the dispute shall be submitted to the exclusive jurisdiction of the courts of Kenya, specifically the Milimani Commercial Courts in Nairobi.</li>
              </ul>
              <p>
                Nothing in this clause prevents you from filing a complaint with the Office of the Data Protection 
                Commissioner (ODPC) regarding data protection matters, or with any other relevant regulatory authority.
              </p>

              <h2>17. Contact Information</h2>
              <p>
                For support or legal inquiries:
              </p>
              <ul>
                <li><strong>Email:</strong> <a href="mailto:support@workabroadhub.tech">support@workabroadhub.tech</a></li>
                <li><strong>Phone/WhatsApp:</strong> +254 742 619777</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
