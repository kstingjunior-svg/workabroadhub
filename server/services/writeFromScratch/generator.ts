/**
 * Write-from-Scratch generator.
 *
 * Given a doc type and the user's short-form input, produces a plain-text
 * body ready to hand to server/services/document-renderer.ts for .docx or
 * .pdf conversion.
 *
 * Design notes:
 * - We use askGPT() (server/lib/openai.ts) which is the existing wrapper
 *   already used by CV Checker, offer-letter screener, and other AI tools.
 *   Consistent temperature (0.4) keeps output stable across regenerations.
 * - Errors from OpenAI are caught + surfaced with a friendly message so the
 *   route layer can save error_message on the draft row without leaking the
 *   OpenAI error shape to the client.
 */

import { askGPT } from "../../lib/openai";
import {
  buildCvPrompt,
  buildCoverLetterPrompt,
  buildRecruitmentCvPrompt,
  buildReferenceLetterPrompt,
  type CvInput,
  type CoverLetterInput,
  type RecruitmentCvInput,
  type ReferenceLetterInput,
} from "./prompts";

export type WriteFromScratchDocType =
  | "cv"
  | "cover_letter"
  | "recruitment_cv"
  | "reference_letter";

export type WriteFromScratchInput =
  | { docType: "cv"; input: CvInput }
  | { docType: "cover_letter"; input: CoverLetterInput }
  | { docType: "recruitment_cv"; input: RecruitmentCvInput }
  | { docType: "reference_letter"; input: ReferenceLetterInput };

export interface GenerationResult {
  body: string;             // plain text, "# " / "## " heading markers
  title: string;            // used as the docx/pdf filename
  wordCount: number;
}

export class WriteFromScratchGenerationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "WriteFromScratchGenerationError";
  }
}

export async function generateDocument(
  request: WriteFromScratchInput,
): Promise<GenerationResult> {
  const prompt = buildPromptFor(request);

  let body: string;
  try {
    body = (await askGPT(prompt)).trim();
  } catch (err: any) {
    // OpenAI errors have distinctive shapes; boil them down to friendly codes.
    const msg = String(err?.message ?? err ?? "");
    if (/rate.?limit|429/i.test(msg)) {
      throw new WriteFromScratchGenerationError(
        "The AI is temporarily rate-limited. Please try again in a minute.",
        "RATE_LIMIT",
      );
    }
    if (/timeout|timed out|network/i.test(msg)) {
      throw new WriteFromScratchGenerationError(
        "The AI didn't respond in time. Please try again.",
        "TIMEOUT",
      );
    }
    if (/auth|invalid.?key|401/i.test(msg)) {
      throw new WriteFromScratchGenerationError(
        "The AI service is not configured. Support has been notified.",
        "AUTH",
      );
    }
    throw new WriteFromScratchGenerationError(
      "The AI could not generate this document right now. Please try again.",
      "UNKNOWN",
    );
  }

  if (!body || body.length < 40) {
    // Empty / near-empty output is a silent failure mode of gpt-4o-mini.
    throw new WriteFromScratchGenerationError(
      "The AI returned an empty document. Please try again.",
      "EMPTY_OUTPUT",
    );
  }

  const title = buildTitleFor(request);
  return {
    body,
    title,
    wordCount: body.split(/\s+/).filter(Boolean).length,
  };
}

function buildPromptFor(request: WriteFromScratchInput): string {
  switch (request.docType) {
    case "cv":
      return buildCvPrompt(request.input);
    case "cover_letter":
      return buildCoverLetterPrompt(request.input);
    case "recruitment_cv":
      return buildRecruitmentCvPrompt(request.input);
    case "reference_letter":
      return buildReferenceLetterPrompt(request.input);
  }
}

function buildTitleFor(request: WriteFromScratchInput): string {
  const safe = (s: string) =>
    s.replace(/[^a-zA-Z0-9\-_\s]/g, "").trim().replace(/\s+/g, "_");
  switch (request.docType) {
    case "cv":
      return `CV_${safe(request.input.fullName)}`;
    case "cover_letter": {
      const emp = request.input.employerName;
      return `Cover_Letter_${safe(request.input.fullName)}${emp ? "_" + safe(emp) : ""}`;
    }
    case "recruitment_cv":
      return `Recruitment_CV_${safe(request.input.fullName)}_${safe(request.input.destinationCountry)}`;
    case "reference_letter":
      return `Reference_Letter_${safe(request.input.candidateName)}`;
  }
}
