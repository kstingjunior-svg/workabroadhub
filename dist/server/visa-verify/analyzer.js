"use strict";
/**
 * analyzer.ts — the AI Visa Verification engine.
 *
 * Tony's founder brief (2026-07):
 *   "The system must NOT simply classify visas as 'real' or 'fake.' Instead
 *   it must analyze, verify, explain, educate, score risk, and provide
 *   official government verification resources. The AI should behave like
 *   an experienced immigration officer."
 *
 * Pipeline:
 *   1. Call GPT-4o Vision with a forensic-analysis prompt — returns both
 *      extracted fields AND observations about layout, security features,
 *      forgery indicators.
 *   2. Match the extracted country against the country registry.
 *   3. Run country-specific rules (rules.ts).
 *   4. Compute 7 sub-scores: Layout, Security, Format, Photo, Dates, OCR, Forgery.
 *   5. Aggregate into overall trust score + risk band.
 *   6. Assemble the full report: verdict copy, findings, recommendations,
 *      government links, next-step actions.
 *
 * Never says "fake" — always explains. Founder's warm-clear tone throughout.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeVisa = analyzeVisa;
const openai_1 = require("../lib/openai");
const countries_1 = require("./countries");
const rules_1 = require("./rules");
// ── Vision prompt ───────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior immigration officer with 15 years experience verifying visas. You never make guesses about authenticity — you observe carefully and report what you see. You never say a visa is "fake" or "genuine" outright; you describe indicators that support or undermine authenticity, then let the reader form their own view backed by official verification.

You will be shown a visa or work-permit document. Your job:
1. EXTRACT every field you can read.
2. OBSERVE the document's forensic properties.
3. RETURN a strict JSON object.

FORENSIC OBSERVATIONS to note:
- Layout consistency (does the header/body/footer follow expected government layout?)
- Font consistency (does one section use a different font — a classic forgery tell?)
- Photo authenticity (edge sharpness, background matches document paper, lighting consistent?)
- Security features (barcode, QR, MRZ, watermarks, holograms, seals, signatures)
- Editing traces (pixel artifacts around fields, uneven compression, misaligned baselines)
- Date logic (issue < expiry, dates in expected country format)
- Country-specific formatting (does the document layout match the government's known template?)

Return ONLY valid JSON in this shape (no markdown, no code fences):

{
  "country": "United Arab Emirates" | "Canada" | "United Kingdom" | ... | null,
  "visaNumber": string | null,
  "passportNumber": string | null,
  "applicantName": string | null,
  "dateOfBirth": string | null,
  "nationality": string | null,
  "employer": string | null,
  "visaType": string | null,
  "visaClass": string | null,
  "workPermitNumber": string | null,
  "issueDate": "YYYY-MM-DD" | null,
  "expiryDate": "YYYY-MM-DD" | null,
  "entryType": "single" | "multiple" | null,
  "hasBarcode": boolean,
  "hasQrCode": boolean,
  "hasMrz": boolean,
  "hasSignature": boolean,
  "hasStamp": boolean,
  "hasWatermark": boolean,
  "hasDigitalSignature": boolean,
  "observedSecurityFeatures": [string],
  "forgeryIndicators": [string],
  "positiveIndicators": [string],
  "layoutScore": 0-100,
  "photoScore": 0-100,
  "securityScore": 0-100,
  "confidence": 0-100
}

Rules:
- Set unknown fields to null. NEVER guess.
- forgeryIndicators: only include things you actually observed. Empty array is fine.
- positiveIndicators: same — what specifically looks legitimate.
- confidence: how sure you are of your own reading (0 = illegible, 100 = crystal clear).
- Every string in indicators arrays must be one short sentence.`;
// ── Main entrypoint ─────────────────────────────────────────────────────
async function analyzeVisa(imageBase64DataUrl) {
    // Step 1: call GPT-4o vision
    let vision;
    try {
        const completion = await openai_1.openai.chat.completions.create({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 1400,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Analyze this visa document. Return the JSON only." },
                        { type: "image_url", image_url: { url: imageBase64DataUrl, detail: "high" } },
                    ],
                },
            ],
        });
        const raw = completion.choices[0]?.message?.content ?? "{}";
        vision = JSON.parse(raw);
    }
    catch (err) {
        console.error("[visa-analyzer] Vision call failed:", err?.message);
        return {
            ok: false,
            error: "vision_failed",
            message: mapVisionError(err?.message ?? ""),
        };
    }
    // Step 2: map vision output to ExtractedFields
    const fields = {
        country: str(vision.country),
        visaNumber: str(vision.visaNumber),
        passportNumber: str(vision.passportNumber),
        applicantName: str(vision.applicantName),
        dateOfBirth: str(vision.dateOfBirth),
        nationality: str(vision.nationality),
        employer: str(vision.employer),
        visaType: str(vision.visaType),
        visaClass: str(vision.visaClass),
        workPermitNumber: str(vision.workPermitNumber),
        issueDate: str(vision.issueDate),
        expiryDate: str(vision.expiryDate),
        entryType: str(vision.entryType),
        hasBarcode: bool(vision.hasBarcode),
        hasQrCode: bool(vision.hasQrCode),
        hasMrz: bool(vision.hasMrz),
        hasSignature: bool(vision.hasSignature),
        hasStamp: bool(vision.hasStamp),
        hasWatermark: bool(vision.hasWatermark),
        hasDigitalSignature: bool(vision.hasDigitalSignature),
        observedSecurityFeatures: arr(vision.observedSecurityFeatures),
    };
    // Step 3: country lookup
    const country = (0, countries_1.findCountry)(fields.country);
    // Step 4: run country rules
    const findings = (0, rules_1.runRules)(fields, country);
    // Step 5: sub-scores
    const layoutScore = clamp0100(vision.layoutScore);
    const photoScore = clamp0100(vision.photoScore);
    const securityScore = clamp0100(vision.securityScore);
    const formatScore = (0, rules_1.scoreRules)(findings);
    const dateScore = dateScoreFromFindings(findings);
    const ocrScore = clamp0100(vision.confidence);
    const forgeryLoad = Math.min(100, arr(vision.forgeryIndicators).length * 20); // 5+ indicators = max
    const forgeryScore = 100 - forgeryLoad;
    const subScores = [
        { key: "layout", label: "Layout & Structure", score: layoutScore, detail: describeLayout(layoutScore) },
        { key: "security", label: "Security Features", score: securityScore, detail: describeSecurity(securityScore, fields) },
        { key: "format", label: "Government Format Match", score: formatScore, detail: describeFormat(formatScore, country) },
        { key: "photo", label: "Photo Consistency", score: photoScore, detail: describePhoto(photoScore) },
        { key: "dates", label: "Date Logic", score: dateScore, detail: describeDates(dateScore) },
        { key: "ocr", label: "Reading Confidence", score: ocrScore, detail: describeOcr(ocrScore) },
        { key: "forgery", label: "Forgery Absence", score: forgeryScore, detail: describeForgery(forgeryScore, arr(vision.forgeryIndicators).length) },
    ];
    // Step 6: overall trust — weighted average
    const overallTrust = Math.round(layoutScore * 0.14 +
        securityScore * 0.16 +
        formatScore * 0.20 +
        photoScore * 0.10 +
        dateScore * 0.10 +
        ocrScore * 0.10 +
        forgeryScore * 0.20);
    const confidence = ocrScore;
    const { riskBand, verdict, headline, explanation } = deriveVerdict(overallTrust, findings, country);
    // Step 7: recommendations + scam pattern matches
    const recommendations = buildRecommendations(country, fields, findings);
    const scamPatternsMatched = matchScams(country, fields);
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
        forgeryIndicators: arr(vision.forgeryIndicators),
        positiveIndicators: arr(vision.positiveIndicators),
        recommendations,
        scamPatternsMatched,
    };
}
// ── Helpers ─────────────────────────────────────────────────────────────
function str(v) {
    if (v === null || v === undefined)
        return null;
    const s = String(v).trim();
    return s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "unknown" ? null : s;
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
function dateScoreFromFindings(findings) {
    // Any date-related fail zeroes it. Warn = 60. Pass = 100.
    const dateChecks = findings.filter((f) => f.id.startsWith("date_") || f.id === "visa_expired" || f.id === "visa_active");
    if (dateChecks.length === 0)
        return 50;
    if (dateChecks.some((c) => c.status === "fail"))
        return 0;
    if (dateChecks.some((c) => c.status === "warn"))
        return 60;
    return 100;
}
function deriveVerdict(overall, findings, country) {
    const hardFails = findings.filter((f) => f.status === "fail").length;
    const warns = findings.filter((f) => f.status === "warn").length;
    const countryName = country?.name || "the issuing country";
    if (hardFails >= 2 || overall < 40) {
        return {
            riskBand: "critical",
            verdict: "high_risk",
            headline: `⚠️ Multiple serious indicators — do NOT act on this document without official ${countryName} verification.`,
            explanation: `Our forensic review found ${hardFails} critical issue${hardFails === 1 ? "" : "s"} that are inconsistent with a genuine ${countryName} visa. This alone doesn't confirm the document is forged, but the pattern is what we typically see in known scams. Do not send money, share your passport, or travel until you have verified through the official ${countryName} channels below.`,
        };
    }
    if (hardFails >= 1 || overall < 65) {
        return {
            riskBand: "high",
            verdict: "suspicious",
            headline: `Several elements need clarification before you rely on this document.`,
            explanation: `We identified ${hardFails + warns} inconsistency${(hardFails + warns) === 1 ? "" : "ies"} with what a genuine ${countryName} visa typically shows. It may still be legitimate (unusual visa class, poor photo quality) but you should verify through the official ${countryName} portals below before taking any action.`,
        };
    }
    if (warns >= 2 || overall < 80) {
        return {
            riskBand: "medium",
            verdict: "needs_verification",
            headline: `The document looks consistent with a genuine ${countryName} visa, but should still be verified officially.`,
            explanation: `Nothing about the document raises major red flags, and the layout matches expected ${countryName} formatting. However, appearance alone cannot confirm authenticity — always verify the visa number via the official ${countryName} portal below.`,
        };
    }
    return {
        riskBand: "low",
        verdict: "verified",
        headline: `The document appears consistent with a genuine ${countryName} visa.`,
        explanation: `Our forensic checks found no significant inconsistencies with the expected ${countryName} visa format. The security features, layout, and date logic all look right. We still recommend a final official verification via the ${countryName} portal below — no one should ever travel or send money on visual inspection alone.`,
    };
}
function buildRecommendations(country, fields, findings) {
    const recs = [];
    if (country?.links.visaStatusChecker) {
        recs.push(`Verify the visa number directly at ${country.name}'s official visa checker: ${country.links.visaStatusChecker}`);
    }
    else if (country?.links.immigration) {
        recs.push(`${country.name} does not offer public visa verification online. Contact the immigration department directly at ${country.links.immigration} with the visa number.`);
    }
    if (fields.employer && country?.links.employerCheck) {
        recs.push(`Verify the employer "${fields.employer}" against ${country.name}'s official employer registry: ${country.links.employerCheck}`);
    }
    if (fields.workPermitNumber && country?.links.workPermitChecker) {
        recs.push(`Verify the work-permit number at ${country.name}'s work-permit checker: ${country.links.workPermitChecker}`);
    }
    if (findings.some((f) => f.status === "fail" || f.status === "warn")) {
        recs.push("Do NOT pay any additional fees, share your original passport, or make travel bookings until the visa is officially verified.");
    }
    if (country?.contacts.embassyPhone) {
        recs.push(`Contact the ${country.name} embassy in Nairobi directly: ${country.contacts.embassyPhone}${country.contacts.embassyEmail ? ` / ${country.contacts.embassyEmail}` : ""}`);
    }
    if (country?.links.fraudReporting) {
        recs.push(`If you suspect the document is forged, report it to ${country.name}'s fraud reporting channel: ${country.links.fraudReporting}`);
    }
    // Kenya-side fallback — always
    recs.push("You can also verify with Kenya's Ministry of Foreign Affairs overseas jobs desk: https://www.mfa.go.ke/");
    return recs;
}
function matchScams(country, fields) {
    if (!country?.knownScamPatterns)
        return [];
    // For MVP, return the full country-scam pattern list as advisory. Later
    // we can pattern-match against fields (e.g. employer email domain).
    return country.knownScamPatterns.slice();
}
// ── Score descriptions ──────────────────────────────────────────────────
function describeLayout(s) {
    if (s >= 85)
        return "Header, body, and footer follow the expected government layout.";
    if (s >= 60)
        return "Layout largely matches expected format, but some spacing/alignment is slightly off.";
    if (s >= 30)
        return "Layout deviates from typical government formatting in several places.";
    return "Layout does not match expected government template.";
}
function describeSecurity(s, f) {
    const parts = [];
    if (f.hasBarcode)
        parts.push("barcode");
    if (f.hasQrCode)
        parts.push("QR code");
    if (f.hasMrz)
        parts.push("MRZ");
    if (f.hasWatermark)
        parts.push("watermark");
    if (f.hasSignature)
        parts.push("signature");
    if (f.hasStamp)
        parts.push("stamp");
    const list = parts.length > 0 ? parts.join(", ") : "none detected";
    return `Security features present: ${list}.`;
}
function describeFormat(s, c) {
    if (!c)
        return "Country could not be identified — country-specific format check not applied.";
    if (s >= 85)
        return `Matches expected ${c.name} visa formatting.`;
    if (s >= 60)
        return `Mostly matches ${c.name} formatting with minor deviations.`;
    return `Multiple deviations from ${c.name}'s standard visa format.`;
}
function describePhoto(s) {
    if (s >= 85)
        return "Photo appears well-integrated: edges clean, lighting consistent with the rest of the document.";
    if (s >= 60)
        return "Photo is present but has minor inconsistencies (edge blur, colour mismatch, or unclear background).";
    return "Photo shows signs of replacement or manipulation.";
}
function describeDates(s) {
    if (s >= 90)
        return "Issue and expiry dates are both present, logical, and within valid range.";
    if (s >= 60)
        return "Dates are present but incomplete or the visa is close to / past expiry.";
    return "Date logic is broken (expiry before issue, or both dates missing).";
}
function describeOcr(s) {
    if (s >= 85)
        return "Document is clearly legible.";
    if (s >= 60)
        return "Some fields are hard to read — a sharper scan or photo would improve accuracy.";
    return "Document is significantly obscured, blurred, or damaged. Results are unreliable.";
}
function describeForgery(s, indicatorCount) {
    if (indicatorCount === 0)
        return "No forensic indicators of forgery detected.";
    if (indicatorCount === 1)
        return "One potential forensic concern was noted — see forgery indicators below.";
    return `${indicatorCount} potential forensic concerns noted — see indicators below.`;
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
