/**
 * CV Revamp — honest before/after scoring (2026-11).
 *
 * Tony: "honesty and trust is the key, no fake scores on CVs."
 *
 *   • Both scores come from the SAME engine as the free /tools/ats-cv-checker
 *     (lib/cv-ai/ats-scorer → ATS_ANALYSIS_ENGINE, gpt-4o, temperature 0).
 *   • If the rewrite isn't clearly better, the caller regenerates using the
 *     engine's own feedback (missing keywords, weaknesses) and keeps the best
 *     MEASURED attempt. No number is ever chosen, raised or rounded up.
 *   • "Key improvements" are derived from real differences between the two
 *     texts and the two engine reports — not a fixed marketing list.
 */
import type { AtsScore } from "./cv-ai/types";

export const TARGET_LIFT = 5;      // regenerate if the rewrite beats the original by less than this
export const MAX_ATTEMPTS = 3;     // first rewrite + up to 2 feedback-driven retries

export interface Improvement { key: string; title: string; detail: string }

const SECTION_PATTERNS: Array<{ key: string; label: string; re: RegExp }> = [
  { key: "summary",        label: "Professional Summary", re: /^\s*(#+\s*)?(professional\s+summary|profile|career\s+summary|summary)\b/im },
  { key: "skills",         label: "Core Skills",          re: /^\s*(#+\s*)?(core\s+skills|key\s+skills|skills|technical\s+skills|competencies)\b/im },
  { key: "experience",     label: "Work Experience",      re: /^\s*(#+\s*)?(work\s+experience|professional\s+experience|experience|employment\s+history)\b/im },
  { key: "education",      label: "Education",            re: /^\s*(#+\s*)?(education|academic)\b/im },
  { key: "certifications", label: "Certifications",       re: /^\s*(#+\s*)?(certifications?|licen[cs]es|training)\b/im },
  { key: "languages",      label: "Languages",            re: /^\s*(#+\s*)?languages?\b/im },
];

const WEAK_VERBS = /\b(responsible for|worked on|assisted with|helped (to )?|duties included|tasked with)\b/gi;
const NUMBERS = /\b\d+(?:[.,]\d+)?\s*(?:%|percent|k\b|m\b|kes|usd|aed|sar|qar|hours?|days?|weeks?|months?|years?|people|staff|clients?|customers?|patients?|units?)\b/gi;

const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Real, evidence-based list of what changed. Empty if nothing measurable changed. */
export function deriveImprovements(inputText: string, outputText: string, before: AtsScore, after: AtsScore): Improvement[] {
  const out: Improvement[] = [];
  const inN = norm(inputText), outN = norm(outputText);

  // 1. Keywords the engine said were missing that now appear.
  const added = (before.missingKeywords ?? []).filter((k) => {
    const kk = norm(k);
    return kk.length > 1 && !inN.includes(kk) && outN.includes(kk);
  });
  if (added.length) {
    out.push({ key: "keywords", title: "Optimised keywords", detail: `Added ${added.length} keyword${added.length === 1 ? "" : "s"} recruiters search for: ${added.slice(0, 4).join(", ")}${added.length > 4 ? "…" : ""}` });
  }

  // 2. Sections that now exist.
  const newSections = SECTION_PATTERNS.filter((p) => !p.re.test(inputText) && p.re.test(outputText)).map((p) => p.label);
  if (newSections.includes("Professional Summary")) {
    out.push({ key: "summary", title: "Stronger summary", detail: "Added a Professional Summary that states your role and value up front." });
  }
  const otherNew = newSections.filter((x) => x !== "Professional Summary");
  if (otherNew.length) {
    out.push({ key: "structure", title: "Improved structure", detail: `Added clear ${otherNew.join(", ")} section${otherNew.length === 1 ? "" : "s"} that ATS systems look for.` });
  }

  // 3. Quantified achievements.
  const numIn = count(NUMBERS, inputText), numOut = count(NUMBERS, outputText);
  if (numOut > numIn) {
    out.push({ key: "achievements", title: "Enhanced achievements", detail: `${numOut - numIn} more measurable result${numOut - numIn === 1 ? "" : "s"} (numbers, %, time, scale) in your bullets.` });
  }

  // 4. Weak phrasing removed.
  const weakIn = count(WEAK_VERBS, inputText), weakOut = count(WEAK_VERBS, outputText);
  if (weakIn > weakOut) {
    out.push({ key: "language", title: "Stronger language", detail: `Replaced ${weakIn - weakOut} weak phrase${weakIn - weakOut === 1 ? "" : "s"} like "responsible for" with action verbs.` });
  }

  // 5. Weaknesses the engine flagged before but not after.
  const afterW = (after.weaknesses ?? []).map(norm);
  const fixed = (before.weaknesses ?? []).filter((w) => {
    const ww = norm(w);
    return ww.length > 8 && !afterW.some((a) => a.includes(ww.slice(0, 24)) || ww.includes(a.slice(0, 24)));
  });
  if (fixed.length) {
    out.push({ key: "fixed", title: "Issues fixed", detail: `Fixed ${fixed.length} issue${fixed.length === 1 ? "" : "s"} the ATS check flagged, e.g. "${fixed[0].slice(0, 90)}${fixed[0].length > 90 ? "…" : ""}"` });
  }

  return out.slice(0, 6);
}

/** Feedback for a regeneration, built from the engine's own report on the last attempt. */
export function liftFeedback(before: AtsScore, last: AtsScore): string {
  const missing = (last.missingKeywords ?? []).slice(0, 12);
  const weak = (last.weaknesses ?? []).slice(0, 6);
  return `\n\nRETRY INSTRUCTION — our ATS checker scored your rewrite ${last.score}/100 versus ${before.score}/100 for the original. The customer paid for a measurable improvement, so improve what the checker flagged — truthfully:\n` +
    (missing.length ? `- Work these missing keywords in where the candidate's real experience supports them: ${missing.join(", ")}\n` : "") +
    (weak.length ? `- Fix these issues the checker reported: ${weak.join("; ")}\n` : "") +
    `- Clear section headings (Professional Summary, Core Skills, Work Experience, Education, Certifications, Languages)\n` +
    `- Achievement bullets: action verb + concrete outcome; reframe what's there, never invent employers, dates, degrees or numbers\n` +
    `- Plain single-column text: no tables, text boxes or graphics`;
}

export interface CompareRecord {
  inputAtsScore: number;
  outputAtsScore: number;
  atsLift: number;
  atsImprovements: Improvement[];
  atsAttempts: number;
  atsEngine: "ats-analysis-engine";
  atsMeasuredAt: string;
}

export function buildCompareRecord(inputText: string, outputText: string, before: AtsScore, after: AtsScore, attempts: number): CompareRecord {
  return {
    inputAtsScore: before.score,
    outputAtsScore: after.score,
    atsLift: after.score - before.score,
    atsImprovements: after.score > before.score ? deriveImprovements(inputText, outputText, before, after) : [],
    atsAttempts: attempts,
    atsEngine: "ats-analysis-engine",
    atsMeasuredAt: new Date().toISOString(),
  };
}
