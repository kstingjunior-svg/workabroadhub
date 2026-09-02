"use strict";
/**
 * endpoint.ts — POST /api/tools/job-scam-check
 *
 * Multi-input: accepts either a text field ("chat", "email", "jobAd") OR an
 * image file OR both. At least one must be present. Rate-limited via the
 * global aiHotPathLimiter (see server/routes.ts).
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
exports.registerScamCheckRoute = registerScamCheckRoute;
const multer_1 = __importDefault(require("multer"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// 2026-08 (Tony): accept PDF + Word too — WhatsApp/Facebook job forwards
// often arrive as PDF attachments (the recruiter's "official offer" that
// turned out to be a template scam). PDF/Word are extracted to text and
// merged into the text-analysis path.
const ACCEPTED_MIMES = new Set([
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
]);
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        cb(null, ACCEPTED_MIMES.has(file.mimetype));
    },
});
const scamLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "You're going a bit fast — please wait a minute and try again." },
});
function registerScamCheckRoute(app) {
    app.post("/api/tools/job-scam-check", scamLimiter, (req, res, next) => upload.single("file")(req, res, (err) => {
        if (!err)
            return next();
        const isSize = err?.code === "LIMIT_FILE_SIZE";
        return res.status(400).json({
            message: isSize
                ? "That file is larger than 10 MB. Please upload a smaller image."
                : "We couldn't process that upload. Please try a JPG, PNG or WEBP.",
        });
    }), async (req, res) => {
        const t0 = Date.now();
        try {
            let text = String(req.body?.text ?? "").trim();
            const file = req.file;
            if (!text && !file) {
                return res.status(400).json({
                    ok: false,
                    message: "Please paste the chat/email text OR upload a screenshot / document (or both).",
                });
            }
            // Route based on file type. Images → vision path. PDF/Word →
            // extract text and merge with whatever text the user already pasted.
            let imageDataUrl;
            if (file) {
                if (file.mimetype.startsWith("image/")) {
                    imageDataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
                }
                else if (file.mimetype === "application/pdf" ||
                    file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                    file.mimetype === "application/msword") {
                    // 2026-08 (Tony): pull PDF/Word text and merge into the analysis
                    // text. The scam analyzer works great on pure text — same
                    // employer-name checks, salary-vs-benchmark checks, scam-phrase
                    // scanning as with pasted chat text.
                    const { extractTextFromBuffer } = await Promise.resolve().then(() => __importStar(require("../utils/extract-text")));
                    const extracted = await extractTextFromBuffer(file.buffer, file.mimetype, file.originalname);
                    if (!extracted?.text || extracted.text.trim().length < 20) {
                        return res.status(400).json({
                            ok: false,
                            message: "We couldn't read enough text from that file. If it's a scanned PDF, please upload a clear photo (JPG/PNG) instead — our vision engine handles those.",
                        });
                    }
                    const joiner = text ? "\n\n---FROM UPLOADED DOCUMENT---\n" : "";
                    text = (text + joiner + extracted.text.trim()).slice(0, 15000);
                }
                else {
                    return res.status(400).json({ ok: false, message: "Please upload an image, PDF, or Word document." });
                }
            }
            const { analyzeScam } = await Promise.resolve().then(() => __importStar(require("./analyzer")));
            const report = await analyzeScam({ text, imageDataUrl });
            if (!report.ok) {
                return res.status(502).json({ ok: false, message: report.message });
            }
            console.log(`[JobScamCheck] verdict=${report.verdict} trust=${report.overallTrust} country=${report.country?.code ?? "?"} ` +
                `findings=${report.findings.length} inputMode=${imageDataUrl ? (text ? "text+image" : "image") : "text"} in ${Date.now() - t0}ms`);
            res.json({
                ok: true,
                overallTrust: report.overallTrust,
                confidence: report.confidence,
                riskBand: report.riskBand,
                verdict: report.verdict,
                headline: report.headline,
                explanation: report.explanation,
                extractedFields: report.extractedFields,
                country: report.country ? {
                    code: report.country.code,
                    name: report.country.name,
                    flag: report.country.flag,
                    links: report.country.links,
                    contacts: report.country.contacts,
                    nextStepAdvice: report.country.nextStepAdvice,
                } : null,
                subScores: report.subScores,
                findings: report.findings,
                positiveIndicators: report.positiveIndicators,
                recommendations: report.recommendations,
                scamPatternsMatched: report.scamPatternsMatched,
                disclaimer: "This is an AI-assisted screening — not a legal determination. Always verify the employer and recruiter through the official government portals below before making travel, payment, or contract decisions.",
            });
        }
        catch (err) {
            console.error("[JobScamCheck] endpoint error:", err?.message);
            res.status(500).json({
                ok: false,
                message: "We couldn't complete the analysis right now. Please try again shortly.",
            });
        }
    });
    console.log("[JobScamCheck] Route registered: POST /api/tools/job-scam-check (AI scam analyzer v2)");
}
