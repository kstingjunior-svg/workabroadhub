"use strict";
/**
 * analyzer.ts — AI Employment Offer Letter Verification engine.
 *
 * Tony's founder brief (2026-07):
 *   "The AI should behave like an experienced HR manager, immigration
 *   officer, labour inspector, and document forensic analyst. Never simply
 *   respond 'This letter is genuine.' Instead provide evidence and explain
 *   the reasoning."
 *
 * Pipeline:
 *   1. Vision extract every field (employer, salary, dates, benefits, contact info)
 *      + forensic observations + full document text.
 *   2. Match issuing country against the same country registry the visa
 *      verifier uses (server/visa-verify/countries.ts — reused).
 *   3. Run universal fraud pattern detectors (fraud-patterns.ts).
 *   4. Run salary realism check against country/occupation benchmarks
 *      (salary-benchmarks.ts).
 *   5. Compute 8 sub-scores: Company, Document, Salary, Contact, Country
 *      Compliance, Fraud Indicators, Recruitment Practices, Website Trust.
 *   6. Aggregate → overall trust + risk band + verdict copy.
 *   7. Assemble recommendations + country gov-links + scam matches.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeOffer = analyzeOffer;
const openai_1 = require("../lib/openai");
const countries_1 = require("../visa-verify/countries");
const fraud_patterns_1 = require("./fraud-patterns");
const salary_benchmarks_1 = require("./salary-benchmarks");
// ── Vision prompt ──────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior HR compliance officer with 15 years of experience verifying overseas employment offers. Your job is to extract every fact from the offer letter you are shown and note forensic observations — never to guess authenticity.

You will be shown an employment offer letter document. Your job:
1. EXTRACT every field present.
2. OBSERVE forensic properties (letterhead quality, signature presence, formatting consistency).
3. RETURN a strict JSON object.

Return ONLY valid JSON in this shape (no markdown, no code fences):

{
  "employerName": string | null,
  "companyRegistrationNumber": string | null,
  "companyAddress": string | null,
  "country": "United Arab Emirates" | "Canada" | "United Kingdom" | ... | null,
  "jobTitle": string | null,
  "salaryText": string | null,
  "salaryMonthly": number | null,
  "currency": "AED" | "USD" | "GBP" | ... | null,
  "workingHours": string | null,
  "benefits": [string],
  "accommodation": string | null,
  "medicalInsurance": string | null,
  "visaSponsorship": string | null,
  "probationPeriod": string | null,
  "contractDuration": string | null,
  "leaveDays": string | null,
  "reportingManager": string | null,
  "startDate": "YYYY-MM-DD" | null,
  "workLocation": string | null,
  "recruitmentAgency": string | null,
  "recruiterName": string | null,
  "recruiterEmail": string | null,
  "recruiterPhone": string | null,
  "companyWebsite": string | null,
  "hasSignature": boolean,
  "hasStamp": boolean,
  "hasLetterhead": boolean,
  "dateIssued": "YYYY-MM-DD" | null,
  "referenceNumber": string | null,
  "fullText": string,
  "layoutScore": 0-100,
  "documentAuthenticityScore": 0-100,
  "forgeryIndicators": [string],
  "positiveIndicators": [string],
  "confidence": 0-100
}

Rules:
- Unknown fields → null. NEVER guess.
- salaryMonthly: convert stated pay to MONTHLY figure in local currency. If letter says "$60,000 annual", set salaryMonthly=5000 and currency="USD". If unclear, leave null.
- fullText: extract EVERY word of visible text (used for scam-phrase scanning downstream). Keep line breaks.
- benefits: only list items explicitly stated.
- forgeryIndicators: only include things you actually observed (font mismatch, misaligned baseline, copy-paste artifact, low-res logo, spelling errors that suggest a template not authored by native English HR, etc). Empty is fine.
- positiveIndicators: what specifically looks legitimate (crisp corporate letterhead, matching signature block, professional English, reasonable specificity).
- confidence: how sure you are of your own reading (0 = illegible, 100 = crystal clear).`;
// ── Main entrypoint ────────────────────────────────────────────────────
async function analyzeOffer(imageBase64DataUrl) {
    let vision;
    try {
        const completion = await openai_1.openai.chat.completions.create({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 2200,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Analyze this employment offer letter. Return the JSON only." },
                        { type: "image_url", image_url: { url: imageBase64DataUrl, detail: "high" } },
                    ],
                },
            ],
        });
        const raw = completion.choices[0]?.message?.content ?? "{}";
        vision = JSON.parse(raw);
    }
    catch (err) {
        console.error("[offer-analyzer] Vision call failed:", err?.message);
        return {
            ok: false,
            error: "vision_failed",
            message: mapVisionError(err?.message ?? ""),
        };
    }
    // Map vision output to structured fields
    const fields = {
        employerName: str(vision.employerName),
        companyRegistrationNumber: str(vision.companyRegistrationNumber),
        companyAddress: str(vision.companyAddress),
        country: str(vision.country),
        jobTitle: str(vision.jobTitle),
        salaryText: str(vision.salaryText),
        salaryMonthly: num(vision.salaryMonthly),
        currency: str(vision.currency),
        workingHours: str(vision.workingHours),
        benefits: arr(vision.benefits),
        accommodation: str(vision.accommodation),
        medicalInsurance: str(vision.medicalInsurance),
        visaSponsorship: str(vision.visaSponsorship),
        probationPeriod: str(vision.probationPeriod),
        contractDuration: str(vision.contractDuration),
        leaveDays: str(vision.leaveDays),
        reportingManager: str(vision.reportingManager),
        startDate: str(vision.startDate),
        workLocation: str(vision.workLocation),
        recruitmentAgency: str(vision.recruitmentAgency),
        recruiterName: str(vision.recruiterName),
        recruiterEmail: str(vision.recruiterEmail),
        recruiterPhone: str(vision.recruiterPhone),
        companyWebsite: str(vision.companyWebsite),
        hasSignature: bool(vision.hasSignature),
        hasStamp: bool(vision.hasStamp),
        hasLetterhead: bool(vision.hasLetterhead),
        dateIssued: str(vision.dateIssued),
        referenceNumber: str(vision.referenceNumber),
        fullText: str(vision.fullText),
    };
    // Country match
    const country = (0, countries_1.findCountry)(fields.country);
    // Fraud pattern detection
    const findings = (0, fraud_patterns_1.detectFraudPatterns)(fields);
    // Salary realism check
    const salaryAssessment = assessSalary(fields, country);
    if (salaryAssessment.band === "too_high") {
        findings.push({
            id: "salary_too_high",
            label: "Salary is unrealistically high",
            severity: "hard",
            detail: salaryAssessment.explanation,
            actionable: "Verify by cross-checking the country's typical salary range for this role via the destination country's labour ministry.",
        });
    }
    else if (salaryAssessment.band === "above_range") {
        findings.push({
            id: "salary_above_range",
            label: "Salary is above the normal range",
            severity: "soft",
            detail: salaryAssessment.explanation,
            actionable: "Ask the employer to clarify how the salary is structured (basic + allowances + overtime).",
        });
    }
    else if (salaryAssessment.band === "below_range") {
        findings.push({
            id: "salary_below_range",
            label: "Salary is below the country's minimum wage / market range",
            severity: "hard",
            detail: salaryAssessment.explanation,
            actionable: "This may indicate exploitation. Do not accept without verifying with the destination country's labour authority.",
        });
    }
    else if (salaryAssessment.band === "in_range") {
        findings.push({
            id: "salary_in_range",
            label: "Salary matches expected market range",
            severity: "info",
            detail: salaryAssessment.explanation,
        });
    }
    // Sub-scores
    const docScore = clamp0100(vision.documentAuthenticityScore);
    const layoutScore = clamp0100(vision.layoutScore);
    const ocrScore = clamp0100(vision.confidence);
    const fraudScore = scoreFraud(findings);
    const salaryScore = salaryScoreFromAssessment(salaryAssessment);
    const contactScore = scoreContactInfo(fields);
    const companyScore = scoreCompanyIdentity(fields);
    const recruitmentScore = scoreRecruitment(fields, findings);
    const countryScore = country ? 100 : 40; // Unknown country = uncertain
    const websiteScore = fields.companyWebsite ? 80 : 45;
    const subScores = [
        { key: "company", label: "Company Identity", score: companyScore, detail: describeCompany(fields, companyScore) },
        { key: "document", label: "Document Authenticity", score: docScore, detail: describeDocument(docScore, fields) },
        { key: "salary", label: "Salary Realism", score: salaryScore, detail: salaryAssessment.explanation },
        { key: "contact", label: "Contact Information", score: contactScore, detail: describeContact(fields, contactScore) },
        { key: "country", label: "Country Compliance", score: countryScore, detail: describeCountry(country) },
        { key: "fraud", label: "Fraud Indicators", score: fraudScore, detail: describeFraud(fraudScore, findings.length) },
        { key: "recruitment", label: "Recruitment Practices", score: recruitmentScore, detail: describeRecruitment(fields, recruitmentScore) },
        { key: "website", label: "Website Trust", score: websiteScore, detail: fields.companyWebsite ? `Website provided: ${fields.companyWebsite}` : "No company website provided in the letter." },
    ];
    // Overall weighted trust
    const overallTrust = Math.round(companyScore * 0.14 +
        docScore * 0.12 +
        salaryScore * 0.14 +
        contactScore * 0.10 +
        countryScore * 0.10 +
        fraudScore * 0.22 +
        recruitmentScore * 0.10 +
        websiteScore * 0.08);
    const confidence = ocrScore;
    const { riskBand, verdict, headline, explanation } = deriveVerdict(overallTrust, findings, country, fields);
    const recommendations = buildRecommendations(country, fields, findings, salaryAssessment);
    const scamPatternsMatched = country?.knownScamPatterns?.slice() ?? [];
    return {
        ok: true,
        overallTrust,
        confidence,
        riskBand,
        verdict,
        headline,
        explanation,
        extractedFields: fields,
        country,
        subScores,
        findings,
        salaryAssessment,
        positiveIndicators: arr(vision.positiveIndicators),
        negativeIndicators: arr(vision.forgeryIndicators),
        recommendations,
        scamPatternsMatched,
    };
}
// ── Salary assessment ─────────────────────────────────────────────────
function assessSalary(fields, country) {
    const empty = {
        detected: false,
        occupationKey: null,
        occupationLabel: null,
        offeredMonthly: null,
        currency: null,
        expectedMonthlyMin: null,
        expectedMonthlyMax: null,
        band: "unknown",
        explanation: "Salary or occupation could not be determined — cannot benchmark.",
    };
    if (!country)
        return { ...empty, explanation: "Country unknown — cannot benchmark salary." };
    if (!fields.salaryMonthly || !fields.jobTitle)
        return empty;
    const table = (0, salary_benchmarks_1.getSalaryTable)(country.code);
    if (!table)
        return { ...empty, explanation: `No salary benchmarks available for ${country.name} yet.` };
    const occupation = (0, salary_benchmarks_1.classifyJobTitle)(fields.jobTitle);
    if (!occupation) {
        return {
            ...empty,
            occupationKey: null,
            occupationLabel: null,
            offeredMonthly: fields.salaryMonthly,
            currency: fields.currency ?? null,
            explanation: `Job title "${fields.jobTitle}" doesn't map to a benchmarked occupation.`,
        };
    }
    const band = table.bands.find((b) => b.occupationKey === occupation);
    if (!band)
        return { ...empty, explanation: `No ${country.name} benchmark for occupation "${occupation}".` };
    const offered = fields.salaryMonthly;
    const min = band.localMonthlyMin;
    const max = band.localMonthlyMax;
    let category;
    let explanation;
    if (offered < min * 0.6) {
        category = "below_range";
        explanation = `Offered ${offered.toLocaleString()} ${band.currency}/mo is far below the typical ${band.label} range in ${country.name} (${min.toLocaleString()}–${max.toLocaleString()} ${band.currency}). This may indicate wage exploitation.${band.note ? " " + band.note : ""}`;
    }
    else if (offered < min) {
        category = "below_range";
        explanation = `Offered ${offered.toLocaleString()} ${band.currency}/mo is slightly below the typical ${band.label} range in ${country.name} (${min.toLocaleString()}–${max.toLocaleString()} ${band.currency}).`;
    }
    else if (offered <= max) {
        category = "in_range";
        explanation = `Offered ${offered.toLocaleString()} ${band.currency}/mo fits within the typical range for ${band.label} in ${country.name} (${min.toLocaleString()}–${max.toLocaleString()} ${band.currency}). Consistent with a legitimate offer.`;
    }
    else if (offered <= max * 1.5) {
        category = "above_range";
        explanation = `Offered ${offered.toLocaleString()} ${band.currency}/mo is above the typical range (${min.toLocaleString()}–${max.toLocaleString()} ${band.currency}) but not impossibly so. Verify the pay breakdown.`;
    }
    else {
        category = "too_high";
        explanation = `Offered ${offered.toLocaleString()} ${band.currency}/mo is dramatically higher than the typical ${band.label} pay in ${country.name} (${min.toLocaleString()}–${max.toLocaleString()} ${band.currency}). This is a classic "too-good-to-be-true" scam indicator.`;
    }
    return {
        detected: true,
        occupationKey: occupation,
        occupationLabel: band.label,
        offeredMonthly: offered,
        currency: band.currency,
        expectedMonthlyMin: min,
        expectedMonthlyMax: max,
        band: category,
        explanation,
    };
}
// ── Scoring helpers ───────────────────────────────────────────────────
function scoreFraud(findings) {
    let s = 100;
    for (const f of findings) {
        if (f.severity === "hard")
            s -= 25;
        else if (f.severity === "soft")
            s -= 10;
    }
    return Math.max(0, s);
}
function salaryScoreFromAssessment(a) {
    switch (a.band) {
        case "in_range": return 100;
        case "above_range": return 60;
        case "below_range": return 30;
        case "too_high": return 15;
        case "unknown": return 55;
    }
}
function scoreContactInfo(f) {
    let s = 20;
    if (f.recruiterEmail)
        s += 25;
    if (f.recruiterPhone)
        s += 15;
    if (f.recruiterName)
        s += 15;
    if (f.companyWebsite)
        s += 15;
    if (f.companyAddress)
        s += 10;
    return Math.min(100, s);
}
function scoreCompanyIdentity(f) {
    let s = 10;
    if (f.employerName)
        s += 30;
    if (f.companyRegistrationNumber)
        s += 25;
    if (f.companyAddress)
        s += 20;
    if (f.companyWebsite)
        s += 15;
    return Math.min(100, s);
}
function scoreRecruitment(f, findings) {
    let s = 80;
    if (findings.some((x) => x.id === "personal_payment_account"))
        s -= 40;
    if (findings.some((x) => x.id === "upfront_fee_requested"))
        s -= 40;
    if (findings.some((x) => x.id === "pressure_tactics"))
        s -= 15;
    if (f.recruitmentAgency)
        s += 10;
    return Math.max(0, Math.min(100, s));
}
// ── Verdict derivation ───────────────────────────────────────────────
function deriveVerdict(overall, findings, country, fields) {
    const hardFails = findings.filter((f) => f.severity === "hard").length;
    const softFails = findings.filter((f) => f.severity === "soft").length;
    const employer = fields.employerName || "the employer";
    const countryName = country?.name || "the destination country";
    if (hardFails >= 2 || overall < 40) {
        return {
            riskBand: "critical",
            verdict: "high_risk",
            headline: `⚠️ Multiple serious fraud indicators — do NOT act on this offer without official ${countryName} verification.`,
            explanation: `Our review found ${hardFails} critical issue${hardFails === 1 ? "" : "s"} that match known overseas employment scam patterns. This alone doesn't prove the offer is fake, but the pattern is unmistakable. Do not send money, share your passport, or resign your current job until you have independently verified ${employer} through official ${countryName} channels below.`,
        };
    }
    if (hardFails >= 1 || overall < 65) {
        return {
            riskBand: "high",
            verdict: "suspicious",
            headline: `Serious concerns about this offer — verify everything before proceeding.`,
            explanation: `We identified ${hardFails + softFails} inconsistency${(hardFails + softFails) === 1 ? "" : "ies"} with what a legitimate ${countryName} employer typically provides. Some may be legitimate quirks, but at least one is a strong fraud indicator. Please verify with the ${countryName} authorities below before making any decisions.`,
        };
    }
    if (softFails >= 3 || overall < 80) {
        return {
            riskBand: "medium",
            verdict: "verify_first",
            headline: `The offer looks generally consistent, but should be verified officially before you commit.`,
            explanation: `Nothing about this offer is a major red flag, and most standard fields are in place. However, ${softFails} soft concern${softFails === 1 ? "" : "s"} were noted, and appearance alone can't confirm legitimacy — always verify the employer directly and the country's work-permit process.`,
        };
    }
    return {
        riskBand: "low",
        verdict: "trustworthy",
        headline: `This offer appears well-structured and consistent with a legitimate ${countryName} employer.`,
        explanation: `Our checks found no significant inconsistencies. The employer identification, salary, contact info, and document structure all look right. We still recommend a final official verification — no one should ever quit a job or send money based on visual review alone.`,
    };
}
// ── Recommendations builder ──────────────────────────────────────────
function buildRecommendations(country, fields, findings, salary) {
    const recs = [];
    if (fields.employerName && country?.links.employerCheck) {
        recs.push(`Verify "${fields.employerName}" against ${country.name}'s official employer registry: ${country.links.employerCheck}`);
    }
    if (country?.links.recruitmentCheck) {
        recs.push(`Confirm any recruitment agency involved is licensed via ${country.name}'s recruitment authority: ${country.links.recruitmentCheck}`);
    }
    if (country?.links.workPermitChecker) {
        recs.push(`Check the country's work-permit requirements at ${country.links.workPermitChecker} — a real employer must have started the permit process before you travel.`);
    }
    if (findings.some((f) => f.severity === "hard")) {
        recs.push("Do NOT send any money, share your original passport, or resign your current job until you have independently verified the employer.");
    }
    if (fields.companyWebsite) {
        recs.push(`Google "${fields.employerName || "the company"}" independently. Verify the website URL matches what the letter shows and the address on the letter matches the address on the website.`);
    }
    else {
        recs.push(`Google the company name + city — verify a real corporate website + LinkedIn page exist.`);
    }
    if (fields.recruiterEmail) {
        const domain = fields.recruiterEmail.split("@")[1] ?? "";
        if (domain) {
            recs.push(`Email the company's HR through their WEBSITE contact page (not the sender's email) and ask them to confirm the recruiter is a real employee.`);
        }
    }
    if (country?.contacts.embassyPhone) {
        recs.push(`For final confirmation, contact the ${country.name} embassy in Nairobi: ${country.contacts.embassyPhone}${country.contacts.embassyEmail ? ` / ${country.contacts.embassyEmail}` : ""}`);
    }
    if (salary.band === "too_high" || salary.band === "above_range") {
        recs.push(`The offered salary is above normal — request a full pay breakdown (basic + housing + transport + medical) in writing before accepting.`);
    }
    recs.push("Register the offer with Kenya's National Employment Authority (NEA) at neaims.nea.go.ke before travel — this is a legal requirement + your best proof if things go wrong.");
    recs.push("Kenya MFA overseas jobs desk: https://www.mfa.go.ke/");
    return recs;
}
// ── Sub-score descriptions ───────────────────────────────────────────
function describeCompany(f, s) {
    const bits = [];
    if (f.employerName)
        bits.push("name");
    if (f.companyRegistrationNumber)
        bits.push("registration number");
    if (f.companyAddress)
        bits.push("address");
    if (f.companyWebsite)
        bits.push("website");
    return bits.length
        ? `Employer identity fields present: ${bits.join(", ")}.`
        : "No employer identity fields were clearly stated.";
}
function describeDocument(s, f) {
    const authBits = [];
    if (f.hasLetterhead)
        authBits.push("letterhead");
    if (f.hasSignature)
        authBits.push("signature");
    if (f.hasStamp)
        authBits.push("stamp");
    return `Authenticity elements: ${authBits.length ? authBits.join(" + ") : "none detected"}.`;
}
function describeContact(f, s) {
    const bits = [];
    if (f.recruiterEmail)
        bits.push("email");
    if (f.recruiterPhone)
        bits.push("phone");
    if (f.recruiterName)
        bits.push("recruiter name");
    return bits.length
        ? `Contact info present: ${bits.join(", ")}.`
        : "No recruiter contact information detected.";
}
function describeCountry(c) {
    return c
        ? `${c.name} identified as the destination — country-specific compliance rules applied.`
        : "Destination country could not be identified — country-specific compliance not applied.";
}
function describeFraud(score, findingsCount) {
    if (findingsCount === 0)
        return "No fraud pattern matches — clean.";
    return `${findingsCount} finding(s) contributing to fraud score. See detail below.`;
}
function describeRecruitment(f, s) {
    return f.recruitmentAgency
        ? `Recruitment via "${f.recruitmentAgency}" — verify the agency is licensed with the destination country's labour authority.`
        : "No recruitment agency named — direct-employer offer or agency not disclosed.";
}
// ── Helpers ────────────────────────────────────────────────────────────
function str(v) {
    if (v === null || v === undefined)
        return null;
    const s = String(v).trim();
    return s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "unknown" ? null : s;
}
function num(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}
function bool(v) {
    return v === true || v === "true" || v === 1;
}
function arr(v) {
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim().length > 0).map(String) : [];
}
function clamp0100(v) {
    const n = Number(v);
    if (!Number.isFinite(n))
        return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}
function mapVisionError(msg) {
    const lower = msg.toLowerCase();
    if (lower.includes("quota") || lower.includes("insufficient_quota")) {
        return "Our verification AI is temporarily out of capacity. Please try again in a few minutes — no charge for this attempt.";
    }
    if (lower.includes("rate limit") || lower.includes("429")) {
        return "Our verification AI is handling many requests right now. Please try again in a few minutes.";
    }
    if (lower.includes("timeout") || lower.includes("timed out")) {
        return "The verification took longer than expected. Please try again with a smaller or clearer image.";
    }
    return "We couldn't complete verification for this document. Please try again with a clearer photo or scan.";
}
