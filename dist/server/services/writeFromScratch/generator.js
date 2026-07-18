"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WriteFromScratchGenerationError = void 0;
exports.generateDocument = generateDocument;
const openai_1 = require("../../lib/openai");
const human_voice_1 = require("../../ai/human-voice");
const prompts_1 = require("./prompts");
class WriteFromScratchGenerationError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = "WriteFromScratchGenerationError";
    }
}
exports.WriteFromScratchGenerationError = WriteFromScratchGenerationError;
async function generateDocument(request) {
    const prompt = buildPromptFor(request);
    let body;
    try {
        // 2026-07: stripAiTells scrubs em-dashes, "delve into", "leverage",
        // "Furthermore", and the marketing filler GPT still slips in even
        // when told not to. Post-processor is deliberately lightweight so
        // it can't damage user-supplied specifics.
        body = (0, human_voice_1.stripAiTells)((await (0, openai_1.askGPT)(prompt)).trim());
    }
    catch (err) {
        // OpenAI errors have distinctive shapes; boil them down to friendly codes.
        const msg = String(err?.message ?? err ?? "");
        if (/rate.?limit|429/i.test(msg)) {
            throw new WriteFromScratchGenerationError("The AI is temporarily rate-limited. Please try again in a minute.", "RATE_LIMIT");
        }
        if (/timeout|timed out|network/i.test(msg)) {
            throw new WriteFromScratchGenerationError("The AI didn't respond in time. Please try again.", "TIMEOUT");
        }
        if (/auth|invalid.?key|401/i.test(msg)) {
            throw new WriteFromScratchGenerationError("The AI service is not configured. Support has been notified.", "AUTH");
        }
        throw new WriteFromScratchGenerationError("The AI could not generate this document right now. Please try again.", "UNKNOWN");
    }
    if (!body || body.length < 40) {
        // Empty / near-empty output is a silent failure mode of gpt-4o-mini.
        throw new WriteFromScratchGenerationError("The AI returned an empty document. Please try again.", "EMPTY_OUTPUT");
    }
    const title = buildTitleFor(request);
    return {
        body,
        title,
        wordCount: body.split(/\s+/).filter(Boolean).length,
    };
}
function buildPromptFor(request) {
    switch (request.docType) {
        case "cv":
            return (0, prompts_1.buildCvPrompt)(request.input);
        case "cover_letter":
            return (0, prompts_1.buildCoverLetterPrompt)(request.input);
        case "recruitment_cv":
            return (0, prompts_1.buildRecruitmentCvPrompt)(request.input);
        case "reference_letter":
            return (0, prompts_1.buildReferenceLetterPrompt)(request.input);
    }
}
function buildTitleFor(request) {
    const safe = (s) => s.replace(/[^a-zA-Z0-9\-_\s]/g, "").trim().replace(/\s+/g, "_");
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
