import {
  IGovernmentAdapter,
  GovernmentAdapterConfig,
  LicenseVerificationResult,
  LicenseStatusResult,
  RenewalSubmissionResult,
  RenewalReceiptResult,
  GovernmentLicenseStatus,
} from "./types";

export abstract class BaseGovernmentAdapter implements IGovernmentAdapter {
  abstract readonly code: string;
  abstract readonly name: string;

  protected config!: GovernmentAdapterConfig;
  protected authToken: string | null = null;
  protected tokenExpiresAt: number = 0;

  async initialize(config: GovernmentAdapterConfig): Promise<void> {
    this.config = config;
    if (config.authType === "oauth2") {
      await this.refreshOAuthToken();
    }
  }

  abstract verifyLicense(licenseNumber: string): Promise<LicenseVerificationResult>;
  abstract fetchLicenseStatus(licenseNumber: string): Promise<LicenseStatusResult>;
  abstract submitRenewal(paymentReference: string, licenseDetails: any): Promise<RenewalSubmissionResult>;
  abstract fetchRenewalReceipt(licenseNumber: string): Promise<RenewalReceiptResult>;
  abstract getSupportedActions(): string[];

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      if (!this.config?.baseUrl) {
        return { healthy: false, message: "No base URL configured" };
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.config.baseUrl}/health`, {
        signal: controller.signal,
        headers: this.getAuthHeaders(),
      });
      clearTimeout(timeout);
      return { healthy: response.ok, message: `HTTP ${response.status}` };
    } catch (error: any) {
      return { healthy: false, message: error.message || "Health check failed" };
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    switch (this.config?.authType) {
      case "api_key":
        if (this.config.credentialRef) {
          const apiKey = process.env[this.config.credentialRef];
          if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
            headers["X-API-Key"] = apiKey;
          }
        }
        break;
      case "oauth2":
        if (this.authToken) {
          headers["Authorization"] = `Bearer ${this.authToken}`;
        }
        break;
    }

    return headers;
  }

  protected async refreshOAuthToken(): Promise<void> {
    if (!this.config?.credentialRef || !this.config?.metadata) return;

    const clientId = process.env[`${this.config.credentialRef}_CLIENT_ID`];
    const clientSecret = process.env[`${this.config.credentialRef}_CLIENT_SECRET`];
    const tokenUrl = (this.config.metadata as any)?.tokenUrl;

    if (!clientId || !clientSecret || !tokenUrl) {
      console.warn(`[GovAdapter:${this.code}] OAuth2 credentials not configured`);
      return;
    }

    try {
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (response.ok) {
        const data = await response.json() as { access_token: string; expires_in: number };
        this.authToken = data.access_token;
        this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
      }
    } catch (error) {
      console.error(`[GovAdapter:${this.code}] OAuth token refresh failed:`, error);
    }
  }

  protected async ensureToken(): Promise<void> {
    if (this.config?.authType === "oauth2" && Date.now() >= this.tokenExpiresAt) {
      await this.refreshOAuthToken();
    }
  }

  protected async makeRequest<T>(method: string, path: string, body?: any): Promise<T> {
    await this.ensureToken();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config?.timeoutMs || 30000);

    try {
      const url = `${this.config.baseUrl}${path}`;
      const response = await fetch(url, {
        method,
        headers: this.getAuthHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Government API error: HTTP ${response.status} - ${await response.text()}`);
      }

      return await response.json() as T;
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === "AbortError") {
        throw new Error(`Government API timeout after ${this.config?.timeoutMs}ms`);
      }
      throw error;
    }
  }

  protected normalizeStatus(rawStatus: string): GovernmentLicenseStatus {
    const normalized = rawStatus.toUpperCase().trim();
    const statusMap: Record<string, GovernmentLicenseStatus> = {
      "VALID": "VALID",
      "ACTIVE": "VALID",
      "APPROVED": "VALID",
      "CURRENT": "VALID",
      "EXPIRED": "EXPIRED",
      "LAPSED": "EXPIRED",
      "INACTIVE": "EXPIRED",
      "SUSPENDED": "SUSPENDED",
      "REVOKED": "SUSPENDED",
      "CANCELLED": "SUSPENDED",
      "UNDER_REVIEW": "UNDER_REVIEW",
      "PENDING": "UNDER_REVIEW",
      "PROCESSING": "UNDER_REVIEW",
    };
    return statusMap[normalized] || "UNKNOWN";
  }
}
