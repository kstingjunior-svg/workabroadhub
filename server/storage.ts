// @ts-nocheck
import {
  countries,
  countryGuides,
  jobLinks,
  scamAlerts,
  payments,
  services,
  userSubscriptions,
  neaAgencies,
  agencyReports,
  agencyClaims,
  agencyNotifications,
  agencyAddOns,
  agencyClicks,
  agencyProfiles,
  serviceOrders,
  serviceDeliverables,
  userNotifications,
  pushSubscriptions,
  scheduledNotifications,
  jobCounts,
  studentVisas,
  visaRequirements,
  visaSteps,
  visaLinks,
  applicationPacks,
  userApplicationPacks,
  userJobApplications,
  applicationStatusHistory,
  trackedApplications,
  mpesaUsers,
  referrals,
  adminLogs,
  influencers,
  accountLockouts,
  webhookProcessingLocks,
  countryInsights,
  advisors,
  consultationBookings,
  successStories,
  userCareerProfiles,
  jobAlertSubscriptions,
  videoTestimonials,
  agencyJobs,
  type AgencyJob,
  type InsertAgencyJob,
  agencyNotificationPreferences,
  notificationPreferences,
  licenseReminderLogs,
  licenseRenewalPayments,
  governmentIntegrations,
  governmentSyncLogs,
  governmentFeatureFlags,
  type LicenseRenewalPayment,
  type InsertLicenseRenewalPayment,
  type GovernmentIntegration,
  type InsertGovernmentIntegration,
  type GovernmentSyncLog,
  type InsertGovernmentSyncLog,
  type GovernmentFeatureFlag,
  type InsertGovernmentFeatureFlag,
  manualOverrides,
  type ManualOverride,
  type InsertManualOverride,
  paymentRetryLogs,
  type PaymentRetryLog,
  type InsertPaymentRetryLog,
  userServices,
  type UserService,
  type InsertUserService,
  paymentAuditLogs,
  type PaymentAuditLog,
  securityEvents,
  type SecurityEvent,
  type InsertSecurityEvent,
  complianceAuditLogs,
  type ComplianceAuditLog,
  type InsertComplianceAuditLog,
  governmentDowntimeEvents,
  type GovernmentDowntimeEvent,
  type InsertGovernmentDowntimeEvent,
  auditExports,
  type AuditExport,
  type InsertAuditExport,
  agencyLegitimacyScores,
  agencyScoreHistory,
  agencyComplianceEvents,
  agencyScoreWeights,
  type AgencyLegitimacyScore,
  type InsertAgencyLegitimacyScore,
  type AgencyScoreHistoryRecord,
  type InsertAgencyScoreHistory,
  type AgencyComplianceEvent,
  type InsertAgencyComplianceEvent,
  type AgencyScoreWeight,
  type InsertAgencyScoreWeight,
  blacklistedEntities,
  fraudFlags,
  fraudInvestigationNotes,
  fraudDetectionRules,
  type BlacklistedEntity,
  type InsertBlacklistedEntity,
  type FraudFlag,
  type InsertFraudFlag,
  type FraudInvestigationNote,
  type InsertFraudInvestigationNote,
  type FraudDetectionRule,
  type InsertFraudDetectionRule,
  type Referral,
  type InsertReferral,
  type Influencer,
  type InsertInfluencer,
  type AdminLog,
  type InsertAdminLog,
  type AccountLockout,
  type InsertAccountLockout,
  type WebhookProcessingLock,
  type InsertWebhookProcessingLock,
  type Country,
  type InsertCountry,
  type CountryGuide,
  type InsertCountryGuide,
  type JobLink,
  type InsertJobLink,
  type ScamAlert,
  type InsertScamAlert,
  refundRequests,
  type RefundRequest,
  type InsertRefundRequest,
  type Payment,
  type InsertPayment,
  type Service,
  type InsertService,
  type UserSubscription,
  type InsertUserSubscription,
  type CountryWithDetails,
  type AgencyNotification,
  type InsertAgencyNotification,
  type NeaAgency,
  type InsertNeaAgency,
  type AgencyReport,
  type InsertAgencyReport,
  type AgencyClaim,
  type InsertAgencyClaim,
  type AgencyAddOn,
  type InsertAgencyAddOn,
  type AgencyClick,
  type InsertAgencyClick,
  type AgencyProfile,
  type InsertAgencyProfile,
  type ServiceOrder,
  type InsertServiceOrder,
  type ServiceDeliverable,
  type InsertServiceDeliverable,
  type UserNotification,
  type InsertUserNotification,
  type PushSubscription,
  type InsertPushSubscription,
  type ScheduledNotification,
  type InsertScheduledNotification,
  type JobCount,
  type InsertJobCount,
  type StudentVisa,
  type InsertStudentVisa,
  type VisaRequirement,
  type InsertVisaRequirement,
  type VisaStep,
  type InsertVisaStep,
  type VisaLink,
  type InsertVisaLink,
  type StudentVisaWithDetails,
  type ApplicationPack,
  type InsertApplicationPack,
  type UserApplicationPack,
  type InsertUserApplicationPack,
  type UserJobApplication,
  type InsertUserJobApplication,
  type ApplicationStatusHistory,
  type InsertApplicationStatusHistory,
  type TrackedApplication,
  type InsertTrackedApplication,
  type MpesaUser,
  type CountryInsights,
  type Advisor,
  type ConsultationBooking,
  type InsertConsultationBooking,
  type SuccessStory,
  type UserCareerProfile,
  type InsertUserCareerProfile,
  type JobAlertSubscription,
  type InsertJobAlertSubscription,
  type VideoTestimonial,
  type InsertVideoTestimonial,
  type AgencyNotificationPreference,
  type InsertAgencyNotificationPreference,
  type LicenseReminderLog,
  type InsertLicenseReminderLog,
  complianceRiskScores,
  complianceRiskHistory,
  complianceAnomalies,
  complianceAlerts,
  complianceRiskConfig,
  type ComplianceRiskScore,
  type InsertComplianceRiskScore,
  type ComplianceRiskHistory,
  type InsertComplianceRiskHistory,
  type ComplianceAnomaly,
  type InsertComplianceAnomaly,
  type ComplianceAlert,
  type InsertComplianceAlert,
  type ComplianceRiskConfig,
  type InsertComplianceRiskConfig,
  complianceIndexScores,
  complianceIndexHistory,
  complianceIndexConfig,
  type ComplianceIndexScore,
  type InsertComplianceIndexScore,
  type ComplianceIndexHistory,
  type InsertComplianceIndexHistory,
  type ComplianceIndexConfig,
  type InsertComplianceIndexConfig,
  agencyCertificates,
  type AgencyCertificate,
  type InsertAgencyCertificate,
  fraudReports,
  type FraudReport,
  type InsertFraudReport,
  fraudIndicators,
  type FraudIndicator,
  type InsertFraudIndicator,
  securityAlerts,
  type SecurityAlert,
  type InsertSecurityAlert,
  analyticsEvents,
  conversionEvents,
  dailyStats,
  type AnalyticsEvent,
  type InsertAnalyticsEvent,
  type ConversionEvent,
  type InsertConversionEvent,
  type DailyStats,
  type InsertDailyStats,
  jobs,
  type Job,
  type InsertJob,
  toolUsage,
  type ToolUsage,
  type InsertToolUsage,
  cvTemplateDownloads,
  type CvTemplateDownload,
  type InsertCvTemplateDownload,
  toolReports,
  type ToolReport,
  type InsertToolReport,
  plans,
  type Plan,
  promoCodes,
  type PromoCode,
  type InsertPromoCode,
  aiUsage,
  scamReports,
  type ScamReport,
  type InsertScamReport,
  deliveries,
  type Delivery,
  type InsertDelivery,
} from "../shared/schema";
import { users, type User } from "../shared/models/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import { db, pool } from "./db";
import { eq, desc, asc, and, or, ilike, sql, lt, inArray, gte, count, isNull } from "drizzle-orm";

export interface IStorage {
  getCountries(): Promise<Country[]>;
  getCountryById(id: string): Promise<Country | undefined>;
  getCountryByCode(code: string): Promise<Country | undefined>;
  getCountryWithDetails(code: string): Promise<CountryWithDetails | undefined>;
  getAllCountriesWithDetails(): Promise<CountryWithDetails[]>;
  createCountry(country: InsertCountry): Promise<Country>;
  updateCountry(id: string, country: Partial<InsertCountry>): Promise<Country | undefined>;

  getCountryGuides(countryId: string): Promise<CountryGuide[]>;
  getGuideById(id: string): Promise<CountryGuide | undefined>;
  createGuide(guide: InsertCountryGuide): Promise<CountryGuide>;
  updateGuide(id: string, data: Partial<InsertCountryGuide>): Promise<CountryGuide | undefined>;
  upsertCountryGuide(guide: InsertCountryGuide): Promise<CountryGuide>;

  getJobLinks(countryId: string): Promise<JobLink[]>;
  getJobLinkById(id: string): Promise<JobLink | undefined>;
  createJobLink(link: InsertJobLink): Promise<JobLink>;
  updateJobLink(id: string, link: Partial<InsertJobLink>): Promise<JobLink | undefined>;
  deleteJobLink(id: string): Promise<void>;
  incrementJobLinkClick(id: string): Promise<void>;
  verifyJobLink(id: string): Promise<void>;

  getAllScamAlerts(): Promise<ScamAlert[]>;
  createScamAlert(alert: InsertScamAlert): Promise<ScamAlert>;
  updateScamAlert(id: string, data: Partial<InsertScamAlert>): Promise<ScamAlert | undefined>;

  getPayments(): Promise<Payment[]>;
  getPaymentsByUser(userId: string): Promise<Payment[]>;
  getPaymentsByStatus(status: string): Promise<Payment[]>;
  getPaymentById(id: string): Promise<Payment | undefined>;
  getPaymentByTransactionRef(ref: string): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, payment: Partial<InsertPayment>): Promise<Payment | undefined>;
  getPaymentsEligibleForAutoRetry(gatewayMethod?: string): Promise<Payment[]>;
  // Atomic idempotency claim — returns true only for the first caller.
  // Uses UPDATE WHERE processed = false RETURNING id so parallel callbacks
  // cannot both get true; the loser gets false and must return immediately.
  markPaymentProcessed(paymentId: string): Promise<boolean>;
  // Undo the processed flag when mid-processing fails (DB error, upgrade error, etc.)
  // so Safaricom retries can re-attempt after the webhook lock expires.
  // Never clears the flag on successfully activated payments (status=success/completed).
  resetPaymentProcessed(paymentId: string): Promise<void>;
  expireStaleServiceOrders(olderThanHours?: number): Promise<ServiceOrder[]>;
  getAbandonedOrders(minMinutes?: number, maxHours?: number): Promise<ServiceOrder[]>;
  markAbandonedCartAlerted(orderId: string): Promise<void>;

  // Payment retry logs
  createPaymentRetryLog(data: InsertPaymentRetryLog): Promise<PaymentRetryLog>;
  getPaymentRetryLogs(paymentId: string): Promise<PaymentRetryLog[]>;

  // Refund requests
  createRefundRequest(data: InsertRefundRequest): Promise<RefundRequest>;
  getRefundRequests(): Promise<RefundRequest[]>;
  getRefundRequestsByUser(userId: string): Promise<RefundRequest[]>;
  getRefundRequestByPayment(paymentId: string): Promise<RefundRequest | undefined>;
  updateRefundRequest(id: string, data: Partial<RefundRequest>): Promise<RefundRequest | undefined>;

  getMpesaUserByPhone(phone: string): Promise<MpesaUser | undefined>;
  getMpesaTransactionByReceipt(receiptNumber: string): Promise<MpesaUser | undefined>;
  getMpesaAllTransactions(limit?: number): Promise<MpesaUser[]>;
  getMpesaOrphanTransactions(limit?: number): Promise<MpesaUser[]>;
  getMpesaFailedCallbacks(limit?: number): Promise<WebhookProcessingLock[]>;
  getMpesaLockedAccounts(minFailures?: number): Promise<AccountLockout[]>;
  unlockAccount(id: string): Promise<void>;
  createMpesaTransaction(data: { phone: string; amount: number; mpesaReceipt?: string; transactionDate?: Date; status: string }): Promise<MpesaUser>;
  updateMpesaTransaction(id: number, data: Partial<{ mpesaReceipt: string; transactionDate: Date; status: string }>): Promise<MpesaUser | undefined>;

  getServices(): Promise<Service[]>;
  getServiceById(id: string): Promise<Service | undefined>;
  getServiceBySlug(slug: string): Promise<Service | undefined>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, service: Partial<InsertService>): Promise<Service | undefined>;
  deleteService(id: string): Promise<void>;

  getUserSubscription(userId: string): Promise<UserSubscription | undefined>;
  createUserSubscription(subscription: InsertUserSubscription): Promise<UserSubscription>;
  getAllSubscriptions(): Promise<UserSubscription[]>;
  updateSubscriptionStatus(userId: string, active: boolean): Promise<void>;
  createSubscription(userId: string): Promise<UserSubscription>;

  // Plan management
  getPlans(includeInactive?: boolean): Promise<Plan[]>;
  getPlanById(planId: string): Promise<Plan | undefined>;
  updatePlan(planId: string, data: Partial<Plan>): Promise<Plan | undefined>;
  upsertPlan(data: InsertPlan): Promise<Plan>;
  getUserPlan(userId: string): Promise<string>;
  updateUserLastSeen(userId: string): Promise<void>;
  activateUserPlan(userId: string, planId: string, paymentId: string, expiresAt?: Date | null): Promise<UserSubscription>;

  // Promo codes — DB-driven discount codes for resolvePrice()
  // createPromoCode  — admin creates a new code
  // getPromoCode     — fetch by code string for validation (case-insensitive)
  // usePromoCode     — atomically increment used_count (UPDATE WHERE used_count < max_uses)
  // listPromoCodes   — admin dashboard list
  // updatePromoCode  — admin update (toggle active, extend expiry, etc.)
  createPromoCode(data: InsertPromoCode): Promise<PromoCode>;
  getPromoCode(code: string): Promise<PromoCode | undefined>;
  usePromoCode(codeId: string, maxUses: number | null): Promise<boolean>;
  listPromoCodes(): Promise<PromoCode[]>;
  updatePromoCode(id: string, data: Partial<InsertPromoCode>): Promise<PromoCode | undefined>;

  // Service unlock — grant / query per-service access
  unlockService(userId: string, serviceId: string, paymentId: string, metadata?: Record<string, unknown>): Promise<UserService>;
  getUserServices(userId: string): Promise<UserService[]>;
  hasServiceAccess(userId: string, serviceId: string): Promise<boolean>;

  getAllUsers(): Promise<User[]>;
  getFilteredUsers(opts: {
    search?: string;
    plan?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ users: User[]; totalUsers: number; totalPages: number; currentPage: number }>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  // Canonical lookup: "@" → email search, otherwise → phone search (normalized).
  getUserByEmailOrPhone(identifier: string): Promise<User | undefined>;
  // Legacy: "@" → email, otherwise → id.
  getUserByEmailOrId(emailOrId: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByReferralCode(code: string): Promise<User | undefined>;
  generateAndSaveReferralCode(userId: string): Promise<string>;
  updateUserProfile(id: string, data: { phone?: string; country?: string; consentAccepted?: boolean }): Promise<User | undefined>;
  updateUserStatus(id: string, isActive: boolean): Promise<User | undefined>;
  setUserAdmin(id: string, isAdmin: boolean): Promise<User | undefined>;
  updateUserStage(userId: string, stage: "new" | "active" | "paid" | "inactive"): Promise<void>;
  getNonPayingUsers(limit?: number): Promise<User[]>;
  getFunnelStageStats(): Promise<{ stage: string; count: number; percentage: number }[]>;
  isUserAdmin(userId: string): Promise<boolean>;
  getUserCount(): Promise<number>;
  getSignupStats(): Promise<{ today: number; thisWeek: number; thisMonth: number }>;
  getActiveSubscriptionCount(): Promise<number>;
  getTotalRevenue(): Promise<number>;
  getRevenueToday(): Promise<number>;
  exportUserData(userId: string): Promise<Record<string, any>>;
  deleteUserAccount(userId: string): Promise<boolean>;

  // Agency Jobs
  getAgencyJobs(agencyId: string): Promise<AgencyJob[]>;
  getAllActiveAgencyJobs(filters?: { country?: string; category?: string }): Promise<AgencyJob[]>;
  getAgencyJobById(jobId: string): Promise<AgencyJob | undefined>;
  createAgencyJob(data: InsertAgencyJob): Promise<AgencyJob>;
  updateAgencyJob(jobId: string, data: Partial<InsertAgencyJob>): Promise<AgencyJob>;
  deleteAgencyJob(jobId: string): Promise<void>;
  incrementAgencyJobViews(jobId: string): Promise<void>;

  getNeaAgencies(search?: string, statusFilter?: string): Promise<NeaAgency[]>;
  getNeaAgencyById(id: string): Promise<NeaAgency | undefined>;
  createNeaAgency(agency: InsertNeaAgency): Promise<NeaAgency>;
  updateNeaAgency(id: string, agency: Partial<InsertNeaAgency>): Promise<NeaAgency | undefined>;
  deleteNeaAgency(id: string): Promise<void>;
  bulkCreateNeaAgencies(agencies: InsertNeaAgency[]): Promise<NeaAgency[]>;
  getAgencyByClaimedUser(userId: string): Promise<NeaAgency | undefined>;
  getAgencyStats(): Promise<{ total: number; valid: number; expired: number }>;
  searchAgenciesForClaim(query: string): Promise<NeaAgency[]>;
  claimAgency(agencyId: string, userId: string): Promise<NeaAgency>;
  verifyAgencyOwner(agencyId: string, userId: string): Promise<NeaAgency>;

  createAgencyClaim(claim: InsertAgencyClaim): Promise<AgencyClaim>;
  getAgencyClaims(filters?: { status?: string; agencyId?: string }): Promise<AgencyClaim[]>;
  getAgencyClaimById(id: string): Promise<AgencyClaim | undefined>;
  getUserClaimForAgency(userId: string, agencyId: string): Promise<AgencyClaim | undefined>;
  updateAgencyClaim(id: string, data: Partial<AgencyClaim>): Promise<AgencyClaim | undefined>;
  getAgencyClaimCount(): Promise<{ total: number; pending: number; approved: number; rejected: number }>;

  getAgencyReports(agencyId?: string): Promise<AgencyReport[]>;
  createAgencyReport(report: InsertAgencyReport): Promise<AgencyReport>;
  updateAgencyReportStatus(id: string, status: string): Promise<AgencyReport | undefined>;

  getAgencyNotifications(unreadOnly?: boolean): Promise<AgencyNotification[]>;
  createAgencyNotification(notification: InsertAgencyNotification): Promise<AgencyNotification>;
  markNotificationAsRead(id: string): Promise<void>;
  markAllNotificationsAsRead(): Promise<void>;
  getUnreadNotificationCount(): Promise<number>;
  checkNotificationExists(agencyId: string, type: string, date: string): Promise<boolean>;

  // Service orders
  getServiceOrders(filters?: { userId?: string; status?: string }): Promise<ServiceOrder[]>;
  getServiceOrderById(id: string): Promise<ServiceOrder | undefined>;
  getServiceOrderByPaymentRef(paymentRef: string): Promise<ServiceOrder | undefined>;
  createServiceOrder(order: InsertServiceOrder): Promise<ServiceOrder>;
  updateServiceOrder(id: string, data: Partial<InsertServiceOrder>): Promise<ServiceOrder | undefined>;

  // Service deliverables
  getDeliverablesByOrderId(orderId: string): Promise<ServiceDeliverable[]>;
  getDeliverablesByUserId(userId: string): Promise<Array<ServiceDeliverable & { serviceName: string; serviceId: string; orderedAt: Date | null }>>;
  getDeliverableById(id: string): Promise<ServiceDeliverable | undefined>;
  createDeliverable(deliverable: InsertServiceDeliverable): Promise<ServiceDeliverable>;
  incrementDownloadCount(id: string): Promise<void>;

  // Deliveries
  createDelivery(delivery: InsertDelivery): Promise<Delivery>;
  getUserDeliveries(userId: string): Promise<Delivery[]>;

  // User notifications
  getUserNotifications(userId: string, unreadOnly?: boolean): Promise<UserNotification[]>;
  createUserNotification(notification: InsertUserNotification): Promise<UserNotification>;
  markUserNotificationAsRead(id: string): Promise<void>;
  markAllUserNotificationsAsRead(userId: string): Promise<void>;
  getUnreadUserNotificationCount(userId: string): Promise<number>;

  // Job counts for real-time alerts
  getAllJobCounts(): Promise<JobCount[]>;
  getJobCountByCountry(countryCode: string): Promise<JobCount | undefined>;
  updateJobCount(countryCode: string, count: number, updatedBy?: string): Promise<JobCount>;

  // Trust metrics
  getTrustMetrics(): Promise<{
    totalOrders: number;
    autoApproved: number;
    humanReviewed: number;
    flaggedForReview: number;
    averageQualityScore: number;
    hallucinationDetections: number;
    autoApprovalRate: number;
    avgProcessingTime: number;
    recentOrders: ServiceOrder[];
    qualityDistribution: { excellent: number; good: number; acceptable: number; poor: number };
    failReasons: { reason: string; count: number }[];
    serviceStats: { serviceName: string; total: number; autoApproved: number; avgScore: number }[];
  }>;

  // Student Visa module
  getStudentVisasByCountry(countryCode: string): Promise<StudentVisaWithDetails[]>;
  getStudentVisaById(id: string): Promise<StudentVisaWithDetails | undefined>;
  getAllStudentVisas(): Promise<StudentVisa[]>;
  createStudentVisa(visa: InsertStudentVisa): Promise<StudentVisa>;
  updateStudentVisa(id: string, visa: Partial<InsertStudentVisa>): Promise<StudentVisa | undefined>;
  deleteStudentVisa(id: string): Promise<void>;
  
  // Visa requirements
  getVisaRequirements(visaId: string): Promise<VisaRequirement[]>;
  createVisaRequirement(requirement: InsertVisaRequirement): Promise<VisaRequirement>;
  deleteVisaRequirement(id: string): Promise<void>;
  
  // Visa steps
  getVisaSteps(visaId: string): Promise<VisaStep[]>;
  createVisaStep(step: InsertVisaStep): Promise<VisaStep>;
  deleteVisaStep(id: string): Promise<void>;
  
  // Visa links
  getVisaLinks(visaId?: string, countryCode?: string): Promise<VisaLink[]>;
  createVisaLink(link: InsertVisaLink): Promise<VisaLink>;
  deleteVisaLink(id: string): Promise<void>;

  // Assisted Apply Mode - Application Packs
  getApplicationPacks(): Promise<ApplicationPack[]>;
  getApplicationPackById(id: string): Promise<ApplicationPack | undefined>;
  createApplicationPack(pack: InsertApplicationPack): Promise<ApplicationPack>;
  updateApplicationPack(id: string, pack: Partial<InsertApplicationPack>): Promise<ApplicationPack | undefined>;
  deleteApplicationPack(id: string): Promise<void>;

  // User Application Packs
  getUserApplicationPacks(userId: string): Promise<UserApplicationPack[]>;
  getUserApplicationPackById(id: string): Promise<UserApplicationPack | undefined>;
  getUserApplicationPackByPaymentRef(paymentRef: string): Promise<UserApplicationPack | undefined>;
  createUserApplicationPack(pack: InsertUserApplicationPack): Promise<UserApplicationPack>;
  updateUserApplicationPack(id: string, pack: Partial<InsertUserApplicationPack>): Promise<UserApplicationPack | undefined>;

  // User Job Applications
  getUserJobApplications(userId: string): Promise<UserJobApplication[]>;
  getUserJobApplicationById(id: string): Promise<UserJobApplication | undefined>;
  createUserJobApplication(application: InsertUserJobApplication): Promise<UserJobApplication>;
  updateUserJobApplication(id: string, application: Partial<InsertUserJobApplication>): Promise<UserJobApplication | undefined>;

  // Application Status History
  getApplicationStatusHistory(applicationId: string): Promise<ApplicationStatusHistory[]>;
  createApplicationStatusHistory(history: InsertApplicationStatusHistory): Promise<ApplicationStatusHistory>;

  // User self-tracked applications
  getTrackedApplications(userId: string): Promise<TrackedApplication[]>;
  getTrackedApplicationById(id: string): Promise<TrackedApplication | undefined>;
  createTrackedApplication(application: InsertTrackedApplication): Promise<TrackedApplication>;
  updateTrackedApplication(id: string, application: Partial<InsertTrackedApplication>): Promise<TrackedApplication | undefined>;
  deleteTrackedApplication(id: string): Promise<void>;
  getTrackedApplicationStats(userId: string): Promise<{ total: number; applied: number; interviewing: number; offered: number }>;

  // Analytics
  recordAnalyticsEvent(event: InsertAnalyticsEvent): Promise<AnalyticsEvent>;
  recordConversionEvent(event: InsertConversionEvent): Promise<ConversionEvent>;
  getDailyStats(startDate: string, endDate: string): Promise<DailyStats[]>;
  incrementDailyStat(date: string, statType: string): Promise<void>;
  getConversionFunnel(startDate: Date, endDate: Date): Promise<{ step: string; count: number; percentage: number }[]>;
  getTopPages(startDate: Date, endDate: Date, limit: number): Promise<{ page: string; views: number }[]>;
  getDeviceBreakdown(startDate: Date, endDate: Date): Promise<{ device: string; count: number; percentage: number }[]>;
  getRecentEvents(limit: number): Promise<AnalyticsEvent[]>;
  getActiveUsers(minutes: number): Promise<number>;
  getEventsByCategory(startDate: Date, endDate: Date, category?: string): Promise<{ category: string; eventName: string; count: number }[]>;

  // Growth Tools Suite
  getVisaJobs(filters?: { country?: string; category?: string }): Promise<Job[]>;
  createJob(data: InsertJob): Promise<Job>;
  updateJob(id: string, data: Partial<InsertJob>): Promise<Job>;
  deleteJob(id: string): Promise<void>;
  recordToolUsage(data: { userId: string | null; toolName: string; metadata: any }): Promise<ToolUsage>;
  recordTemplateDownload(data: { templateId: string; userId: string | null }): Promise<CvTemplateDownload>;
  getToolsAnalytics(): Promise<{
    totalUsage: number;
    byTool: { toolName: string; count: number }[];
    mostUsedTool: string;
    dailyTrend: { date: string; count: number }[];
    templateDownloads: number;
  }>;

  // Tool Reports (viral shareable pages)
  createToolReport(data: InsertToolReport): Promise<ToolReport>;
  getToolReport(reportId: string): Promise<ToolReport | undefined>;
  incrementReportViews(reportId: string): Promise<void>;
  incrementReportShares(reportId: string): Promise<void>;

  // Per-user tool usage & premium status
  getUserToolUsageCount(userId: string, toolName: string): Promise<number>;
  userHasSuccessfulPayment(userId: string): Promise<boolean>;

  // Country Insights, Advisors, Consultations
  getCountryInsights(countryCode: string): Promise<CountryInsights | null>;
  getAllCountryInsights(): Promise<CountryInsights[]>;
  getActiveAdvisors(): Promise<Advisor[]>;
  getAdvisorById(id: string): Promise<Advisor | null>;
  createConsultationBooking(booking: InsertConsultationBooking): Promise<ConsultationBooking>;
  getUserConsultations(userId: string): Promise<ConsultationBooking[]>;
  getAllConsultations(): Promise<ConsultationBooking[]>;
  updateConsultationStatus(id: string, status: string): Promise<ConsultationBooking | null>;
  updateConsultationAdmin(id: string, data: { status?: string; advisorNotes?: string }): Promise<ConsultationBooking | null>;
  markConsultationWhatsappSent(id: string): Promise<void>;
  getFeaturedSuccessStories(): Promise<SuccessStory[]>;
  getAllSuccessStories(): Promise<SuccessStory[]>;

  // User Career Profiles & AI Matching
  getUserCareerProfile(userId: string): Promise<UserCareerProfile | null>;
  upsertUserCareerProfile(userId: string, data: Partial<InsertUserCareerProfile>): Promise<UserCareerProfile>;
  updateCareerProfileRecommendations(userId: string, recommendations: any): Promise<UserCareerProfile | null>;

  // Job Alert Subscriptions
  createJobAlertSubscription(subscription: InsertJobAlertSubscription): Promise<JobAlertSubscription>;
  getUserJobAlerts(userId: string): Promise<JobAlertSubscription[]>;
  updateJobAlert(id: string, data: Partial<InsertJobAlertSubscription>): Promise<JobAlertSubscription | null>;
  deleteJobAlert(id: string): Promise<void>;

  // Video Testimonials
  getVideoTestimonials(): Promise<VideoTestimonial[]>;
  createVideoTestimonial(testimonial: InsertVideoTestimonial): Promise<VideoTestimonial>;

  // License Reminder System
  getAgencyNotificationPreference(agencyId: string): Promise<AgencyNotificationPreference | undefined>;
  upsertAgencyNotificationPreference(pref: InsertAgencyNotificationPreference): Promise<AgencyNotificationPreference>;
  getAllAgencyNotificationPreferences(): Promise<AgencyNotificationPreference[]>;
  disableAgencyReminders(agencyId: string): Promise<void>;
  enableAgencyReminders(agencyId: string): Promise<void>;

  createLicenseReminderLog(log: InsertLicenseReminderLog): Promise<LicenseReminderLog>;
  getLicenseReminderLogs(filters?: { agencyId?: string; status?: string; reminderTier?: string; limit?: number; offset?: number }): Promise<LicenseReminderLog[]>;
  getLicenseReminderLogCount(filters?: { agencyId?: string; status?: string; reminderTier?: string }): Promise<number>;
  getLicenseReminderLogById(id: string): Promise<LicenseReminderLog | undefined>;
  updateLicenseReminderLog(id: string, data: Partial<InsertLicenseReminderLog>): Promise<LicenseReminderLog | undefined>;
  checkReminderAlreadySent(agencyId: string, reminderTier: string, date: string): Promise<boolean>;

  createLicenseRenewalPayment(payment: InsertLicenseRenewalPayment): Promise<LicenseRenewalPayment>;
  getLicenseRenewalPaymentById(id: string): Promise<LicenseRenewalPayment | undefined>;
  getLicenseRenewalPaymentByCheckoutId(checkoutRequestId: string): Promise<LicenseRenewalPayment | undefined>;
  getLicenseRenewalPaymentsByAgency(agencyId: string): Promise<LicenseRenewalPayment[]>;
  updateLicenseRenewalPayment(id: string, data: Partial<InsertLicenseRenewalPayment>): Promise<LicenseRenewalPayment | undefined>;

  // Manual Overrides (Fallback Module)
  getManualOverrides(filters?: { integrationCode?: string; overrideStatus?: string; syncStatus?: string; limit?: number; offset?: number }): Promise<ManualOverride[]>;
  getManualOverrideById(id: string): Promise<ManualOverride | undefined>;
  getManualOverrideByLicense(integrationCode: string, licenseNumber: string): Promise<ManualOverride | undefined>;
  createManualOverride(data: InsertManualOverride): Promise<ManualOverride>;
  updateManualOverride(id: string, data: Partial<ManualOverride>): Promise<ManualOverride | undefined>;
  getManualOverrideCount(filters?: { integrationCode?: string; overrideStatus?: string; syncStatus?: string }): Promise<number>;
  getPendingSyncOverrides(integrationCode: string): Promise<ManualOverride[]>;
  getExpiredManualOverrides(): Promise<ManualOverride[]>;

  // Security events (behavior tracking for AI anomaly detection)
  createSecurityEvent(data: InsertSecurityEvent): Promise<SecurityEvent>;
  getSecurityEvents(opts?: { eventType?: string; ipAddress?: string; userId?: string; since?: Date; limit?: number; offset?: number }): Promise<SecurityEvent[]>;
  getTopSuspiciousIPs(since: Date, limit?: number): Promise<{ ipAddress: string; totalRiskPoints: number; eventCount: number; eventTypes: string[] }[]>;
  getHighRiskUsers(since: Date, limit?: number): Promise<{ userId: string; totalRiskPoints: number; eventCount: number; eventTypes: string[] }[]>;
  getSecurityEventStats(since: Date): Promise<{ totalEvents: number; totalRiskPoints: number; uniqueIPs: number; uniqueUsers: number; byType: Record<string, number> }>;
  pruneOldSecurityEvents(olderThan: Date): Promise<number>;
  setIntegrationFallbackMode(code: string, enabled: boolean, reason?: string): Promise<GovernmentIntegration | undefined>;

  // Compliance Audit Logs (append-only)
  createComplianceAuditLog(log: InsertComplianceAuditLog): Promise<ComplianceAuditLog>;
  getComplianceAuditLogs(filters?: { userId?: string; action?: string; recordType?: string; recordId?: string; limit?: number; offset?: number }): Promise<ComplianceAuditLog[]>;
  getComplianceAuditLogCount(filters?: { userId?: string; action?: string; recordType?: string; recordId?: string }): Promise<number>;

  // Government Downtime Events
  createDowntimeEvent(event: InsertGovernmentDowntimeEvent): Promise<GovernmentDowntimeEvent>;
  getDowntimeEvents(filters?: { integrationCode?: string; eventType?: string; limit?: number; offset?: number }): Promise<GovernmentDowntimeEvent[]>;
  getDowntimeAnalytics(integrationCode?: string): Promise<{ totalEvents: number; totalOutages: number; totalFallbacks: number; avgDurationMs: number }>;

  // Audit Exports
  createAuditExport(data: InsertAuditExport): Promise<AuditExport>;
  getAuditExports(limit?: number): Promise<AuditExport[]>;

  // Agency Legitimacy Scores
  getAgencyScore(agencyId: string): Promise<AgencyLegitimacyScore | undefined>;
  upsertAgencyScore(data: InsertAgencyLegitimacyScore): Promise<AgencyLegitimacyScore>;
  getAllAgencyScores(filters?: { tier?: string; isFrozen?: boolean; limit?: number; offset?: number }): Promise<AgencyLegitimacyScore[]>;
  getAgencyScoreCount(filters?: { tier?: string; isFrozen?: boolean }): Promise<number>;
  freezeAgencyScore(agencyId: string, frozenBy: string, reason: string): Promise<void>;
  unfreezeAgencyScore(agencyId: string): Promise<void>;

  // Agency Score History
  createScoreHistory(data: InsertAgencyScoreHistory): Promise<AgencyScoreHistoryRecord>;
  getScoreHistory(agencyId: string, limit?: number): Promise<AgencyScoreHistoryRecord[]>;

  // Agency Compliance Events
  createComplianceEvent(data: InsertAgencyComplianceEvent): Promise<AgencyComplianceEvent>;
  getComplianceEvents(agencyId: string, limit?: number): Promise<AgencyComplianceEvent[]>;
  getRecentComplianceEvents(agencyId: string, monthsBack?: number): Promise<AgencyComplianceEvent[]>;

  // Agency Score Weights
  getScoreWeights(): Promise<AgencyScoreWeight[]>;
  updateScoreWeight(id: string, weight: number, updatedBy: string): Promise<AgencyScoreWeight>;

  // Compliance Risk Monitoring
  getComplianceRiskScores(filters?: { minScore?: number; maxScore?: number; trend?: string; limit?: number; offset?: number }): Promise<ComplianceRiskScore[]>;
  getComplianceRiskScoreByAgency(agencyId: string): Promise<ComplianceRiskScore | undefined>;
  getComplianceRiskHistory(agencyId: string, limit?: number): Promise<ComplianceRiskHistory[]>;
  getComplianceAnomalies(filters?: { status?: string; severity?: string; anomalyType?: string; limit?: number; offset?: number }): Promise<ComplianceAnomaly[]>;
  updateComplianceAnomaly(id: string, data: Partial<InsertComplianceAnomaly>): Promise<ComplianceAnomaly>;
  getComplianceAlerts(filters?: { status?: string; severity?: string; alertType?: string; limit?: number; offset?: number }): Promise<ComplianceAlert[]>;
  acknowledgeComplianceAlert(id: string, userId: string): Promise<ComplianceAlert>;
  resolveComplianceAlert(id: string, userId: string): Promise<ComplianceAlert>;
  getComplianceRiskConfig(): Promise<ComplianceRiskConfig[]>;
  updateComplianceRiskConfig(key: string, value: any): Promise<ComplianceRiskConfig>;
  getComplianceDashboardStats(): Promise<{ highRisk: number; openAnomalies: number; pendingAlerts: number; avgRiskScore: number; criticalAlerts: number }>;

  // Compliance Index
  getComplianceIndexRankings(filters?: { country?: string; industry?: string; badge?: string; search?: string; limit?: number; offset?: number }): Promise<ComplianceIndexScore[]>;
  getComplianceIndexByAgency(agencyId: string): Promise<ComplianceIndexScore | undefined>;
  getComplianceIndexHistory(agencyId: string, limit?: number): Promise<ComplianceIndexHistory[]>;
  getComplianceIndexStats(): Promise<{ totalRanked: number; avgScore: number; diamondCount: number; platinumCount: number; goldCount: number; silverCount: number }>;
  getComplianceIndexConfig(): Promise<ComplianceIndexConfig[]>;
  updateComplianceIndexConfig(key: string, value: any): Promise<ComplianceIndexConfig>;
  excludeAgencyFromIndex(agencyId: string, excludedBy: string, reason: string): Promise<void>;
  includeAgencyInIndex(agencyId: string): Promise<void>;

  // Agency Certificates
  getCertificateByCertId(certificateId: string): Promise<AgencyCertificate | undefined>;
  getCertificateByAgency(agencyId: string): Promise<AgencyCertificate | undefined>;
  listCertificates(filters?: { status?: string; limit?: number; offset?: number }): Promise<AgencyCertificate[]>;
  getCertificateCount(filters?: { status?: string }): Promise<number>;

  // Fraud Reports
  createFraudReport(data: InsertFraudReport): Promise<FraudReport>;
  getFraudReportById(id: string): Promise<FraudReport | undefined>;
  listFraudReports(filters?: { status?: string; incidentType?: string; limit?: number; offset?: number }): Promise<FraudReport[]>;
  getFraudReportCount(filters?: { status?: string; incidentType?: string }): Promise<number>;
  updateFraudReportStatus(id: string, status: string, updatedBy?: string, resolution?: string): Promise<FraudReport | undefined>;
  assignFraudReport(id: string, assignedTo: string): Promise<FraudReport | undefined>;
  getUserFraudReports(userId: string): Promise<FraudReport[]>;

  // Fraud Indicators
  createFraudIndicator(data: InsertFraudIndicator): Promise<FraudIndicator>;
  getFraudIndicatorById(id: string): Promise<FraudIndicator | undefined>;
  listFraudIndicators(filters?: { indicatorType?: string; riskLevel?: string; status?: string; limit?: number; offset?: number }): Promise<FraudIndicator[]>;
  getFraudIndicatorCount(filters?: { indicatorType?: string; riskLevel?: string; status?: string }): Promise<number>;
  updateFraudIndicator(id: string, data: Partial<FraudIndicator>): Promise<FraudIndicator | undefined>;
  deleteFraudIndicator(id: string): Promise<void>;

  // AI Usage Tracking
  getAiUsageToday(userId: string, toolName: string, date: string): Promise<{ questionsUsed: number } | undefined>;
  incrementAiUsage(userId: string, toolName: string, date: string): Promise<number>;
  addAiUsage(userId: string, toolName: string, date: string, count: number): Promise<number>;

  // Bulk Apply
  bulkCreateTrackedApplications(apps: InsertTrackedApplication[]): Promise<TrackedApplication[]>;

  // Scam Reports
  getScamReports(filters?: { status?: string; search?: string; country?: string; limit?: number; offset?: number }): Promise<ScamReport[]>;
  getScamReportById(id: string): Promise<ScamReport | undefined>;
  createScamReport(data: InsertScamReport): Promise<ScamReport>;
  updateScamReport(id: string, data: Partial<ScamReport>): Promise<ScamReport | undefined>;
  deleteScamReport(id: string): Promise<void>;
  countScamReports(status?: string): Promise<number>;
  getRecentScamReportsByUser(userId: string, since: Date): Promise<number>;
  // Scam Wall engagement
  getScamWallFeed(page: number, limit: number): Promise<{ reports: ScamReport[]; total: number }>;
  likeScamReport(reportId: string, fingerprint: string): Promise<{ liked: boolean; likesCount: number }>;
  hasLikedScamReport(reportId: string, fingerprint: string): Promise<boolean>;
  getScamWallComments(reportId: string): Promise<import('@shared/schema').ScamWallComment[]>;
  addScamWallComment(reportId: string, content: string, authorName: string): Promise<import('@shared/schema').ScamWallComment>;
  incrementScamReportViews(reportId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getCountries(): Promise<Country[]> {
    return db.select().from(countries);
  }

  async getCountryById(id: string): Promise<Country | undefined> {
    const [country] = await db.select().from(countries).where(eq(countries.id, id));
    return country;
  }

  async getCountryByCode(code: string): Promise<Country | undefined> {
    const [country] = await db.select().from(countries).where(eq(countries.code, code));
    return country;
  }

  // OPTIMIZED: Parallel queries for faster response
  async getCountryWithDetails(code: string): Promise<CountryWithDetails | undefined> {
    const country = await this.getCountryByCode(code);
    if (!country) return undefined;

    // Run all queries in parallel
    const [guides, links, alerts] = await Promise.all([
      db.select().from(countryGuides).where(eq(countryGuides.countryId, country.id)),
      db.select().from(jobLinks).where(eq(jobLinks.countryId, country.id)).orderBy(jobLinks.order),
      db.select().from(scamAlerts).where(and(eq(scamAlerts.countryId, country.id), eq(scamAlerts.isActive, true))),
    ]);

    return {
      ...country,
      guides,
      jobLinks: links,
      scamAlerts: alerts,
    };
  }

  // OPTIMIZED: Batch queries to avoid N+1
  async getAllCountriesWithDetails(): Promise<CountryWithDetails[]> {
    const allCountries = await this.getCountries();
    
    if (allCountries.length === 0) return [];
    
    const countryIds = allCountries.map(c => c.id);
    
    // Batch all queries with Promise.all to avoid N+1
    const [allGuides, allLinks, allAlerts] = await Promise.all([
      db.select().from(countryGuides).where(inArray(countryGuides.countryId, countryIds)),
      db.select().from(jobLinks).where(inArray(jobLinks.countryId, countryIds)),
      db.select().from(scamAlerts).where(
        and(inArray(scamAlerts.countryId, countryIds), eq(scamAlerts.isActive, true))
      ),
    ]);
    
    // Map results to countries
    return allCountries.map(country => ({
      ...country,
      guides: allGuides.filter(g => g.countryId === country.id),
      jobLinks: allLinks
        .filter(l => l.countryId === country.id)
        .sort((a, b) => a.order - b.order),
      scamAlerts: allAlerts.filter(a => a.countryId === country.id),
    }));
  }

  async createCountry(country: InsertCountry): Promise<Country> {
    const [created] = await db.insert(countries).values(country).returning();
    return created;
  }

  async updateCountry(id: string, country: Partial<InsertCountry>): Promise<Country | undefined> {
    const [updated] = await db.update(countries).set(country).where(eq(countries.id, id)).returning();
    return updated;
  }

  async getCountryGuides(countryId: string): Promise<CountryGuide[]> {
    return db.select().from(countryGuides).where(eq(countryGuides.countryId, countryId));
  }

  async getGuideById(id: string): Promise<CountryGuide | undefined> {
    const [guide] = await db.select().from(countryGuides).where(eq(countryGuides.id, id));
    return guide;
  }

  async createGuide(guide: InsertCountryGuide): Promise<CountryGuide> {
    const [created] = await db.insert(countryGuides).values(guide).returning();
    return created;
  }

  async updateGuide(id: string, data: Partial<InsertCountryGuide>): Promise<CountryGuide | undefined> {
    const [updated] = await db.update(countryGuides).set(data).where(eq(countryGuides.id, id)).returning();
    return updated;
  }

  async upsertCountryGuide(guide: InsertCountryGuide): Promise<CountryGuide> {
    const [existing] = await db
      .select()
      .from(countryGuides)
      .where(and(eq(countryGuides.countryId, guide.countryId), eq(countryGuides.section, guide.section)));
    if (existing) {
      const [updated] = await db
        .update(countryGuides)
        .set({ content: guide.content })
        .where(eq(countryGuides.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(countryGuides).values(guide).returning();
    return created;
  }

  async getJobLinks(countryId: string): Promise<JobLink[]> {
    return db.select().from(jobLinks).where(eq(jobLinks.countryId, countryId)).orderBy(jobLinks.order);
  }

  async getJobLinkById(id: string): Promise<JobLink | undefined> {
    const [link] = await db.select().from(jobLinks).where(eq(jobLinks.id, id));
    return link;
  }

  async createJobLink(link: InsertJobLink): Promise<JobLink> {
    const [created] = await db.insert(jobLinks).values(link).returning();
    return created;
  }

  async updateJobLink(id: string, link: Partial<InsertJobLink>): Promise<JobLink | undefined> {
    const [updated] = await db.update(jobLinks).set(link).where(eq(jobLinks.id, id)).returning();
    return updated;
  }

  async deleteJobLink(id: string): Promise<void> {
    await db.delete(jobLinks).where(eq(jobLinks.id, id));
  }

  async incrementJobLinkClick(id: string): Promise<void> {
    await db.update(jobLinks)
      .set({ clickCount: sql`${jobLinks.clickCount} + 1` })
      .where(eq(jobLinks.id, id));
  }

  async verifyJobLink(id: string): Promise<void> {
    await db.update(jobLinks)
      .set({ lastVerified: new Date() })
      .where(eq(jobLinks.id, id));
  }

  async getAllScamAlerts(): Promise<ScamAlert[]> {
    return db.select().from(scamAlerts).orderBy(desc(scamAlerts.createdAt));
  }

  async createScamAlert(alert: InsertScamAlert): Promise<ScamAlert> {
    const [created] = await db.insert(scamAlerts).values(alert).returning();
    return created;
  }

  async updateScamAlert(id: string, data: Partial<InsertScamAlert>): Promise<ScamAlert | undefined> {
    const [updated] = await db.update(scamAlerts).set(data).where(eq(scamAlerts.id, id)).returning();
    return updated;
  }

  async getPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  }

  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt));
  }

  async getPaymentsByStatus(status: string): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.status, status)).orderBy(desc(payments.createdAt));
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [created] = await db.insert(payments).values(payment).returning();
    return created;
  }

  async updatePayment(id: string, payment: Partial<InsertPayment>): Promise<Payment | undefined> {
    const [updated] = await db.update(payments).set({ ...payment, updatedAt: new Date() } as any).where(eq(payments.id, id)).returning();
    return updated;
  }

  async getPaymentById(id: string): Promise<Payment | undefined> {
    const [row] = await db.select().from(payments).where(eq(payments.id, id));
    return row;
  }

  async getPaymentByTransactionRef(ref: string): Promise<Payment | undefined> {
    // Check dedicated checkout_request_id column first, fall back to legacy transactionRef
    const [byCheckoutId] = await db.select().from(payments).where(eq(payments.checkoutRequestId as any, ref));
    if (byCheckoutId) return byCheckoutId;
    const [byTransactionRef] = await db.select().from(payments).where(eq(payments.transactionRef as any, ref));
    return byTransactionRef;
  }

  // Payments eligible for automatic retry (status=retry_available, retryCount < maxRetries)
  async getPaymentsEligibleForAutoRetry(gatewayMethod?: string): Promise<Payment[]> {
    const conditions: any[] = [
      eq(payments.status, "retry_available"),
      sql`${payments.retryCount} < ${payments.maxRetries}`,
    ];
    if (gatewayMethod) {
      conditions.push(eq(payments.method, gatewayMethod));
    }
    return db.select().from(payments).where(and(...conditions)).orderBy(asc(payments.createdAt));
  }

  // Atomic idempotency claim — only the first caller wins.
  // The UPDATE is conditional on processed = false, so exactly one concurrent
  // caller gets rows.length === 1 (true); all others get 0 rows (false).
  async markPaymentProcessed(paymentId: string): Promise<boolean> {
    const rows = await db
      .update(payments)
      .set({ processed: true, processedAt: new Date() } as any)
      .where(and(eq(payments.id, paymentId), eq(payments.processed as any, false)))
      .returning({ id: payments.id });
    return rows.length > 0;
  }

  // Reset the processed flag so Safaricom retries (after the webhook lock expires)
  // can re-attempt activation on payments that failed mid-processing.
  // Only clears the flag when status is NOT already 'success' or 'completed' —
  // a fully activated payment can never be un-processed.
  async resetPaymentProcessed(paymentId: string): Promise<void> {
    await db
      .update(payments)
      .set({ processed: false, processedAt: null } as any)
      .where(
        and(
          eq(payments.id, paymentId),
          sql`${payments.status} NOT IN ('success', 'completed')`
        )
      );
  }

  // ── Payment Retry Logs ──────────────────────────────────────────────────────
  async createPaymentRetryLog(data: InsertPaymentRetryLog): Promise<PaymentRetryLog> {
    const [log] = await db.insert(paymentRetryLogs).values(data).returning();
    return log;
  }

  async getPaymentRetryLogs(paymentId: string): Promise<PaymentRetryLog[]> {
    return db.select().from(paymentRetryLogs)
      .where(eq(paymentRetryLogs.paymentId, paymentId))
      .orderBy(desc(paymentRetryLogs.createdAt));
  }

  // ── Refund Requests ────────────────────────────────────────────────────────
  async createRefundRequest(data: InsertRefundRequest): Promise<RefundRequest> {
    const [created] = await db.insert(refundRequests).values(data).returning();
    return created;
  }

  async getRefundRequests(): Promise<RefundRequest[]> {
    return db.select().from(refundRequests).orderBy(desc(refundRequests.createdAt));
  }

  async getRefundRequestsByUser(userId: string): Promise<RefundRequest[]> {
    return db.select().from(refundRequests).where(eq(refundRequests.userId, userId)).orderBy(desc(refundRequests.createdAt));
  }

  async getRefundRequestByPayment(paymentId: string): Promise<RefundRequest | undefined> {
    const [row] = await db.select().from(refundRequests).where(eq(refundRequests.paymentId, paymentId));
    return row;
  }

  async updateRefundRequest(id: string, data: Partial<RefundRequest>): Promise<RefundRequest | undefined> {
    const [updated] = await db.update(refundRequests).set({ ...data, updatedAt: new Date() } as any).where(eq(refundRequests.id, id)).returning();
    return updated;
  }
  // ──────────────────────────────────────────────────────────────────────────

  async getMpesaUserByPhone(phone: string): Promise<MpesaUser | undefined> {
    const [user] = await db.select().from(mpesaUsers).where(eq(mpesaUsers.phone, phone)).orderBy(desc(mpesaUsers.id));
    return user;
  }

  async getMpesaTransactionByReceipt(receiptNumber: string): Promise<MpesaUser | undefined> {
    const [tx] = await db.select().from(mpesaUsers)
      .where(eq(mpesaUsers.mpesaReceipt, receiptNumber))
      .limit(1);
    return tx;
  }

  async getMpesaAllTransactions(limit = 200): Promise<MpesaUser[]> {
    return db.select().from(mpesaUsers)
      .orderBy(desc(mpesaUsers.id))
      .limit(limit);
  }

  async getMpesaOrphanTransactions(limit = 100): Promise<MpesaUser[]> {
    return db.select().from(mpesaUsers)
      .where(eq(mpesaUsers.status, "orphan"))
      .orderBy(desc(mpesaUsers.id))
      .limit(limit);
  }

  async getMpesaFailedCallbacks(limit = 100): Promise<WebhookProcessingLock[]> {
    return db.select().from(webhookProcessingLocks)
      .where(eq(webhookProcessingLocks.status, "failed"))
      .orderBy(desc(webhookProcessingLocks.createdAt))
      .limit(limit);
  }

  async getMpesaLockedAccounts(minFailures = 3): Promise<AccountLockout[]> {
    return db.select().from(accountLockouts)
      .where(gte(accountLockouts.failedAttempts, minFailures))
      .orderBy(desc(accountLockouts.failedAttempts));
  }

  async unlockAccount(id: string): Promise<void> {
    await db.update(accountLockouts)
      .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(accountLockouts.id, id));
  }

  // ── Payment Audit Log ──────────────────────────────────────────────────────
  async createPaymentAuditLog(data: {
    paymentId?: string | null;
    event: string;
    ip?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<PaymentAuditLog> {
    const [row] = await db
      .insert(paymentAuditLogs)
      .values({
        paymentId: data.paymentId ?? null,
        event: data.event,
        ip: data.ip ?? null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      })
      .returning();
    return row;
  }

  async getPaymentAuditLogs(paymentId?: string, limit = 200): Promise<PaymentAuditLog[]> {
    if (paymentId) {
      return db
        .select()
        .from(paymentAuditLogs)
        .where(eq(paymentAuditLogs.paymentId, paymentId))
        .orderBy(desc(paymentAuditLogs.createdAt))
        .limit(limit);
    }
    return db
      .select()
      .from(paymentAuditLogs)
      .orderBy(desc(paymentAuditLogs.createdAt))
      .limit(limit);
  }

  // Expire any payments still in "awaiting_payment" after the cutoff window.
  // Returns the full list of expired records so callers can send user notifications.
  async expireStalePayments(olderThanMinutes = 15): Promise<Payment[]> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const expired = await db
      .update(payments)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(payments.status, "awaiting_payment"),
          sql`${payments.createdAt} < ${cutoff}`
        )
      )
      .returning();
    return expired;
  }

  async getAbandonedOrders(minMinutes = 60, maxHours = 48): Promise<ServiceOrder[]> {
    const minCutoff = new Date(Date.now() - minMinutes * 60 * 1000);
    const maxCutoff = new Date(Date.now() - maxHours * 60 * 60 * 1000);
    return db.select().from(serviceOrders).where(
      and(
        eq(serviceOrders.status, "pending_payment"),
        sql`${serviceOrders.createdAt} <= ${minCutoff}`,
        sql`${serviceOrders.createdAt} >= ${maxCutoff}`,
        isNull(serviceOrders.abandonedCartAlertSentAt),
      )
    ).orderBy(desc(serviceOrders.createdAt));
  }

  async markAbandonedCartAlerted(orderId: string): Promise<void> {
    await db.update(serviceOrders)
      .set({ abandonedCartAlertSentAt: new Date(), updatedAt: new Date() })
      .where(eq(serviceOrders.id, orderId));
  }

  async expireStaleServiceOrders(olderThanHours = 48): Promise<ServiceOrder[]> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const expired = await db
      .update(serviceOrders)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(serviceOrders.status, "pending_payment"),
          sql`${serviceOrders.updatedAt} < ${cutoff}`
        )
      )
      .returning();
    return expired;
  }
  // ───────────────────────────────────────────────────────────────────────────

  async createMpesaTransaction(data: { phone: string; amount: number; mpesaReceipt?: string; transactionDate?: Date; status: string }): Promise<MpesaUser> {
    const [created] = await db.insert(mpesaUsers).values(data).returning();
    return created;
  }

  async updateMpesaTransaction(id: number, data: Partial<{ mpesaReceipt: string; transactionDate: Date; status: string }>): Promise<MpesaUser | undefined> {
    const [updated] = await db.update(mpesaUsers).set(data).where(eq(mpesaUsers.id, id)).returning();
    return updated;
  }

  async getServices(): Promise<Service[]> {
    return db.select().from(services).orderBy(services.order);
  }

  async getServiceById(id: string): Promise<Service | undefined> {
    const [row] = await db.select().from(services).where(eq(services.id, id)).limit(1);
    return row;
  }

  async getServiceBySlug(slug: string): Promise<Service | undefined> {
    const [row] = await db.select().from(services).where(eq((services as any).slug, slug)).limit(1);
    return row;
  }

  async createService(service: InsertService): Promise<Service> {
    const [created] = await db.insert(services).values(service).returning();
    return created;
  }

  async updateService(id: string, service: Partial<InsertService>): Promise<Service | undefined> {
    const [updated] = await db.update(services).set(service).where(eq(services.id, id)).returning();
    return updated;
  }

  async deleteService(id: string): Promise<void> {
    await db.delete(services).where(eq(services.id, id));
  }

  async getUserSubscription(userId: string): Promise<UserSubscription | undefined> {
    const now = new Date();
    // Prefer the most-recent active, non-expired subscription.
    // Falls back to any subscription (even expired) if none is active — callers must check status/endDate.
    const [active] = await db
      .select()
      .from(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.status, "active"),
          or(
            sql`${userSubscriptions.endDate} IS NULL`,
            gte(userSubscriptions.endDate, now),
          ),
        ),
      )
      .orderBy(desc(userSubscriptions.createdAt));

    if (active) return active;

    // No active non-expired subscription — return the most recent row for display purposes
    const [latest] = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))
      .orderBy(desc(userSubscriptions.createdAt));
    return latest;
  }

  async createUserSubscription(subscription: InsertUserSubscription): Promise<UserSubscription> {
    const [created] = await db.insert(userSubscriptions).values(subscription).returning();
    // Sync denormalised plan field
    if (subscription.plan && subscription.status === "active") {
      await db.update(users).set({ plan: subscription.plan, updatedAt: new Date() }).where(eq(users.id, subscription.userId)).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    }
    return created;
  }

  async getAllSubscriptions(): Promise<UserSubscription[]> {
    return db.select().from(userSubscriptions);
  }

  async updateSubscriptionStatus(userId: string, active: boolean): Promise<void> {
    await db
      .update(userSubscriptions)
      .set({ status: active ? "active" : "canceled", updatedAt: new Date() })
      .where(eq(userSubscriptions.userId, userId));
  }

  async createSubscription(userId: string): Promise<UserSubscription> {
    const [created] = await db
      .insert(userSubscriptions)
      .values({
        userId,
        paymentId: null,
        status:    "active",
        plan:      "pro",
        endDate:   null,
        autoRenew: true,
      })
      .returning();
    return created;
  }

  // ── Plan management ───────────────────────────────────────────────────────
  async getPlans(includeInactive = false): Promise<Plan[]> {
    const query = db.select().from(plans);
    if (!includeInactive) {
      return query.where(eq(plans.isActive, true)).orderBy(plans.displayOrder, plans.price);
    }
    return query.orderBy(plans.displayOrder, plans.price);
  }

  async getPlanById(planId: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.planId, planId));
    return plan;
  }

  async updatePlan(planId: string, data: Partial<Plan>): Promise<Plan | undefined> {
    const { planId: _id, createdAt: _c, ...safeData } = data as any;
    const [updated] = await db
      .update(plans)
      .set({ ...safeData, updatedAt: new Date() })
      .where(eq(plans.planId, planId))
      .returning();
    return updated;
  }

  async upsertPlan(data: InsertPlan): Promise<Plan> {
    const [result] = await db
      .insert(plans)
      .values({ ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: plans.planId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return result;
  }

  async updateUserLastSeen(userId: string): Promise<void> {
    await db.update(users).set({ lastSeen: new Date() }).where(eq(users.id, userId));
  }

  async getUserPlan(userId: string): Promise<string> {
    const sub = await this.getUserSubscription(userId);

    // Always fetch users.plan — used as authoritative fallback for admin-promoted accounts
    const [userRow] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId));
    const usersPlan = userRow?.plan || "free";

    // If there's an active, non-expired subscription, return its plan
    if (sub && sub.status === "active") {
      if (!sub.endDate || sub.endDate >= new Date()) {
        if (sub.plan) return sub.plan;
        // Subscription is active but plan is null (legacy row) — trust users.plan
        if (usersPlan !== "free") {
          console.info(`[getUserPlan] Active subscription missing plan for userId=${userId} — using users.plan="${usersPlan}"`);
        }
        return usersPlan;
      }
      // Subscription exists but is expired — mark expired, lazy-sync users.plan to "free"
      db.update(userSubscriptions).set({ status: "expired", updatedAt: new Date() }).where(eq(userSubscriptions.userId, userId)).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      db.update(users).set({ plan: "free", subscriptionStatus: "expired", updatedAt: new Date() }).where(eq(users.id, userId)).catch((err) => {
        console.warn(`[getUserPlan] Could not sync expired plan for userId=${userId}:`, err?.message);
      });
      // Mirror expiry to Supabase subscriptions table
      import("./supabaseClient").then(({ downgradeSupabaseUser }) => downgradeSupabaseUser(userId)).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      return "free";
    }

    // No active subscription in userSubscriptions — fall back to the users.plan column
    // (handles admin-promoted users or edge cases where the subscription insert failed)
    if (usersPlan !== "free") {
      console.info(`[getUserPlan] No active subscription for userId=${userId} but users.plan="${usersPlan}" — using fallback`);
    }
    return usersPlan;
  }

  async activateUserPlan(userId: string, planId: string, paymentId: string, expiresAt?: Date | null): Promise<UserSubscription> {
    // Use a real DB transaction so all three writes (expire old, insert new, sync users.plan)
    // are atomic.  A crash between any of them can no longer leave inconsistent state.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Lock the current active subscription row (if any) so parallel callbacks
      // can't read a stale end_date and both compute the same extension.
      const { rows: [existing] } = await client.query<{ end_date: Date | null }>(
        `SELECT end_date FROM user_subscriptions
         WHERE user_id = $1 AND status = 'active'
         ORDER BY end_date DESC NULLS LAST
         LIMIT 1
         FOR UPDATE`,
        [userId],
      );

      // Extension logic (mirrors reference implementation):
      // • If the user already has time left → add 360 days to their current expiry
      //   (they don't lose remaining days when they renew early)
      // • If the subscription has lapsed → use the fresh expiresAt passed in
      const now = new Date();
      const freshExpiry  = expiresAt ?? new Date(Date.now() + 360 * 86_400_000);
      const duration     = freshExpiry.getTime() - now.getTime();          // 360d in ms
      const currentExpiry = existing?.end_date ? new Date(existing.end_date) : null;
      const finalExpiry  = (currentExpiry && currentExpiry > now)
        ? new Date(currentExpiry.getTime() + duration)                     // extend
        : freshExpiry;                                                     // fresh start

      // Expire all currently-active rows for this user (keeps the table tidy)
      await client.query(
        `UPDATE user_subscriptions
         SET status = 'expired', updated_at = now()
         WHERE user_id = $1 AND status = 'active'`,
        [userId],
      );

      // Insert the new active subscription
      const { rows: [created] } = await client.query<UserSubscription>(
        `INSERT INTO user_subscriptions
           (user_id, payment_id, status, plan, end_date, auto_renew, created_at, updated_at)
         VALUES ($1, $2, 'active', $3, $4, true, now(), now())
         RETURNING *`,
        [userId, paymentId || null, planId, finalExpiry],
      );

      // Sync denormalised fields so gating checks are instant (no join needed)
      await client.query(
        `UPDATE users SET plan = $1, subscription_status = 'active', updated_at = now() WHERE id = $2`,
        [planId, userId],
      );

      await client.query("COMMIT");

      if (currentExpiry && currentExpiry > now) {
        console.log(
          `[activateUserPlan] Extended "${planId}" for userId=${userId} ` +
          `from ${currentExpiry.toISOString()} → ${finalExpiry.toISOString()}`,
        );
      } else {
        console.log(
          `[activateUserPlan] Activated "${planId}" for userId=${userId} ` +
          `| expires=${finalExpiry.toISOString()}`,
        );
      }

      return created;
    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error(`[activateUserPlan] Transaction rolled back for userId=${userId}:`, err?.message);
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Promo codes ────────────────────────────────────────────────────────────

  async createPromoCode(data: InsertPromoCode): Promise<PromoCode> {
    const [row] = await db
      .insert(promoCodes)
      .values({ ...data, updatedAt: new Date() })
      .returning();
    return row;
  }

  // Case-insensitive lookup; checks active flag and expiry in-app (callers decide on expired codes).
  async getPromoCode(code: string): Promise<PromoCode | undefined> {
    const [row] = await db
      .select()
      .from(promoCodes)
      .where(sql`LOWER(${promoCodes.code}) = LOWER(${code})`);
    return row;
  }

  // Atomically claim one use of a promo code.
  // Returns true if the increment succeeded (used_count was still < maxUses or unlimited).
  // Uses UPDATE WHERE ... RETURNING to avoid a race condition between the check and increment.
  async usePromoCode(codeId: string, maxUses: number | null): Promise<boolean> {
    if (maxUses === null) {
      // Unlimited uses — just increment
      const rows = await db
        .update(promoCodes)
        .set({ usedCount: sql`${promoCodes.usedCount} + 1`, updatedAt: new Date() })
        .where(eq(promoCodes.id, codeId))
        .returning({ id: promoCodes.id });
      return rows.length > 0;
    }
    // Limited uses — conditional increment (only when room remains)
    const rows = await db
      .update(promoCodes)
      .set({ usedCount: sql`${promoCodes.usedCount} + 1`, updatedAt: new Date() })
      .where(and(eq(promoCodes.id, codeId), sql`${promoCodes.usedCount} < ${maxUses}`))
      .returning({ id: promoCodes.id });
    return rows.length > 0;
  }

  async listPromoCodes(): Promise<PromoCode[]> {
    return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
  }

  async updatePromoCode(id: string, data: Partial<InsertPromoCode>): Promise<PromoCode | undefined> {
    const [row] = await db
      .update(promoCodes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(promoCodes.id, id))
      .returning();
    return row;
  }

  // ── Service unlock ────────────────────────────────────────────────────────
  // Idempotent: uses ON CONFLICT DO UPDATE so duplicate calls are safe.
  async unlockService(
    userId: string,
    serviceId: string,
    paymentId: string,
    metadata?: Record<string, unknown>,
  ): Promise<UserService> {
    const [row] = await db
      .insert(userServices)
      .values({
        userId,
        serviceId,
        paymentId,
        unlockedAt: new Date(),
        expiresAt: null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      })
      .onConflictDoUpdate({
        target: [userServices.userId, userServices.serviceId],
        set: {
          paymentId,
          unlockedAt: new Date(),
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      })
      .returning();
    return row;
  }

  async getUserServices(userId: string): Promise<UserService[]> {
    return db
      .select()
      .from(userServices)
      .where(eq(userServices.userId, userId));
  }

  async hasServiceAccess(userId: string, serviceId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: userServices.id, expiresAt: userServices.expiresAt })
      .from(userServices)
      .where(
        and(
          eq(userServices.userId, userId),
          eq(userServices.serviceId, serviceId),
        ),
      );
    if (!row) return false;
    if (row.expiresAt && row.expiresAt < new Date()) return false;
    return true;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const { normalizePhone } = await import("./utils/phone");
    const normalized = normalizePhone(phone.trim());
    console.info(`[Storage][getUserByPhone] searching phone="${normalized}"`);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.phone, normalized));
    console.info(`[Storage][getUserByPhone] ${user ? `found userId=${user.id}` : "not found"}`);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(users)
      .where(ilike(users.email, normalized));
    return user;
  }

  // Canonical lookup: if input contains "@" → search by email, otherwise → normalize phone and search by phone.
  async getUserByEmailOrPhone(identifier: string): Promise<User | undefined> {
    const raw = identifier.trim();
    if (raw.includes("@")) {
      console.info(`[Storage][getUserByEmailOrPhone] searching by email="${raw.toLowerCase()}"`);
      const user = await this.getUserByEmail(raw);
      console.info(`[Storage][getUserByEmailOrPhone] email search ${user ? `found userId=${user.id}` : "not found"}`);
      return user;
    }
    // Phone lookup
    const { normalizePhone } = await import("./utils/phone");
    const normalized = normalizePhone(raw);
    console.info(`[Storage][getUserByEmailOrPhone] searching by phone="${normalized}" (raw="${raw}")`);
    const user = await this.getUserByPhone(normalized);
    console.info(`[Storage][getUserByEmailOrPhone] phone search ${user ? `found userId=${user.id}` : "not found"}`);
    return user;
  }

  // Legacy: email-first lookup — if input contains "@" query by email; otherwise query by id.
  async getUserByEmailOrId(emailOrId: string): Promise<User | undefined> {
    const isEmail = emailOrId.includes("@");
    if (isEmail) {
      return this.getUserByEmail(emailOrId);
    }
    return this.getUserById(emailOrId);
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getFilteredUsers(opts: {
    search?: string;
    plan?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ users: User[]; totalUsers: number; totalPages: number; currentPage: number }> {
    const { search = "", plan = "all", status = "all", page = 1, limit = 20 } = opts;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];

    if (search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(or(
        ilike(users.email, q),
        ilike(users.firstName, q),
        ilike(users.lastName, q),
        ilike(users.phone, q),
      ));
    }

    if (plan === "paid" || plan === "pro") {
      // Match users whose plan column is "pro" OR who have an active pro subscription
      // (covers cases where users.plan was not yet synced after a runtime grant)
      conditions.push(or(
        eq(users.plan, "pro"),
        sql`EXISTS (
          SELECT 1 FROM user_subscriptions us
          WHERE us.user_id = users.id
            AND us.plan = 'pro'
            AND us.status = 'active'
            AND (us.end_date IS NULL OR us.end_date > NOW())
        )`,
      ));
    } else if (plan === "free") {
      // Free = no "pro" in users.plan AND no active pro subscription
      conditions.push(and(
        or(eq(users.plan, "free"), sql`users.plan IS NULL`),
        sql`NOT EXISTS (
          SELECT 1 FROM user_subscriptions us
          WHERE us.user_id = users.id
            AND us.plan = 'pro'
            AND us.status = 'active'
            AND (us.end_date IS NULL OR us.end_date > NOW())
        )`,
      ));
    } else if (plan !== "all") {
      conditions.push(eq(users.plan, plan));
    }

    if (status === "active") {
      conditions.push(eq(users.isActive, true));
    } else if (status === "inactive") {
      conditions.push(eq(users.isActive, false));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult, userRows] = await Promise.all([
      db.select({ count: count() }).from(users).where(where),
      db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        country: users.country,
        isAdmin: users.isAdmin,
        isActive: users.isActive,
        role: users.role,
        plan: users.plan,
        userStage: users.userStage,
        authMethod: users.authMethod,
        referralCode: users.referralCode,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        lastLogin: users.lastLogin,
      }).from(users).where(where).orderBy(asc(users.firstName), asc(users.lastName), asc(users.email)).limit(limit).offset(offset),
    ]);

    const totalUsers = Number(totalResult[0]?.count ?? 0);
    const totalPages = Math.ceil(totalUsers / limit);

    return {
      users: userRows as User[],
      totalUsers,
      totalPages,
      currentPage: page,
    };
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByReferralCode(code: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.referralCode, code));
    return user;
  }

  async generateAndSaveReferralCode(userId: string): Promise<string> {
    const user = await this.getUserById(userId);
    if (user?.referralCode) return user.referralCode;
    const { generateUniqueReferralCode } = await import("./utils/referral-code");
    const code = await generateUniqueReferralCode();
    await db.update(users).set({ referralCode: code, updatedAt: new Date() }).where(eq(users.id, userId));
    return code;
  }

  async updateUserProfile(id: string, data: { phone?: string; country?: string; consentAccepted?: boolean }): Promise<User | undefined> {
    // Always store phone in normalized 254XXXXXXXXX format
    const payload: typeof data = { ...data };
    if (payload.phone) {
      const { normalizePhone } = await import("./utils/phone");
      payload.phone = normalizePhone(payload.phone.trim());
    }
    const [updated] = await db
      .update(users)
      .set({
        ...payload,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async updateUserStage(userId: string, stage: "new" | "active" | "paid" | "inactive"): Promise<void> {
    await db
      .update(users)
      .set({ userStage: stage, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
  }

  async getNonPayingUsers(limit = 500): Promise<User[]> {
    // Users who are still on the free plan — registered but never converted
    return db
      .select()
      .from(users)
      .where(eq(users.plan, "free"))
      .orderBy(desc(users.createdAt))
      .limit(limit);
  }

  async getFunnelStageStats(): Promise<{ stage: string; count: number; percentage: number }[]> {
    const all = await db.select({ stage: users.userStage }).from(users);
    const total = all.length;
    if (total === 0) return [];

    const counts: Record<string, number> = { new: 0, active: 0, paid: 0, inactive: 0 };
    for (const u of all) {
      const s = u.stage ?? "new";
      counts[s] = (counts[s] ?? 0) + 1;
    }

    return Object.entries(counts).map(([stage, count]) => ({
      stage,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  }

  async updateUserStatus(id: string, isActive: boolean): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async setUserAdmin(id: string, isAdmin: boolean): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ isAdmin, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async isUserAdmin(userId: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    return user?.isAdmin || false;
  }

  // Referral methods
  async createReferral(data: InsertReferral): Promise<Referral> {
    const [created] = await db
      .insert(referrals)
      .values(data)
      .returning();
    return created;
  }

  async getReferrals(): Promise<Referral[]> {
    return db.select().from(referrals).orderBy(desc(referrals.createdAt));
  }

  async getReferralsByCode(refCode: string): Promise<Referral[]> {
    return db
      .select()
      .from(referrals)
      .where(eq(referrals.refCode, refCode))
      .orderBy(desc(referrals.createdAt));
  }

  async updateReferralStatus(id: number, status: string, transactionId?: string): Promise<Referral | undefined> {
    const updateData: any = { status };
    if (status === "paid") {
      updateData.paidAt = new Date();
      if (transactionId) {
        updateData.transactionId = transactionId;
      }
    }
    const [updated] = await db
      .update(referrals)
      .set(updateData)
      .where(eq(referrals.id, id))
      .returning();
    return updated;
  }

  async getPendingReferrals(maxRetries: number = 5): Promise<Referral[]> {
    return db
      .select()
      .from(referrals)
      .where(
        and(
          eq(referrals.status, "pending"),
          sql`${referrals.retryCount} < ${maxRetries}`
        )
      )
      .orderBy(referrals.createdAt);
  }

  async markReferralPayoutAttempt(id: number, transactionId: string): Promise<Referral | undefined> {
    const [updated] = await db
      .update(referrals)
      .set({
        status: "processing",
        transactionId,
        lastPayoutAttempt: new Date(),
        retryCount: sql`${referrals.retryCount} + 1`,
      })
      .where(eq(referrals.id, id))
      .returning();
    return updated;
  }

  async markReferralFailed(id: number): Promise<Referral | undefined> {
    const [updated] = await db
      .update(referrals)
      .set({
        status: "failed",
        lastPayoutAttempt: new Date(),
        retryCount: sql`${referrals.retryCount} + 1`,
      })
      .where(eq(referrals.id, id))
      .returning();
    return updated;
  }

  // Fraud detection: Check for self-referrals and loops
  async checkFraud(refCode: string, referredPhone: string): Promise<{ isFraud: boolean; reason?: string }> {
    // Check if the referred phone has already been used
    const existingReferral = await db
      .select()
      .from(referrals)
      .where(eq(referrals.referredPhone, referredPhone));
    
    if (existingReferral.length > 0) {
      return { isFraud: true, reason: "Phone number already referred" };
    }

    // SECURITY: Check for self-referral by comparing influencer's phone with payer's phone
    const influencer = await this.getInfluencerByRefCode(refCode);
    if (influencer && influencer.phone) {
      // Normalize both phones to 2547XXXXXXXX format for comparison
      const { normalizePhone: normPhone } = await import("./utils/phone");
      if (normPhone(influencer.phone) === normPhone(referredPhone)) {
        return { isFraud: true, reason: "Self-referral detected" };
      }
    }

    // Check for duplicate referral from same refCode to same phone
    const refOwnerReferrals = await this.getReferralsByCode(refCode);
    if (refOwnerReferrals.some(r => r.referredPhone === referredPhone)) {
      return { isFraud: true, reason: "Duplicate referral detected" };
    }

    return { isFraud: false };
  }

  // Get referral by referred phone
  async getReferralByPhone(phone: string): Promise<Referral | undefined> {
    const [result] = await db
      .select()
      .from(referrals)
      .where(eq(referrals.referredPhone, phone));
    return result;
  }

  // Top partners analytics
  async getTopPartners(limit: number = 10): Promise<{ refCode: string; totalReferrals: number; totalCommission: number; pendingPayout: number }[]> {
    const allReferrals = await this.getReferrals();
    const partnerStats: Record<string, { totalReferrals: number; totalCommission: number; pendingPayout: number }> = {};
    
    for (const ref of allReferrals) {
      if (!partnerStats[ref.refCode]) {
        partnerStats[ref.refCode] = { totalReferrals: 0, totalCommission: 0, pendingPayout: 0 };
      }
      partnerStats[ref.refCode].totalReferrals++;
      partnerStats[ref.refCode].totalCommission += ref.commission;
      if (ref.status === "pending") {
        partnerStats[ref.refCode].pendingPayout += ref.commission;
      }
    }
    
    return Object.entries(partnerStats)
      .map(([refCode, data]) => ({ refCode, ...data }))
      .sort((a, b) => b.totalReferrals - a.totalReferrals)
      .slice(0, limit);
  }

  async getReferralStats(): Promise<{ refCode: string; total: number; pending: number; paid: number; totalCommission: number }[]> {
    const allReferrals = await this.getReferrals();
    const stats: Record<string, { total: number; pending: number; paid: number; totalCommission: number }> = {};
    
    for (const ref of allReferrals) {
      if (!stats[ref.refCode]) {
        stats[ref.refCode] = { total: 0, pending: 0, paid: 0, totalCommission: 0 };
      }
      stats[ref.refCode].total++;
      stats[ref.refCode].totalCommission += ref.commission;
      if (ref.status === "pending") {
        stats[ref.refCode].pending++;
      } else if (ref.status === "paid") {
        stats[ref.refCode].paid++;
      }
    }
    
    return Object.entries(stats).map(([refCode, data]) => ({
      refCode,
      ...data,
    }));
  }

  // Influencer management
  async createInfluencer(data: InsertInfluencer): Promise<Influencer> {
    const [influencer] = await db.insert(influencers).values(data).returning();
    return influencer;
  }

  async getInfluencers(): Promise<Influencer[]> {
    return db.select().from(influencers).orderBy(desc(influencers.createdAt));
  }

  // Admin audit logging
  async logAdminAction(adminId: string, action: string, target?: Record<string, any>, ipAddress?: string): Promise<AdminLog> {
    const [log] = await db.insert(adminLogs).values({
      adminId,
      action,
      target: target ? JSON.stringify(target) : null,
      ipAddress: ipAddress || null,
    }).returning();
    return log;
  }

  async getAdminLogs(limit: number = 100): Promise<AdminLog[]> {
    return db.select().from(adminLogs).orderBy(desc(adminLogs.timestamp)).limit(limit);
  }

  async getInfluencerByRefCode(refCode: string): Promise<Influencer | undefined> {
    const [result] = await db.select().from(influencers).where(eq(influencers.refCode, refCode));
    return result;
  }

  async getInfluencerByUserId(userId: string): Promise<Influencer | undefined> {
    const [result] = await db.select().from(influencers).where(eq(influencers.userId, userId));
    return result;
  }

  async updateInfluencerStatus(id: number, status: string): Promise<Influencer | undefined> {
    const updateData: any = { status };
    if (status === "approved") {
      updateData.approvedAt = new Date();
    }
    const [updated] = await db.update(influencers).set(updateData).where(eq(influencers.id, id)).returning();
    return updated;
  }

  async updateInfluencerStats(refCode: string, referralAmount: number): Promise<void> {
    const influencer = await this.getInfluencerByRefCode(refCode);
    if (influencer) {
      await db.update(influencers)
        .set({ 
          totalReferrals: influencer.totalReferrals + 1,
          totalEarnings: influencer.totalEarnings + referralAmount
        })
        .where(eq(influencers.refCode, refCode));
    }
  }

  async getUserCount(): Promise<number> {
    const result = await db.select({ count: count() }).from(users);
    return Number(result[0]?.count ?? 0);
  }

  async getSignupStats(): Promise<{ today: number; thisWeek: number; thisMonth: number }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [todayRows, weekRows, monthRows] = await Promise.all([
      db.select({ c: count() }).from(users).where(gte(users.createdAt, todayStart)),
      db.select({ c: count() }).from(users).where(gte(users.createdAt, weekStart)),
      db.select({ c: count() }).from(users).where(gte(users.createdAt, monthStart)),
    ]);

    return {
      today: Number(todayRows[0]?.c ?? 0),
      thisWeek: Number(weekRows[0]?.c ?? 0),
      thisMonth: Number(monthRows[0]?.c ?? 0),
    };
  }

  async getActiveSubscriptionCount(): Promise<number> {
    // Count DISTINCT real users who have an active paid subscription.
    // Uses INNER JOIN with the users table to exclude orphaned/test data rows
    // whose user_id no longer exists in the users table.
    const result = await db
      .select({ c: sql<number>`count(distinct ${userSubscriptions.userId})` })
      .from(userSubscriptions)
      .innerJoin(users, eq(userSubscriptions.userId, users.id))
      .where(
        and(
          eq(userSubscriptions.status, "active"),
          inArray(userSubscriptions.plan, ["pro"])
        )
      );
    return Number(result[0]?.c ?? 0);
  }

  async getTotalRevenue(): Promise<number> {
    const result = await db.select().from(payments)
      .where(sql`status IN ('completed', 'success')`);
    return result.reduce((sum, p) => sum + p.amount, 0);
  }

  async getRevenueToday(): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const result = await db.select().from(payments)
      .where(sql`status IN ('completed', 'success') AND created_at >= ${startOfDay.toISOString()}`);
    return result.reduce((sum, p) => sum + p.amount, 0);
  }

  private generateRefCode(user: any): string {
    return user.firstName 
      ? `${user.firstName.toUpperCase()}${user.id?.slice(-4) || ""}`
      : `USER${user.id?.slice(-6) || ""}`;
  }

  async exportUserData(userId: string): Promise<Record<string, any>> {
    const user = await this.getUserById(userId);
    if (!user) return {};
    
    const refCode = this.generateRefCode(user);
    
    const [
      userPayments,
      subscription,
      userReferrals,
      userOrders,
      userNotifs,
      userAlerts,
      userCareerProfile,
      userBookings,
      userTracked,
      userJobApps,
      userAppPacks,
      userInfluencer,
    ] = await Promise.all([
      db.select().from(payments).where(eq(payments.userId, userId)),
      this.getUserSubscription(userId),
      db.select().from(referrals).where(eq(referrals.refCode, refCode)),
      db.select().from(serviceOrders).where(eq(serviceOrders.userId, userId)),
      db.select().from(userNotifications).where(eq(userNotifications.userId, userId)),
      db.select().from(jobAlertSubscriptions).where(eq(jobAlertSubscriptions.userId, userId)),
      db.select().from(userCareerProfiles).where(eq(userCareerProfiles.userId, userId)),
      db.select().from(consultationBookings).where(eq(consultationBookings.userId, userId)),
      db.select().from(trackedApplications).where(eq(trackedApplications.userId, userId)),
      db.select().from(userJobApplications).where(eq(userJobApplications.userId, userId)),
      db.select().from(userApplicationPacks).where(eq(userApplicationPacks.userId, userId)),
      db.select().from(influencers).where(eq(influencers.userId, userId)),
    ]);

    return {
      exportDate: new Date().toISOString(),
      profile: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        country: user.country,
        consentAccepted: user.consentAccepted,
        createdAt: user.createdAt,
      },
      subscription: subscription || null,
      payments: userPayments,
      referrals: userReferrals,
      serviceOrders: userOrders,
      trackedApplications: userTracked,
      jobApplications: userJobApps,
      applicationPacks: userAppPacks,
      notifications: userNotifs,
      jobAlertSubscriptions: userAlerts,
      careerProfile: userCareerProfile,
      consultationBookings: userBookings,
      influencerProfile: userInfluencer,
    };
  }

  async deleteUserAccount(userId: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    if (!user) return false;

    const refCode = this.generateRefCode(user);

    // Get user's job application IDs for cascading delete of status history
    const userJobApps = await db.select({ id: userJobApplications.id })
      .from(userJobApplications).where(eq(userJobApplications.userId, userId));
    const jobAppIds = userJobApps.map(a => a.id);

    // Get user's service order IDs for cascading delete of deliverables
    const userOrders = await db.select({ id: serviceOrders.id })
      .from(serviceOrders).where(eq(serviceOrders.userId, userId));
    const orderIds = userOrders.map(o => o.id);

    // Get user's payment IDs for cascading delete of payment_retry_logs (FK: payment_retry_logs.payment_id → payments.id)
    const userPaymentRows = await db.select({ id: payments.id })
      .from(payments).where(eq(payments.userId, userId));
    const paymentIds = userPaymentRows.map(p => p.id);

    // Phase 1: Delete child records that have FK constraints pointing at other user records
    const phase1Deletes: Promise<any>[] = [];
    if (jobAppIds.length > 0) {
      phase1Deletes.push(
        db.delete(applicationStatusHistory).where(inArray(applicationStatusHistory.applicationId, jobAppIds))
      );
    }
    if (orderIds.length > 0) {
      phase1Deletes.push(
        db.delete(serviceDeliverables).where(inArray(serviceDeliverables.orderId, orderIds))
      );
    }
    if (paymentIds.length > 0) {
      // Must delete payment_retry_logs before payments (FK: NO ACTION)
      phase1Deletes.push(
        db.delete(paymentRetryLogs).where(inArray(paymentRetryLogs.paymentId, paymentIds))
      );
    }
    if (phase1Deletes.length > 0) {
      await Promise.all(phase1Deletes);
    }

    // Phase 2: Delete all direct user-linked records in parallel (no FK constraints)
    await Promise.all([
      db.delete(userNotifications).where(eq(userNotifications.userId, userId)),
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
      db.delete(jobAlertSubscriptions).where(eq(jobAlertSubscriptions.userId, userId)),
      db.delete(trackedApplications).where(eq(trackedApplications.userId, userId)),
      db.delete(userCareerProfiles).where(eq(userCareerProfiles.userId, userId)),
      db.delete(consultationBookings).where(eq(consultationBookings.userId, userId)),
      db.delete(analyticsEvents).where(eq(analyticsEvents.userId, userId)),
      db.delete(conversionEvents).where(eq(conversionEvents.userId, userId)),
      db.delete(userJobApplications).where(eq(userJobApplications.userId, userId)),
      db.delete(userApplicationPacks).where(eq(userApplicationPacks.userId, userId)),
      db.delete(scheduledNotifications).where(eq(scheduledNotifications.createdBy, userId)),
      db.delete(accountLockouts).where(eq(accountLockouts.identifier, userId)),
      db.delete(influencers).where(eq(influencers.userId, userId)),
      db.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId)),
      db.delete(userServices).where(eq(userServices.userId, userId)),
      db.delete(securityAlerts).where(eq(securityAlerts.userId, userId)),
      db.delete(securityEvents).where(eq(securityEvents.userId, userId)),
      db.delete(toolUsage).where(eq(toolUsage.userId, userId)),
      db.delete(toolReports).where(eq(toolReports.userId, userId)),
      db.delete(cvTemplateDownloads).where(eq(cvTemplateDownloads.userId, userId)),
      db.delete(refundRequests).where(eq(refundRequests.userId, userId)),
      db.delete(aiUsage).where(eq(aiUsage.userId, userId)),
      db.delete(agencyClaims).where(eq(agencyClaims.userId, userId)),
    ]);

    // Phase 3: Delete records with FK dependencies (sequential order matters)
    await db.delete(serviceOrders).where(eq(serviceOrders.userId, userId));
    await db.delete(userSubscriptions).where(eq(userSubscriptions.userId, userId));
    await db.delete(referrals).where(eq(referrals.refCode, refCode));
    await db.delete(payments).where(eq(payments.userId, userId));
    await db.delete(users).where(eq(users.id, userId));

    // Phase 4: Clear sessions
    try {
      await db.execute(sql`DELETE FROM sessions WHERE sess::jsonb -> 'passport' ->> 'user' = ${userId}`);
    } catch {}

    return true;
  }

  // ── Agency Jobs ──────────────────────────────────────────────────────────────

  async getAgencyJobs(agencyId: string): Promise<AgencyJob[]> {
    return db
      .select()
      .from(agencyJobs)
      .where(and(eq(agencyJobs.agencyId, agencyId), eq(agencyJobs.isActive, true)))
      .orderBy(desc(agencyJobs.isFeatured), desc(agencyJobs.createdAt));
  }

  async getAllActiveAgencyJobs(filters?: { country?: string; category?: string }): Promise<AgencyJob[]> {
    const conditions: any[] = [eq(agencyJobs.isActive, true)];
    if (filters?.country) conditions.push(ilike(agencyJobs.country, `%${filters.country}%`));
    if (filters?.category) conditions.push(ilike(agencyJobs.jobCategory, `%${filters.category}%`));
    return db
      .select()
      .from(agencyJobs)
      .where(and(...conditions))
      .orderBy(desc(agencyJobs.isFeatured), desc(agencyJobs.createdAt));
  }

  async getAgencyJobById(jobId: string): Promise<AgencyJob | undefined> {
    const [job] = await db.select().from(agencyJobs).where(eq(agencyJobs.id, jobId));
    return job;
  }

  async createAgencyJob(data: InsertAgencyJob): Promise<AgencyJob> {
    const [job] = await db.insert(agencyJobs).values(data).returning();
    return job;
  }

  async updateAgencyJob(jobId: string, data: Partial<InsertAgencyJob>): Promise<AgencyJob> {
    const [job] = await db
      .update(agencyJobs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agencyJobs.id, jobId))
      .returning();
    return job;
  }

  async deleteAgencyJob(jobId: string): Promise<void> {
    await db.update(agencyJobs).set({ isActive: false }).where(eq(agencyJobs.id, jobId));
  }

  async incrementAgencyJobViews(jobId: string): Promise<void> {
    await db
      .update(agencyJobs)
      .set({ viewCount: sql`view_count + 1` })
      .where(eq(agencyJobs.id, jobId));
  }

  // ─────────────────────────────────────────────────────────────────────────────

  async getNeaAgencies(search?: string, statusFilter?: string): Promise<NeaAgency[]> {
    let query = db.select().from(neaAgencies).where(eq(neaAgencies.isPublished, true));
    
    if (search) {
      const safeSearch = search.slice(0, 200).replace(/[%_\\]/g, c => `\\${c}`);
      const searchPattern = `%${safeSearch}%`;
      query = db.select().from(neaAgencies).where(
        and(
          eq(neaAgencies.isPublished, true),
          or(
            ilike(neaAgencies.agencyName, searchPattern),
            ilike(neaAgencies.licenseNumber, searchPattern)
          )
        )
      );
    }
    
    return query.orderBy(neaAgencies.agencyName);
  }

  async getNeaAgencyById(id: string): Promise<NeaAgency | undefined> {
    const [agency] = await db.select().from(neaAgencies).where(eq(neaAgencies.id, id));
    return agency;
  }

  async createNeaAgency(agency: InsertNeaAgency): Promise<NeaAgency> {
    const [created] = await db.insert(neaAgencies).values(agency).returning();
    return created;
  }

  async updateNeaAgency(id: string, agency: Partial<InsertNeaAgency>): Promise<NeaAgency | undefined> {
    const [updated] = await db.update(neaAgencies).set({
      ...agency,
      lastUpdated: new Date(),
    }).where(eq(neaAgencies.id, id)).returning();
    return updated;
  }

  async deleteNeaAgency(id: string): Promise<void> {
    await db.delete(neaAgencies).where(eq(neaAgencies.id, id));
  }

  async bulkCreateNeaAgencies(agencies: InsertNeaAgency[]): Promise<NeaAgency[]> {
    if (agencies.length === 0) return [];
    const created = await db.insert(neaAgencies).values(agencies).returning();
    return created;
  }

  async getAgencyStats(): Promise<{ total: number; valid: number; expired: number }> {
    const now = new Date();
    const [totalRow] = await db.select({ count: sql<number>`count(*)` })
      .from(neaAgencies).where(eq(neaAgencies.isPublished, true));
    const [expiredRow] = await db.select({ count: sql<number>`count(*)` })
      .from(neaAgencies).where(
        and(
          eq(neaAgencies.isPublished, true),
          sql`${neaAgencies.expiryDate} < ${now}`
        )
      );
    const total = Number(totalRow?.count ?? 0);
    const expired = Number(expiredRow?.count ?? 0);
    return { total, valid: total - expired, expired };
  }

  async getAgencyByClaimedUser(userId: string): Promise<NeaAgency | undefined> {
    const [agency] = await db.select().from(neaAgencies).where(eq(neaAgencies.claimedByUserId, userId));
    return agency;
  }

  async searchAgenciesForClaim(rawQuery: string): Promise<NeaAgency[]> {
    const query = rawQuery.slice(0, 200).replace(/[%_\\]/g, c => `\\${c}`);
    return db.select().from(neaAgencies)
      .where(or(
        ilike(neaAgencies.agencyName, `%${query}%`),
        ilike(neaAgencies.licenseNumber, `%${query}%`)
      ))
      .limit(10);
  }

  async claimAgency(agencyId: string, userId: string): Promise<NeaAgency> {
    const [updated] = await db.update(neaAgencies)
      .set({ claimedByUserId: userId, claimedAt: new Date() })
      .where(eq(neaAgencies.id, agencyId))
      .returning();
    return updated;
  }

  async verifyAgencyOwner(agencyId: string, userId: string): Promise<NeaAgency> {
    const [updated] = await db.update(neaAgencies)
      .set({ claimedByUserId: userId, claimedAt: new Date(), isVerifiedOwner: true, verifiedOwnerAt: new Date() })
      .where(eq(neaAgencies.id, agencyId))
      .returning();
    return updated;
  }

  async createAgencyClaim(claim: InsertAgencyClaim): Promise<AgencyClaim> {
    const [created] = await db.insert(agencyClaims).values(claim).returning();
    return created;
  }

  async getAgencyClaims(filters?: { status?: string; agencyId?: string }): Promise<AgencyClaim[]> {
    const conditions = [];
    if (filters?.status) conditions.push(eq(agencyClaims.status, filters.status));
    if (filters?.agencyId) conditions.push(eq(agencyClaims.agencyId, filters.agencyId));
    const query = db.select().from(agencyClaims).orderBy(desc(agencyClaims.submittedAt));
    if (conditions.length > 0) return query.where(and(...conditions));
    return query;
  }

  async getAgencyClaimById(id: string): Promise<AgencyClaim | undefined> {
    const [claim] = await db.select().from(agencyClaims).where(eq(agencyClaims.id, id));
    return claim;
  }

  async getUserClaimForAgency(userId: string, agencyId: string): Promise<AgencyClaim | undefined> {
    const [claim] = await db.select().from(agencyClaims)
      .where(and(eq(agencyClaims.userId, userId), eq(agencyClaims.agencyId, agencyId)))
      .orderBy(desc(agencyClaims.submittedAt));
    return claim;
  }

  async updateAgencyClaim(id: string, data: Partial<AgencyClaim>): Promise<AgencyClaim | undefined> {
    const [updated] = await db.update(agencyClaims)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agencyClaims.id, id))
      .returning();
    return updated;
  }

  async getAgencyClaimCount(): Promise<{ total: number; pending: number; approved: number; rejected: number }> {
    const all = await db.select().from(agencyClaims);
    return {
      total: all.length,
      pending: all.filter(c => c.status === "pending").length,
      approved: all.filter(c => c.status === "approved").length,
      rejected: all.filter(c => c.status === "rejected").length,
    };
  }

  async getAgencyReports(agencyId?: string): Promise<AgencyReport[]> {
    if (agencyId) {
      return db.select().from(agencyReports)
        .where(eq(agencyReports.agencyId, agencyId))
        .orderBy(desc(agencyReports.createdAt));
    }
    return db.select().from(agencyReports).orderBy(desc(agencyReports.createdAt));
  }

  async createAgencyReport(report: InsertAgencyReport): Promise<AgencyReport> {
    const [created] = await db.insert(agencyReports).values(report).returning();
    return created;
  }

  async updateAgencyReportStatus(id: string, status: string): Promise<AgencyReport | undefined> {
    const [updated] = await db.update(agencyReports).set({ status }).where(eq(agencyReports.id, id)).returning();
    return updated;
  }

  async getAgencyNotifications(unreadOnly?: boolean): Promise<AgencyNotification[]> {
    if (unreadOnly) {
      return db.select().from(agencyNotifications)
        .where(eq(agencyNotifications.isRead, false))
        .orderBy(desc(agencyNotifications.createdAt));
    }
    return db.select().from(agencyNotifications).orderBy(desc(agencyNotifications.createdAt));
  }

  async createAgencyNotification(notification: InsertAgencyNotification): Promise<AgencyNotification> {
    const [created] = await db.insert(agencyNotifications).values(notification).returning();
    return created;
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await db.update(agencyNotifications).set({ isRead: true }).where(eq(agencyNotifications.id, id));
  }

  async markAllNotificationsAsRead(): Promise<void> {
    await db.update(agencyNotifications).set({ isRead: true }).where(eq(agencyNotifications.isRead, false));
  }

  async getUnreadNotificationCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(agencyNotifications)
      .where(eq(agencyNotifications.isRead, false));
    return Number(result[0]?.count ?? 0);
  }

  async checkNotificationExists(agencyId: string, type: string, date: string): Promise<boolean> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(agencyNotifications)
      .where(and(
        eq(agencyNotifications.agencyId, agencyId),
        eq(agencyNotifications.type, type),
        sql`${agencyNotifications.createdAt} >= ${startOfDay}`,
        sql`${agencyNotifications.createdAt} <= ${endOfDay}`
      ));
    return Number(result[0]?.count ?? 0) > 0;
  }

  // Agency Add-Ons
  async getAgencyAddOns(agencyId?: string): Promise<AgencyAddOn[]> {
    if (agencyId) {
      return db.select().from(agencyAddOns).where(eq(agencyAddOns.agencyId, agencyId)).orderBy(desc(agencyAddOns.createdAt));
    }
    return db.select().from(agencyAddOns).orderBy(desc(agencyAddOns.createdAt));
  }

  async getActiveAddOnsByType(addOnType: string): Promise<AgencyAddOn[]> {
    const now = new Date();
    return db.select().from(agencyAddOns).where(and(
      eq(agencyAddOns.addOnType, addOnType),
      eq(agencyAddOns.isActive, true),
      sql`${agencyAddOns.startDate} <= ${now}`,
      sql`${agencyAddOns.endDate} >= ${now}`
    ));
  }

  async getAgencyActiveAddOns(agencyId: string): Promise<AgencyAddOn[]> {
    const now = new Date();
    return db.select().from(agencyAddOns).where(and(
      eq(agencyAddOns.agencyId, agencyId),
      eq(agencyAddOns.isActive, true),
      sql`${agencyAddOns.startDate} <= ${now}`,
      sql`${agencyAddOns.endDate} >= ${now}`
    ));
  }

  async createAgencyAddOn(addOn: InsertAgencyAddOn): Promise<AgencyAddOn> {
    const [created] = await db.insert(agencyAddOns).values(addOn).returning();
    return created;
  }

  async updateAgencyAddOn(id: string, data: Partial<InsertAgencyAddOn>): Promise<AgencyAddOn | undefined> {
    const [updated] = await db.update(agencyAddOns).set(data).where(eq(agencyAddOns.id, id)).returning();
    return updated;
  }

  async deleteAgencyAddOn(id: string): Promise<void> {
    await db.delete(agencyAddOns).where(eq(agencyAddOns.id, id));
  }

  // Agency Clicks
  async recordAgencyClick(click: InsertAgencyClick): Promise<AgencyClick> {
    const [created] = await db.insert(agencyClicks).values(click).returning();
    return created;
  }

  async getAgencyClickStats(agencyId: string, startDate?: Date, endDate?: Date): Promise<{ source: string; count: number }[]> {
    let query = db.select({ 
      source: agencyClicks.source, 
      count: sql<number>`count(*)::int` 
    })
    .from(agencyClicks)
    .where(eq(agencyClicks.agencyId, agencyId))
    .groupBy(agencyClicks.source);
    
    return query;
  }

  async getAgencyTotalClicks(agencyId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(agencyClicks)
      .where(eq(agencyClicks.agencyId, agencyId));
    return Number(result[0]?.count ?? 0);
  }

  // Agency Profiles
  async getAgencyProfile(agencyId: string): Promise<AgencyProfile | undefined> {
    const [profile] = await db.select().from(agencyProfiles).where(eq(agencyProfiles.agencyId, agencyId));
    return profile;
  }

  async createAgencyProfile(profile: InsertAgencyProfile): Promise<AgencyProfile> {
    const [created] = await db.insert(agencyProfiles).values(profile).returning();
    return created;
  }

  async updateAgencyProfile(agencyId: string, data: Partial<InsertAgencyProfile>): Promise<AgencyProfile | undefined> {
    const [updated] = await db.update(agencyProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agencyProfiles.agencyId, agencyId))
      .returning();
    return updated;
  }

  async deleteAgencyProfile(agencyId: string): Promise<void> {
    await db.delete(agencyProfiles).where(eq(agencyProfiles.agencyId, agencyId));
  }

  // Service Orders
  async getServiceOrders(filters?: { userId?: string; status?: string }): Promise<ServiceOrder[]> {
    let query = db.select().from(serviceOrders).orderBy(desc(serviceOrders.createdAt));
    
    if (filters?.userId && filters?.status) {
      return db.select().from(serviceOrders)
        .where(and(
          eq(serviceOrders.userId, filters.userId),
          eq(serviceOrders.status, filters.status)
        ))
        .orderBy(desc(serviceOrders.createdAt));
    } else if (filters?.userId) {
      return db.select().from(serviceOrders)
        .where(eq(serviceOrders.userId, filters.userId))
        .orderBy(desc(serviceOrders.createdAt));
    } else if (filters?.status) {
      return db.select().from(serviceOrders)
        .where(eq(serviceOrders.status, filters.status))
        .orderBy(desc(serviceOrders.createdAt));
    }
    
    return db.select().from(serviceOrders).orderBy(desc(serviceOrders.createdAt));
  }

  async getServiceOrderById(id: string): Promise<ServiceOrder | undefined> {
    const [order] = await db.select().from(serviceOrders).where(eq(serviceOrders.id, id));
    return order;
  }

  async getServiceOrderByPaymentRef(paymentRef: string): Promise<ServiceOrder | undefined> {
    const [order] = await db.select().from(serviceOrders)
      .where(and(
        eq(serviceOrders.paymentRef, paymentRef),
        eq(serviceOrders.status, "pending_payment")
      ));
    return order;
  }

  async createServiceOrder(order: InsertServiceOrder): Promise<ServiceOrder> {
    const [created] = await db.insert(serviceOrders).values(order).returning();
    return created;
  }

  async updateServiceOrder(id: string, data: Partial<InsertServiceOrder>): Promise<ServiceOrder | undefined> {
    const [updated] = await db.update(serviceOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(serviceOrders.id, id))
      .returning();
    return updated;
  }

  // Service Deliverables
  async getDeliverablesByOrderId(orderId: string): Promise<ServiceDeliverable[]> {
    return db.select().from(serviceDeliverables)
      .where(eq(serviceDeliverables.orderId, orderId))
      .orderBy(desc(serviceDeliverables.createdAt));
  }

  async getDeliverablesByUserId(userId: string): Promise<Array<ServiceDeliverable & { serviceName: string; serviceId: string; orderedAt: Date | null }>> {
    const rows = await db
      .select({
        id: serviceDeliverables.id,
        orderId: serviceDeliverables.orderId,
        fileName: serviceDeliverables.fileName,
        fileType: serviceDeliverables.fileType,
        fileSize: serviceDeliverables.fileSize,
        fileUrl: serviceDeliverables.fileUrl,
        description: serviceDeliverables.description,
        downloadCount: serviceDeliverables.downloadCount,
        uploadedBy: serviceDeliverables.uploadedBy,
        createdAt: serviceDeliverables.createdAt,
        serviceName: serviceOrders.serviceName,
        serviceId: serviceOrders.serviceId,
        orderedAt: serviceOrders.createdAt,
      })
      .from(serviceDeliverables)
      .innerJoin(serviceOrders, eq(serviceDeliverables.orderId, serviceOrders.id))
      .where(eq(serviceOrders.userId, userId))
      .orderBy(desc(serviceDeliverables.createdAt));
    return rows;
  }

  async getDeliverableById(id: string): Promise<ServiceDeliverable | undefined> {
    const [deliverable] = await db.select().from(serviceDeliverables).where(eq(serviceDeliverables.id, id));
    return deliverable;
  }

  async createDeliverable(deliverable: InsertServiceDeliverable): Promise<ServiceDeliverable> {
    const [created] = await db.insert(serviceDeliverables).values(deliverable).returning();
    return created;
  }

  async incrementDownloadCount(id: string): Promise<void> {
    await db.update(serviceDeliverables)
      .set({ downloadCount: sql`${serviceDeliverables.downloadCount} + 1` })
      .where(eq(serviceDeliverables.id, id));
  }

  // User Notifications
  async getUserNotifications(userId: string, unreadOnly?: boolean): Promise<UserNotification[]> {
    if (unreadOnly) {
      return db.select().from(userNotifications)
        .where(and(
          eq(userNotifications.userId, userId),
          eq(userNotifications.isRead, false)
        ))
        .orderBy(desc(userNotifications.createdAt));
    }
    return db.select().from(userNotifications)
      .where(eq(userNotifications.userId, userId))
      .orderBy(desc(userNotifications.createdAt));
  }

  async createDelivery(delivery: InsertDelivery): Promise<Delivery> {
    const [created] = await db.insert(deliveries).values(delivery).returning();
    return created;
  }

  async getUserDeliveries(userId: string): Promise<Delivery[]> {
    return db.select().from(deliveries)
      .where(eq(deliveries.userId, userId))
      .orderBy(desc(deliveries.createdAt));
  }

  async createUserNotification(notification: InsertUserNotification): Promise<UserNotification> {
    const [created] = await db.insert(userNotifications).values(notification).returning();
    return created;
  }

  async markUserNotificationAsRead(id: string): Promise<void> {
    await db.update(userNotifications)
      .set({ isRead: true })
      .where(eq(userNotifications.id, id));
  }

  async markAllUserNotificationsAsRead(userId: string): Promise<void> {
    await db.update(userNotifications)
      .set({ isRead: true })
      .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
  }

  async getUnreadUserNotificationCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(userNotifications)
      .where(and(
        eq(userNotifications.userId, userId),
        eq(userNotifications.isRead, false)
      ));
    return Number(result[0]?.count ?? 0);
  }

  async getTrustMetrics() {
    // Get all orders
    const allOrders = await db.select().from(serviceOrders).orderBy(desc(serviceOrders.createdAt));
    
    const totalOrders = allOrders.length;
    const autoApproved = allOrders.filter(o => !o.needsHumanReview && o.status === 'completed').length;
    const humanReviewed = allOrders.filter(o => o.needsHumanReview && o.status === 'completed').length;
    const flaggedForReview = allOrders.filter(o => o.needsHumanReview && o.status !== 'completed').length;
    
    // Quality scores
    const ordersWithScores = allOrders.filter(o => o.qualityScore !== null);
    const averageQualityScore = ordersWithScores.length > 0
      ? ordersWithScores.reduce((sum, o) => sum + (o.qualityScore || 0), 0) / ordersWithScores.length
      : 0;
    
    // Hallucination detection count
    const hallucinationDetections = allOrders.filter(o => {
      const details = o.qualityCheckData as Record<string, any> | null;
      return details?.hallucinationDetected === true;
    }).length;
    
    // Auto-approval rate
    const completedOrders = allOrders.filter(o => o.status === 'completed');
    const autoApprovalRate = completedOrders.length > 0
      ? (autoApproved / completedOrders.length) * 100
      : 0;
    
    // Average processing time (from createdAt to completedAt)
    const ordersWithTimes = completedOrders.filter(o => o.createdAt && o.completedAt);
    const avgProcessingTime = ordersWithTimes.length > 0
      ? ordersWithTimes.reduce((sum, o) => {
          const created = new Date(o.createdAt!).getTime();
          const completed = new Date(o.completedAt!).getTime();
          return sum + (completed - created) / 1000; // seconds
        }, 0) / ordersWithTimes.length
      : 0;
    
    // Quality distribution
    const qualityDistribution = {
      excellent: ordersWithScores.filter(o => (o.qualityScore || 0) >= 85).length,
      good: ordersWithScores.filter(o => (o.qualityScore || 0) >= 75 && (o.qualityScore || 0) < 85).length,
      acceptable: ordersWithScores.filter(o => (o.qualityScore || 0) >= 60 && (o.qualityScore || 0) < 75).length,
      poor: ordersWithScores.filter(o => (o.qualityScore || 0) < 60).length,
    };
    
    // Fail reasons from quality check details
    const failReasonCounts: Record<string, number> = {};
    allOrders.forEach(o => {
      if (o.needsHumanReview && o.qualityCheckData) {
        const details = o.qualityCheckData as Record<string, any>;
        const issues = details.issues || [];
        issues.forEach((issue: string) => {
          if (issue.startsWith('FAIL:') || issue.startsWith('CONDITION:')) {
            const reason = issue.replace(/^(FAIL:|CONDITION:)\s*/, '').substring(0, 50);
            failReasonCounts[reason] = (failReasonCounts[reason] || 0) + 1;
          }
        });
      }
    });
    const failReasons = Object.entries(failReasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Service stats
    const serviceMap: Record<string, { total: number; autoApproved: number; totalScore: number; scoreCount: number }> = {};
    allOrders.forEach(o => {
      if (!serviceMap[o.serviceName]) {
        serviceMap[o.serviceName] = { total: 0, autoApproved: 0, totalScore: 0, scoreCount: 0 };
      }
      serviceMap[o.serviceName].total++;
      if (!o.needsHumanReview && o.status === 'completed') {
        serviceMap[o.serviceName].autoApproved++;
      }
      if (o.qualityScore !== null) {
        serviceMap[o.serviceName].totalScore += o.qualityScore;
        serviceMap[o.serviceName].scoreCount++;
      }
    });
    const serviceStats = Object.entries(serviceMap).map(([serviceName, stats]) => ({
      serviceName,
      total: stats.total,
      autoApproved: stats.autoApproved,
      avgScore: stats.scoreCount > 0 ? stats.totalScore / stats.scoreCount : 0,
    }));
    
    // Recent orders (last 10)
    const recentOrders = allOrders.slice(0, 10);
    
    return {
      totalOrders,
      autoApproved,
      humanReviewed,
      flaggedForReview,
      averageQualityScore,
      hallucinationDetections,
      autoApprovalRate,
      avgProcessingTime,
      recentOrders,
      qualityDistribution,
      failReasons,
      serviceStats,
    };
  }

  // Push Subscriptions
  async createPushSubscription(data: InsertPushSubscription): Promise<PushSubscription> {
    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, data.endpoint))
      .limit(1);
    
    if (existing.length > 0) {
      const [updated] = await db
        .update(pushSubscriptions)
        .set({ ...data, isActive: true, updatedAt: new Date() })
        .where(eq(pushSubscriptions.id, existing[0].id))
        .returning();
      return updated;
    }
    
    const [sub] = await db.insert(pushSubscriptions).values(data).returning();
    return sub;
  }

  async getActivePushSubscriptions(): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.isActive, true));
  }

  async getUserPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return db
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.isActive, true)));
  }

  async deactivatePushSubscription(id: string): Promise<void> {
    await db.update(pushSubscriptions).set({ isActive: false }).where(eq(pushSubscriptions.id, id));
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  // Scheduled Notifications
  async createScheduledNotification(data: InsertScheduledNotification): Promise<ScheduledNotification> {
    const [notification] = await db.insert(scheduledNotifications).values(data).returning();
    return notification;
  }

  async getScheduledNotifications(): Promise<ScheduledNotification[]> {
    return db.select().from(scheduledNotifications).orderBy(desc(scheduledNotifications.createdAt));
  }

  async updateScheduledNotification(id: string, data: Partial<ScheduledNotification>): Promise<ScheduledNotification | null> {
    const [updated] = await db
      .update(scheduledNotifications)
      .set(data)
      .where(eq(scheduledNotifications.id, id))
      .returning();
    return updated || null;
  }

  async getPushSubscriptionCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(pushSubscriptions).where(eq(pushSubscriptions.isActive, true));
    return Number(result[0]?.count || 0);
  }

  // Job counts for real-time alerts
  async getAllJobCounts(): Promise<JobCount[]> {
    return db.select().from(jobCounts);
  }

  async getJobCountByCountry(countryCode: string): Promise<JobCount | undefined> {
    const [count] = await db.select().from(jobCounts).where(eq(jobCounts.countryCode, countryCode));
    return count;
  }

  async updateJobCount(countryCode: string, count: number, updatedBy?: string): Promise<JobCount> {
    const existing = await this.getJobCountByCountry(countryCode);
    
    if (existing) {
      const [updated] = await db
        .update(jobCounts)
        .set({
          previousCount: existing.jobCount,
          jobCount: count,
          lastUpdated: new Date(),
          updatedBy: updatedBy || existing.updatedBy,
        })
        .where(eq(jobCounts.countryCode, countryCode))
        .returning();
      return updated;
    }

    // Create new entry if doesn't exist
    const countryNames: Record<string, string> = {
      usa: "USA",
      canada: "Canada",
      uk: "United Kingdom",
      uae: "UAE",
      australia: "Australia",
      europe: "Europe",
    };

    const [created] = await db
      .insert(jobCounts)
      .values({
        countryCode,
        countryName: countryNames[countryCode] || countryCode.toUpperCase(),
        jobCount: count,
        previousCount: 0,
        updatedBy,
      })
      .returning();
    return created;
  }

  // Student Visa methods - OPTIMIZED: Batch queries to avoid N+1
  async getStudentVisasByCountry(countryCode: string): Promise<StudentVisaWithDetails[]> {
    const visas = await db.select().from(studentVisas)
      .where(and(eq(studentVisas.countryCode, countryCode), eq(studentVisas.isActive, true)))
      .orderBy(studentVisas.order);
    
    if (visas.length === 0) return [];
    
    const visaIds = visas.map(v => v.id);
    
    // Batch all queries with Promise.all to avoid N+1
    const [allRequirements, allSteps, allLinks] = await Promise.all([
      db.select().from(visaRequirements).where(inArray(visaRequirements.visaId, visaIds)),
      db.select().from(visaSteps).where(inArray(visaSteps.visaId, visaIds)),
      db.select().from(visaLinks).where(
        or(inArray(visaLinks.visaId, visaIds), eq(visaLinks.countryCode, countryCode))
      ),
    ]);
    
    // Map results to visas
    return visas.map(visa => ({
      ...visa,
      requirements: allRequirements
        .filter(r => r.visaId === visa.id)
        .sort((a, b) => a.order - b.order),
      steps: allSteps
        .filter(s => s.visaId === visa.id)
        .sort((a, b) => a.stepNumber - b.stepNumber),
      links: allLinks
        .filter(l => l.visaId === visa.id || l.countryCode === countryCode)
        .sort((a, b) => a.order - b.order),
    }));
  }

  async getStudentVisaById(id: string): Promise<StudentVisaWithDetails | undefined> {
    const [visa] = await db.select().from(studentVisas).where(eq(studentVisas.id, id));
    if (!visa) return undefined;
    
    const requirements = await db.select().from(visaRequirements)
      .where(eq(visaRequirements.visaId, id))
      .orderBy(visaRequirements.order);
    const steps = await db.select().from(visaSteps)
      .where(eq(visaSteps.visaId, id))
      .orderBy(visaSteps.stepNumber);
    const links = await db.select().from(visaLinks)
      .where(or(eq(visaLinks.visaId, id), eq(visaLinks.countryCode, visa.countryCode)))
      .orderBy(visaLinks.order);
    
    return { ...visa, requirements, steps, links };
  }

  async getAllStudentVisas(): Promise<StudentVisa[]> {
    return db.select().from(studentVisas).orderBy(studentVisas.countryCode, studentVisas.order);
  }

  async createStudentVisa(visa: InsertStudentVisa): Promise<StudentVisa> {
    const [created] = await db.insert(studentVisas).values(visa).returning();
    return created;
  }

  async updateStudentVisa(id: string, visa: Partial<InsertStudentVisa>): Promise<StudentVisa | undefined> {
    const [updated] = await db.update(studentVisas).set(visa).where(eq(studentVisas.id, id)).returning();
    return updated;
  }

  async deleteStudentVisa(id: string): Promise<void> {
    await db.delete(visaRequirements).where(eq(visaRequirements.visaId, id));
    await db.delete(visaSteps).where(eq(visaSteps.visaId, id));
    await db.delete(visaLinks).where(eq(visaLinks.visaId, id));
    await db.delete(studentVisas).where(eq(studentVisas.id, id));
  }

  async getVisaRequirements(visaId: string): Promise<VisaRequirement[]> {
    return db.select().from(visaRequirements).where(eq(visaRequirements.visaId, visaId)).orderBy(visaRequirements.order);
  }

  async createVisaRequirement(requirement: InsertVisaRequirement): Promise<VisaRequirement> {
    const [created] = await db.insert(visaRequirements).values(requirement).returning();
    return created;
  }

  async deleteVisaRequirement(id: string): Promise<void> {
    await db.delete(visaRequirements).where(eq(visaRequirements.id, id));
  }

  async getVisaSteps(visaId: string): Promise<VisaStep[]> {
    return db.select().from(visaSteps).where(eq(visaSteps.visaId, visaId)).orderBy(visaSteps.stepNumber);
  }

  async createVisaStep(step: InsertVisaStep): Promise<VisaStep> {
    const [created] = await db.insert(visaSteps).values(step).returning();
    return created;
  }

  async deleteVisaStep(id: string): Promise<void> {
    await db.delete(visaSteps).where(eq(visaSteps.id, id));
  }

  async getVisaLinks(visaId?: string, countryCode?: string): Promise<VisaLink[]> {
    if (visaId) {
      return db.select().from(visaLinks).where(eq(visaLinks.visaId, visaId)).orderBy(visaLinks.order);
    }
    if (countryCode) {
      return db.select().from(visaLinks).where(eq(visaLinks.countryCode, countryCode)).orderBy(visaLinks.order);
    }
    return db.select().from(visaLinks).orderBy(visaLinks.order);
  }

  async createVisaLink(link: InsertVisaLink): Promise<VisaLink> {
    const [created] = await db.insert(visaLinks).values(link).returning();
    return created;
  }

  async deleteVisaLink(id: string): Promise<void> {
    await db.delete(visaLinks).where(eq(visaLinks.id, id));
  }

  // ============================================
  // ASSISTED APPLY MODE IMPLEMENTATIONS
  // ============================================

  async getApplicationPacks(): Promise<ApplicationPack[]> {
    return db.select().from(applicationPacks).where(eq(applicationPacks.isActive, true)).orderBy(applicationPacks.order);
  }

  async getApplicationPackById(id: string): Promise<ApplicationPack | undefined> {
    const [pack] = await db.select().from(applicationPacks).where(eq(applicationPacks.id, id));
    return pack;
  }

  async createApplicationPack(pack: InsertApplicationPack): Promise<ApplicationPack> {
    const [created] = await db.insert(applicationPacks).values(pack).returning();
    return created;
  }

  async updateApplicationPack(id: string, pack: Partial<InsertApplicationPack>): Promise<ApplicationPack | undefined> {
    const [updated] = await db.update(applicationPacks).set(pack).where(eq(applicationPacks.id, id)).returning();
    return updated;
  }

  async deleteApplicationPack(id: string): Promise<void> {
    await db.delete(applicationPacks).where(eq(applicationPacks.id, id));
  }

  async getUserApplicationPacks(userId: string): Promise<UserApplicationPack[]> {
    return db.select().from(userApplicationPacks).where(eq(userApplicationPacks.userId, userId)).orderBy(desc(userApplicationPacks.createdAt));
  }

  async getUserApplicationPackById(id: string): Promise<UserApplicationPack | undefined> {
    const [pack] = await db.select().from(userApplicationPacks).where(eq(userApplicationPacks.id, id));
    return pack;
  }

  async getUserApplicationPackByPaymentRef(paymentRef: string): Promise<UserApplicationPack | undefined> {
    const [pack] = await db.select().from(userApplicationPacks).where(eq(userApplicationPacks.paymentRef, paymentRef));
    return pack;
  }

  async createUserApplicationPack(pack: InsertUserApplicationPack): Promise<UserApplicationPack> {
    const [created] = await db.insert(userApplicationPacks).values(pack).returning();
    return created;
  }

  async updateUserApplicationPack(id: string, pack: Partial<InsertUserApplicationPack>): Promise<UserApplicationPack | undefined> {
    const [updated] = await db.update(userApplicationPacks).set({
      ...pack,
      updatedAt: new Date(),
    }).where(eq(userApplicationPacks.id, id)).returning();
    return updated;
  }

  async getUserJobApplications(userId: string): Promise<UserJobApplication[]> {
    return db.select().from(userJobApplications).where(eq(userJobApplications.userId, userId)).orderBy(desc(userJobApplications.createdAt));
  }

  async getUserJobApplicationById(id: string): Promise<UserJobApplication | undefined> {
    const [application] = await db.select().from(userJobApplications).where(eq(userJobApplications.id, id));
    return application;
  }

  async createUserJobApplication(application: InsertUserJobApplication): Promise<UserJobApplication> {
    const [created] = await db.insert(userJobApplications).values(application).returning();
    return created;
  }

  async updateUserJobApplication(id: string, application: Partial<InsertUserJobApplication>): Promise<UserJobApplication | undefined> {
    const [updated] = await db.update(userJobApplications).set({
      ...application,
      updatedAt: new Date(),
    }).where(eq(userJobApplications.id, id)).returning();
    return updated;
  }

  async getApplicationStatusHistory(applicationId: string): Promise<ApplicationStatusHistory[]> {
    return db.select().from(applicationStatusHistory).where(eq(applicationStatusHistory.applicationId, applicationId)).orderBy(desc(applicationStatusHistory.createdAt));
  }

  async createApplicationStatusHistory(history: InsertApplicationStatusHistory): Promise<ApplicationStatusHistory> {
    const [created] = await db.insert(applicationStatusHistory).values(history).returning();
    return created;
  }

  // Security: Account lockout methods
  async getAccountLockout(identifier: string, identifierType: string): Promise<AccountLockout | undefined> {
    const [lockout] = await db.select().from(accountLockouts)
      .where(and(
        eq(accountLockouts.identifier, identifier),
        eq(accountLockouts.identifierType, identifierType)
      ));
    return lockout;
  }

  async incrementFailedAttempts(identifier: string, identifierType: string): Promise<AccountLockout> {
    const existing = await this.getAccountLockout(identifier, identifierType);
    const now = new Date();
    
    if (existing) {
      const newAttempts = existing.failedAttempts + 1;
      // Lock account after 5 failed attempts for 30 minutes
      const lockedUntil = newAttempts >= 5 ? new Date(now.getTime() + 30 * 60 * 1000) : null;
      
      const [updated] = await db.update(accountLockouts).set({
        failedAttempts: newAttempts,
        lastFailedAt: now,
        lockedUntil,
        updatedAt: now,
      }).where(eq(accountLockouts.id, existing.id)).returning();
      return updated;
    }
    
    const [created] = await db.insert(accountLockouts).values({
      identifier,
      identifierType,
      failedAttempts: 1,
      lastFailedAt: now,
    }).returning();
    return created;
  }

  async resetFailedAttempts(identifier: string, identifierType: string): Promise<void> {
    await db.update(accountLockouts).set({
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    }).where(and(
      eq(accountLockouts.identifier, identifier),
      eq(accountLockouts.identifierType, identifierType)
    ));
  }

  async isAccountLocked(identifier: string, identifierType: string): Promise<boolean> {
    const lockout = await this.getAccountLockout(identifier, identifierType);
    if (!lockout || !lockout.lockedUntil) return false;
    return lockout.lockedUntil > new Date();
  }

  // Security: Webhook idempotency methods
  async acquireWebhookLock(lockKey: string, webhookType: string, ttlSeconds: number = 300): Promise<boolean> {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await db.insert(webhookProcessingLocks).values({
        lockKey,
        webhookType,
        status: "processing",
        expiresAt,
      });
      return true;
    } catch (error: any) {
      // Unique constraint violation means lock already exists
      if (error.code === "23505") {
        // Check if existing lock is stale (expired)
        const [existing] = await db.select().from(webhookProcessingLocks)
          .where(eq(webhookProcessingLocks.lockKey, lockKey));
        
        if (existing && existing.expiresAt < new Date()) {
          // Stale lock - clean up and try again
          await db.delete(webhookProcessingLocks).where(eq(webhookProcessingLocks.lockKey, lockKey));
          return this.acquireWebhookLock(lockKey, webhookType, ttlSeconds);
        }
        return false;
      }
      throw error;
    }
  }

  async completeWebhookLock(lockKey: string): Promise<void> {
    await db.update(webhookProcessingLocks).set({
      status: "completed",
      processedAt: new Date(),
    }).where(eq(webhookProcessingLocks.lockKey, lockKey));
  }

  async failWebhookLock(lockKey: string): Promise<void> {
    await db.update(webhookProcessingLocks).set({
      status: "failed",
      processedAt: new Date(),
    }).where(eq(webhookProcessingLocks.lockKey, lockKey));
  }

  async getWebhookLock(lockKey: string): Promise<WebhookProcessingLock | undefined> {
    const [lock] = await db.select().from(webhookProcessingLocks)
      .where(eq(webhookProcessingLocks.lockKey, lockKey));
    return lock;
  }

  async cleanupStaleWebhookLocks(): Promise<number> {
    const result = await db.delete(webhookProcessingLocks)
      .where(lt(webhookProcessingLocks.expiresAt, new Date()))
      .returning();
    return result.length;
  }

  // User self-tracked applications implementation
  async getTrackedApplications(userId: string): Promise<TrackedApplication[]> {
    return db.select().from(trackedApplications)
      .where(eq(trackedApplications.userId, userId))
      .orderBy(desc(trackedApplications.updatedAt));
  }

  async getTrackedApplicationById(id: string): Promise<TrackedApplication | undefined> {
    const [application] = await db.select().from(trackedApplications)
      .where(eq(trackedApplications.id, id));
    return application;
  }

  async createTrackedApplication(application: InsertTrackedApplication): Promise<TrackedApplication> {
    const [created] = await db.insert(trackedApplications).values(application).returning();
    return created;
  }

  async updateTrackedApplication(id: string, application: Partial<InsertTrackedApplication>): Promise<TrackedApplication | undefined> {
    const [updated] = await db.update(trackedApplications)
      .set({ ...application, updatedAt: new Date() })
      .where(eq(trackedApplications.id, id))
      .returning();
    return updated;
  }

  async deleteTrackedApplication(id: string): Promise<void> {
    await db.delete(trackedApplications).where(eq(trackedApplications.id, id));
  }

  async getTrackedApplicationStats(userId: string): Promise<{ total: number; applied: number; interviewing: number; offered: number }> {
    const applications = await this.getTrackedApplications(userId);
    return {
      total: applications.length,
      applied: applications.filter(a => a.status === 'applied').length,
      interviewing: applications.filter(a => a.status === 'interviewing').length,
      offered: applications.filter(a => a.status === 'offered' || a.status === 'accepted').length,
    };
  }

  // Analytics implementation
  async recordAnalyticsEvent(event: InsertAnalyticsEvent): Promise<AnalyticsEvent> {
    const [created] = await db.insert(analyticsEvents).values(event).returning();
    return created;
  }

  async recordConversionEvent(event: InsertConversionEvent): Promise<ConversionEvent> {
    const [created] = await db.insert(conversionEvents).values(event).returning();
    return created;
  }

  async getDailyStats(startDate: string, endDate: string): Promise<DailyStats[]> {
    return db.select().from(dailyStats)
      .where(and(
        sql`${dailyStats.date} >= ${startDate}`,
        sql`${dailyStats.date} <= ${endDate}`
      ))
      .orderBy(dailyStats.date);
  }

  async incrementDailyStat(date: string, statType: string): Promise<void> {
    // First, try to get existing record
    const [existing] = await db.select().from(dailyStats).where(eq(dailyStats.date, date));
    
    if (!existing) {
      // Create new record
      const newRecord: any = {
        date,
        pageViews: 0,
        uniqueVisitors: 0,
        signups: 0,
        paymentsStarted: 0,
        paymentsCompleted: 0,
        revenue: 0,
        jobLinkClicks: 0,
        serviceOrders: 0,
        signupRate: 0,
        paymentRate: 0
      };
      
      // Increment the specific stat
      switch (statType) {
        case 'landing_view': newRecord.pageViews = 1; newRecord.uniqueVisitors = 1; break;
        case 'signup': newRecord.signups = 1; break;
        case 'payment_started': newRecord.paymentsStarted = 1; break;
        case 'payment_completed': newRecord.paymentsCompleted = 1; break;
        case 'job_link_click': newRecord.jobLinkClicks = 1; break;
        case 'service_order': newRecord.serviceOrders = 1; break;
      }
      
      await db.insert(dailyStats).values(newRecord);
    } else {
      // Update existing record
      const updateData: any = { updatedAt: new Date() };
      
      switch (statType) {
        case 'landing_view':
          updateData.pageViews = (existing.pageViews || 0) + 1;
          break;
        case 'signup':
          updateData.signups = (existing.signups || 0) + 1;
          break;
        case 'payment_started':
          updateData.paymentsStarted = (existing.paymentsStarted || 0) + 1;
          break;
        case 'payment_completed':
          updateData.paymentsCompleted = (existing.paymentsCompleted || 0) + 1;
          break;
        case 'job_link_click':
          updateData.jobLinkClicks = (existing.jobLinkClicks || 0) + 1;
          break;
        case 'service_order':
          updateData.serviceOrders = (existing.serviceOrders || 0) + 1;
          break;
      }
      
      await db.update(dailyStats).set(updateData).where(eq(dailyStats.date, date));
    }
  }

  async getConversionFunnel(startDate: Date, endDate: Date): Promise<{ step: string; count: number; percentage: number }[]> {
    const steps = ['landing_view', 'signup', 'payment_started', 'payment_completed', 'dashboard_access'];
    const results: { step: string; count: number; percentage: number }[] = [];
    
    for (const step of steps) {
      const [result] = await db.select({ count: sql<number>`count(distinct ${conversionEvents.sessionId})` })
        .from(conversionEvents)
        .where(and(
          eq(conversionEvents.funnelStep, step),
          sql`${conversionEvents.completedAt} >= ${startDate}`,
          sql`${conversionEvents.completedAt} <= ${endDate}`
        ));
      
      results.push({
        step,
        count: Number(result?.count || 0),
        percentage: 0
      });
    }
    
    // Calculate percentages relative to first step
    const firstStepCount = results[0]?.count || 1;
    results.forEach(r => {
      r.percentage = Math.round((r.count / firstStepCount) * 100);
    });
    
    return results;
  }

  async getTopPages(startDate: Date, endDate: Date, limit: number): Promise<{ page: string; views: number }[]> {
    const result = await db.select({
      page: analyticsEvents.page,
      views: sql<number>`count(*)::int`
    })
    .from(analyticsEvents)
    .where(and(
      eq(analyticsEvents.eventType, 'page_view'),
      sql`${analyticsEvents.createdAt} >= ${startDate}`,
      sql`${analyticsEvents.createdAt} <= ${endDate}`
    ))
    .groupBy(analyticsEvents.page)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
    
    return result.map(r => ({
      page: r.page || 'unknown',
      views: Number(r.views)
    }));
  }

  async getDeviceBreakdown(startDate: Date, endDate: Date): Promise<{ device: string; count: number; percentage: number }[]> {
    const result = await db.select({
      device: analyticsEvents.deviceType,
      count: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`
    })
    .from(analyticsEvents)
    .where(and(
      sql`${analyticsEvents.createdAt} >= ${startDate}`,
      sql`${analyticsEvents.createdAt} <= ${endDate}`
    ))
    .groupBy(analyticsEvents.deviceType);
    
    const total = result.reduce((sum, r) => sum + Number(r.count), 0) || 1;
    
    return result.map(r => ({
      device: r.device || 'unknown',
      count: Number(r.count),
      percentage: Math.round((Number(r.count) / total) * 100)
    }));
  }

  async getRecentEvents(limit: number): Promise<AnalyticsEvent[]> {
    return db.select().from(analyticsEvents)
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(limit);
  }

  async getActiveUsers(minutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const [result] = await db.select({ count: sql<number>`count(distinct ${analyticsEvents.sessionId})::int` })
      .from(analyticsEvents)
      .where(sql`${analyticsEvents.createdAt} >= ${cutoff}`);
    
    return Number(result?.count || 0);
  }

  async getEventsByCategory(startDate: Date, endDate: Date, category?: string): Promise<{ category: string; eventName: string; count: number }[]> {
    let query = db.select({
      category: analyticsEvents.eventCategory,
      eventName: analyticsEvents.eventName,
      count: sql<number>`count(*)::int`
    })
    .from(analyticsEvents)
    .where(and(
      sql`${analyticsEvents.createdAt} >= ${startDate}`,
      sql`${analyticsEvents.createdAt} <= ${endDate}`,
      category ? eq(analyticsEvents.eventCategory, category) : sql`1=1`
    ))
    .groupBy(analyticsEvents.eventCategory, analyticsEvents.eventName)
    .orderBy(sql`count(*) desc`);
    
    const result = await query;
    return result.map(r => ({
      category: r.category,
      eventName: r.eventName,
      count: Number(r.count)
    }));
  }

  // ============================================
  // COUNTRY INSIGHTS, ADVISORS, CONSULTATIONS
  // ============================================

  async getCountryInsights(countryCode: string): Promise<CountryInsights | null> {
    const [insight] = await db.select().from(countryInsights).where(eq(countryInsights.countryCode, countryCode));
    return insight || null;
  }

  async getAllCountryInsights(): Promise<CountryInsights[]> {
    return db.select().from(countryInsights);
  }

  async getActiveAdvisors(): Promise<Advisor[]> {
    return db.select().from(advisors).where(eq(advisors.isActive, true));
  }

  async getAdvisorById(id: string): Promise<Advisor | null> {
    const [advisor] = await db.select().from(advisors).where(eq(advisors.id, id));
    return advisor || null;
  }

  async createConsultationBooking(booking: InsertConsultationBooking): Promise<ConsultationBooking> {
    const [newBooking] = await db.insert(consultationBookings).values(booking).returning();
    return newBooking;
  }

  async getUserConsultations(userId: string): Promise<ConsultationBooking[]> {
    return db.select().from(consultationBookings).where(eq(consultationBookings.userId, userId)).orderBy(desc(consultationBookings.scheduledDate));
  }

  async getAllConsultations(): Promise<ConsultationBooking[]> {
    return db.select().from(consultationBookings).orderBy(desc(consultationBookings.createdAt));
  }

  async updateConsultationStatus(id: string, status: string): Promise<ConsultationBooking | null> {
    const [updated] = await db.update(consultationBookings).set({ status, updatedAt: new Date() }).where(eq(consultationBookings.id, id)).returning();
    return updated || null;
  }

  async updateConsultationAdmin(id: string, data: { status?: string; advisorNotes?: string }): Promise<ConsultationBooking | null> {
    const [updated] = await db.update(consultationBookings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(consultationBookings.id, id))
      .returning();
    return updated || null;
  }

  async markConsultationWhatsappSent(id: string): Promise<void> {
    await db.update(consultationBookings).set({ whatsappSent: true }).where(eq(consultationBookings.id, id));
  }

  async getFeaturedSuccessStories(): Promise<SuccessStory[]> {
    return db.select().from(successStories).where(and(eq(successStories.isActive, true), eq(successStories.isFeatured, true))).limit(6);
  }

  async getAllSuccessStories(): Promise<SuccessStory[]> {
    return db.select().from(successStories).where(eq(successStories.isActive, true));
  }

  // ============================================
  // USER CAREER PROFILES & JOB ALERTS
  // ============================================

  async getUserCareerProfile(userId: string): Promise<UserCareerProfile | null> {
    const [profile] = await db.select().from(userCareerProfiles).where(eq(userCareerProfiles.userId, userId));
    return profile || null;
  }

  async upsertUserCareerProfile(userId: string, data: Partial<InsertUserCareerProfile>): Promise<UserCareerProfile> {
    const existing = await this.getUserCareerProfile(userId);
    if (existing) {
      const [updated] = await db.update(userCareerProfiles)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userCareerProfiles.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(userCareerProfiles)
        .values({ ...data, userId })
        .returning();
      return created;
    }
  }

  async updateCareerProfileRecommendations(userId: string, recommendations: any): Promise<UserCareerProfile | null> {
    const [updated] = await db.update(userCareerProfiles)
      .set({ aiRecommendations: recommendations, lastAnalyzedAt: new Date(), updatedAt: new Date() })
      .where(eq(userCareerProfiles.userId, userId))
      .returning();
    return updated || null;
  }

  async createJobAlertSubscription(subscription: InsertJobAlertSubscription): Promise<JobAlertSubscription> {
    const [created] = await db.insert(jobAlertSubscriptions).values(subscription).returning();
    return created;
  }

  async getUserJobAlerts(userId: string): Promise<JobAlertSubscription[]> {
    return db.select().from(jobAlertSubscriptions).where(eq(jobAlertSubscriptions.userId, userId));
  }

  async updateJobAlert(id: string, data: Partial<InsertJobAlertSubscription>): Promise<JobAlertSubscription | null> {
    const [updated] = await db.update(jobAlertSubscriptions).set(data).where(eq(jobAlertSubscriptions.id, id)).returning();
    return updated || null;
  }

  async deleteJobAlert(id: string): Promise<void> {
    await db.delete(jobAlertSubscriptions).where(eq(jobAlertSubscriptions.id, id));
  }

  async getVideoTestimonials(): Promise<VideoTestimonial[]> {
    return db.select().from(videoTestimonials).where(eq(videoTestimonials.isApproved, true));
  }

  async createVideoTestimonial(testimonial: InsertVideoTestimonial): Promise<VideoTestimonial> {
    const [created] = await db.insert(videoTestimonials).values(testimonial).returning();
    return created;
  }

  async getAgencyNotificationPreference(agencyId: string): Promise<AgencyNotificationPreference | undefined> {
    const [pref] = await db.select().from(agencyNotificationPreferences).where(eq(agencyNotificationPreferences.agencyId, agencyId));
    return pref;
  }

  async upsertAgencyNotificationPreference(pref: InsertAgencyNotificationPreference): Promise<AgencyNotificationPreference> {
    const existing = await this.getAgencyNotificationPreference(pref.agencyId);
    if (existing) {
      const [updated] = await db.update(agencyNotificationPreferences)
        .set({ ...pref, updatedAt: new Date() })
        .where(eq(agencyNotificationPreferences.agencyId, pref.agencyId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(agencyNotificationPreferences).values(pref).returning();
    return created;
  }

  async getAllAgencyNotificationPreferences(): Promise<AgencyNotificationPreference[]> {
    return db.select().from(agencyNotificationPreferences);
  }

  async disableAgencyReminders(agencyId: string): Promise<void> {
    const existing = await this.getAgencyNotificationPreference(agencyId);
    if (existing) {
      await db.update(agencyNotificationPreferences)
        .set({ remindersEnabled: false, updatedAt: new Date() })
        .where(eq(agencyNotificationPreferences.agencyId, agencyId));
    } else {
      await db.insert(agencyNotificationPreferences).values({
        agencyId,
        remindersEnabled: false,
      });
    }
  }

  async enableAgencyReminders(agencyId: string): Promise<void> {
    const existing = await this.getAgencyNotificationPreference(agencyId);
    if (existing) {
      await db.update(agencyNotificationPreferences)
        .set({ remindersEnabled: true, updatedAt: new Date() })
        .where(eq(agencyNotificationPreferences.agencyId, agencyId));
    } else {
      await db.insert(agencyNotificationPreferences).values({
        agencyId,
        remindersEnabled: true,
      });
    }
  }

  async createLicenseReminderLog(log: InsertLicenseReminderLog): Promise<LicenseReminderLog> {
    const [created] = await db.insert(licenseReminderLogs).values(log).returning();
    return created;
  }

  async getLicenseReminderLogs(filters?: { agencyId?: string; status?: string; reminderTier?: string; limit?: number; offset?: number }): Promise<LicenseReminderLog[]> {
    const conditions = [];
    if (filters?.agencyId) conditions.push(eq(licenseReminderLogs.agencyId, filters.agencyId));
    if (filters?.status) conditions.push(eq(licenseReminderLogs.status, filters.status));
    if (filters?.reminderTier) conditions.push(eq(licenseReminderLogs.reminderTier, filters.reminderTier));

    const query = db.select().from(licenseReminderLogs);
    const withConditions = conditions.length > 0 ? query.where(and(...conditions)) : query;
    const ordered = withConditions.orderBy(desc(licenseReminderLogs.createdAt));
    
    if (filters?.limit) {
      const limited = ordered.limit(filters.limit);
      if (filters?.offset) return limited.offset(filters.offset);
      return limited;
    }
    return ordered;
  }

  async getLicenseReminderLogCount(filters?: { agencyId?: string; status?: string; reminderTier?: string }): Promise<number> {
    const conditions = [];
    if (filters?.agencyId) conditions.push(eq(licenseReminderLogs.agencyId, filters.agencyId));
    if (filters?.status) conditions.push(eq(licenseReminderLogs.status, filters.status));
    if (filters?.reminderTier) conditions.push(eq(licenseReminderLogs.reminderTier, filters.reminderTier));

    const query = db.select({ count: sql<number>`count(*)` }).from(licenseReminderLogs);
    const withConditions = conditions.length > 0 ? query.where(and(...conditions)) : query;
    const [result] = await withConditions;
    return Number(result?.count || 0);
  }

  async getLicenseReminderLogById(id: string): Promise<LicenseReminderLog | undefined> {
    const [log] = await db.select().from(licenseReminderLogs).where(eq(licenseReminderLogs.id, id));
    return log;
  }

  async updateLicenseReminderLog(id: string, data: Partial<InsertLicenseReminderLog>): Promise<LicenseReminderLog | undefined> {
    const [updated] = await db.update(licenseReminderLogs)
      .set(data)
      .where(eq(licenseReminderLogs.id, id))
      .returning();
    return updated;
  }

  async checkReminderAlreadySent(agencyId: string, reminderTier: string, date: string): Promise<boolean> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [existing] = await db.select({ count: sql<number>`count(*)` })
      .from(licenseReminderLogs)
      .where(and(
        eq(licenseReminderLogs.agencyId, agencyId),
        eq(licenseReminderLogs.reminderTier, reminderTier),
        sql`${licenseReminderLogs.createdAt} >= ${startOfDay}`,
        sql`${licenseReminderLogs.createdAt} <= ${endOfDay}`,
      ));
    return Number(existing?.count || 0) > 0;
  }

  async createLicenseRenewalPayment(payment: InsertLicenseRenewalPayment): Promise<LicenseRenewalPayment> {
    const [created] = await db.insert(licenseRenewalPayments).values(payment).returning();
    return created;
  }

  async getLicenseRenewalPaymentById(id: string): Promise<LicenseRenewalPayment | undefined> {
    const [payment] = await db.select().from(licenseRenewalPayments).where(eq(licenseRenewalPayments.id, id));
    return payment;
  }

  async getLicenseRenewalPaymentByCheckoutId(checkoutRequestId: string): Promise<LicenseRenewalPayment | undefined> {
    const [payment] = await db.select().from(licenseRenewalPayments)
      .where(eq(licenseRenewalPayments.checkoutRequestId, checkoutRequestId));
    return payment;
  }

  async getLicenseRenewalPaymentsByAgency(agencyId: string): Promise<LicenseRenewalPayment[]> {
    return db.select().from(licenseRenewalPayments)
      .where(eq(licenseRenewalPayments.agencyId, agencyId))
      .orderBy(desc(licenseRenewalPayments.createdAt));
  }

  async updateLicenseRenewalPayment(id: string, data: Partial<InsertLicenseRenewalPayment>): Promise<LicenseRenewalPayment | undefined> {
    const [updated] = await db.update(licenseRenewalPayments)
      .set(data)
      .where(eq(licenseRenewalPayments.id, id))
      .returning();
    return updated;
  }

  async getGovernmentIntegrations(): Promise<GovernmentIntegration[]> {
    return db.select().from(governmentIntegrations).orderBy(governmentIntegrations.name);
  }

  async getGovernmentIntegrationById(id: string): Promise<GovernmentIntegration | undefined> {
    const [integration] = await db.select().from(governmentIntegrations)
      .where(eq(governmentIntegrations.id, id)).limit(1);
    return integration;
  }

  async getGovernmentIntegrationByCode(code: string): Promise<GovernmentIntegration | undefined> {
    const [integration] = await db.select().from(governmentIntegrations)
      .where(eq(governmentIntegrations.code, code)).limit(1);
    return integration;
  }

  async createGovernmentIntegration(data: InsertGovernmentIntegration): Promise<GovernmentIntegration> {
    const [integration] = await db.insert(governmentIntegrations).values(data).returning();
    return integration;
  }

  async updateGovernmentIntegration(id: string, data: Partial<InsertGovernmentIntegration>): Promise<GovernmentIntegration | undefined> {
    const [updated] = await db.update(governmentIntegrations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(governmentIntegrations.id, id)).returning();
    return updated;
  }

  async deleteGovernmentIntegration(id: string): Promise<boolean> {
    const result = await db.delete(governmentIntegrations).where(eq(governmentIntegrations.id, id));
    return true;
  }

  async getGovernmentSyncLogs(filters?: {
    integrationCode?: string;
    status?: string;
    action?: string;
    limit?: number;
    offset?: number;
  }): Promise<GovernmentSyncLog[]> {
    let query = db.select().from(governmentSyncLogs).orderBy(desc(governmentSyncLogs.startedAt));

    const conditions = [];
    if (filters?.integrationCode) {
      conditions.push(eq(governmentSyncLogs.integrationCode, filters.integrationCode));
    }
    if (filters?.status) {
      conditions.push(eq(governmentSyncLogs.status, filters.status));
    }
    if (filters?.action) {
      conditions.push(eq(governmentSyncLogs.action, filters.action));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return query.limit(filters?.limit || 100).offset(filters?.offset || 0);
  }

  async getGovernmentSyncLogByRequestId(requestId: string): Promise<GovernmentSyncLog | undefined> {
    const [log] = await db.select().from(governmentSyncLogs)
      .where(eq(governmentSyncLogs.requestId, requestId)).limit(1);
    return log;
  }

  async getGovernmentSyncStats(): Promise<{
    total: number;
    pending: number;
    success: number;
    error: number;
    byIntegration: Record<string, { total: number; success: number; error: number }>;
  }> {
    const logs = await db.select().from(governmentSyncLogs);
    const stats = {
      total: logs.length,
      pending: logs.filter(l => l.status === "pending").length,
      success: logs.filter(l => l.status === "success").length,
      error: logs.filter(l => l.status === "error").length,
      byIntegration: {} as Record<string, { total: number; success: number; error: number }>,
    };

    logs.forEach(l => {
      if (!stats.byIntegration[l.integrationCode]) {
        stats.byIntegration[l.integrationCode] = { total: 0, success: 0, error: 0 };
      }
      stats.byIntegration[l.integrationCode].total++;
      if (l.status === "success") stats.byIntegration[l.integrationCode].success++;
      if (l.status === "error") stats.byIntegration[l.integrationCode].error++;
    });

    return stats;
  }

  async getGovernmentFeatureFlags(): Promise<GovernmentFeatureFlag[]> {
    return db.select().from(governmentFeatureFlags).orderBy(governmentFeatureFlags.key);
  }

  async getGovernmentFeatureFlagByKey(key: string): Promise<GovernmentFeatureFlag | undefined> {
    const [flag] = await db.select().from(governmentFeatureFlags)
      .where(eq(governmentFeatureFlags.key, key)).limit(1);
    return flag;
  }

  async upsertGovernmentFeatureFlag(data: InsertGovernmentFeatureFlag): Promise<GovernmentFeatureFlag> {
    const existing = await this.getGovernmentFeatureFlagByKey(data.key);
    if (existing) {
      const [updated] = await db.update(governmentFeatureFlags)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(governmentFeatureFlags.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(governmentFeatureFlags).values(data).returning();
    return created;
  }

  async updateGovernmentFeatureFlag(id: string, data: Partial<InsertGovernmentFeatureFlag>): Promise<GovernmentFeatureFlag | undefined> {
    const [updated] = await db.update(governmentFeatureFlags)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(governmentFeatureFlags.id, id)).returning();
    return updated;
  }

  async getManualOverrides(filters?: { integrationCode?: string; overrideStatus?: string; syncStatus?: string; limit?: number; offset?: number }): Promise<ManualOverride[]> {
    let query = db.select().from(manualOverrides).orderBy(desc(manualOverrides.createdAt));
    if (filters) {
      const conditions: any[] = [];
      if (filters.integrationCode) {
        conditions.push(eq(manualOverrides.integrationCode, filters.integrationCode));
      }
      if (filters.overrideStatus) {
        conditions.push(eq(manualOverrides.overrideStatus, filters.overrideStatus));
      }
      if (filters.syncStatus) {
        conditions.push(eq(manualOverrides.syncStatus, filters.syncStatus));
      }
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      if (filters.limit) {
        query = query.limit(filters.limit) as any;
      }
      if (filters.offset) {
        query = query.offset(filters.offset) as any;
      }
    }
    return query;
  }

  async getManualOverrideById(id: string): Promise<ManualOverride | undefined> {
    const [override] = await db.select().from(manualOverrides)
      .where(eq(manualOverrides.id, id)).limit(1);
    return override;
  }

  async getManualOverrideByLicense(integrationCode: string, licenseNumber: string): Promise<ManualOverride | undefined> {
    const [override] = await db.select().from(manualOverrides)
      .where(and(
        eq(manualOverrides.integrationCode, integrationCode),
        eq(manualOverrides.licenseNumber, licenseNumber),
        eq(manualOverrides.overrideStatus, 'approved')
      ))
      .orderBy(desc(manualOverrides.approvedAt))
      .limit(1);
    return override;
  }

  async createManualOverride(data: InsertManualOverride): Promise<ManualOverride> {
    const [override] = await db.insert(manualOverrides).values(data).returning();
    return override;
  }

  async updateManualOverride(id: string, data: Partial<ManualOverride>): Promise<ManualOverride | undefined> {
    const [updated] = await db.update(manualOverrides)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(manualOverrides.id, id)).returning();
    return updated;
  }

  async getManualOverrideCount(filters?: { integrationCode?: string; overrideStatus?: string; syncStatus?: string }): Promise<number> {
    let query = db.select({ count: sql<number>`count(*)` }).from(manualOverrides);
    if (filters) {
      const conditions: any[] = [];
      if (filters.integrationCode) {
        conditions.push(eq(manualOverrides.integrationCode, filters.integrationCode));
      }
      if (filters.overrideStatus) {
        conditions.push(eq(manualOverrides.overrideStatus, filters.overrideStatus));
      }
      if (filters.syncStatus) {
        conditions.push(eq(manualOverrides.syncStatus, filters.syncStatus));
      }
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
    }
    const [result] = await query;
    return Number(result?.count ?? 0);
  }

  async getPendingSyncOverrides(integrationCode: string): Promise<ManualOverride[]> {
    return db.select().from(manualOverrides)
      .where(and(
        eq(manualOverrides.integrationCode, integrationCode),
        eq(manualOverrides.overrideStatus, 'approved'),
        eq(manualOverrides.syncRequired, true),
        eq(manualOverrides.syncStatus, 'pending')
      ))
      .orderBy(manualOverrides.createdAt);
  }

  async getExpiredManualOverrides(): Promise<ManualOverride[]> {
    return db.select().from(manualOverrides)
      .where(and(
        eq(manualOverrides.overrideStatus, 'approved'),
        eq(manualOverrides.expiryNotified, false),
        sql`${manualOverrides.manualVerificationExpiry} IS NOT NULL AND ${manualOverrides.manualVerificationExpiry} < NOW()`
      ));
  }

  // ── Security Events (behavior tracking + anomaly detection) ─────────────

  async createSecurityEvent(data: InsertSecurityEvent): Promise<SecurityEvent> {
    const [event] = await db.insert(securityEvents).values(data).returning();
    return event;
  }

  async getSecurityEvents(opts?: { eventType?: string; ipAddress?: string; userId?: string; since?: Date; limit?: number; offset?: number }): Promise<SecurityEvent[]> {
    const conditions = [];
    if (opts?.eventType) conditions.push(eq(securityEvents.eventType, opts.eventType));
    if (opts?.ipAddress) conditions.push(eq(securityEvents.ipAddress, opts.ipAddress));
    if (opts?.userId) conditions.push(eq(securityEvents.userId, opts.userId));
    if (opts?.since) conditions.push(gte(securityEvents.createdAt, opts.since));
    let query = db.select().from(securityEvents).orderBy(desc(securityEvents.createdAt)) as any;
    if (conditions.length > 0) query = query.where(and(...conditions));
    query = query.limit(opts?.limit ?? 100).offset(opts?.offset ?? 0);
    return query;
  }

  async getTopSuspiciousIPs(since: Date, limit = 10): Promise<{ ipAddress: string; totalRiskPoints: number; eventCount: number; eventTypes: string[] }[]> {
    const rows = await db.execute(sql`
      SELECT
        ip_address AS "ipAddress",
        SUM(risk_points)::int AS "totalRiskPoints",
        COUNT(*)::int AS "eventCount",
        ARRAY_AGG(DISTINCT event_type)::text[] AS "eventTypes"
      FROM security_events
      WHERE ip_address IS NOT NULL AND created_at >= ${since}
      GROUP BY ip_address
      ORDER BY SUM(risk_points) DESC
      LIMIT ${limit}
    `);
    return rows.rows as any;
  }

  async getHighRiskUsers(since: Date, limit = 10): Promise<{ userId: string; totalRiskPoints: number; eventCount: number; eventTypes: string[] }[]> {
    const rows = await db.execute(sql`
      SELECT
        user_id AS "userId",
        SUM(risk_points)::int AS "totalRiskPoints",
        COUNT(*)::int AS "eventCount",
        ARRAY_AGG(DISTINCT event_type)::text[] AS "eventTypes"
      FROM security_events
      WHERE user_id IS NOT NULL AND created_at >= ${since}
      GROUP BY user_id
      ORDER BY SUM(risk_points) DESC
      LIMIT ${limit}
    `);
    return rows.rows as any;
  }

  async getSecurityEventStats(since: Date): Promise<{ totalEvents: number; totalRiskPoints: number; uniqueIPs: number; uniqueUsers: number; byType: Record<string, number> }> {
    const totalsResult = await db.execute(sql`
      SELECT
        COUNT(*)::int AS "totalEvents",
        COALESCE(SUM(risk_points), 0)::int AS "totalRiskPoints",
        COUNT(DISTINCT ip_address)::int AS "uniqueIPs",
        COUNT(DISTINCT user_id)::int AS "uniqueUsers"
      FROM security_events
      WHERE created_at >= ${since}
    `);
    const t = (totalsResult.rows[0] ?? {}) as Record<string, number>;

    const typeResult = await db.execute(sql`
      SELECT event_type AS "eventType", COUNT(*)::int AS cnt
      FROM security_events
      WHERE created_at >= ${since}
      GROUP BY event_type
    `);

    const byType: Record<string, number> = {};
    for (const row of (typeResult.rows as any[])) {
      byType[row.eventType] = row.cnt;
    }

    return {
      totalEvents: t.totalEvents ?? 0,
      totalRiskPoints: t.totalRiskPoints ?? 0,
      uniqueIPs: t.uniqueIPs ?? 0,
      uniqueUsers: t.uniqueUsers ?? 0,
      byType,
    };
  }

  async pruneOldSecurityEvents(olderThan: Date): Promise<number> {
    const result = await db.delete(securityEvents).where(sql`${securityEvents.createdAt} < ${olderThan}`);
    return result.rowCount ?? 0;
  }

  async setIntegrationFallbackMode(code: string, enabled: boolean, reason?: string): Promise<GovernmentIntegration | undefined> {
    const [updated] = await db.update(governmentIntegrations)
      .set({
        fallbackMode: enabled,
        fallbackReason: reason || null,
        fallbackActivatedAt: enabled ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(governmentIntegrations.code, code)).returning();
    return updated;
  }

  async createComplianceAuditLog(log: InsertComplianceAuditLog): Promise<ComplianceAuditLog> {
    const [created] = await db.insert(complianceAuditLogs).values(log).returning();
    return created;
  }

  async getComplianceAuditLogs(filters?: { userId?: string; action?: string; recordType?: string; recordId?: string; limit?: number; offset?: number }): Promise<ComplianceAuditLog[]> {
    let query = db.select().from(complianceAuditLogs).orderBy(desc(complianceAuditLogs.createdAt));
    if (filters) {
      const conditions: any[] = [];
      if (filters.userId) conditions.push(eq(complianceAuditLogs.userId, filters.userId));
      if (filters.action) conditions.push(eq(complianceAuditLogs.action, filters.action));
      if (filters.recordType) conditions.push(eq(complianceAuditLogs.recordType, filters.recordType));
      if (filters.recordId) conditions.push(eq(complianceAuditLogs.recordId, filters.recordId));
      if (conditions.length > 0) query = query.where(and(...conditions)) as any;
      if (filters.limit) query = query.limit(filters.limit) as any;
      if (filters.offset) query = query.offset(filters.offset) as any;
    }
    return query;
  }

  async getComplianceAuditLogCount(filters?: { userId?: string; action?: string; recordType?: string; recordId?: string }): Promise<number> {
    let query = db.select({ count: sql<number>`count(*)` }).from(complianceAuditLogs);
    if (filters) {
      const conditions: any[] = [];
      if (filters.userId) conditions.push(eq(complianceAuditLogs.userId, filters.userId));
      if (filters.action) conditions.push(eq(complianceAuditLogs.action, filters.action));
      if (filters.recordType) conditions.push(eq(complianceAuditLogs.recordType, filters.recordType));
      if (filters.recordId) conditions.push(eq(complianceAuditLogs.recordId, filters.recordId));
      if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    }
    const [result] = await query;
    return Number(result?.count ?? 0);
  }

  async createDowntimeEvent(event: InsertGovernmentDowntimeEvent): Promise<GovernmentDowntimeEvent> {
    const [created] = await db.insert(governmentDowntimeEvents).values(event).returning();
    return created;
  }

  async getDowntimeEvents(filters?: { integrationCode?: string; eventType?: string; limit?: number; offset?: number }): Promise<GovernmentDowntimeEvent[]> {
    let query = db.select().from(governmentDowntimeEvents).orderBy(desc(governmentDowntimeEvents.createdAt));
    if (filters) {
      const conditions: any[] = [];
      if (filters.integrationCode) conditions.push(eq(governmentDowntimeEvents.integrationCode, filters.integrationCode));
      if (filters.eventType) conditions.push(eq(governmentDowntimeEvents.eventType, filters.eventType));
      if (conditions.length > 0) query = query.where(and(...conditions)) as any;
      if (filters.limit) query = query.limit(filters.limit) as any;
      if (filters.offset) query = query.offset(filters.offset) as any;
    }
    return query;
  }

  async getDowntimeAnalytics(integrationCode?: string): Promise<{ totalEvents: number; totalOutages: number; totalFallbacks: number; avgDurationMs: number }> {
    let baseConditions: any[] = [];
    if (integrationCode) baseConditions.push(eq(governmentDowntimeEvents.integrationCode, integrationCode));

    const [totalResult] = await (baseConditions.length > 0
      ? db.select({ count: sql<number>`count(*)` }).from(governmentDowntimeEvents).where(and(...baseConditions))
      : db.select({ count: sql<number>`count(*)` }).from(governmentDowntimeEvents));

    const outageConditions = [...baseConditions, eq(governmentDowntimeEvents.eventType, 'outage_start')];
    const [outageResult] = await db.select({ count: sql<number>`count(*)` }).from(governmentDowntimeEvents).where(and(...outageConditions));

    const fallbackConditions = [...baseConditions, eq(governmentDowntimeEvents.eventType, 'fallback_activated')];
    const [fallbackResult] = await db.select({ count: sql<number>`count(*)` }).from(governmentDowntimeEvents).where(and(...fallbackConditions));

    const durationConditions = [...baseConditions, sql`${governmentDowntimeEvents.durationMs} IS NOT NULL`];
    const [durationResult] = await db.select({ avg: sql<number>`COALESCE(AVG(${governmentDowntimeEvents.durationMs}), 0)` }).from(governmentDowntimeEvents).where(and(...durationConditions));

    return {
      totalEvents: Number(totalResult?.count ?? 0),
      totalOutages: Number(outageResult?.count ?? 0),
      totalFallbacks: Number(fallbackResult?.count ?? 0),
      avgDurationMs: Math.round(Number(durationResult?.avg ?? 0)),
    };
  }

  async createAuditExport(data: InsertAuditExport): Promise<AuditExport> {
    const [created] = await db.insert(auditExports).values(data).returning();
    return created;
  }

  async getAuditExports(limit: number = 50): Promise<AuditExport[]> {
    return db.select().from(auditExports).orderBy(desc(auditExports.createdAt)).limit(limit);
  }

  async getAgencyScore(agencyId: string): Promise<AgencyLegitimacyScore | undefined> {
    const [score] = await db.select().from(agencyLegitimacyScores).where(eq(agencyLegitimacyScores.agencyId, agencyId));
    return score;
  }

  async upsertAgencyScore(data: InsertAgencyLegitimacyScore): Promise<AgencyLegitimacyScore> {
    const existing = await this.getAgencyScore(data.agencyId);
    if (existing) {
      const [updated] = await db.update(agencyLegitimacyScores)
        .set({ ...data, updatedAt: new Date(), lastCalculatedAt: new Date() })
        .where(eq(agencyLegitimacyScores.agencyId, data.agencyId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(agencyLegitimacyScores).values(data).returning();
    return created;
  }

  async getAllAgencyScores(filters?: { tier?: string; isFrozen?: boolean; limit?: number; offset?: number }): Promise<AgencyLegitimacyScore[]> {
    const conditions: any[] = [];
    if (filters?.tier) conditions.push(eq(agencyLegitimacyScores.tier, filters.tier));
    if (filters?.isFrozen !== undefined) conditions.push(eq(agencyLegitimacyScores.isFrozen, filters.isFrozen));
    const query = db.select().from(agencyLegitimacyScores)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(agencyLegitimacyScores.overallScore))
      .limit(filters?.limit || 100)
      .offset(filters?.offset || 0);
    return query;
  }

  async getAgencyScoreCount(filters?: { tier?: string; isFrozen?: boolean }): Promise<number> {
    const conditions: any[] = [];
    if (filters?.tier) conditions.push(eq(agencyLegitimacyScores.tier, filters.tier));
    if (filters?.isFrozen !== undefined) conditions.push(eq(agencyLegitimacyScores.isFrozen, filters.isFrozen));
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(agencyLegitimacyScores)
      .where(conditions.length ? and(...conditions) : undefined);
    return Number(result?.count ?? 0);
  }

  async freezeAgencyScore(agencyId: string, frozenBy: string, reason: string): Promise<void> {
    await db.update(agencyLegitimacyScores)
      .set({ isFrozen: true, frozenBy, frozenReason: reason, frozenAt: new Date(), updatedAt: new Date() })
      .where(eq(agencyLegitimacyScores.agencyId, agencyId));
  }

  async unfreezeAgencyScore(agencyId: string): Promise<void> {
    await db.update(agencyLegitimacyScores)
      .set({ isFrozen: false, frozenBy: null, frozenReason: null, frozenAt: null, updatedAt: new Date() })
      .where(eq(agencyLegitimacyScores.agencyId, agencyId));
  }

  async createScoreHistory(data: InsertAgencyScoreHistory): Promise<AgencyScoreHistoryRecord> {
    const [created] = await db.insert(agencyScoreHistory).values(data).returning();
    return created;
  }

  async getScoreHistory(agencyId: string, limit: number = 50): Promise<AgencyScoreHistoryRecord[]> {
    return db.select().from(agencyScoreHistory)
      .where(eq(agencyScoreHistory.agencyId, agencyId))
      .orderBy(desc(agencyScoreHistory.createdAt))
      .limit(limit);
  }

  async createComplianceEvent(data: InsertAgencyComplianceEvent): Promise<AgencyComplianceEvent> {
    const [created] = await db.insert(agencyComplianceEvents).values(data).returning();
    return created;
  }

  async getComplianceEvents(agencyId: string, limit: number = 50): Promise<AgencyComplianceEvent[]> {
    return db.select().from(agencyComplianceEvents)
      .where(eq(agencyComplianceEvents.agencyId, agencyId))
      .orderBy(desc(agencyComplianceEvents.createdAt))
      .limit(limit);
  }

  async getRecentComplianceEvents(agencyId: string, monthsBack: number = 12): Promise<AgencyComplianceEvent[]> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
    return db.select().from(agencyComplianceEvents)
      .where(and(
        eq(agencyComplianceEvents.agencyId, agencyId),
        sql`${agencyComplianceEvents.createdAt} >= ${cutoffDate}`
      ))
      .orderBy(desc(agencyComplianceEvents.createdAt));
  }

  async getScoreWeights(): Promise<AgencyScoreWeight[]> {
    return db.select().from(agencyScoreWeights).orderBy(agencyScoreWeights.factorName);
  }

  async updateScoreWeight(id: string, weight: number, updatedBy: string): Promise<AgencyScoreWeight> {
    const [updated] = await db.update(agencyScoreWeights)
      .set({ weight, updatedBy, updatedAt: new Date() })
      .where(eq(agencyScoreWeights.id, id))
      .returning();
    return updated;
  }
  async createBlacklistEntry(data: InsertBlacklistedEntity): Promise<BlacklistedEntity> {
    const [entry] = await db.insert(blacklistedEntities).values(data).returning();
    return entry;
  }

  async getBlacklistEntry(id: string): Promise<BlacklistedEntity | undefined> {
    const [entry] = await db.select().from(blacklistedEntities).where(eq(blacklistedEntities.id, id));
    return entry;
  }

  async getAllBlacklistEntries(filters: { status?: string; entityType?: string; limit?: number; offset?: number } = {}): Promise<BlacklistedEntity[]> {
    const conditions: any[] = [];
    if (filters.status) conditions.push(eq(blacklistedEntities.status, filters.status));
    if (filters.entityType) conditions.push(eq(blacklistedEntities.entityType, filters.entityType));
    let query = db.select().from(blacklistedEntities);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return (query as any).orderBy(desc(blacklistedEntities.dateAdded))
      .limit(filters.limit || 100)
      .offset(filters.offset || 0);
  }

  async getBlacklistCount(filters: { status?: string; entityType?: string } = {}): Promise<number> {
    const conditions: any[] = [];
    if (filters.status) conditions.push(eq(blacklistedEntities.status, filters.status));
    if (filters.entityType) conditions.push(eq(blacklistedEntities.entityType, filters.entityType));
    let query = db.select({ count: sql<number>`count(*)` }).from(blacklistedEntities);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    const [result] = await query;
    return Number(result.count);
  }

  async isEntityBlacklisted(entityId: string): Promise<boolean> {
    const [entry] = await db.select().from(blacklistedEntities)
      .where(and(eq(blacklistedEntities.entityId, entityId), eq(blacklistedEntities.status, "active")));
    return !!entry;
  }

  async getActiveBlacklistedEntityIds(): Promise<Set<string>> {
    const rows = await db.select({ entityId: blacklistedEntities.entityId })
      .from(blacklistedEntities)
      .where(eq(blacklistedEntities.status, "active"));
    return new Set(rows.map(r => r.entityId));
  }

  async getBlacklistByEntityId(entityId: string): Promise<BlacklistedEntity[]> {
    return db.select().from(blacklistedEntities)
      .where(eq(blacklistedEntities.entityId, entityId))
      .orderBy(desc(blacklistedEntities.dateAdded));
  }

  async updateBlacklistStatus(id: string, status: string): Promise<BlacklistedEntity> {
    const [updated] = await db.update(blacklistedEntities)
      .set({ status, updatedAt: new Date() })
      .where(eq(blacklistedEntities.id, id))
      .returning();
    return updated;
  }

  async clearBlacklistEntry(id: string, clearedBy: string, clearedReason: string): Promise<BlacklistedEntity> {
    const [updated] = await db.update(blacklistedEntities)
      .set({ status: "cleared", clearedAt: new Date(), clearedBy, clearedReason, updatedAt: new Date() })
      .where(eq(blacklistedEntities.id, id))
      .returning();
    return updated;
  }

  async createFraudFlag(data: InsertFraudFlag): Promise<FraudFlag> {
    const [flag] = await db.insert(fraudFlags).values(data).returning();
    return flag;
  }

  async getFraudFlag(id: string): Promise<FraudFlag | undefined> {
    const [flag] = await db.select().from(fraudFlags).where(eq(fraudFlags.id, id));
    return flag;
  }

  async getAllFraudFlags(filters: { status?: string; severity?: string; entityType?: string; limit?: number; offset?: number } = {}): Promise<FraudFlag[]> {
    const conditions: any[] = [];
    if (filters.status) conditions.push(eq(fraudFlags.status, filters.status));
    if (filters.severity) conditions.push(eq(fraudFlags.severity, filters.severity));
    if (filters.entityType) conditions.push(eq(fraudFlags.entityType, filters.entityType));
    let query = db.select().from(fraudFlags);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return (query as any).orderBy(desc(fraudFlags.createdAt))
      .limit(filters.limit || 100)
      .offset(filters.offset || 0);
  }

  async getFraudFlagCount(filters: { status?: string; severity?: string } = {}): Promise<number> {
    const conditions: any[] = [];
    if (filters.status) conditions.push(eq(fraudFlags.status, filters.status));
    if (filters.severity) conditions.push(eq(fraudFlags.severity, filters.severity));
    let query = db.select({ count: sql<number>`count(*)` }).from(fraudFlags);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    const [result] = await query;
    return Number(result.count);
  }

  async updateFraudFlagStatus(id: string, status: string, resolvedBy?: string): Promise<FraudFlag> {
    const updateData: any = { status };
    if (status === "resolved" || status === "dismissed") {
      updateData.resolvedBy = resolvedBy;
      updateData.resolvedAt = new Date();
    }
    const [updated] = await db.update(fraudFlags)
      .set(updateData)
      .where(eq(fraudFlags.id, id))
      .returning();
    return updated;
  }

  async getFraudFlagsByEntityId(entityId: string): Promise<FraudFlag[]> {
    return db.select().from(fraudFlags)
      .where(eq(fraudFlags.entityId, entityId))
      .orderBy(desc(fraudFlags.createdAt));
  }

  async getOpenFraudFlagsByEntityAndRule(entityId: string, ruleTriggered: string): Promise<FraudFlag[]> {
    return db.select().from(fraudFlags)
      .where(and(
        eq(fraudFlags.entityId, entityId),
        eq(fraudFlags.ruleTriggered, ruleTriggered),
        eq(fraudFlags.status, "open")
      ));
  }

  async createFraudInvestigationNote(data: InsertFraudInvestigationNote): Promise<FraudInvestigationNote> {
    const [note] = await db.insert(fraudInvestigationNotes).values(data).returning();
    return note;
  }

  async getNotesByFraudFlag(fraudFlagId: string): Promise<FraudInvestigationNote[]> {
    return db.select().from(fraudInvestigationNotes)
      .where(eq(fraudInvestigationNotes.fraudFlagId, fraudFlagId))
      .orderBy(desc(fraudInvestigationNotes.createdAt));
  }

  async getNotesByBlacklistEntry(blacklistEntryId: string): Promise<FraudInvestigationNote[]> {
    return db.select().from(fraudInvestigationNotes)
      .where(eq(fraudInvestigationNotes.blacklistEntryId, blacklistEntryId))
      .orderBy(desc(fraudInvestigationNotes.createdAt));
  }

  async updateFraudFlagAutoActions(id: string, actions: string[]): Promise<void> {
    await db.update(fraudFlags)
      .set({ autoActions: actions })
      .where(eq(fraudFlags.id, id));
  }

  async getAllFraudDetectionRules(): Promise<FraudDetectionRule[]> {
    return db.select().from(fraudDetectionRules).orderBy(fraudDetectionRules.ruleName);
  }

  async getActiveFraudDetectionRules(): Promise<FraudDetectionRule[]> {
    return db.select().from(fraudDetectionRules)
      .where(eq(fraudDetectionRules.isActive, true))
      .orderBy(fraudDetectionRules.ruleName);
  }

  async getFraudDetectionRule(id: string): Promise<FraudDetectionRule | undefined> {
    const [rule] = await db.select().from(fraudDetectionRules).where(eq(fraudDetectionRules.id, id));
    return rule;
  }

  async seedDefaultFraudDetectionRules(): Promise<void> {
    const defaults = [
      { ruleName: "complaints_threshold", description: "3 or more complaints against an agency within 30 days", ruleType: "complaints", threshold: 3, timeWindowDays: 30, severity: "high", autoBlacklist: false, autoReduceScore: true, scoreReduction: 15 },
      { ruleName: "license_expired_extended", description: "License expired for more than 60 days without renewal", ruleType: "license_expiry", threshold: 60, timeWindowDays: 0, severity: "high", autoBlacklist: false, autoReduceScore: true, scoreReduction: 20 },
      { ruleName: "manual_verification_rejected", description: "Manual verification requests repeatedly rejected", ruleType: "verification_rejected", threshold: 3, timeWindowDays: 90, severity: "critical", autoBlacklist: true, autoReduceScore: true, scoreReduction: 25 },
      { ruleName: "payment_fraud", description: "Payment fraud or disputes reported against agency", ruleType: "payment_fraud", threshold: 1, timeWindowDays: 90, severity: "critical", autoBlacklist: true, autoReduceScore: true, scoreReduction: 30 },
      { ruleName: "fake_renewal_receipts", description: "Multiple failed or fraudulent renewal payment attempts", ruleType: "fake_receipts", threshold: 2, timeWindowDays: 60, severity: "high", autoBlacklist: false, autoReduceScore: true, scoreReduction: 20 },
    ];
    for (const rule of defaults) {
      const existing = await db.select().from(fraudDetectionRules).where(eq(fraudDetectionRules.ruleName, rule.ruleName));
      if (existing.length === 0) {
        await db.insert(fraudDetectionRules).values(rule);
      }
    }
  }

  async updateFraudDetectionRule(id: string, data: Partial<InsertFraudDetectionRule>): Promise<FraudDetectionRule> {
    const [updated] = await db.update(fraudDetectionRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(fraudDetectionRules.id, id))
      .returning();
    return updated;
  }

  async getComplianceRiskScores(filters?: { minScore?: number; maxScore?: number; trend?: string; limit?: number; offset?: number }): Promise<ComplianceRiskScore[]> {
    const conditions: any[] = [];
    if (filters?.minScore !== undefined) conditions.push(gte(complianceRiskScores.riskScore, filters.minScore));
    if (filters?.maxScore !== undefined) conditions.push(sql`${complianceRiskScores.riskScore} <= ${filters.maxScore}`);
    if (filters?.trend) conditions.push(eq(complianceRiskScores.trend, filters.trend));

    let query = db.select().from(complianceRiskScores);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return (query as any).orderBy(desc(complianceRiskScores.riskScore))
      .limit(filters?.limit || 100)
      .offset(filters?.offset || 0);
  }

  async getComplianceRiskScoreByAgency(agencyId: string): Promise<ComplianceRiskScore | undefined> {
    const [score] = await db.select().from(complianceRiskScores)
      .where(eq(complianceRiskScores.agencyId, agencyId)).limit(1);
    return score;
  }

  async getComplianceRiskHistory(agencyId: string, limit?: number): Promise<ComplianceRiskHistory[]> {
    return db.select().from(complianceRiskHistory)
      .where(eq(complianceRiskHistory.agencyId, agencyId))
      .orderBy(desc(complianceRiskHistory.calculatedAt))
      .limit(limit || 30);
  }

  async getComplianceAnomalies(filters?: { status?: string; severity?: string; anomalyType?: string; limit?: number; offset?: number }): Promise<ComplianceAnomaly[]> {
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(complianceAnomalies.status, filters.status));
    if (filters?.severity) conditions.push(eq(complianceAnomalies.severity, filters.severity));
    if (filters?.anomalyType) conditions.push(eq(complianceAnomalies.anomalyType, filters.anomalyType));

    let query = db.select().from(complianceAnomalies);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return (query as any).orderBy(desc(complianceAnomalies.detectedAt))
      .limit(filters?.limit || 100)
      .offset(filters?.offset || 0);
  }

  async updateComplianceAnomaly(id: string, data: Partial<InsertComplianceAnomaly>): Promise<ComplianceAnomaly> {
    const [updated] = await db.update(complianceAnomalies)
      .set({ ...data, reviewedAt: new Date() })
      .where(eq(complianceAnomalies.id, id))
      .returning();
    return updated;
  }

  async getComplianceAlerts(filters?: { status?: string; severity?: string; alertType?: string; limit?: number; offset?: number }): Promise<ComplianceAlert[]> {
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(complianceAlerts.status, filters.status));
    if (filters?.severity) conditions.push(eq(complianceAlerts.severity, filters.severity));
    if (filters?.alertType) conditions.push(eq(complianceAlerts.alertType, filters.alertType));

    let query = db.select().from(complianceAlerts);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return (query as any).orderBy(desc(complianceAlerts.triggeredAt))
      .limit(filters?.limit || 100)
      .offset(filters?.offset || 0);
  }

  async acknowledgeComplianceAlert(id: string, userId: string): Promise<ComplianceAlert> {
    const [updated] = await db.update(complianceAlerts)
      .set({ status: "acknowledged", acknowledgedBy: userId, acknowledgedAt: new Date() })
      .where(eq(complianceAlerts.id, id))
      .returning();
    return updated;
  }

  async resolveComplianceAlert(id: string, userId: string): Promise<ComplianceAlert> {
    const [updated] = await db.update(complianceAlerts)
      .set({ status: "resolved", resolvedBy: userId, resolvedAt: new Date() })
      .where(eq(complianceAlerts.id, id))
      .returning();
    return updated;
  }

  async getComplianceRiskConfig(): Promise<ComplianceRiskConfig[]> {
    return db.select().from(complianceRiskConfig).orderBy(complianceRiskConfig.configKey);
  }

  async updateComplianceRiskConfig(key: string, value: any): Promise<ComplianceRiskConfig> {
    const [updated] = await db.update(complianceRiskConfig)
      .set({ configValue: value, updatedAt: new Date() })
      .where(eq(complianceRiskConfig.configKey, key))
      .returning();
    return updated;
  }

  async getComplianceDashboardStats(): Promise<{ highRisk: number; openAnomalies: number; pendingAlerts: number; avgRiskScore: number; criticalAlerts: number }> {
    const [highRiskResult] = await db.select({ cnt: count() }).from(complianceRiskScores)
      .where(gte(complianceRiskScores.riskScore, 70));
    const [anomalyResult] = await db.select({ cnt: count() }).from(complianceAnomalies)
      .where(eq(complianceAnomalies.status, "open"));
    const [pendingResult] = await db.select({ cnt: count() }).from(complianceAlerts)
      .where(eq(complianceAlerts.status, "pending"));
    const [criticalResult] = await db.select({ cnt: count() }).from(complianceAlerts)
      .where(and(eq(complianceAlerts.status, "pending"), eq(complianceAlerts.severity, "critical")));
    const [avgResult] = await db.select({ avg: sql<number>`COALESCE(AVG(${complianceRiskScores.riskScore}), 0)` })
      .from(complianceRiskScores);

    return {
      highRisk: highRiskResult?.cnt || 0,
      openAnomalies: anomalyResult?.cnt || 0,
      pendingAlerts: pendingResult?.cnt || 0,
      avgRiskScore: Math.round(avgResult?.avg || 0),
      criticalAlerts: criticalResult?.cnt || 0,
    };
  }

  async getComplianceIndexRankings(filters?: { country?: string; industry?: string; badge?: string; search?: string; limit?: number; offset?: number }): Promise<ComplianceIndexScore[]> {
    const conditions: any[] = [eq(complianceIndexScores.isExcluded, false)];
    if (filters?.country) conditions.push(eq(complianceIndexScores.country, filters.country));
    if (filters?.industry) conditions.push(eq(complianceIndexScores.industry, filters.industry));
    if (filters?.badge && filters.badge !== "_all") conditions.push(eq(complianceIndexScores.badge, filters.badge));
    if (filters?.search) conditions.push(ilike(complianceIndexScores.agencyName, `%${filters.search}%`));

    return db.select().from(complianceIndexScores)
      .where(and(...conditions))
      .orderBy(complianceIndexScores.globalRank)
      .limit(filters?.limit || 100)
      .offset(filters?.offset || 0);
  }

  async getComplianceIndexByAgency(agencyId: string): Promise<ComplianceIndexScore | undefined> {
    const [score] = await db.select().from(complianceIndexScores)
      .where(eq(complianceIndexScores.agencyId, agencyId)).limit(1);
    return score;
  }

  async getComplianceIndexHistory(agencyId: string, limit?: number): Promise<ComplianceIndexHistory[]> {
    return db.select().from(complianceIndexHistory)
      .where(eq(complianceIndexHistory.agencyId, agencyId))
      .orderBy(desc(complianceIndexHistory.calculatedAt))
      .limit(limit || 30);
  }

  async getComplianceIndexStats(): Promise<{ totalRanked: number; avgScore: number; diamondCount: number; platinumCount: number; goldCount: number; silverCount: number }> {
    const notExcluded = eq(complianceIndexScores.isExcluded, false);
    const [totalResult] = await db.select({ cnt: count() }).from(complianceIndexScores).where(notExcluded);
    const [avgResult] = await db.select({ avg: sql<number>`COALESCE(AVG(${complianceIndexScores.compositeScore}), 0)` }).from(complianceIndexScores).where(notExcluded);
    const [diamond] = await db.select({ cnt: count() }).from(complianceIndexScores).where(and(notExcluded, eq(complianceIndexScores.badge, "diamond")));
    const [platinum] = await db.select({ cnt: count() }).from(complianceIndexScores).where(and(notExcluded, eq(complianceIndexScores.badge, "platinum")));
    const [gold] = await db.select({ cnt: count() }).from(complianceIndexScores).where(and(notExcluded, eq(complianceIndexScores.badge, "gold")));
    const [silver] = await db.select({ cnt: count() }).from(complianceIndexScores).where(and(notExcluded, eq(complianceIndexScores.badge, "silver")));
    return {
      totalRanked: totalResult?.cnt || 0,
      avgScore: Math.round(avgResult?.avg || 0),
      diamondCount: diamond?.cnt || 0,
      platinumCount: platinum?.cnt || 0,
      goldCount: gold?.cnt || 0,
      silverCount: silver?.cnt || 0,
    };
  }

  async getComplianceIndexConfig(): Promise<ComplianceIndexConfig[]> {
    return db.select().from(complianceIndexConfig).orderBy(complianceIndexConfig.configKey);
  }

  async updateComplianceIndexConfig(key: string, value: any): Promise<ComplianceIndexConfig> {
    const [updated] = await db.update(complianceIndexConfig)
      .set({ configValue: value, updatedAt: new Date() })
      .where(eq(complianceIndexConfig.configKey, key))
      .returning();
    return updated;
  }

  async excludeAgencyFromIndex(agencyId: string, excludedBy: string, reason: string): Promise<void> {
    await db.update(complianceIndexScores)
      .set({ isExcluded: true, excludedBy, excludedReason: reason, updatedAt: new Date() })
      .where(eq(complianceIndexScores.agencyId, agencyId));
  }

  async includeAgencyInIndex(agencyId: string): Promise<void> {
    await db.update(complianceIndexScores)
      .set({ isExcluded: false, excludedBy: null, excludedReason: null, updatedAt: new Date() })
      .where(eq(complianceIndexScores.agencyId, agencyId));
  }

  async getCertificateByCertId(certificateId: string): Promise<AgencyCertificate | undefined> {
    const [cert] = await db.select().from(agencyCertificates)
      .where(eq(agencyCertificates.certificateId, certificateId)).limit(1);
    return cert;
  }

  async getCertificateByAgency(agencyId: string): Promise<AgencyCertificate | undefined> {
    const [cert] = await db.select().from(agencyCertificates)
      .where(and(eq(agencyCertificates.agencyId, agencyId), eq(agencyCertificates.status, "active")))
      .limit(1);
    return cert;
  }

  async listCertificates(filters?: { status?: string; limit?: number; offset?: number }): Promise<AgencyCertificate[]> {
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(agencyCertificates.status, filters.status));
    let query = db.select().from(agencyCertificates);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return (query as any).orderBy(desc(agencyCertificates.issuedAt))
      .limit(filters?.limit || 100)
      .offset(filters?.offset || 0);
  }

  async getCertificateCount(filters?: { status?: string }): Promise<number> {
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(agencyCertificates.status, filters.status));
    let query = db.select({ cnt: count() }).from(agencyCertificates);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    const [result] = await query;
    return result?.cnt || 0;
  }

  async createFraudReport(data: InsertFraudReport): Promise<FraudReport> {
    const [report] = await db.insert(fraudReports).values(data).returning();
    return report;
  }

  async getFraudReportById(id: string): Promise<FraudReport | undefined> {
    const [report] = await db.select().from(fraudReports).where(eq(fraudReports.id, id)).limit(1);
    return report;
  }

  async listFraudReports(filters?: { status?: string; incidentType?: string; limit?: number; offset?: number }): Promise<FraudReport[]> {
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(fraudReports.status, filters.status));
    if (filters?.incidentType) conditions.push(eq(fraudReports.incidentType, filters.incidentType));
    let query = db.select().from(fraudReports);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return (query as any).orderBy(desc(fraudReports.createdAt))
      .limit(filters?.limit || 100)
      .offset(filters?.offset || 0);
  }

  async getFraudReportCount(filters?: { status?: string; incidentType?: string }): Promise<number> {
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(fraudReports.status, filters.status));
    if (filters?.incidentType) conditions.push(eq(fraudReports.incidentType, filters.incidentType));
    let query = db.select({ cnt: count() }).from(fraudReports);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    const [result] = await query;
    return result?.cnt || 0;
  }

  async updateFraudReportStatus(id: string, status: string, updatedBy?: string, resolution?: string): Promise<FraudReport | undefined> {
    const updates: any = { status, updatedAt: new Date() };
    if (status === "confirmed" || status === "rejected") {
      updates.resolvedAt = new Date();
      updates.resolvedBy = updatedBy;
      if (resolution) updates.resolution = resolution;
    }
    const [report] = await db.update(fraudReports).set(updates).where(eq(fraudReports.id, id)).returning();
    return report;
  }

  async assignFraudReport(id: string, assignedTo: string): Promise<FraudReport | undefined> {
    const [report] = await db.update(fraudReports)
      .set({ assignedTo, status: "investigating", updatedAt: new Date() })
      .where(eq(fraudReports.id, id)).returning();
    return report;
  }

  async getUserFraudReports(userId: string): Promise<FraudReport[]> {
    return db.select().from(fraudReports)
      .where(eq(fraudReports.reporterId, userId))
      .orderBy(desc(fraudReports.createdAt));
  }

  async createFraudIndicator(data: InsertFraudIndicator): Promise<FraudIndicator> {
    const [indicator] = await db.insert(fraudIndicators).values(data).returning();
    return indicator;
  }

  async getFraudIndicatorById(id: string): Promise<FraudIndicator | undefined> {
    const [indicator] = await db.select().from(fraudIndicators).where(eq(fraudIndicators.id, id)).limit(1);
    return indicator;
  }

  async listFraudIndicators(filters?: { indicatorType?: string; riskLevel?: string; status?: string; limit?: number; offset?: number }): Promise<FraudIndicator[]> {
    const conditions: any[] = [];
    if (filters?.indicatorType) conditions.push(eq(fraudIndicators.indicatorType, filters.indicatorType));
    if (filters?.riskLevel) conditions.push(eq(fraudIndicators.riskLevel, filters.riskLevel));
    if (filters?.status) conditions.push(eq(fraudIndicators.status, filters.status || "active"));
    let query = db.select().from(fraudIndicators);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return (query as any).orderBy(desc(fraudIndicators.reportCount))
      .limit(filters?.limit || 100)
      .offset(filters?.offset || 0);
  }

  async getFraudIndicatorCount(filters?: { indicatorType?: string; riskLevel?: string; status?: string }): Promise<number> {
    const conditions: any[] = [];
    if (filters?.indicatorType) conditions.push(eq(fraudIndicators.indicatorType, filters.indicatorType));
    if (filters?.riskLevel) conditions.push(eq(fraudIndicators.riskLevel, filters.riskLevel));
    if (filters?.status) conditions.push(eq(fraudIndicators.status, filters.status || "active"));
    let query = db.select({ cnt: count() }).from(fraudIndicators);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    const [result] = await query;
    return result?.cnt || 0;
  }

  async updateFraudIndicator(id: string, data: Partial<FraudIndicator>): Promise<FraudIndicator | undefined> {
    const [indicator] = await db.update(fraudIndicators).set(data).where(eq(fraudIndicators.id, id)).returning();
    return indicator;
  }

  async deleteFraudIndicator(id: string): Promise<void> {
    await db.delete(fraudIndicators).where(eq(fraudIndicators.id, id));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GROWTH TOOLS SUITE
  // ═══════════════════════════════════════════════════════════════════════════

  async getVisaJobs(filters?: { country?: string; category?: string }): Promise<Job[]> {
    let query = db.select().from(jobs).where(eq(jobs.isActive, true)) as any;
    if (filters?.country) {
      query = db.select().from(jobs).where(
        and(eq(jobs.isActive, true), ilike(jobs.country, `%${filters.country}%`))
      );
    }
    if (filters?.category) {
      const countryFilter = filters?.country
        ? ilike(jobs.country, `%${filters.country}%`)
        : undefined;
      const conditions = countryFilter
        ? and(eq(jobs.isActive, true), countryFilter, ilike(jobs.jobCategory, `%${filters.category}%`))
        : and(eq(jobs.isActive, true), ilike(jobs.jobCategory, `%${filters.category}%`));
      query = db.select().from(jobs).where(conditions);
    }
    return await query.orderBy(desc(jobs.createdAt));
  }

  async createJob(data: InsertJob): Promise<Job> {
    const [job] = await db.insert(jobs).values(data).returning();
    return job;
  }

  async updateJob(id: string, data: Partial<InsertJob>): Promise<Job> {
    const [job] = await db.update(jobs).set(data).where(eq(jobs.id, id)).returning();
    return job;
  }

  async deleteJob(id: string): Promise<void> {
    await db.update(jobs).set({ isActive: false }).where(eq(jobs.id, id));
  }

  async recordToolUsage(data: { userId: string | null; toolName: string; metadata: any }): Promise<ToolUsage> {
    const [record] = await db.insert(toolUsage).values({
      userId: data.userId,
      toolName: data.toolName,
      metadata: data.metadata,
    }).returning();
    return record;
  }

  async getUserToolUsageCount(userId: string, toolName: string): Promise<number> {
    const [row] = await db
      .select({ count: count() })
      .from(toolUsage)
      .where(and(eq(toolUsage.userId, userId), eq(toolUsage.toolName, toolName)));
    return Number(row?.count ?? 0);
  }

  async userHasSuccessfulPayment(userId: string): Promise<boolean> {
    const [row] = await db
      .select({ count: count() })
      .from(payments)
      .where(and(eq(payments.userId, userId), eq(payments.status, "success")));
    return Number(row?.count ?? 0) > 0;
  }

  async recordTemplateDownload(data: { templateId: string; userId: string | null }): Promise<CvTemplateDownload> {
    const [record] = await db.insert(cvTemplateDownloads).values({
      templateId: data.templateId,
      userId: data.userId,
    }).returning();
    return record;
  }

  async getToolsAnalytics(): Promise<{
    totalUsage: number;
    byTool: { toolName: string; count: number }[];
    mostUsedTool: string;
    dailyTrend: { date: string; count: number }[];
    templateDownloads: number;
  }> {
    // By tool
    const byToolRows = await db
      .select({ toolName: toolUsage.toolName, count: count() })
      .from(toolUsage)
      .groupBy(toolUsage.toolName)
      .orderBy(desc(count()));

    const byTool = byToolRows.map((r) => ({ toolName: r.toolName, count: Number(r.count) }));
    const totalUsage = byTool.reduce((s, r) => s + r.count, 0);
    const mostUsedTool = byTool[0]?.toolName ?? "N/A";

    // Daily trend (last 14 days)
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const trendRows = await db
      .select({
        date: sql<string>`DATE(created_at)::text`,
        count: count(),
      })
      .from(toolUsage)
      .where(gte(toolUsage.createdAt, since))
      .groupBy(sql`DATE(created_at)`)
      .orderBy(sql`DATE(created_at)`);
    const dailyTrend = trendRows.map((r) => ({ date: r.date, count: Number(r.count) }));

    // Template downloads
    const [{ count: dlCount }] = await db.select({ count: count() }).from(cvTemplateDownloads);
    const templateDownloads = Number(dlCount);

    return { totalUsage, byTool, mostUsedTool, dailyTrend, templateDownloads };
  }

  async createToolReport(data: InsertToolReport): Promise<ToolReport> {
    const [report] = await db.insert(toolReports).values(data).returning();
    return report;
  }

  async getToolReport(reportId: string): Promise<ToolReport | undefined> {
    const [report] = await db.select().from(toolReports).where(eq(toolReports.id, reportId));
    return report;
  }

  async incrementReportViews(reportId: string): Promise<void> {
    await db.update(toolReports)
      .set({ views: sql`${toolReports.views} + 1` })
      .where(eq(toolReports.id, reportId));
  }

  async incrementReportShares(reportId: string): Promise<void> {
    await db.update(toolReports)
      .set({ shares: sql`${toolReports.shares} + 1` })
      .where(eq(toolReports.id, reportId));
  }

  // ── AI Usage Tracking ────────────────────────────────────────────────────
  async getAiUsageToday(userId: string, toolName: string, date: string): Promise<{ questionsUsed: number } | undefined> {
    const [row] = await db
      .select({ questionsUsed: aiUsage.questionsUsed })
      .from(aiUsage)
      .where(
        sql`${aiUsage.userId} = ${userId} AND ${aiUsage.toolName} = ${toolName} AND ${aiUsage.date} = ${date}`
      );
    return row;
  }

  async incrementAiUsage(userId: string, toolName: string, date: string): Promise<number> {
    const existing = await this.getAiUsageToday(userId, toolName, date);
    if (existing) {
      const newCount = existing.questionsUsed + 1;
      await db
        .update(aiUsage)
        .set({ questionsUsed: newCount, updatedAt: new Date() })
        .where(
          sql`${aiUsage.userId} = ${userId} AND ${aiUsage.toolName} = ${toolName} AND ${aiUsage.date} = ${date}`
        );
      return newCount;
    } else {
      await db.insert(aiUsage).values({ userId, toolName, date, questionsUsed: 1 });
      return 1;
    }
  }

  async addAiUsage(userId: string, toolName: string, date: string, count: number): Promise<number> {
    const existing = await this.getAiUsageToday(userId, toolName, date);
    if (existing) {
      const newCount = existing.questionsUsed + count;
      await db
        .update(aiUsage)
        .set({ questionsUsed: newCount, updatedAt: new Date() })
        .where(
          sql`${aiUsage.userId} = ${userId} AND ${aiUsage.toolName} = ${toolName} AND ${aiUsage.date} = ${date}`
        );
      return newCount;
    } else {
      await db.insert(aiUsage).values({ userId, toolName, date, questionsUsed: count });
      return count;
    }
  }

  async bulkCreateTrackedApplications(apps: InsertTrackedApplication[]): Promise<TrackedApplication[]> {
    if (apps.length === 0) return [];
    const inserted = await db.insert(trackedApplications).values(apps).returning();
    return inserted;
  }

  // ── Scam Reports ──────────────────────────────────────────────────────────
  async getScamReports(filters?: { status?: string; search?: string; country?: string; limit?: number; offset?: number }): Promise<ScamReport[]> {
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(scamReports.status, filters.status));
    if (filters?.country) conditions.push(ilike(scamReports.country as any, `%${filters.country}%`));
    if (filters?.search) conditions.push(ilike(scamReports.agencyName, `%${filters.search}%`));
    const query = db.select().from(scamReports)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(scamReports.createdAt))
      .limit(filters?.limit ?? 20)
      .offset(filters?.offset ?? 0);
    return query;
  }

  async getScamReportById(id: string): Promise<ScamReport | undefined> {
    const [r] = await db.select().from(scamReports).where(eq(scamReports.id, id));
    return r;
  }

  async createScamReport(data: InsertScamReport): Promise<ScamReport> {
    const [r] = await db.insert(scamReports).values(data).returning();
    return r;
  }

  async updateScamReport(id: string, data: Partial<ScamReport>): Promise<ScamReport | undefined> {
    const [r] = await db.update(scamReports).set({ ...data, updatedAt: new Date() }).where(eq(scamReports.id, id)).returning();
    return r;
  }

  async deleteScamReport(id: string): Promise<void> {
    await db.delete(scamReports).where(eq(scamReports.id, id));
  }

  async countScamReports(status?: string): Promise<number> {
    const [{ value }] = await db.select({ value: count() }).from(scamReports)
      .where(status ? eq(scamReports.status, status) : undefined);
    return Number(value);
  }

  async getRecentScamReportsByUser(userId: string, since: Date): Promise<number> {
    const [{ value }] = await db.select({ value: count() }).from(scamReports)
      .where(and(eq(scamReports.reportedBy, userId), gte(scamReports.createdAt, since)));
    return Number(value);
  }

  async getScamWallFeed(page: number, limit: number): Promise<{ reports: ScamReport[]; total: number }> {
    const offset = (page - 1) * limit;
    const reports = await db.select().from(scamReports)
      .where(eq(scamReports.status, "approved"))
      .orderBy(sql`${scamReports.isFeatured} DESC, ${scamReports.likesCount} DESC, ${scamReports.createdAt} DESC`)
      .limit(limit).offset(offset);
    const [{ value }] = await db.select({ value: count() }).from(scamReports).where(eq(scamReports.status, "approved"));
    return { reports, total: Number(value) };
  }

  async likeScamReport(reportId: string, fingerprint: string): Promise<{ liked: boolean; likesCount: number }> {
    const { scamWallLikes } = await import('@shared/schema');
    const existing = await db.select().from(scamWallLikes)
      .where(and(eq(scamWallLikes.reportId, reportId), eq(scamWallLikes.fingerprint, fingerprint)))
      .limit(1);
    if (existing.length > 0) {
      await db.delete(scamWallLikes).where(eq(scamWallLikes.id, existing[0].id));
      const [updated] = await db.update(scamReports)
        .set({ likesCount: sql`GREATEST(0, ${scamReports.likesCount} - 1)` })
        .where(eq(scamReports.id, reportId)).returning({ likesCount: scamReports.likesCount });
      return { liked: false, likesCount: updated?.likesCount ?? 0 };
    } else {
      await db.insert(scamWallLikes).values({ reportId, fingerprint });
      const [updated] = await db.update(scamReports)
        .set({ likesCount: sql`${scamReports.likesCount} + 1` })
        .where(eq(scamReports.id, reportId)).returning({ likesCount: scamReports.likesCount });
      return { liked: true, likesCount: updated?.likesCount ?? 1 };
    }
  }

  async hasLikedScamReport(reportId: string, fingerprint: string): Promise<boolean> {
    const { scamWallLikes } = await import('@shared/schema');
    const existing = await db.select().from(scamWallLikes)
      .where(and(eq(scamWallLikes.reportId, reportId), eq(scamWallLikes.fingerprint, fingerprint)))
      .limit(1);
    return existing.length > 0;
  }

  async getScamWallComments(reportId: string): Promise<import('@shared/schema').ScamWallComment[]> {
    const { scamWallComments } = await import('@shared/schema');
    return db.select().from(scamWallComments)
      .where(and(eq(scamWallComments.reportId, reportId), eq(scamWallComments.isApproved, true)))
      .orderBy(sql`${scamWallComments.createdAt} DESC`).limit(50);
  }

  async addScamWallComment(reportId: string, content: string, authorName: string): Promise<import('@shared/schema').ScamWallComment> {
    const { scamWallComments } = await import('@shared/schema');
    const [comment] = await db.insert(scamWallComments).values({ reportId, content, authorName }).returning();
    return comment;
  }

  async incrementScamReportViews(reportId: string): Promise<void> {
    await db.update(scamReports)
      .set({ viewsCount: sql`${scamReports.viewsCount} + 1` })
      .where(eq(scamReports.id, reportId));
  }
}

export const storage = new DatabaseStorage();
