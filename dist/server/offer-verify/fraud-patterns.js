"use strict";
/**
 * fraud-patterns.ts — universal + country-general offer-letter fraud detection.
 *
 * The analyzer runs every extracted field through these detectors. Each detector
 * returns a finding with severity ("hard" / "soft" / "info") and a human
 * explanation the user can read + act on.
 *
 * Sources: Kenya MFA overseas-jobs scam registry (2026), UK Home Office
 * modern-slavery indicators, MOHRE fraud advisories, IOM anti-trafficking
 * red-flag list. Cross-checked with real complaints Tony has received.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectFraudPatterns = detectFraudPatterns;
// ── Universal detectors — run against every letter ───────────────────
/**
 * Free / disposable email domains — legitimate employers should almost never
 * use these for HR communication. Rare exceptions (micro-businesses) are
 * flagged as "soft" not "hard".
 */
const FREE_EMAIL_DOMAINS = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.in",
    "hotmail.com", "outlook.com", "live.com", "aol.com", "icloud.com",
    "protonmail.com", "proton.me", "yandex.com", "mail.com", "zoho.com",
    // Common disposable / one-time providers
    "10minutemail.com", "guerrillamail.com", "mailinator.com", "temp-mail.org",
    "tempmail.com", "throwawaymail.com",
]);
/**
 * Phrases that strongly indicate an advance-fee / recruitment-fee scam.
 * Case-insensitive substring match against the letter's full text.
 */
const UPFRONT_FEE_PHRASES = [
    "visa fee",
    "visa processing fee",
    "processing fee",
    "medical fee",
    "medical clearance fee",
    "training fee",
    "orientation fee",
    "registration fee",
    "recruitment fee",
    "agency fee",
    "placement fee",
    "administrative fee",
    "security deposit",
    "refundable deposit",
    "advance payment",
    "wire the amount",
    "western union",
    "moneygram",
    "bitcoin",
    "cryptocurrency",
    "usdt",
    "kes only", // asking for KES (payment sent from Kenya) for overseas fee
];
/**
 * Phrases that promise unrealistic outcomes — hallmark of overseas job scams
 * targeting Kenyan workers.
 */
const OVERPROMISE_PHRASES = [
    "guaranteed permanent residency",
    "guaranteed pr",
    "citizenship guaranteed",
    "no interview required",
    "no experience needed",
    "hire immediately",
    "start next week",
    "start immediately",
    "unlimited overtime pay",
    "double salary",
    "salary + tips + commission",
    "no qualifications required",
];
/**
 * Pressure / social-engineering red flags — urgency = coercion tell.
 */
const PRESSURE_PHRASES = [
    "pay within 24 hours",
    "pay today",
    "limited slots",
    "final chance",
    "final opportunity",
    "reply immediately or lose",
    "seat expires",
    "position closes today",
    "act now",
];
/**
 * Personal bank account / non-corporate payment indicators.
 */
const PERSONAL_ACCOUNT_PHRASES = [
    "personal account",
    "my personal m-pesa",
    "send to my number",
    "till number", // suspicious for a foreign employer
    "paybill", // suspicious for a foreign employer
    "buy goods", // M-Pesa "buy goods" instead of employer's corporate account
];
/**
 * Vague / evasive-language indicators — usually paired with pressure.
 */
const VAGUE_LANGUAGE_PHRASES = [
    "duties as assigned",
    "salary based on performance",
    "salary tbd",
    "salary to be discussed",
    "flexible work location",
    "various locations",
    "as needed",
];
// ── Main detector ─────────────────────────────────────────────────────
function detectFraudPatterns(fields) {
    const findings = [];
    const fullText = (fields.fullText || "").toLowerCase();
    // ── 1. Email verification ─────────────────────────────────────────
    if (fields.recruiterEmail) {
        const email = fields.recruiterEmail.toLowerCase().trim();
        const domain = email.split("@")[1] ?? "";
        if (domain && FREE_EMAIL_DOMAINS.has(domain)) {
            findings.push({
                id: "email_free_provider",
                label: "Recruiter uses free email service",
                severity: "hard",
                detail: `Recruiter's email (${maskEmail(email)}) is on a free provider like Gmail or Yahoo. Legitimate overseas employers use their corporate domain (e.g. @company.com).`,
                actionable: `Ask the recruiter to email you from the company's official domain. Cross-check that domain with the company's official website.`,
            });
        }
        else if (domain && fields.employerName && fields.companyWebsite) {
            // Corporate email should match company website domain (roughly).
            const siteDomain = extractDomain(fields.companyWebsite);
            if (siteDomain && !domain.includes(siteDomain) && !siteDomain.includes(domain.split(".")[0])) {
                findings.push({
                    id: "email_domain_mismatch",
                    label: "Email domain doesn't match company website",
                    severity: "soft",
                    detail: `The recruiter's email domain (${domain}) doesn't match the company website (${siteDomain}). This could be a subsidiary, or it could be a spoofed identity.`,
                    actionable: `Look up the company website independently and email the HR address listed there — don't reply to the offer email.`,
                });
            }
        }
    }
    else {
        findings.push({
            id: "email_missing",
            label: "No recruiter email provided",
            severity: "soft",
            detail: "The letter doesn't include a recruiter or HR email address. Legitimate offers always include a way to reach HR directly.",
        });
    }
    // ── 2. Upfront-fee scam ──────────────────────────────────────────
    const feeMatches = UPFRONT_FEE_PHRASES.filter((p) => fullText.includes(p));
    if (feeMatches.length > 0) {
        findings.push({
            id: "upfront_fee_requested",
            label: "Upfront fee request detected",
            severity: "hard",
            detail: `The letter mentions: ${feeMatches.slice(0, 3).map((s) => `"${s}"`).join(", ")}. Legitimate overseas employers pay ALL visa, medical, and processing fees themselves — Kenyan labour law also prohibits recruitment fees paid by the worker.`,
            actionable: "Do NOT send any money. Report this offer to the Kenya National Employment Authority (NEA) at neaims.nea.go.ke.",
        });
    }
    // ── 3. Over-promise indicators ───────────────────────────────────
    const overMatches = OVERPROMISE_PHRASES.filter((p) => fullText.includes(p));
    if (overMatches.length > 0) {
        findings.push({
            id: "overpromise_language",
            label: "Unrealistic promises detected",
            severity: "hard",
            detail: `Promises like ${overMatches.slice(0, 2).map((s) => `"${s}"`).join(", ")} are classic scam indicators. Real employers can never guarantee PR / citizenship, and every serious role requires at least one interview.`,
        });
    }
    // ── 4. Pressure / urgency ────────────────────────────────────────
    const pressureMatches = PRESSURE_PHRASES.filter((p) => fullText.includes(p));
    if (pressureMatches.length > 0) {
        findings.push({
            id: "pressure_tactics",
            label: "High-pressure urgency language",
            severity: "soft",
            detail: `Phrases like "${pressureMatches[0]}" are used to stop you thinking or verifying independently. Real employment offers give you at least 3-5 business days to review.`,
            actionable: "Take at least 48 hours. Any employer who won't wait is not a legitimate one.",
        });
    }
    // ── 5. Personal bank / non-corporate account ────────────────────
    const personalMatches = PERSONAL_ACCOUNT_PHRASES.filter((p) => fullText.includes(p));
    if (personalMatches.length > 0) {
        findings.push({
            id: "personal_payment_account",
            label: "Payment to personal account requested",
            severity: "hard",
            detail: "The letter mentions a personal M-Pesa number, till number, or private wire — legitimate overseas employers use corporate bank transfers, never M-Pesa Buy Goods or personal accounts.",
            actionable: "Refuse the payment. This is textbook advance-fee fraud.",
        });
    }
    // ── 6. Vague language ────────────────────────────────────────────
    const vagueMatches = VAGUE_LANGUAGE_PHRASES.filter((p) => fullText.includes(p));
    if (vagueMatches.length >= 2) {
        findings.push({
            id: "vague_terms",
            label: "Contract terms are unusually vague",
            severity: "soft",
            detail: `Multiple vague phrases like "${vagueMatches[0]}" and "${vagueMatches[1]}" appear in the offer. A real employment contract specifies duties, salary, and location precisely.`,
            actionable: "Request a revised contract with specific duties, exact salary, work address, and hours.",
        });
    }
    // ── 7. Missing employer identity fields ─────────────────────────
    if (!fields.employerName) {
        findings.push({
            id: "employer_name_missing",
            label: "Employer name missing",
            severity: "hard",
            detail: "The offer letter doesn't clearly state the employing company's name. This is not possible in a legitimate offer.",
        });
    }
    if (!fields.companyAddress) {
        findings.push({
            id: "company_address_missing",
            label: "Company address missing",
            severity: "soft",
            detail: "No physical company address is stated. Every legitimate overseas employer has a verifiable office address.",
            actionable: "Google the company name + city and confirm the address matches.",
        });
    }
    if (!fields.jobTitle) {
        findings.push({
            id: "job_title_missing",
            label: "Job title unclear",
            severity: "soft",
            detail: "The specific job title isn't clear on the letter. Real offers always specify the exact position.",
        });
    }
    if (!fields.startDate) {
        findings.push({
            id: "start_date_missing",
            label: "Start date not specified",
            severity: "soft",
            detail: "No specific start date is on the letter. Real employers commit to a date.",
        });
    }
    if (!fields.salaryText && !fields.salaryMonthly) {
        findings.push({
            id: "salary_missing",
            label: "Salary not specified",
            severity: "hard",
            detail: "The offer doesn't state a clear salary. No legitimate offer omits pay.",
        });
    }
    // ── 8. Document authenticity ────────────────────────────────────
    const authCount = [fields.hasLetterhead, fields.hasSignature, fields.hasStamp].filter(Boolean).length;
    if (authCount === 0) {
        findings.push({
            id: "no_authenticity_elements",
            label: "No letterhead, signature, or stamp",
            severity: "hard",
            detail: "The document has none of the standard authenticity elements (company letterhead, signature, or stamp). Real offer letters carry at least two of these.",
        });
    }
    else if (authCount === 1) {
        findings.push({
            id: "weak_authenticity",
            label: "Only one authenticity element present",
            severity: "soft",
            detail: "The document has only one of letterhead/signature/stamp. Legitimate offers typically carry all three.",
        });
    }
    // ── 9. Contract detail depth (positive signal → info) ───────────
    const contractDepth = [
        fields.probationPeriod, fields.contractDuration, fields.leaveDays,
        fields.workingHours, fields.reportingManager, fields.medicalInsurance,
    ].filter(Boolean).length;
    if (contractDepth >= 4) {
        findings.push({
            id: "contract_detail_strong",
            label: "Contract terms are detailed",
            severity: "info",
            detail: `The offer specifies ${contractDepth} of 6 standard contract clauses (probation, duration, leave, hours, manager, insurance) — consistent with a genuine HR-drafted offer.`,
        });
    }
    return findings;
}
// ── Helpers ─────────────────────────────────────────────────────────
function extractDomain(url) {
    try {
        const clean = url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
        return clean.toLowerCase().split(".").slice(-2).join(".");
    }
    catch {
        return "";
    }
}
function maskEmail(email) {
    const [local, domain] = email.split("@");
    if (!local || !domain)
        return email;
    const masked = local.length > 2 ? local.slice(0, 2) + "***" : local + "***";
    return `${masked}@${domain}`;
}
