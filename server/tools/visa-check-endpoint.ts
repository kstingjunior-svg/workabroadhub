/**
 * Visa Screening — HTTP endpoint (RC1 free tool).
 *
 *   POST /api/tools/visa-check
 *     multipart/form-data { file: JPG|PNG|WEBP|PDF, up to 10 MB }
 *   Response 200:
 *     { checkId, riskScore, riskBand, findings[], parsed, mrz, headline,
 *       recommendation, aiVisionUsed }
 *
 * Pipeline:
 *   1. Validate upload (mime + size).
 *   2. Compute sha-256 of the bytes (dedup + audit).
 *   3. Extract text — image → OpenAI Vision (single call that BOTH extracts
 *      text AND returns forensic observations); PDF → pdfjs-dist; DOCX not
 *      accepted (visas aren't Word docs).
 *   4. Parse MRZ + visible fields from the extracted text.
 *   5. Screen via `screenVisa()` pure logic.
 *   6. Persist to `visa_checks` with 30-day retention.
 *   7. Return the report.
 *
 * Rate limiting: mounted under /api/tools which is already behind aiLimiter
 * in server/index.ts (per-IP window across all tool routes). Additional
 * per-user daily cap enforced here for authenticated users.
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { pool } from "../db";
import { openai } from "../lib/openai";
import { extractTextFromBuffer } from "../utils/extract-text";
import {
  parseMrz,
  screenVisa,
  type AiVisionObservation,
  type ParsedVisaFields,
  type ScreenVisaReport,
} from "./visa-screening";

// ── Multer: 10 MB, images + PDF only ────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/pdf";
    cb(null, ok);
  },
});

// ── Daily per-user cap ──────────────────────────────────────────────────────
const FREE_DAILY_LIMIT = 3;

async function overDailyLimit(userId: string | null, guestFp: string): Promise<boolean> {
  const idCol = userId ? "user_id" : "guest_fingerprint";
  const idVal = userId ?? guestFp;
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM visa_checks
      WHERE ${idCol} = $1
        AND created_at > NOW() - INTERVAL '24 hours'`,
    [idVal],
  );
  return Number(rows[0]?.n ?? 0) >= FREE_DAILY_LIMIT;
}

// ── Guest fingerprint (privacy-preserving) ──────────────────────────────────
function guestFingerprint(req: Request): string {
  const ip = String(req.ip ?? req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  const ua = String(req.headers["user-agent"] ?? "");
  return crypto.createHash("sha256").update(`${ip}::${ua}`).digest("hex").slice(0, 32);
}

// ── OpenAI Vision: extract text + look for tampering ────────────────────────
async function runVisionPass(
  buffer: Buffer,
  mimetype: string,
): Promise<{ text: string; vision: AiVisionObservation | null }> {
  const base64   = buffer.toString("base64");
  const safeType = mimetype.startsWith("image/") ? mimetype : "image/jpeg";

  const prompt = `You are reviewing a visa or work-permit image for a document-screening tool.

Return your response as valid JSON matching this exact shape:
{
  "extractedText": "every visible line of text on the document, one per line",
  "visionNotes": "2-3 sentences describing what you see and any authenticity concerns",
  "anomalyFlags": ["short phrases naming specific issues, e.g. 'font inconsistency in date field', 'copy-paste artifact around visa number'"],
  "visionConfidence": 0-100 integer estimating how likely this looks like a genuine visa document
}

Rules:
- extractedText: capture EVERY visible line, including numbers, dates, MRZ zone at the bottom. Preserve MRZ characters exactly including "<".
- anomalyFlags: only include ACTUAL observations. If nothing looks off, return an empty array. Do not invent problems.
- visionConfidence: 80-100 = looks genuine and consistent, 40-79 = some concerns, 0-39 = strong tampering indicators OR does not look like a visa at all.
- If the image is not a visa/permit at all, set visionConfidence very low and add a flag.
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
      max_tokens: 2500,
      temperature: 0.2,
    });
    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw);
    return {
      text: String(parsed.extractedText ?? ""),
      vision: {
        notes:            String(parsed.visionNotes ?? ""),
        anomalyFlags:     Array.isArray(parsed.anomalyFlags) ? parsed.anomalyFlags.map(String) : [],
        visionConfidence: typeof parsed.visionConfidence === "number"
                          ? Math.max(0, Math.min(100, Math.round(parsed.visionConfidence)))
                          : null,
      },
    };
  } catch (err: any) {
    console.warn("[VisaCheck] Vision pass failed:", err?.message);
    return { text: "", vision: null };
  }
}

// ── Field parsing from OCR text ─────────────────────────────────────────────
//
// Very heuristic — driven by regex patterns commonly seen on visa faces.
// The AI vision pass usually returns clean line-by-line output which makes
// these regexes reliable enough for an MVP.
function parseVisibleFields(ocr: string): ParsedVisaFields {
  const lines = ocr.split(/\r?\n/).map((l) => l.trim());
  const text  = ocr.replace(/\s+/g, " ");

  const num = /(?:visa|permit|reference|no\.?)\s*(?:number|no|#)?\s*[:\-]?\s*([A-Z0-9]{6,15})/i.exec(text);
  const visaNumber = num?.[1] ?? null;

  const country = (() => {
    const m = /(?:issued\s*by|country|state|issuing\s*state)\s*[:\-]?\s*([A-Z][A-Za-z ]{2,25})/i.exec(text);
    if (m) return m[1].trim();
    // Sniff for common country names.
    const names = ["United Arab Emirates", "UAE", "Saudi Arabia", "Qatar",
                   "United Kingdom", "Canada", "Germany", "United States"];
    for (const n of names) if (new RegExp(`\\b${n}\\b`, "i").test(ocr)) return n;
    return null;
  })();

  const holder = /(?:name|holder|surname)\s*[:\-]?\s*([A-Z][A-Za-z' -]{2,40}(?:\s+[A-Z][A-Za-z' -]{2,40}){0,3})/.exec(text);
  const holderName = holder?.[1]?.trim() ?? null;

  const type = /(?:visa\s*type|category|class|purpose)\s*[:\-]?\s*([A-Za-z][A-Za-z ]{2,30})/i.exec(text);
  const visaType = type?.[1]?.trim() ?? null;

  const issue  = extractDate(text, /(?:issue|issued|date\s*of\s*issue|from)\s*[:\-]?\s*/i);
  const expiry = extractDate(text, /(?:expiry|expires|valid\s*until|to|until)\s*[:\-]?\s*/i);

  return {
    visaNumber,
    issuingCountry: country,
    holderName,
    visaType,
    issueDate:  issue,
    expiryDate: expiry,
  };
}

function extractDate(text: string, prefixRe: RegExp): string | null {
  // Look for the prefix followed by a recognisable date.
  const idx = text.search(prefixRe);
  if (idx < 0) return null;
  const window = text.slice(idx, idx + 60);
  const patterns = [
    /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/,        // YYYY-MM-DD
    /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/,        // DD-MM-YYYY
    /(\d{1,2})\s+([A-Z][a-z]{2,8})\s+(\d{4})/,    // 12 Jan 2027
  ];
  for (const p of patterns) {
    const m = p.exec(window);
    if (m) return normalizeDate(m);
  }
  return null;
}

function normalizeDate(m: RegExpExecArray): string {
  if (m[1].length === 4) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if (/[A-Z][a-z]{2,8}/.test(m[2])) {
    const months: Record<string, string> = {
      jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
      jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
    };
    const key = m[2].slice(0, 3).toLowerCase();
    return `${m[3]}-${months[key] ?? "01"}-${pad(m[1])}`;
  }
  return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
}
function pad(s: string): string { return s.length === 1 ? `0${s}` : s; }

// ── Persistence ─────────────────────────────────────────────────────────────
async function saveCheck(args: {
  userId: string | null;
  guestFp: string;
  originalname: string;
  mimetype: string;
  size: number;
  sha256: string;
  ocrText: string;
  ocrMethod: string;
  report: ScreenVisaReport;
}): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO visa_checks
       (id, user_id, guest_fingerprint,
        original_filename, mime_type, file_size_bytes, image_sha256,
        ocr_text, ocr_method,
        visa_number, issuing_country, holder_name, visa_type,
        issue_date, expiry_date,
        mrz_present, mrz_raw, mrz_checksum_valid,
        risk_score, risk_band, findings,
        ai_vision_used, ai_vision_notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             $10, $11, $12, $13,
             $14::date, $15::date,
             $16, $17, $18,
             $19, $20, $21::jsonb,
             $22, $23)`,
    [
      id, args.userId, args.userId ? null : args.guestFp,
      args.originalname, args.mimetype, args.size, args.sha256,
      args.ocrText.slice(0, 15000), args.ocrMethod,
      args.report.parsed.visaNumber, args.report.parsed.issuingCountry,
      args.report.parsed.holderName, args.report.parsed.visaType,
      args.report.parsed.issueDate, args.report.parsed.expiryDate,
      args.report.mrz.present, args.report.mrz.raw, args.report.mrz.checksumValid,
      args.report.riskScore, args.report.riskBand, JSON.stringify(args.report.findings),
      args.report.aiVisionUsed, args.report.aiVisionNotes,
    ],
  );
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerVisaCheckRoute(app: Express): void {
  app.post(
    "/api/tools/visa-check",
    upload.single("file"),
    async (req: any, res: Response) => {
      const t0 = Date.now();
      try {
        if (!req.file) {
          return res.status(400).json({ message: "Please upload the visa image or PDF." });
        }

        const userId: string | null = req.user?.claims?.sub ?? req.user?.id ?? null;
        const guestFp = guestFingerprint(req);

        // Per-user (or per-guest) daily cap. We deliberately DO NOT tell
        // guests "sign up for more" here — that's the frontend's job so we
        // can A/B the CTA copy.
        if (await overDailyLimit(userId, guestFp)) {
          return res.status(429).json({
            message: `Free daily limit reached (${FREE_DAILY_LIMIT} checks per 24h). Try again later, or sign in for a higher limit.`,
            limit:   FREE_DAILY_LIMIT,
          });
        }

        // ── OCR ─────────────────────────────────────────────────────────
        const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
        let ocrText = "";
        let ocrMethod = "";
        let vision: AiVisionObservation | null = null;

        if (req.file.mimetype === "application/pdf") {
          const extracted = await extractTextFromBuffer(
            req.file.buffer, req.file.mimetype, req.file.originalname,
          ).catch(() => ({ text: "", method: "error" }));
          ocrText   = extracted.text ?? "";
          ocrMethod = extracted.method ?? "pdf";
          // Vision pass is skipped for pure PDFs — they usually have a
          // clean text layer already. If the PDF was a scan we still try:
          if (ocrText.trim().length < 50) {
            const v = await runVisionPass(req.file.buffer, "image/jpeg").catch(() => null);
            if (v) { ocrText = v.text; vision = v.vision; ocrMethod += "+vision"; }
          }
        } else {
          const v = await runVisionPass(req.file.buffer, req.file.mimetype);
          ocrText   = v.text;
          vision    = v.vision;
          ocrMethod = "vision";
        }

        if (!ocrText || ocrText.trim().length < 20) {
          return res.status(422).json({
            message: "Could not read enough text from the image. Try a clearer photo or a PDF export.",
          });
        }

        // ── Parse + screen ──────────────────────────────────────────────
        const parsed = parseVisibleFields(ocrText);
        const mrz    = parseMrz(ocrText);
        const report = screenVisa({ ocrText, parsed, mrz, aiVision: vision });

        // ── Persist ─────────────────────────────────────────────────────
        const checkId = await saveCheck({
          userId, guestFp,
          originalname: req.file.originalname,
          mimetype:     req.file.mimetype,
          size:         req.file.size,
          sha256,
          ocrText, ocrMethod,
          report,
        });

        console.log(
          `[VisaCheck] checkId=${checkId} band=${report.riskBand} score=${report.riskScore} ` +
          `mrz=${mrz.present}/${mrz.checksumValid} in ${Date.now() - t0}ms`,
        );

        // ── Respond ─────────────────────────────────────────────────────
        res.json({
          checkId,
          riskScore:      report.riskScore,
          riskBand:       report.riskBand,
          findings:       report.findings,
          parsed:         report.parsed,
          mrz: {
            present:       report.mrz.present,
            checksumValid: report.mrz.checksumValid,
            issuingState:  report.mrz.issuingState,
            documentType:  report.mrz.documentType,
            checkDetails:  report.mrz.checkDetails,
          },
          headline:       report.headline,
          recommendation: report.recommendation,
          aiVisionUsed:   report.aiVisionUsed,
          aiVisionNotes:  report.aiVisionNotes,
          disclaimer:     "This is a screening tool, not an official verification. For legal or travel decisions, always verify with the issuing authority.",
        });
      } catch (err: any) {
        console.error("[VisaCheck] endpoint error:", err?.message);
        res.status(500).json({
          message: "Could not screen the document right now. Please try again shortly.",
        });
      }
    },
  );

  console.log("[VisaCheck] Route registered: POST /api/tools/visa-check");
}
