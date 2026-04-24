export type GovernmentLicenseStatus = "VALID" | "EXPIRED" | "SUSPENDED" | "UNDER_REVIEW" | "UNKNOWN";

export interface LicenseVerificationResult {
  licenseNumber: string;
  status: GovernmentLicenseStatus;
  agencyName?: string;
  issueDate?: string;
  expiryDate?: string;
  rawResponse?: any;
  verifiedAt: string;
}

export interface LicenseStatusResult {
  licenseNumber: string;
  status: GovernmentLicenseStatus;
  details?: Record<string, any>;
  rawResponse?: any;
  checkedAt: string;
}

export interface RenewalSubmissionResult {
  licenseNumber: string;
  referenceNumber: string;
  status: "submitted" | "accepted" | "rejected" | "pending";
  message?: string;
  rawResponse?: any;
  submittedAt: string;
}

export interface RenewalReceiptResult {
  licenseNumber: string;
  receiptNumber: string;
  amount?: number;
  currency?: string;
  paidAt?: string;
  validUntil?: string;
  rawResponse?: any;
  fetchedAt: string;
}

export interface GovernmentAdapterConfig {
  integrationId: string;
  code: string;
  baseUrl: string;
  authType: "api_key" | "oauth2" | "mtls";
  credentialRef?: string;
  timeoutMs: number;
  retryAttempts: number;
  rateLimit: number;
  metadata?: Record<string, any>;
}

export interface IGovernmentAdapter {
  readonly code: string;
  readonly name: string;
  
  initialize(config: GovernmentAdapterConfig): Promise<void>;

  verifyLicense(licenseNumber: string): Promise<LicenseVerificationResult>;

  fetchLicenseStatus(licenseNumber: string): Promise<LicenseStatusResult>;

  submitRenewal(paymentReference: string, licenseDetails: {
    licenseNumber: string;
    agencyId: string;
    amount: number;
    currency: string;
    durationMonths: number;
  }): Promise<RenewalSubmissionResult>;

  fetchRenewalReceipt(licenseNumber: string): Promise<RenewalReceiptResult>;

  healthCheck(): Promise<{ healthy: boolean; message: string }>;

  getSupportedActions(): string[];
}

export interface GovernmentSyncJob {
  integrationCode: string;
  action: "verify" | "status" | "renewal" | "receipt";
  licenseNumber: string;
  agencyId?: string;
  paymentReference?: string;
  licenseDetails?: Record<string, any>;
  triggeredBy?: string;
  requestId: string;
}
