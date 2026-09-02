"use strict";
/**
 * rules.ts — country-specific visa format rules.
 *
 * Each rule set returns a list of pass/fail/warning checks with human-readable
 * explanations. The analyzer aggregates these into the country-specific
 * "Government Format" sub-score.
 *
 * Rules are intentionally CONSERVATIVE — we only fire warnings when we're
 * confident (regex match or known-invalid pattern). Uncertain patterns are
 * marked "info" and don't affect the score, only the report copy.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRules = runRules;
exports.scoreRules = scoreRules;
/**
 * Run generic + country-specific format rules. Returns every check with its
 * verdict. The analyzer scores from these.
 */
function runRules(fields, country) {
    const checks = [];
    // ── Generic checks (apply to every country) ─────────────────────────────
    // Visa number presence
    if (!fields.visaNumber) {
        checks.push({
            id: "visa_number_missing",
            label: "Visa number",
            status: "fail",
            detail: "No visa number is visible on the document. Every legitimate work visa has a unique identifier.",
        });
    }
    else {
        checks.push({
            id: "visa_number_present",
            label: "Visa number",
            status: "pass",
            detail: `A visa number is present: ${maskId(fields.visaNumber)}.`,
        });
    }
    // Applicant name presence
    if (!fields.applicantName) {
        checks.push({
            id: "applicant_name_missing",
            label: "Applicant name",
            status: "warn",
            detail: "The applicant's full name is not clearly visible on the document.",
        });
    }
    else {
        checks.push({
            id: "applicant_name_present",
            label: "Applicant name",
            status: "pass",
            detail: `Applicant name is present: ${fields.applicantName}.`,
        });
    }
    // Date logic — issue must be before expiry, expiry must be in the future
    const issue = parseDate(fields.issueDate);
    const expiry = parseDate(fields.expiryDate);
    if (issue && expiry) {
        if (expiry.getTime() <= issue.getTime()) {
            checks.push({
                id: "date_order_invalid",
                label: "Date order",
                status: "fail",
                detail: `Expiry date (${fields.expiryDate}) is not after issue date (${fields.issueDate}) — this is not possible on a real visa.`,
            });
        }
        else {
            checks.push({
                id: "date_order_valid",
                label: "Date order",
                status: "pass",
                detail: "Issue date is before expiry date — timeline is consistent.",
            });
        }
        if (expiry.getTime() < Date.now()) {
            checks.push({
                id: "visa_expired",
                label: "Expiry",
                status: "warn",
                detail: `This visa has already expired (${fields.expiryDate}). You cannot travel on an expired visa.`,
            });
        }
        else {
            checks.push({
                id: "visa_active",
                label: "Expiry",
                status: "pass",
                detail: `Visa is still within its validity window (expires ${fields.expiryDate}).`,
            });
        }
    }
    else if (fields.issueDate || fields.expiryDate) {
        checks.push({
            id: "date_partial",
            label: "Dates",
            status: "warn",
            detail: "Only one of issue/expiry date is clearly visible. Legitimate visas always show both.",
        });
    }
    else {
        checks.push({
            id: "date_missing",
            label: "Dates",
            status: "fail",
            detail: "No issue or expiry date is visible. Every visa carries both.",
        });
    }
    // Security features (composite check)
    const securityCount = [
        fields.hasBarcode,
        fields.hasQrCode,
        fields.hasMrz,
        fields.hasSignature,
        fields.hasStamp,
        fields.hasWatermark,
        fields.hasDigitalSignature,
    ].filter(Boolean).length;
    if (securityCount === 0) {
        checks.push({
            id: "security_features_absent",
            label: "Security features",
            status: "fail",
            detail: "No security features (barcode, QR, MRZ, watermark, signature, stamp) are visible. Real visas always carry multiple security elements.",
        });
    }
    else if (securityCount <= 2) {
        checks.push({
            id: "security_features_low",
            label: "Security features",
            status: "warn",
            detail: `Only ${securityCount} security feature(s) detected. Legitimate visas typically carry 4-6 (MRZ + barcode/QR + watermark + signature + stamp).`,
        });
    }
    else {
        checks.push({
            id: "security_features_ok",
            label: "Security features",
            status: "pass",
            detail: `${securityCount} security feature(s) detected — consistent with a genuine document.`,
        });
    }
    // ── Country-specific checks ─────────────────────────────────────────────
    if (country) {
        // Visa number format
        if (fields.visaNumber && country.visaNumberPatterns && country.visaNumberPatterns.length > 0) {
            const cleaned = fields.visaNumber.replace(/\s+/g, "");
            const matches = country.visaNumberPatterns.some((rx) => rx.test(cleaned));
            if (matches) {
                checks.push({
                    id: "country_visa_format_ok",
                    label: `${country.name} visa format`,
                    status: "pass",
                    detail: `Visa number matches the standard ${country.name} format.`,
                });
            }
            else {
                checks.push({
                    id: "country_visa_format_mismatch",
                    label: `${country.name} visa format`,
                    status: "warn",
                    detail: `Visa number does not match the typical ${country.name} format. This could be an unfamiliar visa class, OR a forgery — verify at ${country.links.visaStatusChecker || country.links.immigration || "the official immigration website"}.`,
                });
            }
        }
        // Country-specific special-case rules
        if (country.code === "US" && !fields.hasMrz) {
            checks.push({
                id: "us_visa_no_mrz",
                label: "US visa MRZ",
                status: "fail",
                detail: "US visas always carry a Machine Readable Zone (MRZ) at the bottom. Its absence is a strong forgery indicator.",
            });
        }
        if (country.code === "AU" && (fields.hasStamp || fields.hasSignature) && !/electronic/i.test(String(fields.visaType || ""))) {
            checks.push({
                id: "au_visa_sticker_warning",
                label: "Australian visa format",
                status: "warn",
                detail: "Australia has issued visas ELECTRONICALLY since 2015 — no physical sticker or foil. A physical Australian visa document is very likely a forgery.",
            });
        }
        if (country.code === "GB" && fields.visaNumber && !/^GWF/i.test(fields.visaNumber.replace(/\s+/g, ""))) {
            checks.push({
                id: "uk_gwf_missing",
                label: "UK GWF reference",
                status: "info",
                detail: "UK visa applications typically carry a GWF-prefixed reference number. Absence isn't a fail (the applicant may have another reference type), but worth cross-checking.",
            });
        }
        if (country.code === "CA" && fields.visaNumber && !/^[A-Z]\d{9}$/.test(fields.visaNumber.replace(/\s+/g, ""))) {
            checks.push({
                id: "ca_uci_format",
                label: "Canada UCI format",
                status: "info",
                detail: "Canadian UCIs (Unique Client Identifiers) are typically formatted as a letter followed by 9 digits (e.g. \"A123456789\"). The visible number doesn't match — verify via IRCC.",
            });
        }
        if (country.code === "SA" && !fields.workPermitNumber && !/tourist|visit|umrah|hajj/i.test(String(fields.visaType || ""))) {
            checks.push({
                id: "sa_iqama_missing",
                label: "Saudi work permit reference",
                status: "warn",
                detail: "Saudi work visas (non-tourist) always have a linked Iqama/work-permit number. Ask the sponsor for their Iqama number and verify on Qiwa.",
            });
        }
        if (country.code === "AE" && !fields.employer && !/tourist|visit/i.test(String(fields.visaType || ""))) {
            checks.push({
                id: "ae_sponsor_missing",
                label: "UAE sponsor",
                status: "warn",
                detail: "UAE work visas always name the sponsoring company. Absence of an employer/sponsor field is suspicious.",
            });
        }
    }
    else {
        checks.push({
            id: "country_unknown",
            label: "Country",
            status: "warn",
            detail: "We could not confidently identify the issuing country from the document. Country-specific verification is unavailable.",
        });
    }
    return checks;
}
/**
 * Aggregate a list of RuleChecks into a 0-100 "Government Format" sub-score.
 * Failures weigh -25, warnings -10, info 0, pass +baseline.
 */
function scoreRules(checks) {
    if (checks.length === 0)
        return 0;
    let score = 100;
    for (const c of checks) {
        if (c.status === "fail")
            score -= 25;
        else if (c.status === "warn")
            score -= 10;
    }
    return Math.max(0, Math.min(100, score));
}
// ── Helpers ─────────────────────────────────────────────────────────────
function parseDate(s) {
    if (!s)
        return null;
    const trimmed = String(s).trim();
    if (!trimmed)
        return null;
    // Try ISO first (2026-07-27 or 2026/07/27)
    const iso = trimmed.replace(/\//g, "-");
    const asDate = new Date(iso);
    if (!isNaN(asDate.getTime()))
        return asDate;
    // DD MMM YYYY (27 Jul 2026)
    const m = /^(\d{1,2})[\s\-\/]+([A-Za-z]{3,})[\s\-\/]+(\d{4})$/.exec(trimmed);
    if (m) {
        const monthMap = {
            jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
            jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
        };
        const monthIdx = monthMap[m[2].slice(0, 3).toLowerCase()];
        if (monthIdx !== undefined)
            return new Date(Number(m[3]), monthIdx, Number(m[1]));
    }
    return null;
}
/** Mask all but first 2 + last 2 chars for display. */
function maskId(id) {
    const s = String(id).trim();
    if (s.length <= 4)
        return s;
    return `${s.slice(0, 2)}${"*".repeat(Math.min(s.length - 4, 6))}${s.slice(-2)}`;
}
