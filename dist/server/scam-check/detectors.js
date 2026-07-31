"use strict";
/**
 * detectors.ts — phone number, URL, and text-pattern analyzers for the
 * Job Scam Checker. Extends the fraud-patterns.ts detectors already used
 * by the offer-letter verifier with scam-specific signals.
 *
 * These run purely locally — no external OSINT calls, no WHOIS lookups
 * (Render free tier can't reach most WHOIS endpoints anyway). We surface
 * ONLY signals we can compute confidently from the raw evidence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzePhone = analyzePhone;
exports.analyzeUrl = analyzeUrl;
exports.analyzeText = analyzeText;
exports.analyzeEmail = analyzeEmail;
// ═══════════════════════════════════════════════════════════════════════
// PHONE NUMBER ANALYSIS
// ═══════════════════════════════════════════════════════════════════════
/**
 * Map of common country calling codes to country names + expected mobile
 * prefix ranges. Used to detect country mismatches (e.g. "UK employer" using
 * a +254 Kenyan number). NOT exhaustive — covers the 30 highest-Kenyan-volume
 * overseas destinations + Kenya itself.
 */
const COUNTRY_CODES = {
    "254": { name: "Kenya", expectedMobilePrefixes: [/^7\d{8}$/, /^1\d{8}$/] },
    "255": { name: "Tanzania" },
    "256": { name: "Uganda" },
    "44": { name: "United Kingdom", expectedMobilePrefixes: [/^7\d{9}$/] },
    "1": { name: "USA / Canada" },
    "971": { name: "United Arab Emirates" },
    "966": { name: "Saudi Arabia" },
    "974": { name: "Qatar" },
    "965": { name: "Kuwait" },
    "973": { name: "Bahrain" },
    "968": { name: "Oman" },
    "61": { name: "Australia", expectedMobilePrefixes: [/^4\d{8}$/] },
    "64": { name: "New Zealand" },
    "49": { name: "Germany" },
    "353": { name: "Ireland" },
    "31": { name: "Netherlands" },
    "48": { name: "Poland" },
    "352": { name: "Luxembourg" },
    "351": { name: "Portugal" },
    "34": { name: "Spain" },
    "39": { name: "Italy" },
    "33": { name: "France" },
    "46": { name: "Sweden" },
    "45": { name: "Denmark" },
    "358": { name: "Finland" },
    "47": { name: "Norway" },
    "1242": { name: "Bahamas" },
    "90": { name: "Turkey" },
    "81": { name: "Japan" },
    "82": { name: "South Korea" },
    "65": { name: "Singapore" },
    "60": { name: "Malaysia" },
};
/**
 * VoIP number range hints (common commercial VoIP prefixes). Non-exhaustive
 * — a match is only a SOFT signal, not a hard fail. Kept small so we don't
 * false-positive legit business landlines.
 */
const KNOWN_VOIP_HINTS = [
    { pattern: /^\+?1\s?800/i, reason: "US toll-free — often used by legitimate businesses AND by scammers routing calls through VoIP" },
    { pattern: /^\+?44\s?800/i, reason: "UK freephone — same as above" },
    { pattern: /^\+?1\s?(929|347|646|917|332)/i, reason: "NYC mobile / Google Voice range often used by VoIP resellers" },
];
function analyzePhone(rawPhone, claimedCountry) {
    const findings = [];
    if (!rawPhone)
        return findings;
    const cleaned = rawPhone.replace(/[^\d+]/g, "");
    // Extract country code
    let countryCode = null;
    let localPart = cleaned;
    if (cleaned.startsWith("+")) {
        // Try 4→3→2→1 digit codes
        for (const len of [4, 3, 2, 1]) {
            const prefix = cleaned.slice(1, 1 + len);
            if (COUNTRY_CODES[prefix]) {
                countryCode = prefix;
                localPart = cleaned.slice(1 + len);
                break;
            }
        }
    }
    if (!countryCode) {
        findings.push({
            id: "phone_no_country_code",
            label: "Phone has no international dial code",
            severity: "soft",
            category: "phone",
            detail: `The number "${rawPhone}" doesn't start with a country code (+254, +44, etc.). Legitimate overseas recruiters always include the full international format.`,
            actionable: "Ask the recruiter to send their number with the full country code.",
        });
        return findings;
    }
    const countryInfo = COUNTRY_CODES[countryCode];
    // Country mismatch — e.g. "UK employer" but +254 number
    if (claimedCountry) {
        const claimed = claimedCountry.toLowerCase();
        const numberCountry = countryInfo.name.toLowerCase();
        // Fuzzy match — allow "UAE" ↔ "United Arab Emirates", "UK" ↔ "United Kingdom"
        const namesMatch = claimed === numberCountry ||
            numberCountry.includes(claimed) ||
            claimed.includes(numberCountry.split(" ")[0]) ||
            (claimed.match(/uk|britain/) && numberCountry.includes("united kingdom")) ||
            (claimed.match(/uae|emirates/) && numberCountry.includes("united arab")) ||
            (claimed.match(/usa|america/) && numberCountry.includes("usa"));
        if (!namesMatch) {
            findings.push({
                id: "phone_country_mismatch",
                label: "Phone country doesn't match the job's country",
                severity: "hard",
                category: "phone",
                detail: `The job is claimed to be in ${claimedCountry}, but the recruiter's phone (+${countryCode} = ${countryInfo.name}) is from a different country. Real employers use local numbers.`,
                actionable: `Ask the recruiter for their office landline in ${claimedCountry}, or verify the company's number from its official website.`,
            });
        }
    }
    // Kenya number claiming to be foreign employer
    if (countryCode === "254" && claimedCountry && !/kenya/i.test(claimedCountry)) {
        findings.push({
            id: "phone_kenya_number_foreign_employer",
            label: "Kenyan phone number for foreign job",
            severity: "hard",
            category: "phone",
            detail: `Recruiter uses a Kenyan (+254) number but claims the job is in ${claimedCountry}. Real foreign employers do not use Kenyan mobile numbers as their primary contact.`,
            actionable: "This is typical of Kenyan-based scam operations pretending to represent foreign employers. Verify the employer independently through its official website.",
        });
    }
    // VoIP hint
    for (const { pattern, reason } of KNOWN_VOIP_HINTS) {
        if (pattern.test(rawPhone)) {
            findings.push({
                id: "phone_voip_hint",
                label: "Phone number appears to be VoIP",
                severity: "soft",
                category: "phone",
                detail: `${reason}. VoIP alone isn't proof of a scam, but combined with other red flags it's a concern.`,
            });
            break;
        }
    }
    // Very short local part = likely fake or shortened
    if (localPart.length < 6) {
        findings.push({
            id: "phone_too_short",
            label: "Phone number is unusually short",
            severity: "soft",
            category: "phone",
            detail: `The number is only ${localPart.length} digits after the country code — real phone numbers are 7-11 digits.`,
        });
    }
    return findings;
}
// ═══════════════════════════════════════════════════════════════════════
// URL / WEBSITE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════
const SUSPICIOUS_TLDS = [
    ".tk", ".ml", ".ga", ".cf", // Free TLDs — heavily abused by scammers
    ".xyz", ".click", ".link", ".biz", // Cheap TLDs frequently used for throwaway sites
    ".online", ".site", ".website",
];
const LEGITIMATE_TLDS = [
    ".com", ".org", ".net", ".co.uk", ".ie", ".de", ".fr", ".es", ".it",
    ".nl", ".gov", ".edu", ".ac.uk", ".ae", ".sa", ".qa", ".om", ".kw",
    ".ca", ".au", ".nz", ".us", ".tr", ".pl", ".pt", ".lu", ".se", ".dk",
    ".fi", ".no", ".jp", ".kr", ".sg", ".my", ".bs", ".ke",
];
/** Domains scammers most often clone. Add more as they emerge. */
const HIGH_TARGET_BRANDS = [
    "britishcouncil", "linkedin", "indeed", "monster", "workabroadhub",
    "gulftalent", "bayt", "naukri", "reed", "workday",
];
function analyzeUrl(url, claimedEmployer) {
    const findings = [];
    if (!url)
        return findings;
    let parsed;
    try {
        const withProto = url.startsWith("http") ? url : `https://${url}`;
        parsed = new URL(withProto);
    }
    catch {
        findings.push({
            id: "url_invalid",
            label: "URL is malformed",
            severity: "soft",
            category: "url",
            detail: `Could not parse "${url}" as a valid URL. Real employer websites always use a valid URL structure.`,
        });
        return findings;
    }
    const host = parsed.hostname.toLowerCase();
    const originalUrl = url.trim();
    // HTTPS check
    if (originalUrl.startsWith("http://") && !originalUrl.startsWith("https://")) {
        findings.push({
            id: "url_no_https",
            label: "Website doesn't use HTTPS",
            severity: "soft",
            category: "url",
            detail: `The URL "${originalUrl}" uses HTTP not HTTPS. In 2026, every legitimate business website uses HTTPS.`,
        });
    }
    // Suspicious TLD
    for (const tld of SUSPICIOUS_TLDS) {
        if (host.endsWith(tld)) {
            findings.push({
                id: "url_suspicious_tld",
                label: `Domain uses a free/cheap TLD (${tld})`,
                severity: "hard",
                category: "url",
                detail: `The domain "${host}" ends in ${tld} — these TLDs are given away free or nearly free, and are heavily used by scammers because they can be replaced in minutes.`,
                actionable: "Legitimate overseas employers use .com, .co.uk, .ae, .ca, .de and other established TLDs. Verify by searching the company name independently.",
            });
            break;
        }
    }
    // Brand impersonation — cloned domain
    const rootDomain = host.split(".").slice(-2, -1)[0] ?? "";
    for (const brand of HIGH_TARGET_BRANDS) {
        if (rootDomain !== brand && rootDomain.includes(brand)) {
            // e.g. "linkedin-recruiter.com" vs "linkedin.com" — impersonation
            findings.push({
                id: "url_brand_impersonation",
                label: `Domain looks like an impersonation of "${brand}"`,
                severity: "hard",
                category: "url",
                detail: `The domain "${host}" contains "${brand}" but is not the real "${brand}.com" — classic phishing pattern.`,
                actionable: `Go to the REAL ${brand}.com and verify there. Never trust links sent by recruiters.`,
            });
            break;
        }
    }
    // Numbers/hyphens in domain (weak signal)
    if (/\d/.test(rootDomain) && rootDomain.length < 10) {
        findings.push({
            id: "url_numeric_domain",
            label: "Short numeric domain",
            severity: "soft",
            category: "url",
            detail: `The domain "${rootDomain}" mixes letters and numbers in a short pattern — often a throwaway domain.`,
        });
    }
    // Employer name match — if claimed employer doesn't appear in domain at all,
    // it doesn't mean it's fake (many companies use different brand names), but
    // it's worth noting.
    if (claimedEmployer) {
        const employerNormalized = claimedEmployer.toLowerCase().replace(/[^a-z]/g, "");
        if (employerNormalized.length > 3 && !rootDomain.includes(employerNormalized.slice(0, 4))) {
            findings.push({
                id: "url_employer_mismatch",
                label: "Website doesn't obviously belong to the claimed employer",
                severity: "info",
                category: "url",
                detail: `Employer name "${claimedEmployer}" doesn't appear in the domain "${host}". Could be a subsidiary or brand — but worth checking.`,
            });
        }
    }
    return findings;
}
// ═══════════════════════════════════════════════════════════════════════
// TEXT / CHAT PATTERN ANALYSIS (WhatsApp, email body, job ad)
// ═══════════════════════════════════════════════════════════════════════
/** Scam-specific phrases that go beyond the offer-letter fraud-patterns list. */
const CHAT_SCAM_PHRASES = [
    { p: "send your passport", severity: "hard", note: "Real employers never ask for your original passport before verification." },
    { p: "scan of your passport", severity: "soft", note: "Passport SCAN is normal at final stages, but never in the first messages." },
    { p: "telegram me", severity: "soft", note: "Legitimate overseas HR uses email and corporate channels — not Telegram-only." },
    { p: "add me on telegram", severity: "soft", note: "Same as above." },
    { p: "whatsapp only", severity: "soft", note: "WhatsApp-only recruitment is a strong scam pattern." },
    { p: "we don't do interviews", severity: "hard", note: "Every legitimate overseas job requires at least one interview." },
    { p: "start work in 3 days", severity: "soft", note: "Real work visas take weeks. Any promise of days-to-departure is fabrication." },
    { p: "no cv needed", severity: "hard", note: "Real employers always require a CV." },
    { p: "just send your details", severity: "soft", note: "Vague personal-info requests before a formal application = phishing pattern." },
    { p: "guaranteed job", severity: "hard", note: "Nothing about employment is guaranteed. This phrase alone is a scam tell." },
    { p: "airport pickup arranged", severity: "info", note: "Real employers may arrange this, but scammers use it to sound legitimate — verify everything else too." },
];
function analyzeText(fullText) {
    const findings = [];
    if (!fullText)
        return findings;
    const lower = fullText.toLowerCase();
    for (const { p, severity, note } of CHAT_SCAM_PHRASES) {
        if (lower.includes(p)) {
            findings.push({
                id: `chat_${p.replace(/[^a-z]/g, "_").slice(0, 40)}`,
                label: `Scam phrase: "${p}"`,
                severity,
                category: "text",
                detail: `The conversation contains "${p}". ${note}`,
            });
        }
    }
    // Excessive emoji in a "professional" message — soft signal
    const emojiCount = (fullText.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/gu) || []).length;
    if (emojiCount > 5 && /job|position|salary|visa/i.test(fullText)) {
        findings.push({
            id: "chat_emoji_heavy",
            label: "Unprofessional emoji-heavy messaging",
            severity: "soft",
            category: "text",
            detail: `The message contains ${emojiCount} emojis mixed with job/salary/visa language. Legitimate corporate HR emails almost never look like this.`,
        });
    }
    // Excessive capitalization = shouty scam energy
    const capsCount = (fullText.match(/\b[A-Z]{4,}\b/g) || []).length;
    if (capsCount > 4) {
        findings.push({
            id: "chat_shouty_caps",
            label: "Excessive ALL-CAPS words",
            severity: "soft",
            category: "text",
            detail: `Message contains ${capsCount} all-caps words. Real HR writes in normal case.`,
        });
    }
    return findings;
}
// ═══════════════════════════════════════════════════════════════════════
// EMAIL DOMAIN ANALYSIS (extra layer beyond fraud-patterns.ts)
// ═══════════════════════════════════════════════════════════════════════
const FREE_EMAIL_DOMAINS = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com",
    "outlook.com", "live.com", "aol.com", "icloud.com", "protonmail.com",
    "proton.me", "yandex.com", "mail.com", "zoho.com", "10minutemail.com",
    "guerrillamail.com", "mailinator.com", "tempmail.com",
]);
/** Common typo-domains scammers use to impersonate real corporations. */
function looksLikeTypoDomain(domain) {
    const common = {
        "gnail.com": "gmail.com",
        "gmial.com": "gmail.com",
        "microsooft.com": "microsoft.com",
        "microsofl.com": "microsoft.com",
        "gooogle.com": "google.com",
        "amaz0n.com": "amazon.com",
        "linkedln.com": "linkedin.com",
    };
    return common[domain] ?? null;
}
function analyzeEmail(email, claimedEmployer, companyWebsite) {
    const findings = [];
    if (!email)
        return findings;
    const clean = email.toLowerCase().trim();
    const domain = clean.split("@")[1] ?? "";
    if (!domain)
        return findings;
    if (FREE_EMAIL_DOMAINS.has(domain)) {
        findings.push({
            id: "email_free_domain",
            label: "Recruiter uses free email service",
            severity: "hard",
            category: "identity",
            detail: `The recruiter's email is on ${domain}. Legitimate overseas HR always uses corporate email (@companyname.com).`,
            actionable: "Ask the recruiter to email you from the company's corporate domain and cross-check that domain with the company's real website.",
        });
    }
    const typo = looksLikeTypoDomain(domain);
    if (typo) {
        findings.push({
            id: "email_typo_domain",
            label: `Email domain "${domain}" looks like a typo of "${typo}"`,
            severity: "hard",
            category: "identity",
            detail: "Classic impersonation pattern — the domain is nearly identical to a real service but slightly misspelled.",
            actionable: `Never reply. Go directly to the real ${typo} website to verify.`,
        });
    }
    if (companyWebsite && claimedEmployer) {
        const siteHost = extractHost(companyWebsite);
        const siteRoot = siteHost.split(".").slice(-2).join(".");
        if (siteRoot && !domain.endsWith(siteRoot) && !siteRoot.endsWith(domain.split(".")[0])) {
            findings.push({
                id: "email_website_mismatch",
                label: "Email domain doesn't match company website",
                severity: "soft",
                category: "identity",
                detail: `Recruiter's email (${domain}) doesn't match the company website (${siteHost}). Could be a subsidiary, could be a spoof.`,
            });
        }
    }
    return findings;
}
function extractHost(url) {
    try {
        const withProto = url.startsWith("http") ? url : `https://${url}`;
        return new URL(withProto).hostname.toLowerCase();
    }
    catch {
        return "";
    }
}
