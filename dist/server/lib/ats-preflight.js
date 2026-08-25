"use strict";
/**
 * ATS PREFLIGHT SCORER
 *
 * 2026-08 (Tony's mandate): every CV WorkAbroadHub delivers must score at
 * least 70 on our own ATS re-checker. This module runs the AI-generated
 * output through a lightweight ATS scorer BEFORE we mark the order
 * completed. If the score is below the threshold, the caller can retry
 * generation with feedback so the second attempt lands above the line.
 *
 * Design notes:
 *   - Uses a compact prompt (~300 tokens) to keep the preflight cheap.
 *     Runs on gpt-4o-mini for latency; the AI grader only needs to
 *     estimate a score, not produce a full 18-section report.
 *   - Returns weaknesses in a machine-readable format so the caller can
 *     feed them back to the generation prompt on retry.
 *   - Never throws — on any error, returns { ok: false } and the caller
 *     falls back to delivering the original output (belt over suspenders).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.preflightScoreCV = preflightScoreCV;
exports.buildRetryFeedback = buildRetryFeedback;
const openai_1 = require("./openai");
const PREFLIGHT_SYSTEM_PROMPT = `You are a strict ATS quality auditor for CVs targeting overseas jobs.
Score the CV 0-100 based on:
- Contact info present (email, phone, location)
- Professional summary is specific and impactful
- Every bullet uses a strong action verb + concrete detail
- No placeholder text like "[Add X here]", "[insert X]", "[TBD]"
- No fabricated metrics
- Complete work experience section with dates
- Skills section with 8+ real, searchable skills
- Consistent formatting

Return JSON ONLY:
{
  "score": <integer 0-100>,
  "weaknesses": [<short string>, ...],   // max 6 items
  "suggestion": <one line, actionable feedback>
}`;
async function preflightScoreCV(cvText, threshold = 70) {
    const fallback = {
        ok: false,
        score: 0,
        passed: false,
        weaknesses: [],
        suggestion: "",
    };
    if (!cvText || cvText.trim().length < 200) {
        return fallback;
    }
    try {
        const completion = await openai_1.openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            temperature: 0, // deterministic scoring
            max_tokens: 500,
            messages: [
                { role: "system", content: PREFLIGHT_SYSTEM_PROMPT },
                { role: "user", content: `Score this CV:\n\n${cvText.slice(0, 12000)}` },
            ],
        });
        const raw = completion.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw);
        const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
        const weaknesses = Array.isArray(parsed.weaknesses)
            ? parsed.weaknesses.filter((w) => typeof w === "string").slice(0, 6)
            : [];
        return {
            ok: true,
            score,
            passed: score >= threshold,
            weaknesses,
            suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
        };
    }
    catch (err) {
        console.warn("[ats-preflight] scorer failed:", err?.message);
        return fallback;
    }
}
/**
 * Build a corrective-feedback block to append to the generation prompt on
 * retry. Highlights the exact weaknesses that dropped the score below 70.
 */
function buildRetryFeedback(pre, threshold = 70) {
    const lines = [
        `\n\nCRITICAL — PREVIOUS ATTEMPT SCORED ${pre.score}/100 (below the ${threshold} threshold).`,
        "You MUST address these specific weaknesses:",
        ...pre.weaknesses.map((w, i) => `  ${i + 1}. ${w}`),
    ];
    if (pre.suggestion) {
        lines.push(`\nHow to fix: ${pre.suggestion}`);
    }
    lines.push(`\nRegenerate the CV so it scores ${threshold + 15}+ on the same audit.`);
    return lines.join("\n");
}
