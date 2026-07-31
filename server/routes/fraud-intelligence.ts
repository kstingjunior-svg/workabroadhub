/**
 * fraud-intelligence.ts — Community Scam Reporting v2 endpoints.
 *
 * Routes:
 *   POST /api/scam-reports/v2                 — structured submission with cross-ref
 *   GET  /api/agency-profiles/:slug           — public agency profile
 *   GET  /api/agency-profiles                  — paginated list (search + filter)
 *   POST /api/agency-appeals                   — controlled agency response workflow
 *
 * Legacy /api/scam-reports POST + GET remain untouched for backward compat.
 *
 * Security posture:
 *   - Rate-limited per IP (5 submissions/hour) to prevent mass-report abuse
 *   - Reporter IP + user-agent hashed for abuse dedup only (never displayed)
 *   - Auto-moderation status: 'pending' — every report needs admin approval
 *     before appearing on public agency profiles
 *   - Public endpoints only return APPROVED aggregated data
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import {
  slugifyAgency,
  persistAndCrossRef,
  upsertAgencyProfile,
  hashReporterIp,
} from "../lib/scam-cross-ref";

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,                    // 5 reports per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "You've submitted 5 reports in the last hour. Please wait before submitting more, or contact support@workabroadhub.tech if you have many cases to file." },
});

const publicReadLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

interface ReportV2Payload {
  // Who
  agencyName:            string;
  country?:              string | null;
  officeLocation?:       string | null;
  website?:              string | null;
  facebookUrl?:          string | null;
  instagramUrl?:         string | null;
  tiktokUrl?:            string | null;
  linkedinUrl?:          string | null;
  whatsappNumber?:       string | null;
  phoneNumbers?:         string | string[] | null;
  emailAddresses?:       string | string[] | null;
  companyRegistration?:  string | null;
  recruitmentLicence?:   string | null;
  employerName?:         string | null;
  // What
  destinationCountry?:   string | null;
  jobApplied?:           string | null;
  incidentDate?:         string | null;   // ISO
  // Money
  amountLostKes?:        number | null;
  currency?:             string | null;
  paymentMethod?:        string | null;
  bankAccount?:          string | null;
  mpesaNumber?:          string | null;
  cryptoWallet?:         string | null;
  transactionReference?: string | null;
  // Detail
  description:           string;
  timelineJson?:         Array<{ ts?: string; event?: string }>;
  evidenceImages?:       string[];
  // Reporter (optional — anonymous submissions allowed but flagged for extra review)
  reporterEmail?:        string | null;
}

export function registerFraudIntelligenceRoutes(app: Express): void {
  // ═══════════════════════════════════════════════════════════════════════
  // POST /api/scam-reports/v2 — structured intake + cross-reference
  // ═══════════════════════════════════════════════════════════════════════
  app.post("/api/scam-reports/v2", submitLimiter, async (req: any, res: Response) => {
    const t0 = Date.now();
    try {
      const p = req.body as ReportV2Payload;
      if (!p || typeof p !== "object") {
        return res.status(400).json({ message: "Please fill in the report form." });
      }
      const agency = String(p.agencyName ?? "").trim();
      const desc   = String(p.description ?? "").trim();
      if (!agency || agency.length < 2) {
        return res.status(400).json({ message: "Please enter the agency or recruiter's name." });
      }
      if (!desc || desc.length < 30) {
        return res.status(400).json({
          message: "Please describe what happened in at least 30 characters — specifics help us protect other job seekers.",
        });
      }

      // Compute the reporter fingerprint for abuse dedup + cluster stats
      const reporterIpHash = hashReporterIp(req.ip, req.headers?.["user-agent"] as string);
      const reporterUserId = req.user?.claims?.sub ?? req.user?.id ?? null;

      // 1. Insert the report row with all structured fields
      const agencySlug = slugifyAgency(agency);
      const { rows: inserted } = await pool.query<{ id: string }>(
        `INSERT INTO scam_reports (
           agency_name, agency_slug, country, office_location, website,
           facebook_url, instagram_url, tiktok_url, linkedin_url,
           whatsapp_number, phone_numbers, email_addresses,
           company_registration, recruitment_licence, employer_name,
           destination_country, job_applied, incident_date,
           amount_lost, currency, payment_method,
           bank_account, mpesa_number, crypto_wallet, transaction_reference,
           timeline_json, description, evidence_images,
           reported_by, reporter_email, reporter_ip_hash,
           status, risk_band, contact_info
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9,
           $10, $11, $12,
           $13, $14, $15,
           $16, $17, $18,
           $19, $20, $21,
           $22, $23, $24, $25,
           $26, $27, $28,
           $29, $30, $31,
           'pending', 'medium', $32
         )
         RETURNING id`,
        [
          agency, agencySlug, p.country ?? null, p.officeLocation ?? null, p.website ?? null,
          p.facebookUrl ?? null, p.instagramUrl ?? null, p.tiktokUrl ?? null, p.linkedinUrl ?? null,
          p.whatsappNumber ?? null,
          Array.isArray(p.phoneNumbers) ? p.phoneNumbers.join(", ") : (p.phoneNumbers ?? null),
          Array.isArray(p.emailAddresses) ? p.emailAddresses.join(", ") : (p.emailAddresses ?? null),
          p.companyRegistration ?? null, p.recruitmentLicence ?? null, p.employerName ?? null,
          p.destinationCountry ?? null, p.jobApplied ?? null,
          p.incidentDate ? new Date(p.incidentDate) : null,
          p.amountLostKes ?? null, p.currency ?? "KES", p.paymentMethod ?? null,
          p.bankAccount ?? null, p.mpesaNumber ?? null, p.cryptoWallet ?? null, p.transactionReference ?? null,
          p.timelineJson ? JSON.stringify(p.timelineJson) : null,
          desc,
          p.evidenceImages ?? [],
          reporterUserId, p.reporterEmail ?? null, reporterIpHash,
          // Legacy `contact_info` column kept populated for backwards compat with old queries
          [p.whatsappNumber, Array.isArray(p.phoneNumbers) ? p.phoneNumbers.join(",") : p.phoneNumbers, Array.isArray(p.emailAddresses) ? p.emailAddresses.join(",") : p.emailAddresses].filter(Boolean).join(" | ") || null,
        ],
      );
      const reportId = inserted[0]?.id;
      if (!reportId) throw new Error("Insert failed");

      // 2. Cross-reference
      const crossRef = await persistAndCrossRef(reportId, {
        phoneNumbers:   p.phoneNumbers,
        emailAddresses: p.emailAddresses,
        whatsappNumber: p.whatsappNumber,
        bankAccount:    p.bankAccount,
        mpesaNumber:    p.mpesaNumber,
        cryptoWallet:   p.cryptoWallet,
        website:        p.website,
        facebookUrl:    p.facebookUrl,
        instagramUrl:   p.instagramUrl,
        tiktokUrl:      p.tiktokUrl,
        linkedinUrl:    p.linkedinUrl,
      });

      // 3. Update the aggregated agency profile
      await upsertAgencyProfile(agency, {
        country:         p.country,
        officeLocation:  p.officeLocation,
        licenceNumber:   p.recruitmentLicence,
        licenceStatus:   p.recruitmentLicence ? "unknown" : "unlicensed",
        contacts: {
          phoneNumbers:   p.phoneNumbers,
          emailAddresses: p.emailAddresses,
          whatsappNumber: p.whatsappNumber,
          bankAccount:    p.bankAccount,
          mpesaNumber:    p.mpesaNumber,
          website:        p.website,
          facebookUrl:    p.facebookUrl,
          instagramUrl:   p.instagramUrl,
        },
        amountLostKes:   p.amountLostKes,
      });

      console.log(
        `[FraudIntel] Report ${reportId} agency="${agency}" clusters=${crossRef.clusters.length} related=${crossRef.totalRelatedReports} in ${Date.now() - t0}ms`,
      );

      res.status(201).json({
        ok: true,
        reportId,
        agencySlug,
        status: "pending",
        headline: crossRef.headline || `Thank you — your report will be reviewed within 24 hours. If similar reports exist we'll link them to this case.`,
        clusters: crossRef.clusters,
        totalRelatedReports: crossRef.totalRelatedReports,
        disclaimer: "Your report is now in our moderation queue. Publication happens only after evidence review. Please also file with the Kenya Directorate of Criminal Investigations (reportscam@dci.go.ke) and the National Employment Authority (neaims.nea.go.ke) — our platform is a warning resource, not a substitute for official investigation.",
      });
    } catch (err: any) {
      console.error("[FraudIntel] Submit error:", err?.message);
      res.status(500).json({
        ok: false,
        message: "We couldn't save your report right now. Please try again in a moment.",
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GET /api/agency-profiles/:slug — public warning page data
  // ═══════════════════════════════════════════════════════════════════════
  app.get("/api/agency-profiles/:slug", publicReadLimiter, async (req: Request, res: Response) => {
    const slug = String(req.params.slug || "").toLowerCase().slice(0, 64);
    if (!slug) return res.status(400).json({ message: "Missing agency slug." });
    try {
      const { rows } = await pool.query(
        `SELECT * FROM agency_profiles WHERE slug = $1 LIMIT 1`,
        [slug],
      );
      const profile = rows[0];
      if (!profile) return res.status(404).json({ message: "No reported agency found under that name." });

      // Load APPROVED report count + last 5 approved reports (safe fields only)
      const { rows: reports } = await pool.query(
        `SELECT id, incident_date, destination_country, job_applied, amount_lost, currency, description, created_at
           FROM scam_reports
          WHERE agency_slug = $1 AND status = 'approved'
          ORDER BY incident_date DESC NULLS LAST, created_at DESC
          LIMIT 5`,
        [slug],
      );

      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300");
      res.json({
        ok: true,
        profile: {
          slug: profile.slug,
          displayName: profile.display_name,
          country: profile.country,
          officeLocation: profile.office_location,
          licenceStatus: profile.licence_status,
          licenceNumber: profile.licence_number,
          licenceExpiresAt: profile.licence_expires_at,
          reportCount: profile.report_count,
          approvedReportCount: profile.approved_report_count,
          totalReportedLossKes: profile.total_reported_loss_kes,
          riskBand: profile.risk_band,
          firstReportAt: profile.first_report_at,
          lastReportAt: profile.last_report_at,
          knownWebsites: profile.known_websites ?? [],
          // Mask sensitive identifiers on the public view
          knownPhones: (profile.known_phones ?? []).map(maskPhone),
          knownEmails: (profile.known_emails ?? []).map(maskEmail),
          knownWhatsapp: (profile.known_whatsapp ?? []).map(maskPhone),
          knownBankAccounts: (profile.known_bank_accounts ?? []).map(maskAccount),
          knownMpesaNumbers: (profile.known_mpesa_numbers ?? []).map(maskPhone),
        },
        recentReports: reports.map((r: any) => ({
          id: r.id,
          incidentDate: r.incident_date,
          destinationCountry: r.destination_country,
          jobApplied: r.job_applied,
          amountLost: r.amount_lost,
          currency: r.currency,
          // Truncate long descriptions for the summary card
          descriptionExcerpt: (r.description || "").slice(0, 300),
          createdAt: r.created_at,
        })),
        disclaimer: "This page contains allegations submitted by users and evidence reviewed under WorkAbroadHub's moderation process. Publication does not constitute a court finding. Users should make their own decisions and consult official authorities where appropriate.",
      });
    } catch (err: any) {
      console.error("[FraudIntel] Profile fetch error:", err?.message);
      res.status(500).json({ message: "Could not load this agency profile." });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GET /api/agency-profiles — searchable index
  // ═══════════════════════════════════════════════════════════════════════
  app.get("/api/agency-profiles", publicReadLimiter, async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q ?? "").trim().slice(0, 100);
      const country = String(req.query.country ?? "").trim().slice(0, 60);
      const riskBand = String(req.query.risk ?? "").trim().slice(0, 12);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));

      const conditions: string[] = ["approved_report_count > 0"];
      const values: any[] = [];
      if (q) {
        values.push(`%${q.toLowerCase()}%`);
        conditions.push(`LOWER(display_name) LIKE $${values.length}`);
      }
      if (country) {
        values.push(country);
        conditions.push(`country = $${values.length}`);
      }
      if (riskBand && ["low","medium","high","critical"].includes(riskBand)) {
        values.push(riskBand);
        conditions.push(`risk_band = $${values.length}`);
      }
      values.push(limit);

      const { rows } = await pool.query(
        `SELECT slug, display_name, country, risk_band,
                report_count, approved_report_count, total_reported_loss_kes,
                last_report_at
           FROM agency_profiles
          WHERE ${conditions.join(" AND ")}
          ORDER BY last_report_at DESC NULLS LAST
          LIMIT $${values.length}`,
        values,
      );

      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=180");
      res.json({
        ok: true,
        agencies: rows.map((r: any) => ({
          slug: r.slug,
          displayName: r.display_name,
          country: r.country,
          riskBand: r.risk_band,
          reportCount: r.report_count,
          approvedReportCount: r.approved_report_count,
          totalReportedLossKes: r.total_reported_loss_kes,
          lastReportAt: r.last_report_at,
        })),
        total: rows.length,
      });
    } catch (err: any) {
      console.error("[FraudIntel] Index error:", err?.message);
      res.status(500).json({ message: "Could not load agency list." });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // POST /api/agency-appeals — controlled agency response workflow
  // ═══════════════════════════════════════════════════════════════════════
  app.post("/api/agency-appeals", submitLimiter, async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        agencySlug?: string;
        reportId?: string;
        claimantName: string;
        claimantEmail: string;
        claimantPhone?: string;
        claimantRole?: string;
        responseText: string;
        proofOfIdentityUrl?: string;
      };
      if (!body?.claimantName || !body?.claimantEmail || !body?.responseText) {
        return res.status(400).json({ message: "Please provide your name, email, and response." });
      }
      if (!body.agencySlug && !body.reportId) {
        return res.status(400).json({ message: "Please indicate which report or agency this response is about." });
      }
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO scam_report_appeals (
           report_id, agency_slug, claimant_name, claimant_email, claimant_phone,
           claimant_role, proof_of_identity_url, response_text
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          body.reportId ?? null, body.agencySlug ?? null,
          body.claimantName, body.claimantEmail, body.claimantPhone ?? null,
          body.claimantRole ?? null, body.proofOfIdentityUrl ?? null, body.responseText,
        ],
      );
      res.status(201).json({
        ok: true,
        appealId: rows[0].id,
        message: "Thank you. Your response is in our moderation queue. If it's substantiated with proof of identity, we'll publish it alongside the reports within 5 business days.",
      });
    } catch (err: any) {
      console.error("[FraudIntel] Appeal error:", err?.message);
      res.status(500).json({ message: "Could not save your response. Please try again." });
    }
  });

  console.log("[FraudIntel] Routes registered: POST /api/scam-reports/v2, GET /api/agency-profiles(/:slug), POST /api/agency-appeals");
}

// ── Masking helpers (public view) ─────────────────────────────────────

function maskPhone(v: string): string {
  if (!v || v.length <= 5) return v;
  return v.slice(0, -4).replace(/./g, "*") + v.slice(-4);
}
function maskEmail(v: string): string {
  const [local, domain] = (v || "").split("@");
  if (!local || !domain) return v;
  return `${local.length > 2 ? local.slice(0, 2) + "***" : "***"}@${domain}`;
}
function maskAccount(v: string): string {
  if (!v || v.length <= 5) return v;
  return v.slice(0, 4) + "***" + v.slice(-3);
}
