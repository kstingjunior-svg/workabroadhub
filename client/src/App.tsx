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
import AdminRevenue from "@/pages/admin/revenue";
import AdminRevenueLive from "@/pages/admin/revenue-live";
import { AdminQuickPanel } from "@/components/admin-quick-panel";
import { FirebaseConnectionBanner } from "@/components/firebase-connection-banner";
import { SessionGuard } from "@/components/session-guard";
import { lazy, Suspense, ComponentType, useEffect, useState } from "react";
import { prefetchCriticalData } from "./lib/queryClient";
import { startServicesPriceWatcher } from "@/lib/services";
import { usePageViewFunnel } from "@/hooks/use-page-view-funnel";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { LiveActivityFeed } from "@/components/live-activity-feed";
import NanjilaChatWidget from "@/components/NanjilaChatWidget";

// =============================================================================
// PERFORMANCE: Lazy load ALL pages for code splitting
// Critical pages (Landing, Dashboard) are loaded with prefetch hints
// Admin pages only load when accessing /admin/* routes
// =============================================================================

// Critical path - loaded immediately for fast initial render
import Landing from "@/pages/landing";

// Lazy load all other pages with meaningful chunk names
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Pricing = lazy(() => import("@/pages/pricing"));
const Payment = lazy(() => import("@/pages/payment"));
const Country = lazy(() => import("@/pages/country"));
const GlobalOpportunities = lazy(() => import("@/pages/global-opportunities"));
const Services = lazy(() => import("@/pages/services"));
const NeaAgencies = lazy(() => import("@/pages/nea-agencies"));
const AgenciesMarketplace = lazy(() => import("@/pages/agencies"));
const AgencyProfilePage = lazy(() => import("@/pages/agency-profile"));
const Profile = lazy(() => import("@/pages/profile"));
const AgencyPortal = lazy(() => import("@/pages/agency-portal"));
const ServiceOrderPage = lazy(() => import("@/pages/service-order"));
const MyOrders = lazy(() => import("@/pages/my-orders"));
const MyAccountPage = lazy(() => import("@/pages/my-account"));
const OrderDetail = lazy(() => import("@/pages/order-detail"));
const StudentVisas = lazy(() => import("@/pages/student-visas"));
const AssistedApply = lazy(() => import("@/pages/assisted-apply"));
const ApplicationTracker = lazy(() => import("@/pages/application-tracker"));
const PrivacyPolicy = lazy(() => import("@/pages/privacy-policy"));
const TermsOfService = lazy(() => import("@/pages/terms-of-service"));
const RefundPolicy = lazy(() => import("@/pages/refund-policy"));
const AboutPage = lazy(() => import("@/pages/about"));
const ContactPage = lazy(() => import("@/pages/contact"));
const FAQPage = lazy(() => import("@/pages/faq"));
const Referrals = lazy(() => import("@/pages/referrals"));
const ReferralTerms = lazy(() => import("@/pages/referral-terms"));
const CareerMatch = lazy(() => import("@/pages/career-match"));
const ReportAbuse = lazy(() => import("@/pages/report-abuse"));
const LegalDisclaimer = lazy(() => import("@/pages/legal-disclaimer"));
const DataSafety = lazy(() => import("@/pages/data-safety"));
const Verify = lazy(() => import("@/pages/verify"));
const AgencyMap = lazy(() => import("@/pages/agency-map"));
const ComplianceIndex = lazy(() => import("@/pages/compliance-index"));
const CertificateVerify = lazy(() => import("@/pages/certificate-verify"));
const ScamLookup = lazy(() => import("@/pages/scam-lookup"));
const ReportFraud = lazy(() => import("@/pages/report-fraud"));
const ReportScam = lazy(() => import("@/pages/report-scam"));
const ScamWall = lazy(() => import("@/pages/scam-wall"));
const GreenCard = lazy(() => import("@/pages/green-card"));
const VisaGuides = lazy(() => import("@/pages/visa-guides"));
const VisaCountry = lazy(() => import("@/pages/visa-country"));
const VisaAssistant = lazy(() => import("@/pages/visa-assistant"));
const BulkApply = lazy(() => import("@/pages/bulk-apply"));
const UploadCV = lazy(() => import("@/pages/upload-cv"));
const AutoApply = lazy(() => import("@/pages/tools/auto-apply"));
const ErrorRoute = lazy(() => import("@/pages/error"));
const MyPayments = lazy(() => import("@/pages/my-payments"));
const PayPage = lazy(() => import("@/pages/pay"));
const MyDocuments = lazy(() => import("@/pages/my-documents"));
const MyOverview = lazy(() => import("@/pages/my-overview"));
const LoginPage = lazy(() => import("@/pages/login"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
const SharedDocument = lazy(() => import("@/pages/shared-document"));
const Forum = lazy(() => import("@/pages/forum"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Admin pages - heavy bundle, only loaded when needed
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminMainIndex = lazy(() => import("@/pages/admin/index"));
const AdminCountries = lazy(() => import("@/pages/admin/countries"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminPayments = lazy(() => import("@/pages/admin/payments"));
const AdminUnmatchedPayments = lazy(() => import("@/pages/admin/unmatched-payments"));
const AdminServices = lazy(() => import("@/pages/admin/services"));
const AdminAlerts = lazy(() => import("@/pages/admin/alerts"));
const AdminAgencies = lazy(() => import("@/pages/admin/agencies"));
const AdminAgencyClaims = lazy(() => import("@/pages/admin/agency-claims"));
const AdminLicenseExpiry = lazy(() => import("@/pages/admin/license-expiry"));
const AdminLicenseReminders = lazy(() => import("@/pages/admin/license-reminders"));
const AdminExpiryHeatmap = lazy(() => import("@/pages/admin/expiry-heatmap"));
const AdminAgencyAddOns = lazy(() => import("@/pages/admin/agency-addons"));
const AdminServiceOrders = lazy(() => import("@/pages/admin/service-orders"));
const AdminJobApplications = lazy(() => import("@/pages/admin/job-applications"));
const AdminReviewDashboard = lazy(() => import("@/pages/admin/review-dashboard"));
const AdminTrustDashboard = lazy(() => import("@/pages/admin/trust-dashboard"));
const AdminPushNotifications = lazy(() => import("@/pages/admin/push-notifications"));
const AdminSmsWhatsApp = lazy(() => import("@/pages/admin/sms-whatsapp"));
const AdminAnalytics = lazy(() => import("@/pages/admin/analytics"));
const AdminLogin = lazy(() => import("@/pages/admin/login"));
const AdminReferrals = lazy(() => import("@/pages/admin/referrals"));
const AdminConsultations = lazy(() => import("@/pages/admin/consultations"));
const AdminGovernmentIntegrations = lazy(() => import("@/pages/admin/government-integrations"));
const AdminPricing = lazy(() => import("@/pages/admin/pricing"));
const AdminAgencyScores = lazy(() => import("@/pages/admin/agency-scores"));
const AdminFraudDetection = lazy(() => import("@/pages/admin/fraud-detection"));
const AdminScamReports = lazy(() => import("@/pages/admin/scam-reports"));
const AdminComplianceMonitor = lazy(() => import("@/pages/admin/compliance-monitor"));
const AdminSecurity = lazy(() => import("@/pages/admin/security"));
const AdminRefunds = lazy(() => import("@/pages/admin/refunds"));
const AdminPlans = lazy(() => import("@/pages/admin/plans"));
const AdminLogs = lazy(() => import("@/pages/admin/logs"));
const AdminFunnel = lazy(() => import("@/pages/admin/funnel"));
const AdminSuccessStories = lazy(() => import("@/pages/admin/success-stories"));
const AdminReportedAgencies = lazy(() => import("@/pages/admin/reported-agencies"));
const AdminBookings = lazy(() => import("@/pages/admin/bookings"));
const AdminAgencyRatings = lazy(() => import("@/pages/admin/agency-ratings"));
const AdminPortalHealth = lazy(() => import("@/pages/admin/portal-health"));
const AdminModeration = lazy(() => import("@/pages/admin/moderation"));
const AdminSupabaseStats = lazy(() => import("@/pages/admin/supabase-stats"));
const CommunityPortals = lazy(() => import("@/pages/community-portals"));
const ToolsHub = lazy(() => import("@/pages/tools/index"));
const ATSCVChecker = lazy(() => import("@/pages/tools/ats-cv-checker"));
const JobScamChecker = lazy(() => import("@/pages/tools/job-scam-checker"));
const VisaSponsorshipJobs = lazy(() => import("@/pages/tools/visa-sponsorship-jobs"));
const CVTemplates = lazy(() => import("@/pages/tools/cv-templates"));
const JobApplicationAssistant = lazy(() => import("@/pages/tools/job-application-assistant"));
const ToolReport = lazy(() => import("@/pages/tools/tool-report"));
const BulkAgencyVerify = lazy(() => import("@/pages/tools/bulk-agency-verify"));
const AdminErrorMonitor = lazy(() => import("@/pages/admin/error-monitor"));

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
    if (location && location !== "/" && location !== "/dashboard") {
      navigate("/login?redirect=" + encodeURIComponent(location), { replace: true });
    } else {
      navigate("/login", { replace: true });
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
const LazyAssistedApply = withSuspense(AssistedApply);
const LazyApplicationTracker = withSuspense(ApplicationTracker);
const LazyPrivacyPolicy = withSuspense(PrivacyPolicy);
const LazyTermsOfService = withSuspense(TermsOfService);
const LazyRefundPolicy = withSuspense(RefundPolicy);
const LazyAboutPage = withSuspense(AboutPage);
const LazyContactPage = withSuspense(ContactPage);
const LazyFAQPage = withSuspense(FAQPage);
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
      <Route path="/assisted-apply/purchase/:packId" component={LazyAssistedApply} />
      <Route path="/assisted-apply/new" component={LazyAssistedApply} />
      <Route path="/assisted-apply/application/:applicationId" component={LazyAssistedApply} />
      <Route path="/assisted-apply" component={LazyAssistedApply} />
      <Route path="/application-tracker" component={LazyApplicationTracker} />
      <Route path="/profile" component={LazyProfile} />
      <Route path="/my-account" component={() => <Suspense fallback={<div />}><MyAccountPage /></Suspense>} />
      <Route path="/my-payments" component={MyPayments} />
      <Route path="/payments" component={MyPayments} />
      <Route path="/my-documents" component={MyDocuments} />
      <Route path="/my-overview" component={MyOverview} />
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
      <Route path="/admin/revenue" component={AdminRevenue} />
      <Route path="/admin/revenue-live" component={AdminRevenueLive} />
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

  // Safety net: if auth check takes > 4 seconds, unblock the app
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => setLoadingTimedOut(true), 4000);
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
        <Route path="/" component={Landing} />
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
              <NanjilaChatWidget />
            </AgeVerificationGate>
          </UpgradeModalProvider>
        </TooltipProvider>
      </AccessibilityProvider>
    </QueryClientProvider>
  );
}

export default App;
