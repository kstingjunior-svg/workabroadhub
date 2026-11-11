/**
 * Field-extraction model call. The model is used ONLY to read the document
 * (and list concrete visual observations). It never scores authenticity.
 * Image inputs are required for photos; PDFs/Word go as extracted text only
 * (data minimisation — the original file never leaves our server for those).
 */
import { openai } from "../lib/openai";
import { INJECTION_SYSTEM_RULES, wrapUntrusted } from "./guards";

export type ExtractionInput =
  | { kind: "image"; imageBase64DataUrl: string }
  | { kind: "text"; text: string; sourceFilename?: string };

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
}

export const EXTRACTION_MODEL = process.env.VERIFYX_MODEL || "gpt-4o";
// USD per 1M tokens. Estimates only — override via env when pricing changes.
const COST_IN = Number(process.env.VERIFYX_COST_IN_PER_M ?? 2.5);
const COST_OUT = Number(process.env.VERIFYX_COST_OUT_PER_M ?? 10);

export class ExtractionError extends Error {
  constructor(public userMessage: string, message: string) { super(message); }
}

export async function extractJson(
  systemPrompt: string,
  input: ExtractionInput,
  docLabel: string,
  maxTokens = 2000,
): Promise<{ json: any; usage: ModelUsage }> {
  const userContent: any[] =
    input.kind === "image"
      ? [
          { type: "text", text: `Extract the fields from this ${docLabel} image. Return the JSON only.` },
          { type: "image_url", image_url: { url: input.imageBase64DataUrl, detail: "high" } },
        ]
      : [
          {
            type: "text",
            text:
              `The user uploaded a ${docLabel} as a PDF/Word file; only its extracted text is available, so visual observations must be an empty array.\n\n` +
              wrapUntrusted(input.text).block +
              "\n\nReturn the JSON only.",
          },
        ];

  const call = async (content: any[], tokens: number) => {
    const completion = await openai.chat.completions.create({
      model: EXTRACTION_MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: tokens,
      messages: [
        { role: "system", content: systemPrompt + "\n" + INJECTION_SYSTEM_RULES },
        { role: "user", content },
      ],
    });
    // A long or non-English document (e.g. a Polish work permit) can run past
    // max_tokens; the JSON is then cut off mid-string and JSON.parse throws.
    // Surface that explicitly so the caller retries with more room.
    if (completion.choices[0]?.finish_reason === "length") {
      throw new Error(`output truncated at ${tokens} tokens (finish_reason=length)`);
    }
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const u: any = completion.usage ?? {};
    return {
      json: JSON.parse(raw),
      usage: {
        model: EXTRACTION_MODEL,
        inputTokens: u.prompt_tokens ?? 0,
        outputTokens: u.completion_tokens ?? 0,
        estCostUsd: ((u.prompt_tokens ?? 0) * COST_IN + (u.completion_tokens ?? 0) * COST_OUT) / 1_000_000,
      } as ModelUsage,
    };
  };

  try {
    return await call(userContent, maxTokens);
  } catch (err: any) {
    const msg = String(err?.message ?? "").toLowerCase();
    // 2026-11: the raw reason was never logged, so failures like a customer's
    // Polish work permit (4/4 attempts, PDF and photos) were undiagnosable.
    console.error(`[VerifyX] extraction failed (${input.kind}, ${docLabel}): ${String(err?.message ?? err).slice(0, 300)}`);
    const jsonIssue = msg.includes("json") || msg.includes("unexpected token") || msg.includes("unterminated string") || msg.includes("truncated");
    const fatal = msg.includes("insufficient_quota") || msg.includes("credit") || msg.includes("429") || msg.includes("rate limit");
    if (jsonIssue && !fatal) {
      // Retry once with much more room — for photos too (previously only text
      // inputs were retried, so a long photographed document always failed).
      const retryTokens = Math.max(maxTokens * 3, 6000);
      try {
        if (input.kind === "text") {
          const cleaned = input.text.replace(/[֐-ࣿ一-鿿぀-ヿ가-힯]+/g, " ");
          const retry = [{
            type: "text",
            text: `The user uploaded a ${docLabel}; only text is available. Visual observations must be an empty array.\n\n` +
              wrapUntrusted(cleaned).block +
              "\n\nReturn VALID JSON only. Keep every string value short. String values must be plain ASCII English (transliterate non-Latin text).",
          }];
          return await call(retry, retryTokens);
        }
        const retry = [
          { type: "text", text: `Extract the fields from this ${docLabel} image. Return VALID JSON only. Keep every string value short; write values in plain ASCII English (transliterate or translate non-English text).` },
          userContent[1],
        ];
        return await call(retry, retryTokens);
      } catch (err2: any) {
        console.error(`[VerifyX] extraction retry failed (${input.kind}, ${docLabel}): ${String(err2?.message ?? err2).slice(0, 300)}`);
        throw new ExtractionError(mapModelError(err2?.message ?? ""), err2?.message ?? "extraction failed");
      }
    }
    throw new ExtractionError(mapModelError(err?.message ?? ""), err?.message ?? "extraction failed");
  }
}

export function mapModelError(msg: string): string {
  const lower = (msg || "").toLowerCase();
  if (lower.includes("insufficient_quota") || lower.includes("exceeded your current quota") || lower.includes("credit")) {
    return "Our document reader is temporarily unavailable. Our team has been notified — please try again in 10-15 minutes. No charge has been kept.";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "We're handling many checks right now. Please wait 30 seconds and try again. No charge has been kept.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Reading the document took too long. Please try again with a smaller or clearer file. No charge has been kept.";
  }
  if (lower.includes("invalid_image") || lower.includes("image")) {
    return "We couldn't read that image. Please upload a clear JPG or PNG photo, or the original PDF. No charge has been kept.";
  }
  return "We couldn't read this document. Please try again with a clearer photo or scan. No charge has been kept.";
}

// ── Small coercion helpers ────────────────────────────────────────────
export function str(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || /^(null|unknown|n\/a|none)$/i.test(s) ? null : s.slice(0, 300);
}
export function bool(v: any): boolean {
  return v === true || v === "true" || v === 1;
}
export function arr(v: any, max = 10): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim().slice(0, 300)).slice(0, max) : [];
}
export function num(v: any): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.\-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}
export function conf(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
}
export function confMap(v: any): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) out[k] = conf(x);
  return out;
}
