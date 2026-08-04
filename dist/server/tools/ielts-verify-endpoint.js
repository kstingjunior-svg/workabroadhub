"use strict";
/**
 * IELTS Verifier — HTTP endpoint (free with per-day cap, Pro unlimited).
 *
 *   POST /api/tools/ielts-verify
 *     multipart/form-data { file: PDF | JPG | PNG | WEBP, up to 8 MB }
 *   Response 200:
 *     {
 *       checkId, verdict, confidence, findings[], parsed,
 *       officialVerifyUrl, disclaimer, aiVisionUsed
 *     }
 *
 * Pipeline:
 *   1. Validate upload (mime + size).
 *   2. Compute sha-256 for dedupe.
 *   3. Extract text — PDF via pdf-parse, image via GPT-4o Vision.
 *   4. Parse TRF fields — TRF number, test centre code, dates, bands.
 *   5. Run heuristic checks (TRF number format, band consistency, test date
 *      validity, test centre code format).
 *   6. Compose verdict + findings.
 *   7. Persist to ielts_checks (30-day retention).
 *   8. Always append the official verification link + "our tool is not
 *      authoritative" disclaimer.
 *
 * CRITICAL FRAMING: this tool NEVER claims certainty. Only the official
 * IELTS portal (https://ielts.org/organisations/results-verification) queries
 * the real database. Our tool is a pre-screener. All response copy must
 * reinforce this.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIeltsVerifyRoute = registerIeltsVerifyRoute;
const multer_1 = __importDefault(require("multer"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
const openai_1 = require("../lib/openai");
const extract_text_1 = require("../utils/extract-text");
// ── Multer ──────────────────────────────────────────────────────────────────
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = file.mimetype.startsWith("image/") ||
            file.mimetype === "application/pdf";
        cb(null, ok);
    },
});
const FREE_DAILY_LIMIT = 2;
const OFFICIAL_VERIFY_URL = "https://ielts.org/organisations/results-verification";
// ── Rate limiting helpers ───────────────────────────────────────────────────
async function overDailyLimit(userId, guestFp) {
    const idCol = userId ? "user_id" : "guest_fingerprint";
    const idVal = userId ?? guestFp;
    const { rows } = await db_1.pool.query(`SELECT COUNT(*)::text AS n FROM ielts_checks
      WHERE ${idCol} = $1
        AND created_at > NOW() - INTERVAL '24 hours'`, [idVal]);
    return Number(rows[0]?.n ?? 0) >= FREE_DAILY_LIMIT;
}
function guestFingerprint(req) {
    const ip = String(req.ip ?? req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    const ua = String(req.headers["user-agent"] ?? "");
    return crypto_1.default.createHash("sha256").update(`${ip}::${ua}`).digest("hex").slice(0, 32);
}
function currentUserId(req) {
    return (req.user?.claims?.sub ??
        req.user?.id ??
        req.session?.customUserId ??
        null);
}
// ── TRF parsing ─────────────────────────────────────────────────────────────
// TRF number format (2024+): YY + centre code (3-5 alpha) + 6-digit sequence
// + candidate code (4 alphanum) + 2-digit checksum.
// Example: 24CN000123ABCD01, 25AU00567PQRS03
// Older formats also accepted (looser check).
const TRF_NUMBER_RE = /\b(\d{2}[A-Z]{2,5}\d{4,6}[A-Z0-9]{2,4}\d{0,2})\b/;
const TRF_NUMBER_STRICT_RE = /^\d{2}[A-Z]{2,5}\d{6}[A-Z0-9]{4}\d{2}$/;
// Common test centre country prefixes (a sample — the full list has 250+)
const KNOWN_CENTRE_PREFIXES = new Set([
    "AE", "AU", "BR", "CN", "DE", "EG", "ES", "FR", "GB", "GH", "IN",
    "IR", "IT", "JP", "KE", "KR", "LK", "MY", "NG", "NP", "NZ", "PH",
    "PK", "SA", "SG", "TH", "TR", "TZ", "UG", "US", "VN", "ZA",
]);
function parseTrf(text) {
    const t = text.replace(/\s+/g, " ").trim();
    const p = {};
    // TRF Number
    const trfMatch = t.match(TRF_NUMBER_RE);
    if (trfMatch) {
        p.trfNumber = trfMatch[1].toUpperCase();
        // Centre code = first 2 letters after the year
        const centre = p.trfNumber.match(/^\d{2}([A-Z]{2,5})/);
        if (centre)
            p.testCentreCode = centre[1];
    }
    // Test type
    if (/\bacademic\b/i.test(t))
        p.testType = "Academic";
    else if (/\bgeneral training\b/i.test(t))
        p.testType = "General Training";
    else if (/\blife skills\b/i.test(t))
        p.testType = "Life Skills";
    // Bands: look for "Listening: 7.5", "Reading  8", etc. Also overall.
    const bandRe = (label) => new RegExp(`${label}\\s*(?:band\\s*score|score|band)?\\s*[:\\-]?\\s*(\\d(?:\\.\\d)?)`, "i");
    const m1 = t.match(bandRe("listening"));
    if (m1)
        p.listeningBand = Number(m1[1]);
    const m2 = t.match(bandRe("reading"));
    if (m2)
        p.readingBand = Number(m2[1]);
    const m3 = t.match(bandRe("writing"));
    if (m3)
        p.writingBand = Number(m3[1]);
    const m4 = t.match(bandRe("speaking"));
    if (m4)
        p.speakingBand = Number(m4[1]);
    const m5 = t.match(bandRe("overall"));
    if (m5)
        p.overallBand = Number(m5[1]);
    // Test date: several common formats on IELTS TRFs
    const dateRe1 = /\bTest Date[:\s]+(\d{1,2}[\s/-][A-Za-z]{3,9}[\s/-]\d{2,4})/i;
    const dateRe2 = /\b(\d{1,2}[\s/-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s/-]\d{2,4})\b/i;
    const dateMatch = t.match(dateRe1) ?? t.match(dateRe2);
    if (dateMatch) {
        const d = new Date(dateMatch[1].replace(/[/-]/g, " "));
        if (!isNaN(d.getTime()))
            p.testDate = d;
    }
    // Candidate name
    const nameRe = /\bCandidate(?:'s)?\s*Name[:\s]+([A-Z][A-Za-z\-\s'`.]{1,80}?)(?=\s{2,}|\n|Date of|Test Date|Nationality|$)/i;
    const nameMatch = t.match(nameRe);
    if (nameMatch)
        p.candidateName = nameMatch[1].trim().replace(/\s+/g, " ");
    return p;
}
function runHeuristics(parsed, rawText) {
    const findings = [];
    // 1. TRF number presence
    if (!parsed.trfNumber) {
        findings.push({
            code: "trf_number_missing",
            severity: "critical",
            message: "No TRF (Test Report Form) number found in the document. Every real IELTS TRF has a unique number printed on the top-right, e.g. 24CN000123ABCD01.",
        });
    }
    else {
        // TRF number format
        if (TRF_NUMBER_STRICT_RE.test(parsed.trfNumber)) {
            findings.push({
                code: "trf_number_format_valid",
                severity: "info",
                message: `TRF number "${parsed.trfNumber}" matches the standard IELTS format.`,
            });
        }
        else {
            findings.push({
                code: "trf_number_format_unusual",
                severity: "warning",
                message: `TRF number "${parsed.trfNumber}" doesn't match the current standard format (YYCCCCNNNNNNXXXX##). It may be an older format, or the document may be forged.`,
            });
        }
        // Centre code
        if (parsed.testCentreCode && !KNOWN_CENTRE_PREFIXES.has(parsed.testCentreCode.slice(0, 2))) {
            findings.push({
                code: "centre_code_unknown",
                severity: "warning",
                message: `Test centre code prefix "${parsed.testCentreCode.slice(0, 2)}" is not among the known IELTS country prefixes. Verify the centre exists at ielts.org.`,
            });
        }
    }
    // 2. Test date validity — TRFs are valid 2 years
    if (parsed.testDate) {
        const now = Date.now();
        const twoYearsMs = 2 * 365 * 86400 * 1000;
        const ageMs = now - parsed.testDate.getTime();
        if (ageMs < 0) {
            findings.push({
                code: "test_date_future",
                severity: "critical",
                message: "Test date is in the future. This is impossible for a real TRF.",
            });
        }
        else if (ageMs > twoYearsMs) {
            findings.push({
                code: "trf_expired",
                severity: "warning",
                message: `TRF is older than 2 years (test date: ${parsed.testDate.toDateString()}). IELTS TRFs are only accepted by employers and immigration officers for 2 years.`,
            });
        }
        else {
            findings.push({
                code: "test_date_valid",
                severity: "info",
                message: `Test date ${parsed.testDate.toDateString()} is within the 2-year validity window.`,
            });
        }
    }
    else {
        findings.push({
            code: "test_date_missing",
            severity: "warning",
            message: "Could not find a test date on the document.",
        });
    }
    // 3. Band consistency — overall is typically the mean of the 4 skills, rounded to nearest 0.5
    const skills = [parsed.listeningBand, parsed.readingBand, parsed.writingBand, parsed.speakingBand].filter((b) => typeof b === "number");
    if (parsed.overallBand != null && skills.length === 4) {
        const mean = skills.reduce((a, b) => a + b, 0) / 4;
        // Round to nearest 0.5
        const expected = Math.round(mean * 2) / 2;
        const diff = Math.abs(expected - parsed.overallBand);
        if (diff > 0.5) {
            findings.push({
                code: "band_mismatch",
                severity: "critical",
                message: `Overall band (${parsed.overallBand}) doesn't match the mean of the 4 skill bands (${skills.join(", ")}). Expected ~${expected}. This is a common giveaway of a forged TRF.`,
            });
        }
        else {
            findings.push({
                code: "bands_consistent",
                severity: "info",
                message: `Overall band (${parsed.overallBand}) is consistent with the 4 skill bands.`,
            });
        }
        // Every band must be a valid IELTS score: 0, 1, 1.5, 2, 2.5, ..., 9
        for (const [label, b] of [
            ["Listening", parsed.listeningBand],
            ["Reading", parsed.readingBand],
            ["Writing", parsed.writingBand],
            ["Speaking", parsed.speakingBand],
            ["Overall", parsed.overallBand],
        ]) {
            if (typeof b === "number") {
                const doubled = b * 2;
                if (b < 0 || b > 9 || Math.abs(doubled - Math.round(doubled)) > 1e-6) {
                    findings.push({
                        code: "invalid_band",
                        severity: "critical",
                        message: `${label} band "${b}" is not a valid IELTS score. Valid scores are 0, 0.5, 1, 1.5, ..., 9.`,
                    });
                }
            }
        }
    }
    else if (skills.length > 0 && skills.length < 4) {
        findings.push({
            code: "bands_incomplete",
            severity: "warning",
            message: `Only ${skills.length} of the 4 skill bands (Listening / Reading / Writing / Speaking) were found in the document.`,
        });
    }
    // 4. Test type
    if (!parsed.testType) {
        findings.push({
            code: "test_type_missing",
            severity: "warning",
            message: "Could not identify the test type (Academic, General Training, or Life Skills). Every TRF names one.",
        });
    }
    // 5. Candidate name
    if (!parsed.candidateName) {
        findings.push({
            code: "candidate_name_missing",
            severity: "warning",
            message: "Could not find the candidate name on the document.",
        });
    }
    // 6. Presence of "IELTS" branding somewhere in the text
    if (!/\bIELTS\b/i.test(rawText)) {
        findings.push({
            code: "no_ielts_branding",
            severity: "critical",
            message: "The document does not contain the word 'IELTS' anywhere. This is very unusual for a real TRF.",
        });
    }
    // ── Compose verdict ──────────────────────────────────────────────────────
    const criticalCount = findings.filter((f) => f.severity === "critical").length;
    const warningCount = findings.filter((f) => f.severity === "warning").length;
    let verdict;
    let confidence;
    if (criticalCount >= 2) {
        verdict = "likely_fake";
        confidence = Math.min(90, 60 + criticalCount * 10);
    }
    else if (criticalCount === 1) {
        verdict = "suspicious";
        confidence = 55;
    }
    else if (warningCount >= 3) {
        verdict = "suspicious";
        confidence = 45;
    }
    else if (parsed.trfNumber && parsed.testDate && parsed.testType && (parsed.overallBand ?? 0) > 0) {
        verdict = "likely_genuine";
        confidence = warningCount === 0 ? 80 : 65;
    }
    else {
        verdict = "undetermined";
        confidence = 30;
    }
    return { findings, verdict, confidence };
}
// ── Image → text via OpenAI Vision ──────────────────────────────────────────
async function extractFromImage(buffer, mime) {
    const b64 = buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${b64}`;
    const res = await openai_1.openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 1500,
        temperature: 0.1,
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "This is an IELTS Test Report Form (TRF) image. Extract EVERY visible text: candidate name, test date, test type (Academic / General Training / Life Skills), TRF number, test centre code, all four skill band scores (Listening / Reading / Writing / Speaking), and the overall band score. Return the raw text as-is — do not summarise, do not add commentary. If any field is unreadable, say [unreadable] for that field.",
                    },
                    { type: "image_url", image_url: { url: dataUrl } },
                ],
            },
        ],
    });
    return res.choices[0]?.message?.content ?? "";
}
// ── Register route ──────────────────────────────────────────────────────────
function registerIeltsVerifyRoute(app) {
    app.post("/api/tools/ielts-verify", upload.single("file"), async (req, res) => {
        try {
            if (!req.file)
                return res.status(400).json({ error: "No file uploaded" });
            const userId = currentUserId(req);
            const guestFp = guestFingerprint(req);
            // Free daily cap for unauthed / non-Pro users
            if (await overDailyLimit(userId, guestFp)) {
                return res.status(429).json({
                    error: `Free daily limit reached (${FREE_DAILY_LIMIT} checks/day). Upgrade to Pro for unlimited verifications, or try again in 24 hours.`,
                    upgradeUrl: "/pricing",
                });
            }
            const buf = req.file.buffer;
            const mime = req.file.mimetype;
            const filename = req.file.originalname ?? "trf";
            const sha256 = crypto_1.default.createHash("sha256").update(buf).digest("hex");
            // Extract text
            let rawText = "";
            let aiVisionUsed = false;
            try {
                if (mime.startsWith("image/")) {
                    rawText = await extractFromImage(buf, mime);
                    aiVisionUsed = true;
                }
                else {
                    const r = await (0, extract_text_1.extractTextFromBuffer)(buf, mime, filename);
                    rawText = typeof r === "string" ? r : (r?.text ?? "");
                }
            }
            catch (err) {
                console.error("[ielts-verify] extract failed:", err?.message);
                return res.status(422).json({
                    error: "Could not read the file. Try a clearer scan or a text-based PDF.",
                });
            }
            if (!rawText || rawText.length < 40) {
                return res.status(422).json({
                    error: "The document has too little text. Upload a clearer scan of the TRF.",
                });
            }
            // Parse + heuristics
            const parsed = parseTrf(rawText);
            const { findings, verdict, confidence } = runHeuristics(parsed, rawText);
            // Persist
            const { rows: created } = await db_1.pool.query(`INSERT INTO ielts_checks
           (user_id, guest_fingerprint, file_sha256, trf_number, test_centre_code, test_date,
            candidate_name, test_type, overall_band, listening_band, reading_band, writing_band, speaking_band,
            verdict, confidence, findings_json, ai_vision_used, raw_text)
         VALUES ($1,$2,$3, $4,$5,$6, $7,$8, $9,$10,$11,$12,$13, $14,$15,$16, $17,$18)
         RETURNING id`, [
                userId, guestFp, sha256,
                parsed.trfNumber ?? null,
                parsed.testCentreCode ?? null,
                parsed.testDate ?? null,
                parsed.candidateName ?? null,
                parsed.testType ?? null,
                parsed.overallBand ?? null,
                parsed.listeningBand ?? null,
                parsed.readingBand ?? null,
                parsed.writingBand ?? null,
                parsed.speakingBand ?? null,
                verdict, confidence, JSON.stringify(findings), aiVisionUsed, rawText.slice(0, 10000),
            ]);
            res.json({
                checkId: created[0].id,
                verdict,
                confidence,
                parsed,
                findings,
                aiVisionUsed,
                officialVerifyUrl: OFFICIAL_VERIFY_URL,
                disclaimer: "This is a pre-screening tool, not an official verification. Only the IELTS results-verification portal (link above) queries the real IELTS database. Employers and immigration officers use only that portal. If our tool flags your TRF as suspicious, please verify with the official portal before submitting to any employer.",
            });
        }
        catch (err) {
            console.error("[ielts-verify] error:", err?.message);
            res.status(500).json({ error: "Could not process the TRF. Please try again." });
        }
    });
    // ═══════════════════════════════════════════════════════════════════════
    // v2 — 2026-07 AI IELTS Certificate Verification engine.
    //
    // Full forensic analysis: 7 sub-scores, score-consistency check, security
    // features report, provider identification, official portal links.
    // ═══════════════════════════════════════════════════════════════════════
    app.post("/api/tools/ielts-verify-ai", (req, res, next) => upload.single("file")(req, res, (err) => {
        if (!err)
            return next();
        const isSize = err?.code === "LIMIT_FILE_SIZE";
        return res.status(400).json({
            message: isSize
                ? "That file is larger than 8 MB. Please upload a smaller image or PDF."
                : "We couldn't process that upload. Please try a JPG, PNG, WEBP or PDF.",
        });
    }), async (req, res) => {
        const t0 = Date.now();
        try {
            if (!req.file)
                return res.status(400).json({ message: "Please attach the IELTS TRF." });
            const mt = req.file.mimetype;
            const isImage = mt.startsWith("image/");
            const isPdf = mt === "application/pdf";
            const isDocx = mt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            const isDoc = mt === "application/msword";
            if (!isImage && !isPdf && !isDocx && !isDoc) {
                return res.status(400).json({ message: "Please upload an image (JPG, PNG, WEBP), PDF, or Word document." });
            }
            // 2026-08 (Tony): PDF + Word via text-extraction path.
            const { analyzeIelts } = await Promise.resolve().then(() => __importStar(require("../ielts-verify/analyzer")));
            let report;
            if (isImage) {
                const base64 = req.file.buffer.toString("base64");
                const dataUrl = `data:${mt};base64,${base64}`;
                report = await analyzeIelts({ kind: "image", imageBase64DataUrl: dataUrl });
            }
            else {
                const { extractTextFromBuffer } = await Promise.resolve().then(() => __importStar(require("../utils/extract-text")));
                const extracted = await extractTextFromBuffer(req.file.buffer, mt, req.file.originalname);
                if (!extracted?.text || extracted.text.trim().length < 50) {
                    return res.status(400).json({
                        message: "We couldn't read enough text from that file. If it's a scanned PDF, please upload a clear photo (JPG/PNG) instead — our OCR handles those.",
                    });
                }
                report = await analyzeIelts({
                    kind: "text",
                    text: extracted.text,
                    sourceFilename: req.file.originalname,
                });
            }
            if (!report.ok) {
                return res.status(502).json({ ok: false, message: report.message });
            }
            console.log(`[IeltsVerifyAI] verdict=${report.verdict} trust=${report.overallTrust} provider=${report.provider?.key ?? "?"} findings=${report.findings.length} in ${Date.now() - t0}ms`);
            res.json({
                ok: true,
                overallTrust: report.overallTrust,
                confidence: report.confidence,
                riskBand: report.riskBand,
                verdict: report.verdict,
                headline: report.headline,
                explanation: report.explanation,
                extractedFields: report.extractedFields,
                provider: report.provider ? {
                    key: report.provider.key,
                    name: report.provider.name,
                    operatingRegions: report.provider.operatingRegions,
                    links: report.provider.links,
                    contacts: report.provider.contacts,
                    notes: report.provider.notes,
                } : null,
                subScores: report.subScores,
                findings: report.findings,
                forgeryIndicators: report.forgeryIndicators,
                positiveIndicators: report.positiveIndicators,
                recommendations: report.recommendations,
                officialResources: report.officialResources,
                disclaimer: "This is an AI-assisted screening, not an official verification. Only the IELTS Verification Service (ORS) can confirm authenticity — access is restricted to registered institutions. Candidates should share their eTRF from the official Test Taker Portal.",
            });
        }
        catch (err) {
            console.error("[IeltsVerifyAI] endpoint error:", err?.message);
            res.status(500).json({
                ok: false,
                message: "We couldn't verify this TRF right now. Please try again shortly, or use the classic verifier at /api/tools/ielts-verify.",
            });
        }
    });
    console.log("[IeltsVerifyAI] Route registered: POST /api/tools/ielts-verify-ai (AI engine v2)");
}
