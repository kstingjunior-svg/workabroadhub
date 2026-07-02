"use strict";
/**
 * Sync Engine — normalization helpers (Milestone 1).
 *
 * Every adapter calls these functions in its normalize() implementation.
 * Pure, deterministic, no I/O. If a normalization rule changes shape (not
 * just behavior), bump FINGERPRINT_VERSION in fingerprint.ts so stored
 * fingerprints don't silently mismatch.
 *
 * Each helper is liberal in what it accepts (handles whitespace, casing,
 * common typos observed in the NEA portal export) and strict in what it
 * emits (single canonical form, or null when the input cannot be salvaged).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NORMALIZER_VERSION = void 0;
exports.collapseWhitespace = collapseWhitespace;
exports.normalizeAgencyName = normalizeAgencyName;
exports.normalizeLicenseNumber = normalizeLicenseNumber;
exports.normalizeEmail = normalizeEmail;
exports.normalizeWebsite = normalizeWebsite;
exports.normalizePhoneNumber = normalizePhoneNumber;
exports.normalizeServiceType = normalizeServiceType;
exports.normalizeStatusSource = normalizeStatusSource;
exports.normalizeDate = normalizeDate;
exports.normalizeCountryCode = normalizeCountryCode;
const phone_1 = require("../utils/phone");
const types_1 = require("./types");
/**
 * 2026-06 (ADR-0002 / Improvement 2): NORMALIZER_VERSION.
 *
 * Pinned identifier of the normalizer behavior. Persisted alongside every
 * sync_records row so a future code change to any helper in this file can
 * be detected post-hoc: scan sync_records WHERE normalizer_version < CURRENT
 * and re-derive the normalized_payload from the raw_payload.
 *
 * Bump this string whenever ANY normalisation helper changes shape:
 *   • New mapping rule in normalizeServiceType
 *   • Stricter/looser pattern in normalizeLicenseNumber
 *   • New regex in normalizeWebsite
 *   • Any change that would yield a different NormalizedAgency for the
 *     same raw input
 *
 * Format: SemVer-like "MAJOR.MINOR.PATCH". MAJOR bumps imply incompatible
 * re-normalisation; MINOR/PATCH bumps are non-breaking refinements.
 *
 * Version log:
 *   1.0.0 (2026-06, M1) — initial release.
 */
exports.NORMALIZER_VERSION = "1.0.0";
// ─────────────────────────────────────────────────────────────────────────────
// Strings
// ─────────────────────────────────────────────────────────────────────────────
/** Trim + collapse internal whitespace runs to a single space. */
function collapseWhitespace(s) {
    return s.trim().replace(/\s+/g, " ");
}
/** Trim, collapse whitespace, uppercase. The canonical form for agency_name. */
function normalizeAgencyName(raw) {
    return collapseWhitespace(String(raw ?? "")).toUpperCase();
}
/**
 * Normalize a licence number.
 *
 * Observed quirks in the NEA portal:
 *   • Leading colons:    ":PVT-RXU2253Y" → "PVT-RXU2253Y"
 *   • Mixed casing:      "pvt-mkukadj"   → "PVT-MKUKADJ"
 *   • Spaces vs hyphens: "PVT V7U28Y8"  → "PVT-V7U28Y8" (we standardise to hyphen)
 *   • Surrounding pad:   " PVT-Y2UED53 " → "PVT-Y2UED53"
 *
 * We do NOT attempt to parse provider-specific structure here (that's the
 * adapter's job in validate()). We only canonicalise so two visually
 * identical numbers always produce the same string.
 */
function normalizeLicenseNumber(raw) {
    return collapseWhitespace(String(raw ?? ""))
        .replace(/^[:\s]+/, "") // drop leading punctuation
        .replace(/\s/g, "-") // " V7U" → "-V7U"  (PVT V7U28Y8 case)
        .replace(/-+/g, "-") // collapse "--" → "-"
        .toUpperCase();
}
// ─────────────────────────────────────────────────────────────────────────────
// Email
// ─────────────────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/**
 * Pick the first plausible email from a string that may contain multiple
 * separated by "/", ",", or whitespace. Returns null if no valid email is
 * found — the engine prefers null over a bad address.
 *
 * NEA portal quirks observed:
 *   "abdumwalimuinvestment@yahoo.com/info@abdumwalimuin"  → first wins
 *   "beettravelagenciesltdgmail.com"                       → missing @ → null
 */
function normalizeEmail(raw) {
    if (raw == null)
        return null;
    const candidates = String(raw).split(/[\s,/]+/).map((c) => c.trim().toLowerCase());
    for (const c of candidates) {
        if (c && EMAIL_RE.test(c))
            return c;
    }
    return null;
}
// ─────────────────────────────────────────────────────────────────────────────
// Website
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Normalize a website URL. Requires http(s) scheme; adds https:// if missing
 * and the host portion looks valid. Returns null otherwise.
 *
 * We don't follow redirects or probe the URL — that's a network operation
 * and these helpers stay pure.
 */
function normalizeWebsite(raw) {
    if (raw == null)
        return null;
    const trimmed = String(raw).trim();
    if (!trimmed)
        return null;
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const u = new URL(candidate);
        // Reject obviously bad hosts: must contain a dot, no whitespace.
        if (!u.hostname.includes(".") || /\s/.test(u.hostname))
            return null;
        return u.toString().replace(/\/$/, ""); // strip trailing slash for stable form
    }
    catch {
        return null;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Phone
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Normalize a phone number to E.164-style. Reuses the existing Kenya phone
 * normaliser (handles +254 / 0X / 254 prefixes uniformly). Returns null if
 * the input has fewer than 9 digits — too short to be a real number.
 */
function normalizePhoneNumber(raw) {
    if (raw == null)
        return null;
    const trimmed = String(raw).trim();
    if (!trimmed)
        return null;
    const normalised = (0, phone_1.normalizePhone)(trimmed);
    // After normalisation, expect at least 9 digits (Kenyan mobiles are 12 digits as 254…).
    const digitCount = normalised.replace(/\D/g, "").length;
    if (digitCount < 9)
        return null;
    return normalised;
}
// ─────────────────────────────────────────────────────────────────────────────
// Service type
// ─────────────────────────────────────────────────────────────────────────────
const SERVICE_TYPE_SET = new Set(types_1.SERVICE_TYPES);
/**
 * Map a provider's free-text service-type string to the canonical enum.
 *
 * NEA-specific vocabulary (visible in Tony's paste):
 *   • "BOTH LOCAL & INTERNATIONAL LICENSE"          → gulf_and_domestic
 *   • "BOTH LOCAL & INTERNATIONAL RENEWAL LICENSE"  → gulf_and_domestic
 *   • "LOCAL LICENSE"                                → domestic
 *   • "N/A" / blank                                  → unspecified
 *
 * Adapters for other providers should extend this mapping (or pre-map
 * before calling). Unknown strings fall through to "unspecified" so the
 * pipeline never crashes on a new label.
 */
function normalizeServiceType(raw) {
    if (raw == null)
        return "unspecified";
    const s = collapseWhitespace(String(raw)).toUpperCase();
    if (!s || s === "N/A")
        return "unspecified";
    if (s.includes("BOTH LOCAL") && s.includes("INTERNATIONAL"))
        return "gulf_and_domestic";
    if (s.includes("INTERNATIONAL") && !s.includes("LOCAL"))
        return "gulf";
    if (s.includes("LOCAL"))
        return "domestic";
    if (s.includes("MEDICAL") || s.includes("HEALTH") || s.includes("NURSING"))
        return "medical";
    if (s.includes("STUDENT") || s.includes("EDUCATION") || s.includes("AU PAIR"))
        return "education";
    if (s.includes("SKILLED") || s.includes("PROFESSIONAL"))
        return "skilled";
    // Already-canonical pass-through.
    const lower = s.toLowerCase();
    if (SERVICE_TYPE_SET.has(lower))
        return lower;
    return "unspecified";
}
// ─────────────────────────────────────────────────────────────────────────────
// Agency status
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_SET = new Set(types_1.AGENCY_STATUSES);
/**
 * Map a provider's free-text status string to the canonical enum. The NEA
 * portal exports "Verified" for every active agency, but other providers
 * expose suspensions and revocations. Unknown → "unknown" (NOT "verified",
 * since we never want to escalate trust by silent default).
 */
function normalizeStatusSource(raw) {
    if (raw == null)
        return "unknown";
    const s = collapseWhitespace(String(raw)).toLowerCase();
    if (!s)
        return "unknown";
    if (s.includes("verified") || s.includes("active") || s === "valid")
        return "verified";
    if (s.includes("suspend"))
        return "suspended";
    if (s.includes("expir"))
        return "expired";
    if (s.includes("revok") || s.includes("cancel"))
        return "revoked";
    // Already-canonical pass-through.
    if (STATUS_SET.has(s))
        return s;
    return "unknown";
}
// ─────────────────────────────────────────────────────────────────────────────
// Dates
// ─────────────────────────────────────────────────────────────────────────────
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_SLASH_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const YMD_SLASH_RE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
/**
 * Normalize a date to ISO YYYY-MM-DD. Returns null on any unparseable input.
 *
 * Accepts:
 *   • "2026-08-24"   (already ISO)
 *   • "24/08/2026"   (NEA portal day-first)
 *   • "2026/08/24"   (year-first slash)
 *   • Date instance
 *
 * Does NOT accept ambiguous formats (e.g. "08/24/2026" is read as
 * day-first per the NEA paste; a US-format adapter should pre-convert).
 */
function normalizeDate(raw) {
    if (raw == null)
        return null;
    if (raw instanceof Date) {
        if (Number.isNaN(raw.getTime()))
            return null;
        return raw.toISOString().slice(0, 10);
    }
    const s = String(raw).trim();
    if (!s)
        return null;
    const isoMatch = s.match(ISO_DATE_RE);
    if (isoMatch) {
        const [, y, m, d] = isoMatch;
        return assembleDate(y, m, d);
    }
    const dmyMatch = s.match(DMY_SLASH_RE);
    if (dmyMatch) {
        const [, d, m, y] = dmyMatch;
        return assembleDate(y, m, d);
    }
    const ymdMatch = s.match(YMD_SLASH_RE);
    if (ymdMatch) {
        const [, y, m, d] = ymdMatch;
        return assembleDate(y, m, d);
    }
    // Last resort: Date.parse (catches RFC-2822, ISO 8601 with time, etc.).
    const t = Date.parse(s);
    if (!Number.isNaN(t))
        return new Date(t).toISOString().slice(0, 10);
    return null;
}
function assembleDate(y, m, d) {
    const yy = y.padStart(4, "0");
    const mm = m.padStart(2, "0");
    const dd = d.padStart(2, "0");
    // Reject impossible components quickly.
    const month = Number(mm);
    const day = Number(dd);
    if (month < 1 || month > 12 || day < 1 || day > 31)
        return null;
    // Roundtrip through Date to reject e.g. "2026-02-30".
    const iso = `${yy}-${mm}-${dd}`;
    const parsed = new Date(iso + "T00:00:00Z");
    if (Number.isNaN(parsed.getTime()))
        return null;
    // Verify components round-trip (catches Feb 30 etc.).
    if (parsed.getUTCFullYear() !== Number(yy) ||
        parsed.getUTCMonth() + 1 !== month ||
        parsed.getUTCDate() !== day) {
        return null;
    }
    return iso;
}
// ─────────────────────────────────────────────────────────────────────────────
// Country code
// ─────────────────────────────────────────────────────────────────────────────
const ISO_COUNTRY_RE = /^[A-Z]{2}$/;
/** Accepts only ISO-3166-1 alpha-2 codes ("KE", "GB", …). Returns null on miss. */
function normalizeCountryCode(raw) {
    if (raw == null)
        return null;
    const s = String(raw).trim().toUpperCase();
    if (!ISO_COUNTRY_RE.test(s))
        return null;
    return s;
}
