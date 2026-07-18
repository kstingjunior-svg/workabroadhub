/**
 * Offer Letter Screening — HTTP endpoint (free tool).
 *
 *   POST /api/tools/offer-check
 *     multipart/form-data { file: PDF | DOCX | JPG | PNG | WEBP, up to 10 MB }
 *   Response 200:
 *     { checkId, riskScore, riskBand, findings[], parsed, employer,
 *       headline, recommendation, aiVisionUsed, disclaimer }
 *
 * Pipeline:
 *   1. Validate upload (mime + size).
 *   2. Compute sha-256 of the bytes.
 *   3. Extract text:
 *      • PDF/DOCX → extractTextFromBuffer (existing utility)
 *      • Image     → OpenAI Vision structured JSON (extract + forensic pass)
 *   4. Parse candidate/employer/salary/date fields from OCR text.
 *   5. Extract sender-domain and do rough employer-name cross-check.
 *   6. Run screenOffer() pure logic.
 *   7. Persist to offer_letter_checks with 30-day retention.
 *   8. Return the report.
 *
 * Rate limiting: /api/tools is behind aiLimiter (per-IP window). Additional
 * per-user daily cap enforced here for authenticated users.
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { pool } from "../db";
import { openai } from "../lib/openai";
import { extractTextFromBuffer } from "../utils/extract-text";
import {
  screenOffer,
  parseVisibleFields,
  extractSenderDomain,
  type AiVisionObservation,
  type EmployerSignals,
  type ScreenOfferReport,
} from "./offer-screening";
import {
  classifyDocument,
  checkDocumentType,
  type DocumentType,
} from "./document-classifier";

// ── Multer: 10 MB, PDF/DOCX/image ──────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimetype === "application/msword";
    cb(null, ok);
  },
});

const FREE_DAILY_LIMIT = 3;

async function overDailyLimit(userId: string | null, guestFp: string): Promise<boolean> {
  const idCol = userId ? "user_id" : "guest_fingerprint";
  const idVal = userId ?? guestFp;
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM offer_letter_checks
      WHERE ${idCol} = $1
        AND created_at > NOW() - INTERVAL '24 hours'`,
    [idVal],
  );
  return Number(rows[0]?.n ?? 0) >= FREE_DAILY_LIMIT;
}

function guestFingerprint(req: Request): string {
  const ip = String(req.ip ?? req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  const ua = String(req.headers["user-agent"] ?? "");
  return crypto.createHash("sha256").update(`${ip}::${ua}`).digest("hex").slice(0, 32);
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI Vision: structured extraction + forensic pass for image uploads
// ─────────────────────────────────────────────────────────────────────────────

async function runVisionPass(
  buffer: Buffer,
  mimetype: string,
): Promise<{
  text: string;
  vision: AiVisionObservation | null;
  hasLetterhead: boolean | null;
  hasSignature: boolean | null;
  documentType: DocumentType | null;
  documentTypeConfidence: number | null;
}> {
  const base64 = buffer.toString("base64");
  const safeType = mimetype.startsWith("image/") ? mimetype : "image/jpeg";

  const prompt = `You are reviewing an uploaded image for an offer-letter-screening tool.

Return your response as valid JSON matching this exact shape:
{
  "documentType": "offer_letter" | "cv" | "job_advert" | "visa" | "unknown",
  "documentTypeConfidence": 0-100 integer,
  "extractedText": "every visible line of text on the letter, one per line, preserving structure",
  "visionNotes": "2-3 sentences describing what you see and any authenticity concerns",
  "anomalyFlags": ["short phrases naming specific issues, e.g. 'inconsistent font in salary line'"],
  "visionConfidence": 0-100 integer estimating how likely this looks like a GENUINE corporate offer letter (only meaningful if documentType='offer_letter'),
  "hasLetterhead": true|false,
  "hasSignature": true|false
}

Rules:
- documentType: choose ONE:
  • "offer_letter"  — a specific personalized job-offer letter from employer to candidate
  • "cv"            — a CV or résumé (personal work history)
  • "job_advert"    — a job posting or recruitment advert (employer promoting a role)
  • "visa"          — a visa page or work permit
  • "unknown"       — none of the above, or unreadable
- documentTypeConfidence: how sure you are of the documentType choice.
- extractedText: capture EVERY visible line.
- anomalyFlags: only ACTUAL observations.
- visionConfidence: only meaningful when documentType='offer_letter'. Otherwise 0.
- hasLetterhead: TRUE if branded/logo header visible.
- hasSignature: TRUE if signature visible near closing.
- Return ONLY the JSON. No commentary, no code fences.`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${safeType};base64,${base64}`, detail: "high" },
            },
          ],
        },
      ],
      max_tokens: 3000,
      temperature: 0.2,
    });
    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw);
    const validTypes = new Set(["visa","cv","job_advert","offer_letter","unknown"]);
    const rawType = String(parsed.documentType ?? "").toLowerCase();
    const documentType: DocumentType | null = validTypes.has(rawType) ? (rawType as DocumentType) : null;
    const documentTypeConfidence = typeof parsed.documentTypeConfidence === "number"
      ? Math.max(0, Math.min(100, Math.round(parsed.documentTypeConfidence)))
      : null;
    return {
      text: String(parsed.extractedText ?? ""),
      vision: {
        notes:            String(parsed.visionNotes ?? ""),
        anomalyFlags:     Array.isArray(parsed.anomalyFlags) ? parsed.anomalyFlags.map(String) : [],
        visionConfidence: typeof parsed.visionConfidence === "number"
                          ? Math.max(0, Math.min(100, Math.round(parsed.visionConfidence)))
                          : null,
      },
      hasLetterhead: typeof parsed.hasLetterhead === "boolean" ? parsed.hasLetterhead : null,
      hasSignature:  typeof parsed.hasSignature  === "boolean" ? parsed.hasSignature  : null,
      documentType,
      documentTypeConfidence,
    };
  } catch (err: any) {
    console.warn("[OfferCheck] Vision pass failed:", err?.message);
    return { text: "", vision: null, hasLetterhead: null, hasSignature: null, documentType: null, documentTypeConfidence: null };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple physical-address detection (post-OCR)
// ─────────────────────────────────────────────────────────────────────────────

function detectPhysicalAddress(ocr: string): boolean {
  // Heuristic: line contains a street pattern (number + word + street/road/avenue)
  // OR a postal code + city pattern.
  const streetRe = /\b\d{1,6}\s+[A-Z][A-Za-z]+\s+(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Drive|Dr\.?|Way|Highway|Hwy\.?)\b/;
  const cityPostalRe = /\b(?:P\.?O\.?\s*Box|PO Box)\s*\d+|\b\d{5,6}\s+[A-Z][a-z]+\b/;
  return streetRe.test(ocr) || cityPostalRe.test(ocr);
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

async function saveCheck(args: {
  userId: string | null;
  guestFp: string;
  originalname: string;
  mimetype: string;
  size: number;
  sha256: string;
  ocrText: string;
  method: string;
  report: ScreenOfferReport;
}): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO offer_letter_checks
       (id, user_id, guest_fingerprint,
        original_filename, mime_type, file_size_bytes, file_sha256,
        ocr_text, extraction_method,
        candidate_name, employer_name, position_title, work_country,
        salary_amount, salary_currency, start_date,
        sender_domain, domain_matches_company,
        has_letterhead, has_signature, has_physical_address,
        risk_score, risk_band, findings,
        ai_vision_used, ai_vision_notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             $10, $11, $12, $13,
             $14, $15, $16::date,
             $17, $18,
             $19, $20, $21,
             $22, $23, $24::jsonb,
             $25, $26)`,
    [
      id, args.userId, args.userId ? null : args.guestFp,
      args.originalname, args.mimetype, args.size, args.sha256,
      args.ocrText.slice(0, 20000), args.method,
      args.report.parsed.candidateName, args.report.parsed.employerName,
      args.report.parsed.positionTitle, args.report.parsed.workCountry,
      args.report.parsed.salaryAmount, args.report.parsed.salaryCurrency,
      args.report.parsed.startDate,
      args.report.employer.senderDomain, args.report.employer.domainMatchesCompany,
      args.report.employer.hasLetterhead, args.report.employer.hasSignature,
      args.report.employer.hasPhysicalAddress,
      args.report.riskScore, args.report.riskBand, JSON.stringify(args.report.findings),
      args.report.aiVisionUsed, args.report.aiVisionNotes,
    ],
  );
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerOfferCheckRoute(app: Express): void {
  app.post(
    "/api/tools/offer-check",
    upload.single("file"),
    async (req: any, res: Response) => {
      const t0 = Date.now();
      try {
        if (!req.file) {
          return res.status(400).json({ message: "Please upload the offer letter (PDF, Word, or image)." });
        }

        const userId: string | null = req.user?.claims?.sub ?? req.user?.id ?? null;
        const guestFp = guestFingerprint(req);

        if (await overDailyLimit(userId, guestFp)) {
          return res.status(429).json({
            message: `Free daily limit reached (${FREE_DAILY_LIMIT} checks per 24h). Try again later, or sign in for a higher limit.`,
            limit:   FREE_DAILY_LIMIT,
          });
        }

        // ── OCR ─────────────────────────────────────────────────────────
        const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
        let ocrText = "";
        let method = "";
        let vision: AiVisionObservation | null = null;
        let hasLetterhead: boolean | null = null;
        let hasSignature: boolean | null = null;
        let visionDocType: DocumentType | null = null;
        let visionDocTypeConf: number | null = null;

        const isDoc =
          req.file.mimetype === "application/pdf" ||
          req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          req.file.mimetype === "application/msword";

        if (isDoc) {
          const extracted = await extractTextFromBuffer(
            req.file.buffer, req.file.mimetype, req.file.originalname,
          ).catch(() => ({ text: "", method: "error" }));
          ocrText = extracted.text ?? "";
          method  = extracted.method ?? "doc";
          if (ocrText.trim().length < 100) {
            const v = await runVisionPass(req.file.buffer, "image/jpeg").catch(() => null);
            if (v && v.text) {
              ocrText = v.text;
              vision = v.vision;
              hasLetterhead = v.hasLetterhead;
              hasSignature  = v.hasSignature;
              visionDocType = v.documentType;
              visionDocTypeConf = v.documentTypeConfidence;
              method += "+vision";
            }
          }
        } else {
          const v = await runVisionPass(req.file.buffer, req.file.mimetype);
          ocrText = v.text;
          vision  = v.vision;
          hasLetterhead = v.hasLetterhead;
          hasSignature  = v.hasSignature;
          visionDocType = v.documentType;
          visionDocTypeConf = v.documentTypeConfidence;
          method  = "vision";
        }

        if (!ocrText || ocrText.trim().length < 40) {
          return res.status(422).json({
            message: "Could not read enough text from the document. Try a clearer photo or PDF export.",
          });
        }

        // ── Document-type gate ─────────────────────────────────────────
        const classification = classifyDocument({
          text: ocrText,
          visionHint: visionDocType
            ? { type: visionDocType, confidence: visionDocTypeConf ?? 0 }
            : null,
        });
        const wrongDoc = checkDocumentType(classification, "offer_letter");
        // 2026-07: user can force-continue past the wrong-doc gate. Real
        // offer letters (esp. short, non-English, or informal) sometimes
        // score below the classifier's confidence floor. The user sees the
        // warning card first; if they tap "Analyze anyway", the client
        // re-submits with forceAnalyze=true and we run the full screen.
        const forceAnalyzeRaw = (req.body as any)?.forceAnalyze ?? (req.query as any)?.forceAnalyze;
        const forceAnalyze = forceAnalyzeRaw === true || forceAnalyzeRaw === "true" || forceAnalyzeRaw === "1";
        if (wrongDoc && !forceAnalyze) {
          console.log(
            `[OfferCheck] Rejected: detected=${classification.type} conf=${classification.confidence} ` +
            `for upload="${req.file.originalname}"`,
          );
          return res.status(422).json(wrongDoc);
        }

        // ── Parse + screen ──────────────────────────────────────────────
        const parsed   = parseVisibleFields(ocrText);
        const domainCk = extractSenderDomain(ocrText, parsed.employerName);
        const hasAddr  = detectPhysicalAddress(ocrText);

        const employer: EmployerSignals = {
          senderDomain:         domainCk.senderDomain,
          domainMatchesCompany: domainCk.domainMatchesCompany,
          hasLetterhead,
          hasSignature,
          hasPhysicalAddress:   hasAddr,
        };

        const report = screenOffer({ ocrText, parsed, employer, aiVision: vision });

        // ── Persist ─────────────────────────────────────────────────────
        const checkId = await saveCheck({
          userId, guestFp,
          originalname: req.file.originalname,
          mimetype:     req.file.mimetype,
          size:         req.file.size,
          sha256,
          ocrText, method,
          report,
        });

        console.log(
          `[OfferCheck] checkId=${checkId} band=${report.riskBand} score=${report.riskScore} ` +
          `findings=${report.findings.length} in ${Date.now() - t0}ms`,
        );

        res.json({
          checkId,
          riskScore:      report.riskScore,
          riskBand:       report.riskBand,
          findings:       report.findings,
          parsed:         report.parsed,
          employer:       report.employer,
          headline:       report.headline,
          recommendation: report.recommendation,
          aiVisionUsed:   report.aiVisionUsed,
          aiVisionNotes:  report.aiVisionNotes,
          disclaimer:     "This is a screening tool, not official verification. Always verify the employer independently — check their registered office, LinkedIn, and never pay any fee before signing a verified contract.",
        });
      } catch (err: any) {
        console.error("[OfferCheck] endpoint error:", err?.message);
        res.status(500).json({
          message: "Could not screen the document right now. Please try again shortly.",
        });
      }
    },
  );

  console.log("[OfferCheck] Route registered: POST /api/tools/offer-check");
}
