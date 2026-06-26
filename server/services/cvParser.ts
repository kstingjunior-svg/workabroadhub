// server/services/cvParser.ts
//
// Incorporates reference's direct pdf-parse + mammoth path and typed error
// codes. Bug fix: the reference wraps everything in a single try/catch, which
// silently converts CV_EMPTY_OR_SCANNED into CV_PARSE_FAILED — fixed by
// checking the error code before re-throwing.
// OCR fallback (Tesseract) is kept for scanned PDFs that pass the parse step
// but yield < 200 chars of readable text.

import OpenAI from "openai";
import { extractTextFromBuffer } from "../utils/extract-text";
import { generateWithRetry } from "../utils/retry";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── typed error codes (mirrors reference) ────────────────────────────────────

export const CV_ERRORS = {
  EMPTY_OR_SCANNED: "CV_EMPTY_OR_SCANNED",
  PARSE_FAILED:     "CV_PARSE_FAILED",
} as const;

export type CvErrorCode = (typeof CV_ERRORS)[keyof typeof CV_ERRORS];

// ─── types ────────────────────────────────────────────────────────────────────

export interface ParseCVResult {
  success:         boolean;
  text:            string;
  isScanned:       boolean;
  weaknesses:      string[];
  missingKeywords: string[];
  score:           number;
  suggestions:     string[];
}

// ─── internal: extract raw text ──────────────────────────────────────────────

async function extractText(fileBuffer: Buffer, fileType: string, filename: string): Promise<string> {
  // 2026-06: route everything through the shared extractTextFromBuffer
  // cascade (pdf-parse v2 → pdfjs-dist → BT/ET ops → Tesseract OCR → mammoth
  // → utf-8). Previously this function had its own inline `pdf-parse v1`
  // call which always failed under v2 ("pdfParse is not a function") and
  // every CV was passed through to the fallback anyway. One canonical
  // extractor = one place to fix bugs.
  let text = "";
  try {
    const result = await extractTextFromBuffer(fileBuffer, fileType, filename);
    text = typeof result === "string" ? result : (result?.text ?? "");
  } catch (err: any) {
    if ((err?.message as string | undefined)?.startsWith("CV_")) throw err;
    throw new Error(CV_ERRORS.PARSE_FAILED);
  }

  // 🚨 CRITICAL VALIDATION (reference pattern)
  if (!text || text.length < 200) {
    throw new Error(CV_ERRORS.EMPTY_OR_SCANNED);
  }
  return text;
}

// ─── public API ──────────────────────────────────────────────────────────────

export async function parseCV(fileBuffer: Buffer, filename: string): Promise<ParseCVResult> {
  const fileType = filename.toLowerCase().endsWith(".docx")
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/pdf";

  let text: string;
  let isScanned = false;

  try {
    text = await extractText(fileBuffer, fileType, filename);
  } catch (err: any) {
    if (err?.message === CV_ERRORS.EMPTY_OR_SCANNED) {
      // Still return a result so the route can give actionable feedback
      isScanned = true;
      text = "";
    } else {
      throw err; // CV_PARSE_FAILED or unexpected — let route handle it
    }
  }

  const hasEnoughContent = text.length >= 500;
  const lowerText = text.toLowerCase();

  const keywordChecks: Record<string, string> = {
    "work experience": "work experience|experience",
    education:         "education|qualification",
    skills:            "skills|competenc",
    contact:           "email|phone|tel|contact",
    summary:           "summary|objective|profile",
  };

  const missingKeywords = Object.entries(keywordChecks)
    .filter(([, pattern]) => !new RegExp(pattern).test(lowerText))
    .map(([label]) => label);

  const weaknesses: string[] = [];
  if (isScanned)
    weaknesses.push("CV has very little extractable text — may be scanned or image-based");
  if (!isScanned && text.length < 300)
    weaknesses.push("CV content appears too short");
  if (missingKeywords.includes("contact"))
    weaknesses.push("No contact information detected");
  if (missingKeywords.includes("work experience"))
    weaknesses.push("Work experience section not clearly labelled");

  let score = 30;
  if (!isScanned) score += 20;
  if (hasEnoughContent) score += 20;
  score += Math.min(30, (5 - missingKeywords.length) * 6);
  score = Math.max(0, Math.min(100, score));

  const suggestions: string[] = [];
  if (isScanned)
    suggestions.push("Upload a text-based PDF for best results — scanned images reduce ATS compatibility");
  if (missingKeywords.includes("skills"))
    suggestions.push("Add a dedicated Skills section listing your key competencies");
  if (missingKeywords.includes("summary"))
    suggestions.push("Include a short professional summary at the top of your CV");
  if (!suggestions.length)
    suggestions.push("CV structure looks good — use the full ATS checker for a detailed score");

  return {
    success:         !isScanned,
    text,
    isScanned,
    weaknesses,
    missingKeywords,
    score,
    suggestions,
  };
}

// ─── CV rewrite ───────────────────────────────────────────────────────────────

export async function rewriteCV(rawText: string): Promise<string> {
  return generateWithRetry(async () => {
    const fixed = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert CV writer. Rewrite the provided CV to be polished, professional, and ATS-friendly. " +
            "Preserve all factual details (jobs, dates, qualifications). " +
            "Improve structure, action verbs, and quantify achievements where possible. " +
            "Output only the rewritten CV text — no commentary or preamble.",
        },
        {
          role: "user",
          content: `Fix and rewrite this CV professionally:\n${rawText.slice(0, 8000)}`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.4,
    });

    const result = fixed.choices[0]?.message?.content?.trim();
    if (!result) throw new Error("CV_REWRITE_FAILED");
    return result;
  });
}
