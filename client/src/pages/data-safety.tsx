import { Shield, CheckCircle2, XCircle, Lock, Trash2, Eye, Database, Globe, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

const YES = () => (
  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-300 dark:border-green-700 gap-1 text-xs shrink-0">
    <CheckCircle2 className="h-3 w-3" /> Yes
  </Badge>
);
const NO = () => (
  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-700 gap-1 text-xs shrink-0">
    <XCircle className="h-3 w-3" /> No
  </Badge>
);

const Section = ({ icon: Icon, title, children }: { icon: typeof Shield; title: string; children: React.ReactNode }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <Icon className="h-5 w-5 text-primary shrink-0" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">{children}</CardContent>
  </Card>
);

const Row = ({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 border-b last:border-0">
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
    </div>
    <div className="shrink-0">{value}</div>
  </div>
);

export default function DataSafetyPage() {
  return (
    <div className="min-h-screen bg-background pb-24" data-testid="page-data-safety">
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-b px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <Badge variant="outline" className="text-xs">Google Play Compliance</Badge>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Data Safety & Privacy</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Transparency about what data WorkAbroad Hub collects, why, and how it is protected — in accordance with the Kenya Data Protection Act, 2019 and Google Play Store requirements.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        <Section icon={Database} title="Data Collection">
          <Row label="Does the app collect personal data?" value={<YES />} />
          <Row
            label="Name & email address"
            value={<YES />}
            note="Collected via Replit Auth (OpenID Connect) for account creation and login"
          />
          <Row
            label="Phone number"
            value={<YES />}
            note="Collected when initiating M-Pesa payments; used only for STK Push initiation"
          />
          <Row
            label="Payment transaction data"
            value={<YES />}
            note="M-Pesa receipt numbers stored for payment verification. PayPal transactions are handled entirely on PayPal's platform — no card or PayPal credential data is stored by us."
          />
          <Row
            label="Career profile data"
            value={<YES />}
            note="Job preferences, target countries, skills summary — entered voluntarily by user for AI matching and consultation"
          />
          <Row
            label="CV / resume documents"
            value={<YES />}
            note="Uploaded voluntarily by users for ATS checking and AI-assisted applications; stored securely"
          />
          <Row
            label="App usage analytics"
            value={<YES />}
            note="Page views, feature usage, and conversion events — only collected when you accept the data consent banner. Declining disables all analytics."
          />
          <Row label="M-Pesa PIN or banking credentials" value={<NO />} note="We never collect or store payment credentials" />
          <Row label="Precise GPS location" value={<NO />} note="IP-based country detection only, for compliance purposes" />
          <Row label="Contacts, camera, or microphone" value={<NO />} note="No device permissions are requested" />
          <Row label="Data shared with third parties for advertising" value={<NO />} />
        </Section>

        <Section icon={Lock} title="Data Security">
          <Row label="Data encrypted in transit?" value={<YES />} note="All communication uses HTTPS / TLS 1.2+" />
          <Row label="Data encrypted at rest?" value={<YES />} note="Database hosted on encrypted Replit PostgreSQL infrastructure" />
          <Row label="Secure session management?" value={<YES />} note="Server-side sessions with HttpOnly cookies; CSRF protection on all mutations" />
          <Row label="Rate limiting and abuse protection?" value={<YES />} note="Per-IP rate limiting, DDoS protection, bot detection, and fraud detection engine" />
          <Row label="API keys exposed to client?" value={<NO />} note="All API keys are stored as server-side environment secrets only" />
        </Section>

        <Section icon={Trash2} title="Data Deletion & User Rights">
          <Row label="Can users delete their account and all data?" value={<YES />} note="Available in Profile → Delete Account. All data is permanently erased immediately." />
          <Row label="Can users request data export?" value={<YES />} note="Available to all users in Profile → Download My Data. Downloads a full JSON export of your profile, payments, orders and more — free of charge under KDPA Article 32." />
          <Row label="Can users withdraw data processing consent?" value={<YES />} note="Via the consent banner, account deletion, or by contacting our Data Protection Officer" />
          <Row label="Data retention after deletion?" value={<NO />} note="All user data, payment records, and uploaded documents are permanently deleted on account closure" />
        </Section>

        <Section icon={Globe} title="Third-Party Data Sharing">
          <div className="text-sm text-muted-foreground mb-3">The following third-party services receive limited data to enable core functionality:</div>
          {[
            { name: "Safaricom M-Pesa", data: "Phone number (for STK Push only)", purpose: "Mobile payment processing — no PIN or banking credentials collected" },
            { name: "PayPal", data: "Payment is handled directly on PayPal's platform", purpose: "Online card / PayPal wallet payments — we do not store card numbers or PayPal credentials" },
            { name: "Twilio", data: "Phone number (for SMS / WhatsApp)", purpose: "Payment confirmation and service update notifications" },
            { name: "OpenAI (GPT-4o-mini)", data: "CV text and job preferences (anonymised — name & contact removed)", purpose: "AI career matching, CV improvement, cover letter generation" },
            { name: "Supabase", data: "Anonymised user records and analytics events", purpose: "Secondary database mirror for real-time analytics and redundancy" },
            { name: "Google Firebase (Realtime Database)", data: "Anonymised user ID and notification payloads", purpose: "Real-time notification delivery and live dashboard updates" },
            { name: "Replit Infrastructure", data: "Encrypted primary database and session storage", purpose: "App hosting and primary data storage" },
            { name: "ipapi.co", data: "IP address (not stored)", purpose: "Country detection for compliance with local payment and content regulations" },
          ].map(({ name, data, purpose }) => (
            <div key={name} className="py-2 border-b last:border-0">
              <p className="text-sm font-semibold">{name}</p>
              <p className="text-xs text-muted-foreground mt-0.5"><span className="font-medium">Data shared:</span> {data}</p>
              <p className="text-xs text-muted-foreground"><span className="font-medium">Purpose:</span> {purpose}</p>
            </div>
          ))}
        </Section>

        <Section icon={Eye} title="Data Safety Form Answers (Google Play)">
          <div className="text-xs text-muted-foreground mb-2 italic">
            These are the answers to submit in the Google Play Console → App content → Data safety section.
          </div>
          <Row label="Does your app collect or share user data?" value={<YES />} />
          <Row label="Is all data encrypted in transit?" value={<YES />} />
          <Row label="Does the app provide a way to request data deletion?" value={<YES />} />
          <Row label="Data types collected: Personal info" value={<YES />} note="Name, email address" />
          <Row label="Data types collected: Financial info" value={<YES />} note="Payment transaction IDs (no card numbers stored)" />
          <Row label="Data types collected: App activity" value={<YES />} note="Feature usage and page views" />
          <Row label="Data types collected: Files and docs" value={<YES />} note="CV uploads (user-initiated, user can delete)" />
          <Row label="Data shared with third parties for ads?" value={<NO />} />
          <Row label="Is data collection required to use the app?" value={<YES />} note="Email / name needed for account; phone needed for M-Pesa payments only" />
          <Row label="Target audience includes children under 13?" value={<NO />} note="App is for adults seeking overseas employment (18+)" />
        </Section>

        <Section icon={Bell} title="Permissions Requested">
          <div className="text-sm text-muted-foreground mb-2">
            This is a Progressive Web App (PWA). No native Android permissions are requested beyond standard browser APIs.
          </div>
          <Row label="Internet access" value={<YES />} note="Required for all app functionality" />
          <Row label="Camera" value={<NO />} />
          <Row label="Microphone" value={<NO />} />
          <Row label="Location (GPS)" value={<NO />} />
          <Row label="Contacts" value={<NO />} />
          <Row label="Storage / files" value={<NO />} note="CV uploads use browser file picker only; files are sent directly to the server" />
          <Row label="Notifications" value={<NO />} note="No push notifications are sent (WhatsApp/SMS via Twilio only when payment confirmed)" />
        </Section>

        <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4 text-sm space-y-2">
            <p className="font-semibold text-blue-900 dark:text-blue-200">Contact our Data Protection Officer</p>
            <p className="text-blue-800 dark:text-blue-300">
              For data requests, deletions, or complaints under the Kenya Data Protection Act, 2019:
            </p>
            <p className="text-blue-700 dark:text-blue-400">
              <strong>Email:</strong> privacy@workabroadhub.tech<br />
              <strong>Regulator:</strong> Office of the Data Protection Commissioner, Kenya (ODPC)
            </p>
            <div className="pt-1">
              <Link href="/privacy-policy" className="text-primary underline text-sm" data-testid="link-full-privacy-policy">
                Read full Privacy Policy →
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pb-2">
          Last updated: April 2026 · WorkAbroad Hub (Exovia Connect) · workabroadhub.tech
        </p>
      </div>
    </div>
  );
}
