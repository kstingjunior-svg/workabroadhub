// ─────────────────────────────────────────────────────────────────────────────
// AtsScorer adapter — the trust-loop bridge.
//
// Pass 6 (score-gate) needs an AtsScorer to prove the rewrite beats the
// input. The whole trust promise depends on using the SAME engine the
// user's free ATS-check tool uses — otherwise "we improved your score by
// 22 points" is a different number from what /tools/ats-cv-checker will
// tell them tomorrow.
//
// This adapter extracts the inline scoring call from tools-routes.ts into
// a callable function that both places can consume. Long-term the ATS
// endpoint should be refactored to import this too; short-term, both live
// in parallel and we lock them to the same ATS_ANALYSIS_ENGINE prompt
// version so scores stay identical.
//
// Cost: same as the free tool — ~$0.03-0.06 per scoring call on gpt-4o.
// Pass 6 calls it 1x on input + 1-3x on retries — worst case ~$0.24 in
// score calls alone. Combined with Composer retries, this is why the
// pipeline has a MAX_RETRIES cap.
// ─────────────────────────────────────────────────────────────────────────────

import { openai } from "../openai";
import { ATS_ANALYSIS_ENGINE } from "../ats-analysis-engine";
import type { AtsScore } from "./types";
import type { AtsScorer } from "./pass6-score-gate";

/**
 * Score a CV using the WorkAbroadHub ATS Career Intelligence Engine.
 * Same prompt, same model, same output shape as /api/tools/ats-check.
 *
 * Never throws for non-fatal issues — falls back to a conservative
 * "score: 0" result so Pass 6's loop can keep running (a failed score
 * call would otherwise abort a whole generation and hide the user's
 * partial progress).
 */
export const scoreCv: AtsScorer = async (cvText, jd) => {
  const truncated = String(cvText ?? "").slice(0, 12_000);
  if (truncated.trim().length < 100) {
    return { score: 0, grade: "N/A", missingKeywords: [], weaknesses: ["CV too short to score"] };
  }

  const jdBlock = jd && jd.trim().length >= 40
    ? `\nJOB DESCRIPTION (compare against this):\n${jd.slice(0, 8000)}\n(Populate report.jobMatch. Otherwise set to null.)`
    : "\n(No job description provided — set report.jobMatch to null.)";

  const userPrompt = [
    "Analyse the following CV. Emit the full JSON report per the schema.",
    jdBlock,
    `\nCV TEXT:\n\n${truncated}`,
  ].join("\n");

  try {
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o",
        temperature: 0.3,
        max_tokens: 6000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ATS_ANALYSIS_ENGINE },
          { role: "user", content: userPrompt },
        ],
      },
      { timeout: 45_000 } as any,
    );

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    let ai: any;
    try {
      ai = JSON.parse(cleaned);
    } catch {
      const block = cleaned.match(/\{[\s\S]*\}/);
      ai = block ? JSON.parse(block[0]) : {};
    }

    const score = clamp(
      typeof ai.score === "number" ? ai.score : parseInt(String(ai.score ?? "0"), 10) || 0,
      0,
      100,
    );

    return {
      score,
      grade: String(ai.grade ?? deriveGrade(score)),
      missingKeywords: asStringArray(ai.missingKeywords),
      weaknesses: asStringArray(ai.weaknesses),
    };
  } catch (err: any) {
    // Non-fatal: log and return a soft-fail score so Pass 6 can continue.
    // We import lazily to avoid a circular-import problem with the sentry
    // module during startup.
    try {
      const { reportRejection } = await import("../sentry");
      reportRejection(err, "cv-ai/ats-scorer");
    } catch { /* swallow — better to lose a Sentry event than a generation */ }

    return {
      score: 0,
      grade: "N/A",
      missingKeywords: [],
      weaknesses: [`Scoring failed: ${err?.message ?? "unknown"}`],
    };
  }
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function deriveGrade(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 65) return "Average";
  if (score >= 50) return "Below Average";
  return "Poor";
}

function asStringArray(x: any): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((v) => typeof v === "string").slice(0, 50);
}
