"use strict";
/**
 * scam-cross-ref.ts — the fraud intelligence engine.
 *
 * Tony's founder brief (2026-07):
 *   "If multiple users report the same agency / phone / bank / M-Pesa /
 *   recruiter / employer — automatically group them into one investigation
 *   page. Display: '17 independent reports reference this phone number.'"
 *
 * The engine does two jobs on every submitted report:
 *
 *   1. NORMALIZE + PERSIST every identifier (phone, email, bank, mpesa,
 *      website, socials) into `scam_report_contacts`.
 *   2. LOOK UP how many OTHER reports share each identifier, and produce
 *      a "cluster" summary the client can render as
 *      "17 reports reference this phone".
 *   3. UPSERT the agency_profiles row so /agencies-reported/:slug always
 *      reflects the freshest state.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugifyAgency = slugifyAgency;
exports.extractContacts = extractContacts;
exports.persistAndCrossRef = persistAndCrossRef;
exports.upsertAgencyProfile = upsertAgencyProfile;
exports.hashReporterIp = hashReporterIp;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
// ── Normalization ──────────────────────────────────────────────────────
/** Slugify an agency name for use as a stable public URL segment. */
function slugifyAgency(name) {
    return (name || "")
        .toLowerCase()
        .trim()
        .replace(/\bltd\b|\blimited\b|\bplc\b|\binc\b|\bcompany\b|\bco\b/gi, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "unknown-agency";
}
/** Normalize a phone-like string to digits only, strip leading zeros. */
function normalizePhone(v) {
    if (!v)
        return "";
    return v.replace(/[^\d]/g, "").replace(/^0+/, "");
}
/** Normalize an email to lowercase-trimmed. */
function normalizeEmail(v) {
    if (!v)
        return "";
    return v.trim().toLowerCase();
}
/** Normalize a URL: strip protocol, www, trailing slash, lowercase host. */
function normalizeUrl(v) {
    if (!v)
        return "";
    try {
        const withProto = v.startsWith("http") ? v : `https://${v}`;
        const u = new URL(withProto);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        return host + u.pathname.replace(/\/+$/, "");
    }
    catch {
        return v.toLowerCase().trim();
    }
}
/** Normalize bank / mpesa / wallet: digits + letters only, lowercased. */
function normalizeAccount(v) {
    if (!v)
        return "";
    return v.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
/** Split a "phone1, phone2, phone3" free-text field into an array. */
function splitList(v) {
    if (!v)
        return [];
    if (Array.isArray(v))
        return v.filter(Boolean).map(String);
    return String(v).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
}
/**
 * Extract every identifier from a payload as a list of
 * { kind, raw, normalized } records. Used by the caller to insert into
 * scam_report_contacts and to look up cross-refs.
 */
function extractContacts(p) {
    const out = [];
    const add = (kind, raw, normalized) => {
        if (!normalized)
            return;
        out.push({ kind, raw, normalized });
    };
    for (const p2 of splitList(p.phoneNumbers))
        add("phone", p2, normalizePhone(p2));
    if (p.whatsappNumber)
        add("whatsapp", p.whatsappNumber, normalizePhone(p.whatsappNumber));
    for (const e of splitList(p.emailAddresses))
        add("email", e, normalizeEmail(e));
    if (p.bankAccount)
        add("bank", p.bankAccount, normalizeAccount(p.bankAccount));
    if (p.mpesaNumber)
        add("mpesa", p.mpesaNumber, normalizePhone(p.mpesaNumber));
    if (p.cryptoWallet)
        add("crypto", p.cryptoWallet, normalizeAccount(p.cryptoWallet));
    if (p.website)
        add("website", p.website, normalizeUrl(p.website));
    if (p.facebookUrl)
        add("facebook", p.facebookUrl, normalizeUrl(p.facebookUrl));
    if (p.instagramUrl)
        add("instagram", p.instagramUrl, normalizeUrl(p.instagramUrl));
    if (p.tiktokUrl)
        add("tiktok", p.tiktokUrl, normalizeUrl(p.tiktokUrl));
    if (p.linkedinUrl)
        add("linkedin", p.linkedinUrl, normalizeUrl(p.linkedinUrl));
    // Dedupe within one report (same phone entered twice → one contact)
    const seen = new Set();
    return out.filter((c) => {
        const key = `${c.kind}::${c.normalized}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
// ── Persist + look up ──────────────────────────────────────────────────
/**
 * Insert every contact into scam_report_contacts and return the cross-ref
 * cluster summary for the client to display.
 *
 * Non-blocking on individual insert failure — the report itself is more
 * important than the cross-ref index.
 */
async function persistAndCrossRef(reportId, payload) {
    const contacts = extractContacts(payload);
    if (contacts.length === 0) {
        return { clusters: [], totalRelatedReports: 0, headline: "" };
    }
    // Bulk insert
    try {
        const values = [];
        const placeholders = [];
        contacts.forEach((c, i) => {
            const base = i * 4;
            placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
            values.push(reportId, c.kind, c.raw, c.normalized);
        });
        await db_1.pool.query(`INSERT INTO scam_report_contacts (report_id, kind, raw_value, normalized)
       VALUES ${placeholders.join(", ")}`, values);
    }
    catch (err) {
        console.warn("[scam-cross-ref] contact insert failed:", err?.message);
    }
    // Look up matches for each contact
    const clusters = [];
    for (const c of contacts) {
        try {
            const { rows } = await db_1.pool.query(`SELECT
           COUNT(DISTINCT contacts.report_id) FILTER (WHERE contacts.report_id != $1) AS other_count,
           COUNT(DISTINCT reports.reporter_ip_hash) FILTER (WHERE contacts.report_id != $1) AS reporter_count
         FROM scam_report_contacts contacts
         LEFT JOIN scam_reports reports ON reports.id = contacts.report_id
         WHERE contacts.kind = $2 AND contacts.normalized = $3`, [reportId, c.kind, c.normalized]);
            const other = Number(rows[0]?.other_count ?? 0);
            const reporters = Number(rows[0]?.reporter_count ?? 0);
            if (other > 0) {
                clusters.push({
                    kind: c.kind,
                    normalized: maskForDisplay(c.kind, c.normalized),
                    display: c.raw,
                    otherReportCount: other,
                    independentReporters: Math.max(1, reporters),
                });
            }
        }
        catch (err) {
            console.warn("[scam-cross-ref] lookup failed:", err?.message);
        }
    }
    const totalRelated = clusters.reduce((sum, c) => sum + c.otherReportCount, 0);
    const headline = buildHeadline(clusters);
    return { clusters, totalRelatedReports: totalRelated, headline };
}
/**
 * Upsert the aggregated agency_profiles row for a report's agency.
 * Called after cross-ref persistence to keep the public page fresh.
 */
async function upsertAgencyProfile(agencyName, info) {
    const slug = slugifyAgency(agencyName);
    const contactBuckets = extractContacts(info.contacts);
    const bucket = (k) => contactBuckets.filter((c) => c.kind === k).map((c) => c.normalized);
    try {
        await db_1.pool.query(`INSERT INTO agency_profiles (
         slug, display_name, country, office_location,
         known_websites, known_phones, known_emails, known_whatsapp,
         known_bank_accounts, known_mpesa_numbers,
         licence_number, licence_status, licence_expires_at,
         report_count, approved_report_count, total_reported_loss_kes,
         first_report_at, last_report_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8,
         $9, $10,
         $11, $12, $13,
         1, 0, COALESCE($14, 0),
         NOW(), NOW()
       )
       ON CONFLICT (slug) DO UPDATE SET
         known_websites      = array(SELECT DISTINCT unnest(agency_profiles.known_websites      || EXCLUDED.known_websites)),
         known_phones        = array(SELECT DISTINCT unnest(agency_profiles.known_phones        || EXCLUDED.known_phones)),
         known_emails        = array(SELECT DISTINCT unnest(agency_profiles.known_emails        || EXCLUDED.known_emails)),
         known_whatsapp      = array(SELECT DISTINCT unnest(agency_profiles.known_whatsapp      || EXCLUDED.known_whatsapp)),
         known_bank_accounts = array(SELECT DISTINCT unnest(agency_profiles.known_bank_accounts || EXCLUDED.known_bank_accounts)),
         known_mpesa_numbers = array(SELECT DISTINCT unnest(agency_profiles.known_mpesa_numbers || EXCLUDED.known_mpesa_numbers)),
         report_count        = agency_profiles.report_count + 1,
         total_reported_loss_kes = agency_profiles.total_reported_loss_kes + COALESCE($14, 0),
         last_report_at      = NOW(),
         updated_at          = NOW(),
         country             = COALESCE(agency_profiles.country, EXCLUDED.country),
         office_location     = COALESCE(agency_profiles.office_location, EXCLUDED.office_location),
         licence_number      = COALESCE(EXCLUDED.licence_number, agency_profiles.licence_number),
         licence_status      = COALESCE(EXCLUDED.licence_status, agency_profiles.licence_status)`, [
            slug, agencyName, info.country ?? null, info.officeLocation ?? null,
            bucket("website"), bucket("phone"), bucket("email"), bucket("whatsapp"),
            bucket("bank"), bucket("mpesa"),
            info.licenceNumber ?? null, info.licenceStatus ?? null,
            info.licenceExpiresAt ? new Date(info.licenceExpiresAt) : null,
            info.amountLostKes ?? 0,
        ]);
        // Recompute risk_band based on report count + loss aggregate
        await db_1.pool.query(`UPDATE agency_profiles SET risk_band = CASE
         WHEN approved_report_count >= 5 OR total_reported_loss_kes >= 500000 THEN 'critical'
         WHEN approved_report_count >= 2 OR total_reported_loss_kes >= 100000 THEN 'high'
         WHEN approved_report_count >= 1 OR report_count >= 3               THEN 'medium'
         ELSE 'medium' END
       WHERE slug = $1`, [slug]);
    }
    catch (err) {
        console.warn("[scam-cross-ref] agency profile upsert failed:", err?.message);
    }
    return { slug };
}
/**
 * Hash the reporter's IP + user-agent for abuse deduplication.
 * NOT used as an identity or lookup key — only as a "same reporter?" signal
 * for cluster stats + abuse rate limiting.
 */
function hashReporterIp(ip, ua) {
    return crypto_1.default.createHash("sha256").update(`${ip ?? ""}::${ua ?? ""}`).digest("hex").slice(0, 32);
}
// ── Display helpers ─────────────────────────────────────────────────────
function maskForDisplay(kind, normalized) {
    if (kind === "email") {
        const [local, domain] = normalized.split("@");
        if (!local || !domain)
            return normalized;
        const masked = local.length > 2 ? local.slice(0, 2) + "***" : "***";
        return `${masked}@${domain}`;
    }
    if (kind === "phone" || kind === "whatsapp" || kind === "mpesa") {
        if (normalized.length <= 5)
            return normalized;
        return normalized.slice(0, -4).replace(/./g, "*") + normalized.slice(-4);
    }
    if (kind === "bank" || kind === "crypto") {
        if (normalized.length <= 5)
            return normalized;
        return normalized.slice(0, 4) + "***" + normalized.slice(-3);
    }
    return normalized;
}
function buildHeadline(clusters) {
    if (clusters.length === 0)
        return "";
    const strongest = [...clusters].sort((a, b) => b.otherReportCount - a.otherReportCount)[0];
    const kindLabel = {
        phone: "phone number",
        whatsapp: "WhatsApp number",
        email: "email address",
        bank: "bank account",
        mpesa: "M-Pesa number",
        crypto: "crypto wallet",
        website: "website",
        facebook: "Facebook page",
        instagram: "Instagram page",
        tiktok: "TikTok page",
        linkedin: "LinkedIn page",
    };
    return `⚠ ${strongest.otherReportCount} other report${strongest.otherReportCount === 1 ? "" : "s"} in our database reference the same ${kindLabel[strongest.kind]}.`;
}
