"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseGovernmentAdapter = void 0;
class BaseGovernmentAdapter {
    constructor() {
        this.authToken = null;
        this.tokenExpiresAt = 0;
    }
    async initialize(config) {
        this.config = config;
        if (config.authType === "oauth2") {
            await this.refreshOAuthToken();
        }
    }
    async healthCheck() {
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
        }
        catch (error) {
            return { healthy: false, message: error.message || "Health check failed" };
        }
    }
    getAuthHeaders() {
        const headers = {
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
    async refreshOAuthToken() {
        if (!this.config?.credentialRef || !this.config?.metadata)
            return;
        const clientId = process.env[`${this.config.credentialRef}_CLIENT_ID`];
        const clientSecret = process.env[`${this.config.credentialRef}_CLIENT_SECRET`];
        const tokenUrl = this.config.metadata?.tokenUrl;
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
                const data = await response.json();
                this.authToken = data.access_token;
                this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
            }
        }
        catch (error) {
            console.error(`[GovAdapter:${this.code}] OAuth token refresh failed:`, error);
        }
    }
    async ensureToken() {
        if (this.config?.authType === "oauth2" && Date.now() >= this.tokenExpiresAt) {
            await this.refreshOAuthToken();
        }
    }
    async makeRequest(method, path, body) {
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
            return await response.json();
        }
        catch (error) {
            clearTimeout(timeout);
            if (error.name === "AbortError") {
                throw new Error(`Government API timeout after ${this.config?.timeoutMs}ms`);
            }
            throw error;
        }
    }
    normalizeStatus(rawStatus) {
        const normalized = rawStatus.toUpperCase().trim();
        const statusMap = {
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
exports.BaseGovernmentAdapter = BaseGovernmentAdapter;
