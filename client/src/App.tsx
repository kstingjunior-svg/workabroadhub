import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BottomNav } from "@/components/bottom-nav";
import { NetworkStatus } from "@/components/network-status";
import { AccessibilityProvider } from "@/contexts/accessibility-context";
import { AgeVerificationGate } from "@/components/age-verification-gate";
import { DataConsentBanner } from "@/components/data-consent-banner";
import { UpgradeModalProvider } from "@/contexts/upgrade-modal-context";
import { UpgradeModal } from "@/components/upgrade-modal";
import { PhoneCompletionModal } from "@/components/phone-completion-modal";
import "@/lib/i18n";
import { AdminQuickPanel } from "@/components/admin-quick-panel";
import { FirebaseConnectionBanner } from "@/components/firebase-connection-banner";
import { SessionGuard } from "@/components/session-guard";
import { lazy, Suspense, ComponentType, useEffect, useState } from "react";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { prefetchCriticalData } from "./lib/queryClient";
import { startServicesPriceWatcher } from "@/lib/services";
import { usePageViewFunnel } from "@/hooks/use-page-view-funnel";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { useBehaviorTracker } from "@/hooks/use-behavior-tracker";
import { useNanjilaIdleNudge } from "@/hooks/use-nanjila-idle-nudge";
import { LiveActivityFeed } from "@/components/live-activity-feed";
import { InstallAppPrompt } from "@/components/install-app-prompt";
import { GlobalBackButton } from "@/components/global-back-button";
import GlobalPlanListener from "@/components/global-plan-listener";

// =============================================================================
// PERFORMANCE: Lazy load ALL pages for code splitting
//
// 2026-06 main-bundle slim-down: the previous setup eagerly imported Landing,
// AdminRevenue, AdminRevenueLive and NanjilaChatWidget — pushing the main
// bundle to ~1.5 MB / 470 KB gzipped. Now ALL non-critical UI is lazy,
// including:
//   - Landing (first-time visitor only, gets prefetched on idle anyway)
//   - AdminRevenue + AdminRevenueLive (admin-only pages)
//   - NanjilaChatWidget (loads after first interaction, not on first paint)
// =============================================================================

// Lazy load Landing — it's the home page but we prefetch it on idle so
// returning visitors still get instant render. First-time visitors pay one
// chunk download but save 200+ KB on the main bundle.
const Landing = lazyWithRetry(() => import("@/pages/landing"));

// Lazy load admin pages — only ever loaded by admins on /admin/* routes.
const AdminRevenue = lazyWithRetry(() => import("@/pages/admin/revenue"));
const AdminRevenueLive = lazyWithRetry(() => import("@/pages/admin/revenue-live"));

// Lazy load Nanjila chat widget — defer to after first interaction so first
// paint isn't blocked by the AI widget code.
const NanjilaChatWidget = lazyWithRetry(() => import("@/components/NanjilaChatWidget"));

// Lazy load all other pages with meaningful chunk names
const Dashboard = lazyWithRetry(() => import("@/pages/dashboard"));
const Pricing = lazyWithRetry(() => import("@/pages/pricing"));
const Payment = lazyWithRetry(() => import("@/pages/payment"));
const Country = lazyWithRetry(() => import("@/pages/country"));
const GlobalOpportunities = lazyWithRetry(() => import("@/pages/global-opportunities"));
const Services = lazyWithRetry(() => import("@/pages/services"));
const NeaAgencies = lazyWithRetry(() => import("@/pages/nea-agencies"));
const AgenciesMarketplace = lazyWithRetry(() => import("@/pages/agencies"));
const AgencyProfilePage = lazyWithRetry(() => import("@/pages/agency-profile"));
const Profile = lazyWithRetry(() => import("@/pages/profile"));
const AgencyPortal = lazyWithRetry(() => import("@/pages/agency-portal"));
const ServiceOrderPage = lazyWithRetry(() => import("@/pages/service-order"));
const MyOrders = lazyWithRetry(() => import("@/pages/my-orders"));
const MyAccountPage = lazyWithRetry(() => import("@/pages/my-account"));
const OrderDetail = lazyWithRetry(() => import("@/pages/order-detail"));
const StudentVisas = lazyWithRetry(() => import("@/pages/student-visas"));
const PassportApplication = lazyWithRetry(() => import("@/pages/passport-application"));
const GoodConduct = lazyWithRetry(() => import("@/pages/good-conduct"));
const TaxComplianceCertificate = lazyWithRetry(() => import("@/pages/tax-compliance-certificate"));
const HelbClearance = lazyWithRetry(() => import("@/pages/helb-clearance"));
const BirthCertificate = lazyWithRetry(() => import("@/pages/birth-certificate"));
const Community = lazyWithRetry(() => import("@/pages/community"));
const AssistedApply = lazyWithRetry(() => import("@/pages/assisted-apply"));
const ApplicationTracker = lazyWithRetry(() => import("@/pages/application-tracker"));
const PrivacyPolicy = lazyWithRetry(() => import("@/pages/privacy-policy"));
const TermsOfService = lazyWithRetry(() => import("@/pages/terms-of-service"));
const RefundPolicy = lazyWithRetry(() => import("@/pages/refund-policy"));
const VerifyUs = lazyWithRetry(() => import("@/pages/verify-us"));
const GuidesIndex = lazyWithRetry(() => import("@/pages/guides/guides-index"));
const GuidePage = lazyWithRetry(() => import("@/pages/guides/guide-page"));
const AboutPage = lazyWithRetry(() => import("@/pages/about"));
const ContactPage = lazyWithRetry(() => import("@/pages/contact"));
const FAQPage = lazyWithRetry(() => import("@/pages/faq"));
const Referrals = lazyWithRetry(() => import("@/pages/referrals"));
const ReferralTerms = lazyWithRetry(() => import("@/pages/referral-terms"));
const CareerMatch = lazyWithRetry(() => import("@/pages/career-match"));
const ReportAbuse = lazyWithRetry(() => import("@/pages/report-abuse"));
const LegalDisclaimer = lazyWithRetry(() => import("@/pages/legal-disclaimer"));
const DataSafety = lazyWithRetry(() => import("@/pages/data-safety"));
const Verify = lazyWithRetry(() => import("@/pages/verify"));
const AgencyMap = lazyWithRetry(() => import("@/pages/agency-map"));
const ComplianceIndex = lazyWithRetry(() => import("@/pages/compliance-index"));
const CertificateVerify = lazyWithRetry(() => import("@/pages/certificate-verify"));
const ScamLookup = lazyWithRetry(() => import("@/pages/scam-lookup"));
const ReportFraud = lazyWithRetry(() => import("@/pages/report-fraud"));
const ReportScam = lazyWithRetry(() => import("@/pages/report-scam"));
const ScamWall = lazyWithRetry(() => import("@/pages/scam-wall"));
const GreenCard = lazyWithRetry(() => import("@/pages/green-card"));
const VisaGuides = lazyWithRetry(() => import("@/pages/visa-guides"));
const VisaCountry = lazyWithRetry(() => import("@/pages/visa-country"));
const VisaAssistant = lazyWithRetry(() => import("@/pages/visa-assistant"));
const BulkApply = lazyWithRetry(() => import("@/pages/bulk-apply"));
const UploadCV = lazyWithRetry(() => import("@/pages/upload-cv"));
const AutoApply = lazyWithRetry(() => import("@/pages/tools/auto-apply"));
const InterviewPractice = lazyWithRetry(() => import("@/pages/tools/interview-practice"));
const JobMatch = lazyWithRetry(() => import("@/pages/tools/job-match"));
const ErrorRoute = lazyWithRetry(() => import("@/pages/error"));
const MyPayments = lazyWithRetry(() => import("@/pages/my-payments"));
const PayPage = lazyWithRetry(() => import("@/pages/pay"));
const MyDocuments = lazyWithRetry(() => import("@/pages/my-documents"));
const MyOverview = lazyWithRetry(() => import("@/pages/my-overview"));
const AccountVerify = lazyWithRetry(() => import("@/pages/account-verify"));
const ServiceOrderFlow = lazyWithRetry(() => import("@/pages/service-order-flow"));
const LoginPage = lazyWithRetry(() => import("@/pages/login"));
const ForgotPassword = lazyWithRetry(() => import("@/pages/forgot-password"));
const ResetPassword = lazyWithRetry(() => import("@/pages/reset-password"));
const SharedDocument = lazyWithRetry(() => import("@/pages/shared-document"));
const Forum = lazyWithRetry(() => import("@/pages/forum"));
const NotFound = lazyWithRetry(() => import("@/pages/not-found"));

// Admin pages - heavy bundle, only loaded when needed
const AdminDashboard = lazyWithRetry(() => import("@/pages/AdminDashboard"));
const AdminMainIndex = lazyWithRetry(() => import("@/pages/admin/index"));
const AdminCountries = lazyWithRetry(() => import("@/pages/admin/countries"));
const AdminUsers = lazyWithRetry(() => import("@/pages/admin/users"));
const AdminPayments = lazyWithRetry(() => import("@/pages/admin/payments"));
const AdminManualUpgrade = lazyWithRetry(() => import("@/pages/admin/manual-upgrade"));
const JourneyPage = lazyWithRetry(() => import("@/pages/journey"));
const SalaryPage = lazyWithRetry(() => import("@/pages/salary"));
const InterviewPage = lazyWithRetry(() => import("@/pages/interview"));
const BookmarksPage = lazyWithRetry(() => import("@/pages/bookmarks"));
const CalculatorPage = lazyWithRetry(() => import("@/pages/calculator"));
// 2026-06 Canada Express Entry hub (production):
//   /canada       — overview, programs, fees, draws
//   /canada/crs   — working CRS calculator (official IRCC formula)
//   /canada/jobs  — verified Canadian job portals + NOC 2021 finder
const CanadaPage    = lazyWithRetry(() => import("@/pages/canada"));
const CanadaCrsPage = lazyWithRetry(() => import("@/pages/canada-crs"));
const CanadaJobsPage = lazyWithRetry(() => import("@/pages/canada-jobs"));
const AdminUnmatchedPayments = lazyWithRetry(() => import("@/pages/admin/unmatched-payments"));
const AdminServices = lazyWithRetry(() => import("@/pages/admin/services"));
const AdminAlerts = lazyWithRetry(() => import("@/pages/admin/alerts"));
const AdminAgencies = lazyWithRetry(() => import("@/pages/admin/agencies"));
const AdminAgencyClaims = lazyWithRetry(() => import("@/pages/admin/agency-claims"));
const AdminLicenseExpiry = lazyWithRetry(() => import("@/pages/admin/license-expiry"));
const AdminLicenseReminders = lazyWithRetry(() => import("@/pages/admin/license-reminders"));
const AdminExpiryHeatmap = lazyWithRetry(() => import("@/pages/admin/expiry-heatmap"));
const AdminAgencyAddOns = lazyWithRetry(() => import("@/pages/admin/agency-addons"));
const AdminServiceOrders = lazyWithRetry(() => import("@/pages/admin/service-orders"));
const AdminJobApplications = lazyWithRetry(() => import("@/pages/admin/job-applications"));
const AdminReviewDashboard = lazyWithRetry(() => import("@/pages/admin/review-dashboard"));
const AdminTrustDashboard = lazyWithRetry(() => import("@/pages/admin/trust-dashboard"));
const AdminPushNotifications = lazyWithRetry(() => import("@/pages/admin/push-notifications"));
const AdminSmsWhatsApp = lazyWithRetry(() => import("@/pages/admin/sms-whatsapp"));
const AdminAnalytics = lazyWithRetry(() => import("@/pages/admin/analytics"));
const AdminLogin = lazyWithRetry(() => import("@/pages/admin/login"));
const AdminReferrals = lazyWithRetry(() => import("@/pages/admin/referrals"));
const AdminConsultations = lazyWithRetry(() => import("@/pages/admin/consultations"));
const AdminGovernmentIntegrations = lazyWithRetry(() => import("@/pages/admin/government-integrations"));
const AdminPricing = lazyWithRetry(() => import("@/pages/admin/pricing"));
const AdminAgencyScores = lazyWithRetry(() => import("@/pages/admin/agency-scores"));
const AdminFraudDetection = lazyWithRetry(() => import("@/pages/admin/fraud-detection"));
const AdminScamReports = lazyWithRetry(() => import("@/pages/admin/scam-reports"));
const AdminComplianceMonitor = lazyWithRetry(() => import("@/pages/admin/compliance-monitor"));
const AdminSecurity = lazyWithRetry(() => import("@/pages/admin/security"));
const AdminRefunds = lazyWithRetry(() => import("@/pages/admin/refunds"));
const AdminPlans = lazyWithRetry(() => import("@/pages/admin/plans"));
const AdminLogs = lazyWithRetry(() => import("@/pages/admin/logs"));
const AdminFunnel = lazyWithRetry(() => import("@/pages/admin/funnel"));
const AdminSuccessStories = lazyWithRetry(() => import("@/pages/admin/success-stories"));
const AdminReportedAgencies = lazyWithRetry(() => import("@/pages/admin/reported-agencies"));
const AdminBookings = lazyWithRetry(() => import("@/pages/admin/bookings"));
const AdminAgencyRatings = lazyWithRetry(() => import("@/pages/admin/agency-ratings"));
const AdminPortalHealth = lazyWithRetry(() => import("@/pages/admin/portal-health"));
const AdminModeration = lazyWithRetry(() => import("@/pages/admin/moderation"));
const AdminSupabaseStats = lazyWithRetry(() => import("@/pages/admin/supabase-stats"));
const CommunityPortals = lazyWithRetry(() => import("@/pages/community-portals"));
const ToolsHub = lazyWithRetry(() => import("@/pages/tools/index"));
const ATSCVChecker = lazyWithRetry(() => import("@/pages/tools/ats-cv-checker"));
const JobScamChecker = lazyWithRetry(() => import("@/pages/tools/job-scam-checker"));
const VisaSponsorshipJobs = lazyWithRetry(() => import("@/pages/tools/visa-sponsorship-jobs"));
const CVTemplates = lazyWithRetry(() => import("@/pages/tools/cv-templates"));
const JobApplicationAssistant = lazyWithRetry(() => import("@/pages/tools/job-application-assistant"));
const ToolReport = lazyWithRetry(() => import("@/pages/tools/tool-report"));
const BulkAgencyVerify = lazyWithRetry(() => import("@/pages/tools/bulk-agency-verify"));
const AdminErrorMonitor = lazyWithRetry(() => import("@/pages/admin/error-monitor"));

// =============================================================================
// Loading Components
// =============================================================================

function LoadingScreen() {
  const { t } = useTranslation();
  const [showReload, setShowReload] = useState(false);

  // After 4 s show an escape-hatch button — catches users on old cached bundles
  useEffect(() => {
    const t = setTimeout(() => setShowReload(true), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div 
      className="min-h-screen flex items-center justify-center bg-background"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" aria-hidden="true" />
        <p className="text-muted-foreground">{t("common.loading")}</p>
        {showReload && (
          <div className="space-y-2 pt-2">
            <p className="text-sm text-muted-foreground">Taking too long?</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80 transition-opacity"
              data-testid="button-reload-page"
            >
              Reload page
            </button>
          </div>
        )}
        <span className="sr-only">Loading application, please wait</span>
      </div>
    </div>
  );
}

function PageLoadingFallback() {
  return (
    <div 
      className="min-h-[50vh] flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">Loading page content</span>
    </div>
  );
}

function SkipLink() {
  return (
    <a 
      href="#main-content" 
      className="skip-link sr-only-focusable"
      data-testid="link-skip-to-content"
    >
      Skip to main content
    </a>
  );
}

// Redirects unauthenticated users to the landing page with a return path
function ProtectedRedirect() {
  const [location, navigate] = useLocation();
  useEffect(() => {
    // The modal lives on the landing page. Send users to / with a
    // redirect= query param; landing.tsx's effect picks it up and opens
    // the login modal automatically.
    if (location && location !== "/" && location !== "/dashboard") {
      navigate("/?redirect=" + encodeURIComponent(location), { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

// Higher-order component to wrap lazy components with Suspense
// Preserves all route props (params, location) for wouter compatibility
function withSuspense<P extends object>(Component: ComponentType<P>) {
  return function SuspenseWrapper(props: P) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <Component {...props} />
      </Suspense>
    );
  };
}

// Pre-wrapped lazy components that preserve route params
const LazyDashboard = withSuspense(Dashboard);
const LazyPayment = withSuspense(Payment);
const LazyPricing = withSuspense(Pricing);
const LazyCountry = withSuspense(Country);
const LazyServices = withSuspense(Services);
const LazyNeaAgencies = withSuspense(NeaAgencies);
const LazyAgenciesMarketplace = withSuspense(AgenciesMarketplace);
const LazyAgencyProfilePage = withSuspense(AgencyProfilePage);
const LazyProfile = withSuspense(Profile);
const LazyAgencyPortal = withSuspense(AgencyPortal);
const LazyServiceOrderPage = withSuspense(ServiceOrderPage);
const LazyMyOrders = withSuspense(MyOrders);
const LazyOrderDetail = withSuspense(OrderDetail);
const LazyStudentVisas = withSuspense(StudentVisas);
const LazyPassportApplication = withSuspense(PassportApplication);
const LazyGoodConduct = withSuspense(GoodConduct);
const LazyTaxComplianceCertificate = withSuspense(TaxComplianceCertificate);
const LazyHelbClearance = withSuspense(HelbClearance);
const LazyBirthCertificate = withSuspense(BirthCertificate);
const LazyCommunity = withSuspense(Community);
const LazyAssistedApply = withSuspense(AssistedApply);
const LazyApplicationTracker = withSuspense(ApplicationTracker);
const LazyPrivacyPolicy = withSuspense(PrivacyPolicy);
const LazyTermsOfService = withSuspense(TermsOfService);
const LazyRefundPolicy = withSuspense(RefundPolicy);
const LazyVerifyUs = withSuspense(VerifyUs);
const LazyGuidesIndex = withSuspense(GuidesIndex);
const LazyGuidePage = withSuspense(GuidePage);
const LazyAboutPage = withSuspense(AboutPage);
const LazyContactPage = withSuspense(ContactPage);
const LazyFAQPage = withSuspense(FAQPage);
// Fix for React error #426 — these were used as raw `lazy()` exports without
// a Suspense boundary, causing the dashboard's "Just a small detour" page to
// fire whenever an authenticated user clicked through to them.
const LazyMyOverview  = withSuspense(MyOverview);
const LazyMyPayments  = withSuspense(MyPayments);
const LazyMyDocuments = withSuspense(MyDocuments);
const LazyAccountVerify = withSuspense(AccountVerify);
const LazyServiceOrderFlow = withSuspense(ServiceOrderFlow);
const LazyReferrals = withSuspense(Referrals);
const LazyReferralTerms = withSuspense(ReferralTerms);
const LazyCareerMatch = withSuspense(CareerMatch);
const LazyReportAbuse = withSuspense(ReportAbuse);
const LazyLegalDisclaimer = withSuspense(LegalDisclaimer);
const LazyDataSafety = withSuspense(DataSafety);
const LazyVerify = withSuspense(Verify);
const LazyAgencyMap = withSuspense(AgencyMap);
const LazyComplianceIndex = withSuspense(ComplianceIndex);
const LazyCertificateVerify = withSuspense(CertificateVerify);
const LazyScamLookup = withSuspense(ScamLookup);
const LazyReportFraud = withSuspense(ReportFraud);
const LazyReportScam = withSuspense(ReportScam);
const LazyScamWall = withSuspense(ScamWall);
const LazyGreenCard = withSuspense(GreenCard);
const LazyVisaGuides = withSuspense(VisaGuides);
const LazyVisaCountry = withSuspense(VisaCountry);
const LazyVisaAssistant = withSuspense(VisaAssistant);
const LazyBulkApply = withSuspense(BulkApply);
const LazyUploadCV = withSuspense(UploadCV);
const LazyAutoApply = withSuspense(AutoApply);
const LazyForum = withSuspense(Forum);
const LazyLoginPage = withSuspense(LoginPage);
const LazyForgotPassword = withSuspense(ForgotPassword);
const LazyResetPassword = withSuspense(ResetPassword);
const LazySharedDocument = withSuspense(SharedDocument);
const LazyNotFound = withSuspense(NotFound);
const LazyAdminDashboard = withSuspense(AdminDashboard);
const LazyAdminMainIndex = withSuspense(AdminMainIndex);
const LazyAdminCountries = withSuspense(AdminCountries);
const LazyAdminUsers = withSuspense(AdminUsers);
const LazyAdminPayments = withSuspense(AdminPayments);
const LazyAdminManualUpgrade = withSuspense(AdminManualUpgrade);
const LazyJourneyPage = withSuspense(JourneyPage);
const LazySalaryPage = withSuspense(SalaryPage);
const LazyInterviewPage = withSuspense(InterviewPage);
const LazyBookmarksPage = withSuspense(BookmarksPage);
const LazyCalculatorPage = withSuspense(CalculatorPage);
const LazyCanadaPage = withSuspense(CanadaPage);
const LazyCanadaCrsPage = withSuspense(CanadaCrsPage);
const LazyCanadaJobsPage = withSuspense(CanadaJobsPage);
const LazyAdminUnmatchedPayments = withSuspense(AdminUnmatchedPayments);
const LazyAdminServices = withSuspense(AdminServices);
const LazyAdminAlerts = withSuspense(AdminAlerts);
const LazyAdminAgencies = withSuspense(AdminAgencies);
const LazyAdminAgencyClaims = withSuspense(AdminAgencyClaims);
const LazyAdminLicenseExpiry = withSuspense(AdminLicenseExpiry);
const LazyAdminLicenseReminders = withSuspense(AdminLicenseReminders);
const LazyAdminExpiryHeatmap = withSuspense(AdminExpiryHeatmap);
const LazyAdminAgencyAddOns = withSuspense(AdminAgencyAddOns);
const LazyAdminServiceOrders = withSuspense(AdminServiceOrders);
// 2026-06: AdminRevenue + AdminRevenueLive + Landing + NanjilaChatWidget were
// eagerly imported before c8d30ff — they pushed ~250 KB into the main bundle.
// Made lazy with Suspense wrappers to match the pattern used by every other
// admin route. Without these wrappers, the components below render raw lazy()
// without a Suspense boundary, which throws and trips the "Just a small detour"
// error boundary on /admin/revenue, /admin/revenue-live, AND the homepage /.
const LazyAdminRevenue = withSuspense(AdminRevenue);
const LazyAdminRevenueLive = withSuspense(AdminRevenueLive);
const LazyLanding = withSuspense(Landing);
const LazyNanjilaChatWidget = withSuspense(NanjilaChatWidget);
const LazyAdminJobApplications = withSuspense(AdminJobApplications);
const LazyAdminReviewDashboard = withSuspense(AdminReviewDashboard);
const LazyAdminTrustDashboard = withSuspense(AdminTrustDashboard);
const LazyAdminPushNotifications = withSuspense(AdminPushNotifications);
const LazyAdminSmsWhatsApp = withSuspense(AdminSmsWhatsApp);
const LazyAdminAnalytics = withSuspense(AdminAnalytics);
const LazyAdminLogin = withSuspense(AdminLogin);
const LazyAdminReferrals = withSuspense(AdminReferrals);
const LazyAdminConsultations = withSuspense(AdminConsultations);
const LazyAdminGovernmentIntegrations = withSuspense(AdminGovernmentIntegrations);
const LazyAdminPricing = withSuspense(AdminPricing);
const LazyAdminAgencyScores = withSuspense(AdminAgencyScores);
const LazyAdminFraudDetection = withSuspense(AdminFraudDetection);
const LazyAdminScamReports = withSuspense(AdminScamReports);
const LazyAdminComplianceMonitor = withSuspense(AdminComplianceMonitor);
const LazyAdminSecurity = withSuspense(AdminSecurity);
const LazyAdminRefunds = withSuspense(AdminRefunds);
const LazyAdminPlans = withSuspense(AdminPlans);
const LazyAdminLogs = withSuspense(AdminLogs);
const LazyAdminFunnel = withSuspense(AdminFunnel);
const LazyAdminSuccessStories = withSuspense(AdminSuccessStories);
const LazyAdminReportedAgencies = withSuspense(AdminReportedAgencies);
const LazyAdminBookings = withSuspense(AdminBookings);
const LazyAdminAgencyRatings = withSuspense(AdminAgencyRatings);
const LazyAdminPortalHealth = withSuspense(AdminPortalHealth);
const LazyAdminModeration = withSuspense(AdminModeration);
const LazyCommunityPortals = withSuspense(CommunityPortals);
const LazyToolsHub = withSuspense(ToolsHub);
const LazyATSCVChecker = withSuspense(ATSCVChecker);
const LazyJobScamChecker = withSuspense(JobScamChecker);
const LazyVisaSponsorshipJobs = withSuspense(VisaSponsorshipJobs);
const LazyCVTemplates = withSuspense(CVTemplates);
const LazyJobApplicationAssistant = withSuspense(JobApplicationAssistant);
const LazyToolReport = withSuspense(ToolReport);
const LazyBulkAgencyVerify = withSuspense(BulkAgencyVerify);
const LazyGlobalOpportunities = withSuspense(GlobalOpportunities);

// =============================================================================
// Routes
// =============================================================================

function AuthenticatedRoutes() {
  return (
    <Switch>
      <Route path="/" component={LazyDashboard} />
      <Route path="/dashboard" component={LazyDashboard} />
      <Route path="/pricing" component={LazyPricing} />
      <Route path="/payment" component={LazyPayment} />
      <Route path="/pay" component={PayPage} />
      <Route path="/country/:code" component={LazyCountry} />
      <Route path="/forum/:country" component={LazyForum} />
      <Route path="/services" component={LazyServices} />
      <Route path="/service-order/:serviceId" component={LazyServiceOrderPage} />
      <Route path="/my-orders" component={LazyMyOrders} />
      <Route path="/order/:orderId" component={LazyOrderDetail} />
      <Route path="/nea-agencies" component={LazyNeaAgencies} />
      <Route path="/agencies" component={LazyAgenciesMarketplace} />
      <Route path="/agencies/:agencyId" component={LazyAgencyProfilePage} />
      <Route path="/student-visas" component={LazyStudentVisas} />
      <Route path="/passport-application" component={LazyPassportApplication} />
      <Route path="/good-conduct" component={LazyGoodConduct} />
      <Route path="/tax-compliance-certificate" component={LazyTaxComplianceCertificate} />
      <Route path="/helb-clearance" component={LazyHelbClearance} />
      <Route path="/birth-certificate" component={LazyBirthCertificate} />
      <Route path="/community" component={LazyCommunity} />
      <Route path="/assisted-apply/purchase/:packId" component={LazyAssistedApply} />
      <Route path="/assisted-apply/new" component={LazyAssistedApply} />
      <Route path="/assisted-apply/application/:applicationId" component={LazyAssistedApply} />
      <Route path="/assisted-apply" component={LazyAssistedApply} />
      <Route path="/application-tracker" component={LazyApplicationTracker} />
      <Route path="/profile" component={LazyProfile} />
      <Route path="/my-account" component={() => <Suspense fallback={<div />}><MyAccountPage /></Suspense>} />
      <Route path="/my-payments" component={LazyMyPayments} />
      <Route path="/payments" component={LazyMyPayments} />
      <Route path="/my-documents" component={LazyMyDocuments} />
      <Route path="/my-overview" component={LazyMyOverview} />
      <Route path="/account/verify" component={LazyAccountVerify} />
      <Route path="/services/order/:slug" component={LazyServiceOrderFlow} />
      <Route path="/login" component={LazyLoginPage} />
      <Route path="/signup" component={LazyLoginPage} />
      <Route path="/forgot-password" component={LazyForgotPassword} />
      <Route path="/reset-password" component={LazyResetPassword} />
      <Route path="/shared/:id" component={LazySharedDocument} />
      <Route path="/admin" component={LazyAdminDashboard} />
      <Route path="/admin/home" component={LazyAdminMainIndex} />
      <Route path="/admin/login" component={LazyAdminLogin} />
      <Route path="/admin/countries" component={LazyAdminCountries} />
      <Route path="/admin/users" component={LazyAdminUsers} />
      <Route path="/admin/payments" component={LazyAdminPayments} />
      <Route path="/admin/manual-upgrade" component={LazyAdminManualUpgrade} />
      <Route path="/journey/:country" component={LazyJourneyPage} />
      <Route path="/journey" component={LazyJourneyPage} />
      <Route path="/salary" component={LazySalaryPage} />
      <Route path="/interview/:sessionId" component={LazyInterviewPage} />
      <Route path="/interview" component={LazyInterviewPage} />
      <Route path="/bookmarks" component={LazyBookmarksPage} />
      <Route path="/calculator" component={LazyCalculatorPage} />
      {/* 2026-06 Canada Express Entry hub */}
      <Route path="/canada/crs" component={LazyCanadaCrsPage} />
      <Route path="/canada/jobs" component={LazyCanadaJobsPage} />
      <Route path="/canada" component={LazyCanadaPage} />
      <Route path="/admin/unmatched-payments" component={LazyAdminUnmatchedPayments} />
      <Route path="/admin/services" component={LazyAdminServices} />
      <Route path="/admin/alerts" component={LazyAdminAlerts} />
      <Route path="/admin/agencies" component={LazyAdminAgencies} />
      <Route path="/admin/agency-claims" component={LazyAdminAgencyClaims} />
      <Route path="/admin/license-expiry" component={LazyAdminLicenseExpiry} />
      <Route path="/admin/license-reminders" component={LazyAdminLicenseReminders} />
      <Route path="/admin/expiry-heatmap" component={LazyAdminExpiryHeatmap} />
      <Route path="/admin/agency-addons" component={LazyAdminAgencyAddOns} />
      <Route path="/admin/service-orders" component={LazyAdminServiceOrders} />
      <Route path="/admin/job-applications" component={LazyAdminJobApplications} />
      <Route path="/admin/review-dashboard" component={LazyAdminReviewDashboard} />
      <Route path="/admin/trust-dashboard" component={LazyAdminTrustDashboard} />
      <Route path="/admin/push-notifications" component={LazyAdminPushNotifications} />
      <Route path="/admin/sms-whatsapp" component={LazyAdminSmsWhatsApp} />
      <Route path="/admin/analytics" component={LazyAdminAnalytics} />
      <Route path="/admin/referrals" component={LazyAdminReferrals} />
      <Route path="/admin/consultations" component={LazyAdminConsultations} />
      <Route path="/admin/government-integrations" component={LazyAdminGovernmentIntegrations} />
      <Route path="/admin/pricing" component={LazyAdminPricing} />
      <Route path="/admin/agency-scores" component={LazyAdminAgencyScores} />
      <Route path="/admin/fraud-detection" component={LazyAdminFraudDetection} />
      <Route path="/admin/scam-reports" component={LazyAdminScamReports} />
      <Route path="/admin/compliance-monitor" component={LazyAdminComplianceMonitor} />
      <Route path="/admin/security" component={LazyAdminSecurity} />
      <Route path="/admin/refunds" component={LazyAdminRefunds} />
      <Route path="/admin/revenue" component={LazyAdminRevenue} />
      <Route path="/admin/revenue-live" component={LazyAdminRevenueLive} />
      <Route path="/admin/plans" component={LazyAdminPlans} />
      <Route path="/admin/logs" component={LazyAdminLogs} />
      <Route path="/admin/error-monitor" component={AdminErrorMonitor} />
      <Route path="/admin/funnel" component={LazyAdminFunnel} />
      <Route path="/admin/success-stories" component={LazyAdminSuccessStories} />
      <Route path="/admin/reported-agencies" component={LazyAdminReportedAgencies} />
      <Route path="/admin/bookings" component={LazyAdminBookings} />
      <Route path="/admin/agency-ratings" component={LazyAdminAgencyRatings} />
      <Route path="/admin/portal-health" component={LazyAdminPortalHealth} />
      <Route path="/admin/moderation" component={LazyAdminModeration} />
      <Route path="/admin/supabase-stats" component={AdminSupabaseStats} />
      <Route path="/portals/community" component={LazyCommunityPortals} />
      <Route path="/referrals" component={LazyReferrals} />
      <Route path="/referral-terms" component={LazyReferralTerms} />
      <Route path="/career-match" component={LazyCareerMatch} />
      <Route path="/agency-portal" component={LazyAgencyPortal} />
      <Route path="/privacy-policy" component={LazyPrivacyPolicy} />
      <Route path="/terms-of-service" component={LazyTermsOfService} />
      <Route path="/refund-policy" component={LazyRefundPolicy} />
      <Route path="/verify-us" component={LazyVerifyUs} />
      <Route path="/guides/:slug" component={LazyGuidePage} />
      <Route path="/guides" component={LazyGuidesIndex} />
      <Route path="/about" component={LazyAboutPage} />
      <Route path="/contact" component={LazyContactPage} />
      <Route path="/faq" component={LazyFAQPage} />
      <Route path="/report-abuse" component={LazyReportAbuse} />
      <Route path="/verify" component={LazyVerify} />
      <Route path="/agency-map" component={LazyAgencyMap} />
      <Route path="/compliance-index" component={LazyComplianceIndex} />
      <Route path="/certificate/:certificateId" component={LazyCertificateVerify} />
      <Route path="/scam-lookup" component={LazyScamLookup} />
      <Route path="/report-fraud" component={LazyReportFraud} />
      <Route path="/report-scam" component={LazyReportScam} />
      <Route path="/scam-wall" component={LazyScamWall} />
      <Route path="/legal-disclaimer" component={LazyLegalDisclaimer} />
      <Route path="/data-safety" component={LazyDataSafety} />
      <Route path="/green-card" component={LazyGreenCard} />
      <Route path="/visa-guides" component={LazyVisaGuides} />
      <Route path="/visa/:country" component={LazyVisaCountry} />
      <Route path="/visa-assistant" component={LazyVisaAssistant} />
      <Route path="/bulk-apply" component={LazyBulkApply} />
      <Route path="/upload-cv" component={LazyUploadCV} />
      <Route path="/tools/auto-apply" component={LazyAutoApply} />
      <Route path="/tools/interview-practice" component={InterviewPractice} />
      <Route path="/tools/job-match" component={JobMatch} />
      <Route path="/tools" component={LazyToolsHub} />
      <Route path="/tools/ats-cv-checker" component={LazyATSCVChecker} />
      <Route path="/tools/job-scam-checker" component={LazyJobScamChecker} />
      <Route path="/tools/visa-sponsorship-jobs" component={LazyVisaSponsorshipJobs} />
      <Route path="/tools/bulk-agency-verify" component={LazyBulkAgencyVerify} />
      <Route path="/global-opportunities" component={LazyGlobalOpportunities} />
      <Route path="/tools/cv-templates" component={LazyCVTemplates} />
      <Route path="/tools/job-application-assistant" component={LazyJobApplicationAssistant} />
      <Route path="/report/:toolName/:reportId" component={LazyToolReport} />
      <Route component={LazyNotFound} />
    </Switch>
  );
}

function Router() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  // Safety net: if auth check takes > 12 seconds, unblock the app.
  // We previously used 4 s, which fired during cold Render starts (where
  // the first /api/auth/user can take 3-6 s), silently dumping the user
  // into the unauthenticated Switch and bouncing them. 12 s is long
  // enough to absorb cold starts while still preventing an infinite
  // spinner if /api/auth/user is genuinely broken.
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => setLoadingTimedOut(true), 12000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Reset timeout flag when loading resolves normally
  useEffect(() => {
    if (!isLoading) setLoadingTimedOut(false);
  }, [isLoading]);

  // Prefetch critical data only when authenticated
  useEffect(() => {
    if (user) {
      prefetchCriticalData();
    }
  }, [user]);

  // Keep session alive and refresh active-user tracker every 60 s
  useHeartbeat();
  useBehaviorTracker();
  useNanjilaIdleNudge();

  // Poll for service price changes every 10 s — reload if prices changed
  useEffect(() => {
    const stop = startServicesPriceWatcher();
    return stop;
  }, []);

  // After Replit OIDC login, honour the stored redirect path
  useEffect(() => {
    if (user) {
      const redirect = localStorage.getItem("auth_redirect");
      if (redirect && redirect !== "/" && redirect !== "/dashboard") {
        localStorage.removeItem("auth_redirect");
        navigate(redirect, { replace: true });
      }
    }
  }, [user]);

  // Capture ?ref= referral code on first visit — persists through signup flow
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      localStorage.setItem("referral_code", ref);
    }
  }, []);

  // Conversion funnel: trigger upgrade modal after 2 page views for free users
  usePageViewFunnel();

  if (isLoading && !loadingTimedOut) {
    return <LoadingScreen />;
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/" component={LazyLanding} />
        <Route path="/privacy-policy" component={LazyPrivacyPolicy} />
        <Route path="/terms-of-service" component={LazyTermsOfService} />
        <Route path="/refund-policy" component={LazyRefundPolicy} />
        <Route path="/about" component={LazyAboutPage} />
        <Route path="/contact" component={LazyContactPage} />
        <Route path="/faq" component={LazyFAQPage} />
        <Route path="/nea-agencies" component={LazyNeaAgencies} />
        <Route path="/agencies" component={LazyAgenciesMarketplace} />
        <Route path="/agencies/:agencyId" component={LazyAgencyProfilePage} />
        <Route path="/student-visas" component={LazyStudentVisas} />
        <Route path="/passport-application" component={LazyPassportApplication} />
      <Route path="/good-conduct" component={LazyGoodConduct} />
      <Route path="/tax-compliance-certificate" component={LazyTaxComplianceCertificate} />
      <Route path="/helb-clearance" component={LazyHelbClearance} />
      <Route path="/birth-certificate" component={LazyBirthCertificate} />
      <Route path="/community" component={LazyCommunity} />
        <Route path="/assisted-apply/purchase/:packId" component={LazyAssistedApply} />
        <Route path="/assisted-apply" component={LazyAssistedApply} />
        <Route path="/admin/login" component={LazyAdminLogin} />
        <Route path="/admin" component={LazyAdminLogin} />
        <Route path="/referral-terms" component={LazyReferralTerms} />
        <Route path="/agency-portal" component={LazyAgencyPortal} />
        <Route path="/report-abuse" component={LazyReportAbuse} />
        <Route path="/verify" component={LazyVerify} />
        <Route path="/agency-map" component={LazyAgencyMap} />
        <Route path="/compliance-index" component={LazyComplianceIndex} />
        <Route path="/certificate/:certificateId" component={LazyCertificateVerify} />
        <Route path="/scam-lookup" component={LazyScamLookup} />
        <Route path="/report-fraud" component={LazyReportFraud} />
        <Route path="/report-scam" component={LazyReportScam} />
        <Route path="/scam-wall" component={LazyScamWall} />
        <Route path="/legal-disclaimer" component={LazyLegalDisclaimer} />
        <Route path="/data-safety" component={LazyDataSafety} />
        <Route path="/pricing" component={LazyPricing} />
        <Route path="/payment" component={LazyPayment} />
        <Route path="/pay" component={PayPage} />
        <Route path="/tools" component={LazyToolsHub} />
        <Route path="/tools/ats-cv-checker" component={LazyATSCVChecker} />
        <Route path="/tools/job-scam-checker" component={LazyJobScamChecker} />
        <Route path="/tools/visa-sponsorship-jobs" component={LazyVisaSponsorshipJobs} />
        <Route path="/tools/bulk-agency-verify" component={LazyBulkAgencyVerify} />
        <Route path="/tools/cv-templates" component={LazyCVTemplates} />
        <Route path="/tools/job-application-assistant" component={LazyJobApplicationAssistant} />
        <Route path="/report/:toolName/:reportId" component={LazyToolReport} />
        <Route path="/green-card" component={LazyGreenCard} />
        <Route path="/visa-guides" component={LazyVisaGuides} />
        <Route path="/visa/:country" component={LazyVisaCountry} />
        <Route path="/visa-assistant" component={LazyVisaAssistant} />
        <Route path="/bulk-apply" component={LazyBulkApply} />
        <Route path="/upload-cv" component={LazyUploadCV} />
        <Route path="/tools/auto-apply" component={LazyAutoApply} />
      <Route path="/tools/interview-practice" component={InterviewPractice} />
      <Route path="/tools/job-match" component={JobMatch} />
        <Route path="/services" component={LazyServices} />
        <Route path="/country/:code" component={LazyCountry} />
        <Route path="/forum/:country" component={LazyForum} />
        <Route path="/dashboard" component={ProtectedRedirect} />
        <Route path="/my-documents" component={ProtectedRedirect} />
        <Route path="/my-payments" component={ProtectedRedirect} />
        <Route path="/payments" component={ProtectedRedirect} />
        <Route path="/my-account" component={ProtectedRedirect} />
        <Route path="/my-overview" component={ProtectedRedirect} />
        <Route path="/my-orders" component={ProtectedRedirect} />
        <Route path="/order/:orderId" component={ProtectedRedirect} />
        <Route path="/application-tracker" component={ProtectedRedirect} />
        <Route path="/profile" component={ProtectedRedirect} />
        <Route path="/referrals" component={ProtectedRedirect} />
        <Route path="/career-match" component={ProtectedRedirect} />
        <Route path="/service-order/:serviceId" component={LazyServiceOrderPage} />
        <Route path="/global-opportunities" component={LazyGlobalOpportunities} />
        {/* Canada Express Entry hub — public so we can market it */}
        <Route path="/canada/crs" component={LazyCanadaCrsPage} />
        <Route path="/canada/jobs" component={LazyCanadaJobsPage} />
        <Route path="/canada" component={LazyCanadaPage} />
        <Route path="/login" component={LazyLoginPage} />
        <Route path="/signup" component={LazyLoginPage} />
        <Route path="/forgot-password" component={LazyForgotPassword} />
        <Route path="/reset-password" component={LazyResetPassword} />
        <Route path="/shared/:id" component={LazySharedDocument} />
        <Route path="/error" component={ErrorRoute} />
        <Route path="/admin/:rest*" component={LazyAdminLogin} />
        <Route component={LazyNotFound} />
      </Switch>
    );
  }

  return (
    <>
      <AuthenticatedRoutes />
      <BottomNav />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AccessibilityProvider>
        <TooltipProvider>
          <UpgradeModalProvider>
            <AgeVerificationGate>
              <SkipLink />
              <NetworkStatus />
              <Toaster />
              <AdminQuickPanel />
              <FirebaseConnectionBanner />
              <SessionGuard />
              <DataConsentBanner />
              <PhoneCompletionModal />
              <main id="main-content" tabIndex={-1} className="pb-bottom-nav">
                <Router />
              </main>
              <UpgradeModal />
              <LiveActivityFeed />
              <LazyNanjilaChatWidget />
              <InstallAppPrompt />
              <GlobalBackButton />
              <GlobalPlanListener />
            </AgeVerificationGate>
          </UpgradeModalProvider>
        </TooltipProvider>
      </AccessibilityProvider>
    </QueryClientProvider>
  );
}

export default App;
