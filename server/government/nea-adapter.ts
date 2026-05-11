// @ts-nocheck
import { BaseGovernmentAdapter } from "./base-adapter";
import {
  LicenseVerificationResult,
  LicenseStatusResult,
  RenewalSubmissionResult,
  RenewalReceiptResult,
} from "./types";
import { db } from "../db";
import { neaAgencies } from "@shared/schema";
import { eq } from "drizzle-orm";

export class NeaKenyaAdapter extends BaseGovernmentAdapter {
  readonly code = "nea_kenya";
  readonly name = "National Employment Authority (Kenya)";

  getSupportedActions(): string[] {
    return ["verify", "status", "renewal", "receipt"];
  }

  async verifyLicense(licenseNumber: string): Promise<LicenseVerificationResult> {
    const now = new Date().toISOString();

    if (this.config?.baseUrl) {
      try {
        const data = await this.makeRequest<any>("GET", `/licenses/${encodeURIComponent(licenseNumber)}/verify`);
        return {
          licenseNumber,
          status: this.normalizeStatus(data.status || "UNKNOWN"),
          agencyName: data.agency_name,
          issueDate: data.issue_date,
          expiryDate: data.expiry_date,
          rawResponse: data,
          verifiedAt: now,
        };
      } catch (error: any) {
        console.warn(`[NEA] API verification failed, falling back to local DB: ${error.message}`);
      }
    }

    const [agency] = await db
      .select()
      .from(neaAgencies)
      .where(eq(neaAgencies.licenseNumber, licenseNumber))
      .limit(1);

    if (!agency) {
      return {
        licenseNumber,
        status: "UNKNOWN",
        verifiedAt: now,
      };
    }

    const isExpired = new Date(agency.expiryDate) < new Date();
    const status = agency.statusOverride
      ? this.normalizeStatus(agency.statusOverride)
      : isExpired ? "EXPIRED" : "VALID";

    return {
      licenseNumber,
      status,
      agencyName: agency.agencyName,
      issueDate: agency.issueDate?.toISOString(),
      expiryDate: agency.expiryDate?.toISOString(),
      rawResponse: { source: "local_db", agencyId: agency.id },
      verifiedAt: now,
    };
  }

  async fetchLicenseStatus(licenseNumber: string): Promise<LicenseStatusResult> {
    const now = new Date().toISOString();

    if (this.config?.baseUrl) {
      try {
        const data = await this.makeRequest<any>("GET", `/licenses/${encodeURIComponent(licenseNumber)}/status`);
        return {
          licenseNumber,
          status: this.normalizeStatus(data.status || "UNKNOWN"),
          details: data.details || {},
          rawResponse: data,
          checkedAt: now,
        };
      } catch (error: any) {
        console.warn(`[NEA] API status check failed, falling back to local DB: ${error.message}`);
      }
    }

    const [agency] = await db
      .select()
      .from(neaAgencies)
      .where(eq(neaAgencies.licenseNumber, licenseNumber))
      .limit(1);

    if (!agency) {
      return { licenseNumber, status: "UNKNOWN", checkedAt: now };
    }

    const expiryDate = new Date(agency.expiryDate);
    const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const isExpired = daysLeft < 0;

    return {
      licenseNumber,
      status: agency.statusOverride
        ? this.normalizeStatus(agency.statusOverride)
        : isExpired ? "EXPIRED" : "VALID",
      details: {
        agencyName: agency.agencyName,
        daysRemaining: daysLeft,
        expiryDate: agency.expiryDate?.toISOString(),
        source: "local_db",
      },
      checkedAt: now,
    };
  }

  async submitRenewal(paymentReference: string, licenseDetails: {
    licenseNumber: string;
    agencyId: string;
    amount: number;
    currency: string;
    durationMonths: number;
  }): Promise<RenewalSubmissionResult> {
    const now = new Date().toISOString();

    if (this.config?.baseUrl) {
      try {
        const data = await this.makeRequest<any>("POST", "/licenses/renewal", {
          payment_reference: paymentReference,
          license_number: licenseDetails.licenseNumber,
          amount: licenseDetails.amount,
          currency: licenseDetails.currency,
          duration_months: licenseDetails.durationMonths,
        });

        return {
          licenseNumber: licenseDetails.licenseNumber,
          referenceNumber: data.reference_number || paymentReference,
          status: data.status === "accepted" ? "accepted" : "submitted",
          message: data.message,
          rawResponse: data,
          submittedAt: now,
        };
      } catch (error: any) {
        console.warn(`[NEA] API renewal submission failed: ${error.message}`);
      }
    }

    return {
      licenseNumber: licenseDetails.licenseNumber,
      referenceNumber: paymentReference,
      status: "pending",
      message: "Renewal recorded locally. Government API sync pending.",
      rawResponse: { source: "local_pending", paymentReference },
      submittedAt: now,
    };
  }

  async fetchRenewalReceipt(licenseNumber: string): Promise<RenewalReceiptResult> {
    const now = new Date().toISOString();

    if (this.config?.baseUrl) {
      try {
        const data = await this.makeRequest<any>("GET", `/licenses/${encodeURIComponent(licenseNumber)}/receipt`);
        return {
          licenseNumber,
          receiptNumber: data.receipt_number || "",
          amount: data.amount,
          currency: data.currency,
          paidAt: data.paid_at,
          validUntil: data.valid_until,
          rawResponse: data,
          fetchedAt: now,
        };
      } catch (error: any) {
        console.warn(`[NEA] API receipt fetch failed: ${error.message}`);
      }
    }

    return {
      licenseNumber,
      receiptNumber: "",
      fetchedAt: now,
      rawResponse: { source: "local_unavailable", message: "Government receipt API not configured" },
    };
  }
}
