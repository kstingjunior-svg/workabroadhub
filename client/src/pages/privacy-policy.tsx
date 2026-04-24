import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Shield } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPolicy() {
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
            <h1 className="text-3xl font-serif font-bold">Privacy Policy</h1>
            <p className="text-muted-foreground">Last Updated: 21/04/2026</p>
          </div>

          <Card>
            <CardContent className="p-8 prose prose-sm max-w-none dark:prose-invert">

              <div className="not-prose mb-6 p-4 rounded-xl border bg-muted/40 text-sm space-y-1">
                <p><strong>Effective Date:</strong> 21 April 2026</p>
                <p><strong>App Name:</strong> WorkAbroad Hub (Exovia Connect)</p>
                <p><strong>Developer / Data Controller:</strong> EXOVIA CONNECT — Kenya</p>
                <p><strong>Contact Email:</strong> <a href="mailto:support@workabroadhub.tech" className="text-primary underline">support@workabroadhub.tech</a></p>
                <p><strong>Privacy / DPO Email:</strong> <a href="mailto:privacy@workabroadhub.tech" className="text-primary underline">privacy@workabroadhub.tech</a></p>
                <p><strong>Website:</strong> workabroadhub.tech</p>
              </div>

              <p>
                This Privacy Policy explains how WorkAbroad Hub, operated by <strong>Exovia Connect</strong> (a company registered in Kenya),
                collects, uses, stores, and protects personal data in compliance with the <strong>Kenya Data Protection Act, 2019 (KDPA)</strong>.
              </p>
              <p>
                By accessing or using this platform, you consent to the collection and processing of your personal data as described below.
              </p>

              <h2>1. Who We Are (Data Controller)</h2>
              <ul>
                <li><strong>Platform Name:</strong> WorkAbroad Hub</li>
                <li><strong>Company:</strong> EXOVIA CONNECT</li>
                <li><strong>Role:</strong> Data Controller under the Kenya Data Protection Act, 2019</li>
                <li><strong>Contact Email:</strong> <a href="mailto:support@workabroadhub.tech">support@workabroadhub.tech</a></li>
              </ul>
              <p>We determine how and why your personal data is processed.</p>

              <h2>2. Personal Data We Collect</h2>
              <p>We only collect data that is necessary and lawful, including:</p>

              <h3>2.1 Information You Provide</h3>
              <ul>
                <li>Full name</li>
                <li>Phone number</li>
                <li>Email address</li>
                <li>Account login details</li>
                <li>Any information submitted through forms or support channels</li>
              </ul>

              <h3>2.2 Payment-Related Data</h3>
              <ul>
                <li>M-PESA phone number</li>
                <li>Transaction reference numbers</li>
                <li>Payment status (successful / failed)</li>
              </ul>
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 not-prose my-4">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  We do NOT collect or store your M-PESA PIN, OTPs, or credentials.
                </p>
              </div>

              <h3>2.3 Device & Technical Data</h3>
              <ul>
                <li>Device type (phone, tablet, desktop)</li>
                <li>Operating system and browser version</li>
                <li>IP address (used for country detection and fraud prevention)</li>
                <li>App usage logs and feature interaction events</li>
                <li>Error and crash reports</li>
              </ul>

              <h3>2.4 Career & Document Data (Voluntary)</h3>
              <ul>
                <li>CV / résumé files uploaded for ATS checking or AI-assisted applications</li>
                <li>Job preferences, target countries, and skills summary</li>
                <li>Job application records created via the Application Tracker</li>
              </ul>
              <p>These are collected only when you actively submit them. You can delete them at any time by deleting your account.</p>

              <h2>3. Legal Basis for Processing</h2>
              <p>We process personal data based on the following lawful grounds:</p>
              <ul>
                <li>User consent</li>
                <li>Performance of a contract (providing services you request)</li>
                <li>Legal obligation (compliance with Kenyan law)</li>
                <li>Legitimate business interests, provided your rights are not overridden</li>
              </ul>

              <h2>4. How We Use Your Data</h2>
              <p>Your data is used strictly for:</p>
              <ul>
                <li>Creating and managing your account and professional profile</li>
                <li>Providing access to career consultation and overseas employment services</li>
                <li>Processing payments via M-Pesa or PayPal</li>
                <li>Delivering AI-assisted career tools (CV checking, cover letter generation, job matching)</li>
                <li>Sending payment confirmations and service updates via WhatsApp or SMS</li>
                <li>Preventing fraud and protecting platform integrity</li>
                <li>Customer support and communication</li>
                <li>Legal and regulatory compliance under Kenyan law</li>
              </ul>
              <h2>5. Data Sharing & Third-Party Services</h2>
              <p><strong>We do NOT sell or rent your personal data.</strong> We share limited data only where necessary to deliver our services:</p>
              <ul>
                <li><strong>Safaricom M-Pesa</strong> — Your phone number is shared to initiate M-Pesa STK Push payment requests. No PIN or banking credentials are shared.</li>
                <li><strong>PayPal</strong> — When you choose PayPal as a payment method, payment processing is handled directly by PayPal. We do not store your PayPal credentials or card details. PayPal's privacy policy applies to that transaction.</li>
                <li><strong>Twilio</strong> — Your phone number is shared to send payment confirmation messages via SMS or WhatsApp.</li>
                <li><strong>OpenAI (GPT-4o-mini)</strong> — CV text and job preferences are sent (without your name or contact details) for AI-powered career matching and cover letter generation. No personally identifiable information is included in AI requests.</li>
                <li><strong>Supabase</strong> — A secondary database mirror used for real-time analytics and data synchronisation. Data is encrypted at rest and in transit.</li>
                <li><strong>Google Firebase (Realtime Database)</strong> — Used for real-time notification delivery and live dashboard updates. Only anonymised user IDs and notification payloads are stored.</li>
                <li><strong>Replit Infrastructure</strong> — Primary encrypted database and server hosting. All data is stored within Replit's secure cloud infrastructure.</li>
                <li><strong>ipapi.co</strong> — Your IP address is used for country detection to comply with content and payment regulations. No personal data is stored by this service.</li>
                <li><strong>Law enforcement or regulators</strong> — Data is disclosed only when legally required under Kenyan law or a valid court order.</li>
              </ul>
              <p>All third-party services are bound by their own privacy policies and data protection obligations. We do not share your data with employers or recruitment agencies without your explicit action.</p>

              <h2>6. Data Retention</h2>
              <p>We retain personal data:</p>
              <ul>
                <li>Only for as long as necessary to fulfill the purposes stated</li>
                <li>Or as required by law, audit, or dispute resolution</li>
              </ul>
              <p>When data is no longer required, it is securely deleted or anonymized.</p>

              <h2>7. Data Security Measures</h2>
              <p>We implement reasonable technical and organizational safeguards, including:</p>
              <ul>
                <li>Secure servers and encryption</li>
                <li>Restricted access controls</li>
                <li>Secure authentication mechanisms</li>
                <li>Regular system monitoring</li>
              </ul>
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 not-prose my-4">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  However, no system is 100% secure, and users acknowledge this risk.
                </p>
              </div>

              <h2>8. Your Rights Under the Kenya Data Protection Act, 2019</h2>
              <p>You have the right to:</p>
              <ul>
                <li><strong>Access</strong> — Request a copy of your personal data we hold</li>
                <li><strong>Correction</strong> — Request correction of inaccurate or incomplete data</li>
                <li><strong>Deletion</strong> — Request permanent deletion of your account and all associated data</li>
                <li><strong>Objection</strong> — Object to certain processing activities</li>
                <li><strong>Portability</strong> — Request an export of your data in a readable format</li>
                <li><strong>Withdraw consent</strong> — At any time, without affecting prior processing</li>
              </ul>
              <div className="not-prose p-4 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800 my-4">
                <p className="text-sm font-semibold text-green-800 dark:text-green-200 mb-1">How to Delete Your Account</p>
                <p className="text-sm text-green-700 dark:text-green-300">
                  Go to <strong>Profile → Delete Account</strong> inside the app. This permanently and immediately erases your account, payment history, uploaded documents, and all personal data from our systems.
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  Alternatively, email <a href="mailto:privacy@workabroadhub.tech" className="underline">privacy@workabroadhub.tech</a> with your registered email address.
                </p>
              </div>
              <p>
                All other requests can be made via: <a href="mailto:support@workabroadhub.tech">support@workabroadhub.tech</a>
              </p>

              <h2>9. Data Breach Response</h2>
              <p>In the event of a data breach that poses a risk to users:</p>
              <ul>
                <li>We will notify affected users</li>
                <li>We will report to the Office of the Data Protection Commissioner (ODPC) where required</li>
              </ul>

              <h2>10. Children's Data</h2>
              <p>
                This platform is not intended for persons under 18 years.
                We do not knowingly collect data from minors.
              </p>

              <h2>11. Cross-Border Data Transfers</h2>
              <p>If data is processed outside Kenya:</p>
              <ul>
                <li>Adequate data protection safeguards will be ensured</li>
                <li>Processing will comply with Kenyan law</li>
              </ul>

              <h2>12. Cookies & Tracking</h2>
              <p>The platform may use cookies or similar technologies to:</p>
              <ul>
                <li>Improve performance</li>
                <li>Analyze usage patterns</li>
              </ul>
              <p>Users may control cookies via device or browser settings.</p>

              <h2>13. Changes to This Privacy Policy</h2>
              <p>
                We may update this Privacy Policy from time to time.
                Continued use of the platform after updates constitutes acceptance.
              </p>

              <h2>14. Contact & Complaints</h2>
              <p>
                For privacy inquiries or complaints:<br />
                Email: <a href="mailto:support@workabroadhub.tech">support@workabroadhub.tech</a>
              </p>
              <p>
                If unresolved, you may lodge a complaint with the <strong>Office of the Data Protection Commissioner (Kenya)</strong>.
              </p>

              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 not-prose mt-6">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Google Play Data Safety:</strong> See our full{" "}
                  <a href="/data-safety" className="underline text-blue-700 dark:text-blue-300">Data Safety disclosure page</a>{" "}
                  for answers to the Google Play Store Data Safety form, a complete list of third-party services, and user rights under KDPA 2019.
                </p>
              </div>

              <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800 not-prose mt-4">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  IMPORTANT NOTICE: By using this platform, you confirm that you have read, understood, and agreed to this Privacy Policy. If you do not agree, do not use the app.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
