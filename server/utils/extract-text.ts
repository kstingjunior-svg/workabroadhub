// @ts-nocheck
/**
 * extractTextFromBuffer
 *
 * Single shared utility for turning an uploaded file buffer into plain text.
 * Handles PDF, DOCX, plain-text, and unknown formats with a graceful cascade:
 *
 *   PDF  → pdfjs-dist (legacy) → BT/ET operator extraction → Tesseract OCR → ""
 *   DOCX → mammoth extractRawText
 *   TXT  → UTF-8 decode
 *   ???  → try each in order: pdfjs-dist → mammoth → raw UTF-8 strip
 *
 * Returns:
 *   { text: string; method: string }
 *   `text` is always a string (may be empty if nothing worked).
 *   `method` is a short label useful for logging.
 *
 * Callers should check `text.trim().length < MIN_CV_LENGTH` themselves and
 * surface an appropriate user message.
 */

export const MIN_CV_LENGTH = 50; // characters — below this the extraction is considered empty

/**
 * Parse the ATS score that the AI bakes into the structured CV output.
 * Matches "ATS SCORE: 82/100" (case-insensitive, flexible spacing).
 * Returns null when no score is present (e.g. for the free checker output,
 * which is JSON rather than the paid-service text format).
 */
export function extractScore(text: string): number | null {
  const m = text.match(/ATS SCORE:\s*(\d{1,3})\s*\/\s*100/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 0 && n <= 100 ? n : null;
}

export interface ExtractionResult {
  text:   string;
  method: string;
}

/**
 * Decides whether an extracted string contains actual human-readable text.
 *
 * Criteria:
 *  1. At least 40 % of non-whitespace characters must be ASCII letters (a-z/A-Z).
 *  2. There must be at least 8 "word tokens" of 3+ alphabetical characters.
 *
 * This catches the common failure mode where the raw-ASCII-strip fallback
 * returns binary PDF metadata noise that superficially looks like text.
 */
export function isReadableText(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  const noSpace   = text.replace(/\s+/g, "");
  if (noSpace.length === 0) return false;

  const letterCount = (text.match(/[a-zA-Z]/g) ?? []).length;
  const letterRatio = letterCount / noSpace.length;

  const wordTokens  = (text.match(/[a-zA-Z]{3,}/g) ?? []).length;

  return letterRatio >= 0.40 && wordTokens >= 8;
}

/**
 * Conservative BT/ET operator-block extractor.
 * Only returns text if we can find real word-like sequences from the blocks.
 * Returns "" (empty) if the result doesn't look human-readable — which lets
 * callers surface a proper "couldn't parse" error instead of sending garbage to AI.
 */
function extractRawPdfText(buf: Buffer): string {
  try {
    const raw     = buf.toString("latin1");
    const matches = raw.match(/BT[\s\S]{0,2000}?ET/g) ?? [];
    const words: string[] = [];

    for (const block of matches) {
      // Tj / TJ operators carry the actual visible text
      const tjs = block.match(/\((.*?)\)\s*T[jJ]/g) ?? [];
      for (const tj of tjs) {
        const m = tj.match(/\((.*?)\)/);
        if (m) {
          const token = m[1]
            .replace(/\\n/g, " ")
            .replace(/\\r/g, " ")
            .replace(/\\t/g, " ")
            .replace(/\\\(/g, "(")
            .replace(/\\\)/g, ")")
            .replace(/\\/g, "")
            .trim();
          // Only keep tokens that look like actual words/phrases
          if (token.length > 0 && /[a-zA-Z]{2,}/.test(token)) {
            words.push(token);
          }
        }
      }
    }

    const candidate = words.join(" ");
    // Only return if we have genuinely readable content
    if (isReadableText(candidate) && candidate.length >= MIN_CV_LENGTH) {
      return candidate;
    }

    // All extraction paths exhausted — return empty so callers can show a
    // proper "we couldn't read your PDF" message instead of sending noise to AI.
    return "";
  } catch {
    return "";
  }
}

/**
 * pdf-parse extraction — DEPRECATED, kept only to avoid breaking any
 * downstream importer that might still call it.
 *
 * 2026-06 PERMANENT FIX (Tony's daily audit): the installed pdf-parse
 * (v2.4.5) is a complete rewrite that internally uses pdfjs-dist v5, which
 * now requires native canvas bindings (DOMMatrix / ImageData / Path2D)
 * just to LOAD the module in Node.js. Installing canvas on Render is heavy
 * and brittle; we don't need it. Our pdfjs-dist legacy build (used by
 * tryPdfJs below) does the same job without canvas and works reliably in
 * production — every successful CV extraction in the prod logs comes from
 * that path.
 *
 * Old v1 API used to be `const pdfParse = (await import("pdf-parse")).default;`
 * which only worked because the package exported a function. v2 has no
 * default export (only the `PDFParse` class), so that call always threw
 * "pdfParse is not a function" and we silently fell through.
 *
 * Rather than wire up the v2 class API and then fail at canvas-polyfill
 * time, we just stop attempting this path. The cascade below uses
 * pdfjs-dist as the primary extractor, which is what was always doing the
 * real work anyway.
 */
async function tryPdf(_buf: Buffer): Promise<string> {
  // No-op — pdfjs-dist legacy (tryPdfJs) is the primary PDF extractor now.
  return "";
}

async function tryMammoth(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result  = await mammoth.extractRawText({ buffer: buf });
  return result.value ?? "";
}

/**
 * pdfjs-dist extraction — handles compressed / cross-reference-stream PDFs.
 * Uses the legacy Node.js build (no canvas dependency required).
 */
async function tryPdfJs(buf: Buffer): Promise<string> {
  try {
    const { pathToFileURL } = await import("url");
    const { resolve }       = await import("path");

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs" as string) as any;

    // v5 requires an explicit workerSrc — point at the bundled worker file
    if (pdfjs.GlobalWorkerOptions) {
      const workerPath = resolve(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    }

    const data        = new Uint8Array(buf);
    const loadingTask = pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false });
    const pdf         = await loadingTask.promise;

    const pageTexts: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();
      const text    = (content.items as any[])
        .map((item: any) => item.str ?? "")
        .join(" ");
      pageTexts.push(text);
    }

    return pageTexts.join("\n").trim();
  } catch (err) {
    console.warn("[extractText] pdfjs-dist failed:", err instanceof Error ? err.message : err);
    return "";
  }
}

/**
 * OCR fallback using Tesseract.js.
 * Works on scanned image-PDFs and plain image files.
 * Tesseract v5 internally uses pdfjs to render the first page of a PDF,
 * so a PDF buffer can be passed directly.
 * Returns "" on failure so the caller can move to the next fallback.
 */
async function tryOCR(buf: Buffer, filename?: string): Promise<string> {
  try {
    const { createWorker } = await import("tesseract.js");
    console.log("[extractText] Attempting Tesseract OCR…");
    const worker = await createWorker("eng", 1, {
      logger: () => {},          // silence progress spam
      errorHandler: () => {},
    });
    const { data } = await worker.recognize(buf);
    await worker.terminate();
    const text = (data.text ?? "").trim();
    console.log(`[extractText] OCR returned ${text.length} chars (confidence: ${Math.round(data.confidence ?? 0)}%)`);
    return text;
  } catch (err) {
    console.warn("[extractText] Tesseract OCR failed:", err instanceof Error ? err.message : err);
    return "";
  }
}

export async function extractTextFromBuffer(
  buffer:    Buffer,
  mimeType:  string,
  filename?: string,
): Promise<ExtractionResult> {
  const mime = (mimeType  ?? "").toLowerCase();
  const name = (filename  ?? "").toLowerCase();

  const isPdf  = mime.includes("pdf")  || name.endsWith(".pdf");
  const isDocx = mime.includes("word") || mime.includes("officedocument") ||
                 name.endsWith(".docx") || name.endsWith(".doc");
  const isTxt  = mime.includes("text") || name.endsWith(".txt") || name.endsWith(".rtf");

  // ── PDF ───────────────────────────────────────────────────────────────────
  if (isPdf) {
    let lowQualityFallback = "";

    // 2026-06 (Tony's audit): pdf-parse is intentionally NOT attempted
    // here anymore — see the long comment on `tryPdf` for the reason. The
    // pdfjs-dist legacy build is the primary extractor.

    // Attempt 1: pdfjs-dist legacy build — handles compressed / XRef-stream
    // PDFs, no native canvas required. This was the de-facto primary
    // extractor in production already (the old pdf-parse attempt always
    // failed); now it's officially the first try.
    try {
      const pdfjsText = await tryPdfJs(buffer);
      if (pdfjsText.length >= MIN_CV_LENGTH && isReadableText(pdfjsText)) {
        console.log(`[extractText] pdfjs-dist succeeded (${pdfjsText.length} chars)`);
        return { text: pdfjsText, method: "pdfjs-dist" };
      }
      if (pdfjsText.length >= MIN_CV_LENGTH) {
        lowQualityFallback = pdfjsText;
        console.warn("[extractText] pdfjs-dist returned low-quality text — keeping as fallback");
      }
    } catch { /* handled inside tryPdfJs */ }

    // Attempt 2: BT/ET operator extraction (only returns readable text or "")
    const raw = extractRawPdfText(buffer);
    if (raw.length >= MIN_CV_LENGTH) {
      return { text: raw, method: "pdf-raw-fallback" };
    }

    // Attempt 3: Tesseract OCR — handles scanned / image-only PDFs
    const ocrText = await tryOCR(buffer, filename);
    if (ocrText.length >= MIN_CV_LENGTH && isReadableText(ocrText)) {
      return { text: ocrText, method: "tesseract-ocr" };
    }

    // Attempt 4: Return the best text we have even if it failed the
    // readability heuristic — better to send imperfect text to the AI than
    // nothing. Sourced from the pdfjs-dist attempt above.
    if (lowQualityFallback.length >= MIN_CV_LENGTH) {
      console.warn("[extractText] Using low-quality pdfjs-dist text as last resort");
      return { text: lowQualityFallback, method: "pdfjs-fallback" };
    }

    // All local extraction methods exhausted.
    console.warn("[extractText] All PDF extraction methods failed or returned unreadable text.");
    return { text: "", method: "pdf-failed" };
  }

  // ── DOCX / DOC ────────────────────────────────────────────────────────────
  if (isDocx) {
    try {
      const text = await tryMammoth(buffer);
      return { text, method: "mammoth" };
    } catch (err) {
      console.warn("[extractText] mammoth failed:", err instanceof Error ? err.message : err);
      return { text: "", method: "mammoth-error" };
    }
  }

  // ── Plain text / RTF ──────────────────────────────────────────────────────
  if (isTxt) {
    return { text: buffer.toString("utf-8"), method: "utf8" };
  }

  // ── Unknown format: cascade ───────────────────────────────────────────────
  // 1. pdfjs-dist (was pdf-parse before the v2-API breakage)
  try {
    const text = await tryPdfJs(buffer);
    if (text.trim().length >= MIN_CV_LENGTH && isReadableText(text)) {
      return { text, method: "pdfjs-guess" };
    }
  } catch { /* try next */ }

  // 2. mammoth
  try {
    const text = await tryMammoth(buffer);
    if (text.trim().length >= MIN_CV_LENGTH) return { text, method: "mammoth-guess" };
  } catch { /* try next */ }

  // 3. raw UTF-8 — only return if it looks readable
  const utf8text = buffer.toString("utf-8").replace(/[^\x20-\x7E\n]/g, " ");
  if (isReadableText(utf8text)) return { text: utf8text, method: "utf8-strip-guess" };

  return { text: "", method: "unknown-failed" };
}
