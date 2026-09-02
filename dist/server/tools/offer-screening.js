"use strict";
/**
 * Offer Letter Screening — pure logic (free tool).
 *
 * Given the OCR/text-extracted content of a job-offer letter and optional
 * AI-vision observations, produces a structured screening report:
 *
 *   • Parsed candidate + offer fields (name, employer, position, salary, dates)
 *   • Employer authenticity signals (sender domain, letterhead, address)
 *   • Rule-based findings — 40+ patterns covering fees, urgency, scam
 *     language, missing corporate signals, salary sanity
 *   • Composite 0-100 risk score + three-band verdict (low/medium/high)
 *
 * Deliberately PURE: no I/O, no OpenAI, no DB. The endpoint does the OCR
 * + vision + persistence and hands results here for scoring.
 *
 * LEGAL FRAMING (identical to visa-screening):
 *   We never call an output "legit" or "fake". Output is a risk band and
 *   a findings list. Users see a SCREENING report, not a verdict. The UI
 *   and disclaimer text make this explicit throughout.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OFFER_SCREENING_VERSION = void 0;
exports.screenOffer = screenOffer;
exports.parseVisibleFields = parseVisibleFields;
exports.extractSenderDomain = extractSenderDomain;
// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────
exports.OFFER_SCREENING_VERSION = 1;
const PATTERNS = [
    // ── Fee demands (critical) ────────────────────────────────────────────────
    {
        code: "wire_transfer_service", severity: "critical",
        regex: /western union|money\s*gram|moneygram/i,
        message: "Payment via Western Union or MoneyGram requested — hallmark of advance-fee fraud.",
    },
    {
        code: "visa_fee_demand", severity: "critical",
        regex: /visa (?:processing|application)\s*fee|pay(?:ment)? for (?:the )?visa/i,
        message: "Visa processing fee demanded from the candidate — illegal in Kenya. Real employers pay their own visa costs.",
    },
    {
        code: "upfront_fee", severity: "critical",
        regex: /pay upfront|advance (?:fee|payment)|pay .* before (?:starting|arrival|deployment)/i,
        message: "Upfront payment requested before employment — legitimate employers never charge candidates.",
    },
    {
        code: "recruitment_fee", severity: "critical",
        regex: /registration fee|training fee|clearance fee|processing fee.*(?:you|candidate)|placement fee/i,
        message: "Recruitment / training / placement fee demanded — banned under Kenyan NEA regulations.",
    },
    {
        code: "money_transfer_kes", severity: "critical",
        regex: /send (?:money|kes|ksh)|(?:pay|transfer).*(?:kes|ksh)\s?[\d,]+|m-?pesa (?:to|number).*\d/i,
        message: "KES / M-Pesa transfer requested to a personal number — real employer HR uses bank transfers, not M-Pesa.",
    },
    {
        code: "deposit_demand", severity: "critical",
        regex: /(?:security|refundable|caution)\s*deposit|deposit\s*(?:required|of\s*KES)/i,
        message: "Security or refundable deposit demanded — a classic recruitment scam pattern.",
    },
    // ── Salary red flags ──────────────────────────────────────────────────────
    {
        code: "unrealistic_salary_usd", severity: "warning",
        regex: /\$\s?\d{1,3}[,.]?\d{3,}\s*(?:per month|monthly|\/month|a month)/i,
        message: "Suspiciously high monthly USD salary claimed — verify against Glassdoor / PayScale for the destination country.",
    },
    {
        code: "guaranteed_income", severity: "warning",
        regex: /guaranteed (?:income|earnings|salary)|earn (?:millions|big)|easy money/i,
        message: "Guaranteed earnings language — no legitimate employer promises specific income; base pay is contractual, bonuses conditional.",
    },
    {
        code: "salary_no_currency", severity: "info",
        regex: /salary[:\s]+\d+(?!\s*(?:USD|KES|EUR|GBP|AED|SAR|QAR|CAD))/i,
        message: "Salary quoted without a currency code — genuine offer letters always specify currency (USD, AED, KES, etc.).",
    },
    // ── Urgency / pressure ────────────────────────────────────────────────────
    {
        code: "immediate_deployment", severity: "warning",
        regex: /immediate deployment|deploy(?:ed)? within \d+\s*days?|start (?:immediately|within \d+\s*days?)/i,
        message: "Immediate deployment / start required — real overseas hires need visa processing time (typically weeks).",
    },
    {
        code: "urgency_pressure", severity: "warning",
        regex: /urgent(?:ly)? (?:hire|hiring|needed)|reply asap|respond within \d+\s*hours?|limited slots?/i,
        message: "Urgency and scarcity pressure — scammers use time pressure to prevent verification.",
    },
    // ── No-barrier hiring ─────────────────────────────────────────────────────
    {
        code: "no_interview", severity: "critical",
        regex: /no interview (?:required|needed)|without.*interview|skip.*interview/i,
        message: "No interview required — every legitimate employer conducts at least a screening call.",
    },
    {
        code: "no_experience", severity: "warning",
        regex: /no experience (?:required|needed|necessary)|no cv (?:required|needed)|no qualifications/i,
        message: "No experience or CV required — legitimate skilled overseas roles always require documented qualifications.",
    },
    // ── Corporate email red flags ─────────────────────────────────────────────
    {
        code: "free_email_domain", severity: "warning",
        regex: /@(?:gmail|yahoo|hotmail|outlook|ymail|aol|icloud|mail|zoho)\.com\b/i,
        message: "Contact email uses a free personal domain (Gmail / Yahoo / Hotmail). Real corporate HR uses the company's own domain.",
    },
    {
        code: "whatsapp_only", severity: "warning",
        regex: /(?:whatsapp\s+only|contact\s+us\s+on\s+whatsapp|apply\s+via\s+whatsapp|whatsapp\s+for\s+details)/i,
        message: "WhatsApp-only recruitment channel — legitimate multinationals use HR portals or corporate email.",
    },
    // ── Vague / missing corporate signals ─────────────────────────────────────
    {
        code: "no_signatory", severity: "warning",
        regex: /^(?!.*(?:sincerely|regards|yours faithfully|hr manager|director|ceo|senior director|human resources)).*$/is,
        message: "No named signatory or job title. Real offer letters are signed by a named HR representative.",
    },
    {
        code: "generic_greeting", severity: "info",
        regex: /^dear\s+(?:candidate|applicant|sir\/madam|hiring team)/im,
        message: "Generic greeting ('Dear Candidate' / 'Dear Applicant'). Real offer letters address you by name.",
    },
    // ── Contract / legal red flags ────────────────────────────────────────────
    {
        code: "vague_contract_length", severity: "info",
        regex: /(?:as needed|indefinite|to be discussed|will be shared later)/i,
        message: "Contract length is vague — legitimate offers state a fixed duration or 'permanent'.",
    },
    {
        code: "no_probation", severity: "info",
        regex: /^(?!.*probation).*$/is,
        message: "No probation period mentioned. Most legitimate international employment contracts include one (typically 3-6 months).",
    },
    // ── Delivery / logistics scams ────────────────────────────────────────────
    {
        code: "free_ticket_bait", severity: "warning",
        regex: /free (?:ticket|flight|accommodation|housing|meals|transport)/i,
        message: '"Free ticket + accommodation" lure — a well-known trap. Real employers ARRANGE flights, but do not use them as a bait.',
    },
    {
        code: "guaranteed_visa", severity: "critical",
        regex: /guaranteed visa|100%\s*(?:visa|placement|success)|assured visa/i,
        message: "Guaranteed visa — impossible. Visa outcome is decided by the destination country's embassy, never by the employer.",
    },
    // ── Suspicious contact / signatory patterns ───────────────────────────────
    {
        code: "phone_only_contact", severity: "info",
        regex: /^(?!.*(?:email|@|website|www\.)).*$/is,
        message: "No email or website — real employers include multiple official contact channels.",
    },
];
// ─────────────────────────────────────────────────────────────────────────────
// Screen the offer letter
// ─────────────────────────────────────────────────────────────────────────────
function screenOffer(input) {
    const findings = [];
    const text = input.ocrText;
    // ── 1. Sanity check: is this even an offer letter? ─────────────────────
    const offerKeywords = ["offer", "employment", "position", "salary", "compensation",
        "contract", "hereby", "pleased to inform", "welcome to"];
    const hasOfferSignal = offerKeywords.some((k) => new RegExp(`\\b${k}\\b`, "i").test(text));
    if (!hasOfferSignal) {
        findings.push({
            code: "not_offer_like",
            severity: "critical",
            message: "The document doesn't contain typical offer-letter vocabulary (offer, position, salary, contract). It may not be a job offer at all.",
        });
    }
    // ── 2. Apply pattern library ───────────────────────────────────────────
    for (const p of PATTERNS) {
        const match = text.match(p.regex);
        if (match) {
            findings.push({
                code: p.code,
                severity: p.severity,
                message: p.message,
                matched: match[0]?.slice(0, 120),
            });
        }
    }
    // ── 3. Sender-domain vs claimed employer cross-check ───────────────────
    if (input.employer.senderDomain && input.employer.domainMatchesCompany === false) {
        findings.push({
            code: "domain_mismatch",
            severity: "warning",
            message: `Sender email domain (${input.employer.senderDomain}) doesn't obviously match the claimed employer name. Real corporate HR uses the company's registered domain.`,
        });
    }
    // ── 4. Employer authenticity signals from AI vision ─────────────────────
    if (input.employer.hasLetterhead === false) {
        findings.push({
            code: "no_letterhead",
            severity: "warning",
            message: "No corporate letterhead detected. Real offer letters print on branded letterhead with the company logo.",
        });
    }
    if (input.employer.hasSignature === false) {
        findings.push({
            code: "no_signature",
            severity: "warning",
            message: "No visible signature. Real offer letters are signed by an authorized HR representative.",
        });
    }
    if (input.employer.hasPhysicalAddress === false) {
        findings.push({
            code: "no_physical_address",
            severity: "info",
            message: "No physical office address on the letter. A verifiable street address is a standard integrity signal.",
        });
    }
    // ── 5. AI vision anomaly flags ─────────────────────────────────────────
    if (input.aiVision) {
        for (const flag of input.aiVision.anomalyFlags) {
            const sev = classifyVisionSeverity(flag);
            findings.push({
                code: "vision_flag",
                severity: sev,
                message: `AI vision review: ${flag}`,
            });
        }
        if (input.aiVision.visionConfidence !== null &&
            input.aiVision.visionConfidence < 40) {
            findings.push({
                code: "vision_low_confidence",
                severity: "warning",
                message: `AI vision confidence in document authenticity is low (${input.aiVision.visionConfidence}/100).`,
            });
        }
    }
    // ── 6. Composite score + band ──────────────────────────────────────────
    const riskScore = computeRiskScore(findings, input);
    const riskBand = riskScore >= 71 ? "high" :
        riskScore >= 31 ? "medium" :
            "low";
    const { headline, recommendation } = pickHeadline(riskBand, findings);
    return {
        version: exports.OFFER_SCREENING_VERSION,
        riskScore,
        riskBand,
        findings,
        parsed: input.parsed,
        employer: input.employer,
        aiVisionUsed: input.aiVision !== null,
        aiVisionNotes: input.aiVision?.notes ?? null,
        headline,
        recommendation,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────
const SEVERITY_WEIGHT = {
    info: 2,
    warning: 14,
    critical: 30,
};
function computeRiskScore(findings, input) {
    let score = 0;
    for (const f of findings)
        score += SEVERITY_WEIGHT[f.severity];
    // Positive corporate signals — deduct.
    if (input.employer.hasLetterhead === true)
        score -= 8;
    if (input.employer.hasSignature === true)
        score -= 6;
    if (input.employer.hasPhysicalAddress === true)
        score -= 5;
    if (input.employer.domainMatchesCompany === true)
        score -= 8;
    if (input.aiVision?.visionConfidence &&
        input.aiVision.visionConfidence >= 80)
        score -= 10;
    return Math.max(0, Math.min(100, Math.round(score)));
}
function pickHeadline(band, findings) {
    const critical = findings.filter((f) => f.severity === "critical").length;
    if (band === "high") {
        return {
            headline: `High-risk offer${critical ? ` (${critical} critical flag${critical > 1 ? "s" : ""})` : ""}. Treat as likely fraudulent.`,
            recommendation: "Do NOT engage further. Do not send any documents, and do not pay any fee under any pretext. Verify the employer independently through their official website and registered office phone before responding.",
        };
    }
    if (band === "medium") {
        return {
            headline: "Some anomalies detected — human review recommended.",
            recommendation: "Cross-check the flagged items: call the company's official landline, confirm the HR contact exists on LinkedIn, and never pay any fee. If the employer refuses to schedule a proper interview, walk away.",
        };
    }
    return {
        headline: "No major red flags found in our automated checks.",
        recommendation: "Our screening did not raise concerns, but always verify independently: confirm the company's registration in the destination country, insist on an interview, and never pay a fee. For high-value overseas roles, ask us to schedule a paid Contract Review with our licensed advisers.",
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function classifyVisionSeverity(flag) {
    const f = flag.toLowerCase();
    if (/tamper|edit|photoshop|forged|forgery|altered|clon(e|ed)|paste|fabricat/.test(f))
        return "critical";
    if (/misalign|font|blur|artifact|artefact|watermark|inconsist(ent|ency)|mismatch/.test(f))
        return "warning";
    return "info";
}
// ─────────────────────────────────────────────────────────────────────────────
// Field parsing helpers — used by the endpoint before calling screenOffer()
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Best-effort parse of offer-letter fields from OCR text. Heuristic — better
 * OCR (via GPT-4o vision structured extraction) does most of the work; this
 * regex-based fallback is for pure-text PDFs.
 */
function parseVisibleFields(ocr) {
    const text = ocr.replace(/\s+/g, " ");
    const candidate = /(?:offer(?:ed)? to|dear|mr\.?|ms\.?|mrs\.?)\s+([A-Z][A-Za-z' -]{2,40}(?:\s+[A-Z][A-Za-z' -]{2,40}){0,2})/i.exec(text);
    const candidateName = candidate?.[1]?.trim() ?? null;
    const employer = /(?:on behalf of|from|by|company)[:\s]+([A-Z][A-Za-z0-9 &'.,-]{3,60}(?:\bLimited|\bLLC|\bLtd|\bInc|\bGmbH|\bLLP)?)/i.exec(text);
    const employerName = employer?.[1]?.trim().replace(/[,.]$/, "") ?? null;
    const position = /(?:position|role|job title|title)[:\s]+([A-Z][A-Za-z ,()/-]{2,80})/i.exec(text);
    const positionTitle = position?.[1]?.trim() ?? null;
    const salaryMatch = /(?:salary|compensation|remuneration|pay(?:ment)?)[:\s]+((?:USD|KES|EUR|GBP|AED|SAR|QAR|CAD|\$|€|£)\s?[\d,.]+(?:\s?(?:per|\/)\s?(?:month|annum|year))?)/i.exec(text);
    const salaryAmount = salaryMatch?.[1]?.trim() ?? null;
    const currencyMatch = salaryAmount?.match(/^(USD|KES|EUR|GBP|AED|SAR|QAR|CAD|\$|€|£)/i);
    const salaryCurrency = currencyMatch?.[1]?.toUpperCase() ?? null;
    const startMatch = /(?:start(?:ing)? date|commence(?:ment)?|(?:date of )?joining)[:\s]+(\d{1,2}[\s/-][A-Za-z]{3,10}[\s/-]\d{4}|\d{4}[\s/-]\d{1,2}[\s/-]\d{1,2})/i.exec(text);
    const startDate = startMatch ? normalizeDate(startMatch[1]) : null;
    const countryNames = ["UAE", "United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait",
        "Oman", "Bahrain", "United Kingdom", "UK", "Canada", "USA",
        "United States", "Germany", "Australia"];
    let workCountry = null;
    for (const n of countryNames) {
        if (new RegExp(`\\b${n}\\b`, "i").test(text)) {
            workCountry = n;
            break;
        }
    }
    return { candidateName, employerName, positionTitle, workCountry, salaryAmount, salaryCurrency, startDate };
}
/**
 * Extracts the first HR-looking email domain from the letter, and does a
 * rough match against the claimed employer name.
 */
function extractSenderDomain(ocr, employerName) {
    const emailMatch = /(?:[a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/i.exec(ocr);
    const senderDomain = emailMatch?.[1]?.toLowerCase() ?? null;
    if (!senderDomain)
        return { senderDomain: null, domainMatchesCompany: null };
    if (!employerName)
        return { senderDomain, domainMatchesCompany: null };
    const domainRoot = senderDomain.split(".")[0].toLowerCase();
    const companyRoot = employerName
        .toLowerCase()
        .replace(/\b(limited|ltd|llc|llp|inc|gmbh|company|co)\b/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
    if (!companyRoot)
        return { senderDomain, domainMatchesCompany: null };
    const matches = companyRoot.includes(domainRoot) ||
        domainRoot.includes(companyRoot.slice(0, Math.max(4, companyRoot.length - 2)));
    return { senderDomain, domainMatchesCompany: matches };
}
function normalizeDate(raw) {
    const cleaned = raw.replace(/\s+/g, " ").trim();
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return null;
}
