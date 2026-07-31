"use strict";
/**
 * analyzer.ts — the Job Scam Checker engine.
 *
 * Tony's founder brief (2026-07): "The AI should investigate overseas job
 * opportunities, recruitment agencies, employers, contracts, emails,
 * WhatsApp chats, social media profiles, payment requests, and supporting
 * documents to determine the likelihood of fraud. Never simply answer
 * 'This job is genuine.' Instead explain WHY."
 *
 * Accepts MULTI-INPUT:
 *   - text: pasted WhatsApp chat, email body, job ad copy, or all three
 *   - image: optional screenshot / offer letter / contract
 *
 * Both are analyzed together. Text alone is enough for a real assessment
 * (unlike the visa / IELTS / offer verifiers which require an image).
 *
 * Pipeline:
 *   1. If image present → GPT-4o vision extracts fields + observations.
 *      If text present  → structured prompt extracts fields from raw text.
 *      Merge both.
 *   2. Match to country registry (reuses server/visa-verify/countries.ts).
 *   3. Salary benchmark (reuses server/offer-verify/salary-benchmarks.ts).
 *   4. Run universal fraud patterns + scam-check-specific detectors.
 *   5. Compute 10 sub-scores.
 *   6. Aggregate → overall trust + verdict.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeScam = analyzeScam;
const openai_1 = require("../lib/openai");
const countries_1 = require("../visa-verify/countries");
const salary_benchmarks_1 = require("../offer-verify/salary-benchmarks");
const fraud_patterns_1 = require("../offer-verify/fraud-patterns");
const detectors_1 = require("./detectors");
// ── Prompts ────────────────────────────────────────────────────────────
const VISION_SYSTEM = `You are a fraud investigator examining evidence of a possible overseas-employment scam. Given a screenshot of a WhatsApp chat, email, job ad, contract, or receipt, extract every fact and note forensic observations.

Return ONLY valid JSON (no markdown, no code fences):

{
  "employerName": string | null,
  "country": string | null,
  "jobTitle": string | null,
  "salaryText": string | null,
  "salaryMonthly": number | null,
  "currency": string | null,
  "recruiterName": string | null,
  "recruiterEmail": string | null,
  "recruiterPhone": string | null,
  "companyWebsite": string | null,
  "companyAddress": string | null,
  "recruitmentAgency": string | null,
  "hasSignature": boolean,
  "hasStamp": boolean,
  "hasLetterhead": boolean,
  "fullText": string,
  "imageObserved": string,
  "forgeryIndicators": [string],
  "positiveIndicators": [string],
  "confidence": 0-100
}

Rules:
- fullText: extract EVERY word visible in the image, preserving order + newlines.
- imageObserved: one-line description of what type of evidence this is ("WhatsApp chat with recruiter", "offer letter PDF screenshot", "email body", etc).
- salaryMonthly: convert to MONTHLY figure in local currency if stated. If unclear, null.
- forgeryIndicators + positiveIndicators: only real observations, empty arrays are fine.
- Unknown fields → null. NEVER guess.`;
const TEXT_SYSTEM = `You are a fraud investigator examining a text-only piece of evidence (WhatsApp chat pasted, email body, job ad copy, etc). Extract every fact you can from the text.

Return ONLY valid JSON (no markdown, no code fences):

{
  "employerName": string | null,
  "country": string | null,
  "jobTitle": string | null,
  "salaryText": string | null,
  "salaryMonthly": number | null,
  "currency": string | null,
  "recruiterName": string | null,
  "recruiterEmail": string | null,
  "recruiterPhone": string | null,
  "companyWebsite": string | null,
  "companyAddress": string | null,
  "recruitmentAgency": string | null,
  "fullText": string,
  "confidence": 0-100
}

Rules:
- fullText: return the input verbatim.
- Unknown → null.
- confidence: how sure you are the text contains a real job offer / recruitment message vs. gibberish.`;
// ── Main entrypoint ────────────────────────────────────────────────────
async function analyzeScam(input) {
    if (!input.text?.trim() && !input.imageDataUrl) {
        return {
            ok: false,
            error: "no_input",
            message: "Please provide at least the chat/email text OR a screenshot to analyze.",
        };
    }
    let vision = {};
    try {
        if (input.imageDataUrl) {
            const messages = [
                { role: "system", content: VISION_SYSTEM },
                {
                    role: "user",
                    content: [
                        { type: "text", text: input.text
                                ? `Analyze this evidence. Also consider this pasted text alongside the image:\n\n${input.text.slice(0, 3000)}`
                                : "Analyze this evidence." },
                        { type: "image_url", image_url: { url: input.imageDataUrl, detail: "high" } },
                    ],
                },
            ];
            const completion = await openai_1.openai.chat.completions.create({
                model: "gpt-4o",
                response_format: { type: "json_object" },
                temperature: 0.1,
                max_tokens: 2000,
                messages,
            });
            vision = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
        }
        else if (input.text) {
            const completion = await openai_1.openai.chat.completions.create({
                model: "gpt-4o-mini", // text-only is fine on mini
                response_format: { type: "json_object" },
                temperature: 0.1,
                max_tokens: 1200,
                messages: [
                    { role: "system", content: TEXT_SYSTEM },
                    { role: "user", content: input.text.slice(0, 8000) },
                ],
            });
            vision = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
            vision.imageObserved = "text-only input";
        }
    }
    catch (err) {
        console.error("[scam-analyzer] AI call failed:", err?.message);
        return {
            ok: false,
            error: "ai_failed",
            message: mapAiError(err?.message ?? ""),
        };
    }
    const fields = {
        employerName: str(vision.employerName),
        companyRegistrationNumber: null,
        companyAddress: str(vision.companyAddress),
        country: str(vision.country),
        jobTitle: str(vision.jobTitle),
        salaryText: str(vision.salaryText),
        salaryMonthly: num(vision.salaryMonthly),
        currency: str(vision.currency),
        workingHours: null,
        benefits: [],
        accommodation: null,
        medicalInsurance: null,
        visaSponsorship: null,
        probationPeriod: null,
        contractDuration: null,
        leaveDays: null,
        reportingManager: null,
        startDate: null,
        workLocation: null,
        recruitmentAgency: str(vision.recruitmentAgency),
        recruiterName: str(vision.recruiterName),
        recruiterEmail: str(vision.recruiterEmail),
        recruiterPhone: str(vision.recruiterPhone),
        companyWebsite: str(vision.companyWebsite),
        hasSignature: bool(vision.hasSignature),
        hasStamp: bool(vision.hasStamp),
        hasLetterhead: bool(vision.hasLetterhead),
        dateIssued: null,
        referenceNumber: null,
        fullText: str(vision.fullText) ?? input.text ?? null,
        imageObserved: str(vision.imageObserved),
    };
    const country = (0, countries_1.findCountry)(fields.country);
    // Run every detector
    const findings = [];
    // 1. Universal fraud patterns (reused from offer-letter engine)
    const offerFraud = (0, fraud_patterns_1.detectFraudPatterns)(fields);
    for (const f of offerFraud) {
        findings.push({
            id: f.id,
            label: f.label,
            severity: f.severity,
            category: inferCategory(f.id),
            detail: f.detail,
            actionable: f.actionable,
        });
    }
    // 2. Scam-check text patterns
    if (fields.fullText)
        findings.push(...(0, detectors_1.analyzeText)(fields.fullText));
    // 3. Phone number analysis
    if (fields.recruiterPhone)
        findings.push(...(0, detectors_1.analyzePhone)(fields.recruiterPhone, fields.country ?? null));
    // 4. URL / website analysis
    if (fields.companyWebsite)
        findings.push(...(0, detectors_1.analyzeUrl)(fields.companyWebsite, fields.employerName));
    // 5. Email analysis (scam-check version)
    if (fields.recruiterEmail)
        findings.push(...(0, detectors_1.analyzeEmail)(fields.recruiterEmail, fields.employerName, fields.companyWebsite));
    // 6. Salary check
    const salaryCheck = benchmarkSalary(fields, country);
    if (salaryCheck)
        findings.push(salaryCheck);
    // Deduplicate findings by id (some detectors may overlap with fraud-patterns)
    const seen = new Set();
    const dedupedFindings = findings.filter((f) => {
        if (seen.has(f.id))
            return false;
        seen.add(f.id);
        return true;
    });
    // Sub-scores
    const employerScore = scoreEmployer(fields);
    const agencyScore = scoreAgency(fields, dedupedFindings);
    const websiteScore = scoreWebsite(fields, dedupedFindings);
    const documentScore = scoreDocument(fields, dedupedFindings);
    const recruitmentScore = scoreRecruitment(dedupedFindings);
    const salaryScore = scoreSalary(dedupedFindings);
    const paymentScore = scorePayment(dedupedFindings);
    const countryScore = country ? 100 : 40;
    const fraudScore = scoreFraud(dedupedFindings);
    const commScore = scoreCommunication(dedupedFindings);
    const subScores = [
        { key: "employer", label: "Employer Verification", score: employerScore, detail: describeEmployer(fields) },
        { key: "agency", label: "Agency Verification", score: agencyScore, detail: describeAgency(fields) },
        { key: "website", label: "Website Trust", score: websiteScore, detail: fields.companyWebsite ? `Website: ${fields.companyWebsite}` : "No website provided." },
        { key: "document", label: "Document Integrity", score: documentScore, detail: describeDoc(fields) },
        { key: "recruitment", label: "Recruitment Process", score: recruitmentScore, detail: describeProcess(dedupedFindings) },
        { key: "salary", label: "Salary Analysis", score: salaryScore, detail: describeSalary(fields, country) },
        { key: "payment", label: "Payment Risk", score: paymentScore, detail: describePayment(dedupedFindings) },
        { key: "country", label: "Country Compliance", score: countryScore, detail: country ? `${country.name} rules applied.` : "Country not identified." },
        { key: "fraud", label: "Fraud Indicators (absent)", score: fraudScore, detail: describeFraud(dedupedFindings) },
        { key: "comm", label: "Communication Analysis", score: commScore, detail: describeComm(dedupedFindings) },
    ];
    const overallTrust = Math.round(employerScore * 0.12 +
        agencyScore * 0.08 +
        websiteScore * 0.08 +
        documentScore * 0.08 +
        recruitmentScore * 0.10 +
        salaryScore * 0.10 +
        paymentScore * 0.18 +
        countryScore * 0.06 +
        fraudScore * 0.14 +
        commScore * 0.06);
    const confidence = clamp0100(vision.confidence ?? 70);
    const { riskBand, verdict, headline, explanation } = deriveVerdict(overallTrust, dedupedFindings, country, fields);
    const recommendations = buildRecommendations(country, fields, dedupedFindings);
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
        findings: dedupedFindings,
        positiveIndicators: arr(vision.positiveIndicators),
        recommendations,
        scamPatternsMatched,
    };
}
// ── Salary check ──────────────────────────────────────────────────────
function benchmarkSalary(fields, country) {
    if (!country || !fields.salaryMonthly || !fields.jobTitle)
        return null;
    const table = (0, salary_benchmarks_1.getSalaryTable)(country.code);
    if (!table)
        return null;
    const occ = (0, salary_benchmarks_1.classifyJobTitle)(fields.jobTitle);
    if (!occ)
        return null;
    const band = table.bands.find((b) => b.occupationKey === occ);
    if (!band)
        return null;
    const offered = fields.salaryMonthly;
    if (offered > band.localMonthlyMax * 1.5) {
        return {
            id: "salary_too_high",
            label: "Salary is unrealistically high",
            severity: "hard",
            category: "recruitment",
            detail: `Offered ${offered.toLocaleString()} ${band.currency}/mo — dramatically above the typical ${band.label} range in ${country.name} (${band.localMonthlyMin.toLocaleString()}-${band.localMonthlyMax.toLocaleString()} ${band.currency}). Classic "too-good-to-be-true" scam bait.`,
            actionable: "Cross-check the country's typical salary with its labour ministry before believing this offer.",
        };
    }
    if (offered < band.localMonthlyMin * 0.6) {
        return {
            id: "salary_too_low",
            label: "Salary is below country minimum",
            severity: "hard",
            category: "recruitment",
            detail: `Offered ${offered.toLocaleString()} ${band.currency}/mo is far below the typical ${band.label} range (${band.localMonthlyMin.toLocaleString()}-${band.localMonthlyMax.toLocaleString()} ${band.currency}) — possible wage exploitation.`,
        };
    }
    return null;
}
// ── Scoring helpers ───────────────────────────────────────────────────
function scoreEmployer(f) {
    let s = 15;
    if (f.employerName)
        s += 30;
    if (f.companyAddress)
        s += 20;
    if (f.companyWebsite)
        s += 20;
    if (f.recruiterName)
        s += 15;
    return Math.min(100, s);
}
function scoreAgency(f, findings) {
    return f.recruitmentAgency ? 60 : 70; // no agency = neutral, not a fail
}
function scoreWebsite(f, findings) {
    if (!f.companyWebsite)
        return 45;
    let s = 90;
    for (const fx of findings) {
        if (fx.category === "url" && fx.severity === "hard")
            s -= 40;
        if (fx.category === "url" && fx.severity === "soft")
            s -= 15;
    }
    return Math.max(0, s);
}
function scoreDocument(f, findings) {
    const authCount = [f.hasLetterhead, f.hasSignature, f.hasStamp].filter(Boolean).length;
    if (authCount === 0)
        return 40;
    if (authCount === 3)
        return 100;
    return 60 + authCount * 15;
}
function scoreRecruitment(findings) {
    let s = 85;
    for (const f of findings) {
        if (f.category === "recruitment" && f.severity === "hard")
            s -= 25;
        if (f.category === "recruitment" && f.severity === "soft")
            s -= 10;
    }
    return Math.max(0, s);
}
function scoreSalary(findings) {
    const has = findings.find((f) => f.id === "salary_too_high" || f.id === "salary_too_low");
    if (has)
        return has.severity === "hard" ? 20 : 55;
    return 80;
}
function scorePayment(findings) {
    let s = 100;
    for (const f of findings) {
        if (f.category === "payment" && f.severity === "hard")
            s -= 40;
        if (f.category === "payment" && f.severity === "soft")
            s -= 15;
        if (f.id === "upfront_fee_requested")
            s -= 40;
        if (f.id === "personal_payment_account")
            s -= 40;
    }
    return Math.max(0, s);
}
function scoreFraud(findings) {
    let s = 100;
    for (const f of findings) {
        if (f.severity === "hard")
            s -= 15;
        else if (f.severity === "soft")
            s -= 5;
    }
    return Math.max(0, s);
}
function scoreCommunication(findings) {
    let s = 100;
    for (const f of findings) {
        if ((f.category === "text" || f.category === "identity") && f.severity === "hard")
            s -= 25;
        if ((f.category === "text" || f.category === "identity") && f.severity === "soft")
            s -= 8;
    }
    return Math.max(0, s);
}
// ── Verdict ────────────────────────────────────────────────────────────
function deriveVerdict(overall, findings, country, fields) {
    const hard = findings.filter((f) => f.severity === "hard").length;
    const soft = findings.filter((f) => f.severity === "soft").length;
    const cn = country?.name || "the destination country";
    if (hard >= 2 || overall < 40) {
        return {
            riskBand: "critical",
            verdict: "high_risk",
            headline: `⚠️ Multiple serious scam indicators — do NOT proceed without official ${cn} verification.`,
            explanation: `Our investigation found ${hard} critical issue${hard === 1 ? "" : "s"} matching known overseas employment scam patterns. Do not send money, share your original passport, or resign your current job until this employer is independently verified through ${cn}'s official channels below.`,
        };
    }
    if (hard >= 1 || overall < 65) {
        return {
            riskBand: "high",
            verdict: "suspicious",
            headline: `Serious concerns — verify everything before proceeding.`,
            explanation: `We identified ${hard + soft} concern${hard + soft === 1 ? "" : "s"}. At least one is a strong scam indicator. Please verify with the ${cn} authorities below before making any decision.`,
        };
    }
    if (soft >= 3 || overall < 80) {
        return {
            riskBand: "medium",
            verdict: "verify_first",
            headline: `The offer looks generally consistent, but verify before committing.`,
            explanation: `Nothing here is a major red flag, but ${soft} soft concern${soft === 1 ? "" : "s"} were noted. Verify the employer, salary, and work-permit process before sending anything.`,
        };
    }
    return {
        riskBand: "low",
        verdict: "trustworthy",
        headline: `The evidence appears consistent with a legitimate ${cn} employer.`,
        explanation: `Our checks found no significant inconsistencies. We still recommend a final official verification — no one should ever send money or quit a job based on a checker's assessment alone.`,
    };
}
function buildRecommendations(country, fields, findings) {
    const recs = [];
    if (fields.employerName && country?.links.employerCheck) {
        recs.push(`Verify "${fields.employerName}" against ${country.name}'s official employer registry: ${country.links.employerCheck}`);
    }
    if (country?.links.recruitmentCheck) {
        recs.push(`Confirm any recruitment agency is licensed via ${country.name}'s recruitment authority: ${country.links.recruitmentCheck}`);
    }
    if (findings.some((f) => f.severity === "hard")) {
        recs.push("Do NOT send money, share your original passport, or resign your current job until this employer is independently verified.");
    }
    if (fields.recruiterEmail) {
        recs.push("Ignore the recruiter's reply-to email. Contact HR through the company's OFFICIAL website contact page.");
    }
    if (fields.companyWebsite) {
        recs.push(`Independently Google "${fields.employerName || "the company"}" + city. Verify the website + LinkedIn page match what the recruiter shared.`);
    }
    if (country?.contacts.embassyPhone) {
        recs.push(`Confirm with the ${country.name} embassy in Nairobi: ${country.contacts.embassyPhone}${country.contacts.embassyEmail ? ` / ${country.contacts.embassyEmail}` : ""}`);
    }
    recs.push("Register any real offer with Kenya's National Employment Authority (NEA) at neaims.nea.go.ke before travel — this is a legal requirement.");
    recs.push("If this is a scam, report it to Kenya's Directorate of Criminal Investigations: reportscam@dci.go.ke");
    return recs;
}
// ── Descriptions ──────────────────────────────────────────────────────
function describeEmployer(f) {
    const bits = [];
    if (f.employerName)
        bits.push(`name (${f.employerName})`);
    if (f.companyAddress)
        bits.push("address");
    if (f.companyWebsite)
        bits.push("website");
    return bits.length ? `Employer fields present: ${bits.join(", ")}.` : "Employer identity is unclear or missing.";
}
function describeAgency(f) {
    return f.recruitmentAgency
        ? `Recruitment via "${f.recruitmentAgency}" — verify the agency's licence with the destination country's labour authority.`
        : "No recruitment agency named — direct employer contact or agency not disclosed.";
}
function describeDoc(f) {
    const bits = [];
    if (f.hasLetterhead)
        bits.push("letterhead");
    if (f.hasSignature)
        bits.push("signature");
    if (f.hasStamp)
        bits.push("stamp");
    return bits.length ? `Document elements: ${bits.join(" + ")}.` : "No formal document elements (letterhead / signature / stamp) detected.";
}
function describeProcess(findings) {
    const bad = findings.filter((f) => f.category === "recruitment").length;
    return bad === 0 ? "Recruitment process shows no red flags." : `${bad} recruitment-process concern(s) detected.`;
}
function describeSalary(f, c) {
    if (!f.salaryMonthly)
        return "No monthly salary figure detected.";
    if (!c)
        return `${f.salaryMonthly.toLocaleString()} ${f.currency ?? ""}/mo — country unknown, can't benchmark.`;
    return `Offered ${f.salaryMonthly.toLocaleString()} ${f.currency ?? ""}/mo in ${c.name}.`;
}
function describePayment(findings) {
    const payFindings = findings.filter((f) => f.category === "payment" || f.id === "upfront_fee_requested" || f.id === "personal_payment_account");
    if (payFindings.length === 0)
        return "No payment red flags in the evidence.";
    return `${payFindings.length} payment-risk indicator(s) detected — see findings.`;
}
function describeFraud(findings) {
    return findings.length === 0
        ? "No scam patterns detected."
        : `${findings.length} finding(s) in total — see the detailed report.`;
}
function describeComm(findings) {
    const commFindings = findings.filter((f) => f.category === "text" || f.category === "identity");
    return commFindings.length === 0 ? "Communication style consistent with normal HR." : `${commFindings.length} communication concern(s) noted.`;
}
// ── Helpers ────────────────────────────────────────────────────────────
function inferCategory(id) {
    if (id.includes("email"))
        return "identity";
    if (id.includes("payment") || id.includes("fee") || id.includes("bank"))
        return "payment";
    if (id.includes("website") || id.includes("url") || id.includes("domain"))
        return "url";
    if (id.includes("phone"))
        return "phone";
    if (id.includes("salary") || id.includes("recruitment") || id.includes("agency"))
        return "recruitment";
    return "text";
}
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
function mapAiError(msg) {
    const lower = msg.toLowerCase();
    if (lower.includes("quota") || lower.includes("insufficient_quota"))
        return "Our fraud-check AI is temporarily out of capacity. Please try again in a few minutes.";
    if (lower.includes("rate limit") || lower.includes("429"))
        return "Our fraud-check AI is busy right now. Please try again in a few minutes.";
    if (lower.includes("timeout"))
        return "The analysis took longer than expected. Try again with less text or a smaller image.";
    return "We couldn't complete the analysis. Please try again with clearer evidence.";
}
