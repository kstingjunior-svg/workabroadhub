"use strict";
/**
 * LinkedIn Optimization prompts.
 *
 * All prompts pull HUMAN_VOICE_RULES + roleVerticalContext from the shared
 * voice module so the LinkedIn rewrites use the same warmth + anti-generic
 * rules as our other AI docs. See server/ai/human-voice.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildScorePrompt = buildScorePrompt;
exports.buildRewritePrompt = buildRewritePrompt;
exports.buildRefinePrompt = buildRefinePrompt;
const human_voice_1 = require("../../ai/human-voice");
// ── Prompt builders ────────────────────────────────────────────────────────
const BASE_SYSTEM = `
You are a senior LinkedIn profile strategist. You have seen 10,000 profiles
from East African and other emerging-market candidates who want overseas
jobs. You know exactly what international recruiters search for and what
makes them click "Message". Your job is to rewrite the candidate's
profile so it lands in recruiter search results and reads like a real
human wrote it, not ChatGPT.

${human_voice_1.HUMAN_VOICE_RULES}

Extra rules for LinkedIn specifically:
- Headline: 220 char max, pipe-delimited keyword stack that recruiters
  actually type into search. Include 3 to 5 role/skill keywords + open-to
  markets.
- About: 3 short paragraphs. Para 1: one warm concrete hook. Para 2:
  what the candidate has done, with numbers where they exist. Para 3:
  what they are open to and how to reach them.
- Experience bullets: {verb} + {number or specific} + {what} + {timeframe}.
  Never invent employers, dates, or numbers. If the user did not give a
  number, use a placeholder like "[how many]" so they can fill it in.
- Never fabricate certifications, employers, degrees, or achievements.
- Return ONLY the JSON specified by the caller. No prose outside JSON.
`.trim();
function buildScorePrompt(input) {
    const roleForVertical = input.targetRole || input.currentRole || "";
    const user = `
Analyse this LinkedIn profile and score it. Return VALID JSON matching this exact TypeScript type:

{
  "overall": number,               // 0 to 100
  "headline": number,
  "about": number,
  "experience": number,
  "skills": number,
  "keywords": number,
  "recruiterVisibility": number,
  "atsCompatibility": number,
  "internationalReadiness": number,
  "explanations": {
    "headline": string,            // 2-3 sentences: why this score, what's missing
    "about": string,
    "experience": string,
    "skills": string,
    "keywords": string,
    "recruiterVisibility": string
  }
}

Score explanations must call out specific missing keywords or vague phrases.
If a section is empty, explain what recruiters expect to see and score it 15
to 25 rather than 0 (a stronger baseline motivates the user).

${(0, human_voice_1.roleVerticalContext)(roleForVertical)}

Candidate:
- Full name: ${input.fullName ?? "not given"}
- Current headline: ${input.currentHeadline ?? "not given"}
- About section: ${input.aboutSection ?? "not given"}
- Current role: ${input.currentRole ?? "not given"}
- Years of experience: ${input.yearsExperience ?? "not given"}
- Experience blocks:
${(input.experience ?? []).map((e, i) => `  ${i + 1}. ${e.role ?? "?"} at ${e.company ?? "?"} (${e.start ?? "?"} to ${e.end ?? "present"})
     ${e.responsibilities ?? ""}`).join("\n") || "  (none provided)"}
- Education: ${input.education ?? "not given"}
- Skills: ${(input.skills ?? []).join(", ") || "none"}
- Certifications: ${input.certifications ?? "none"}
- Target role: ${input.targetRole ?? "unspecified"}
- Target country: ${input.targetCountry ?? "unspecified"}
`.trim();
    return { system: BASE_SYSTEM, user };
}
function buildRewritePrompt(input, scores) {
    const roleForVertical = input.targetRole || input.currentRole || "";
    const target = input.targetCountry || "international";
    const targetRole = input.targetRole || input.currentRole || "professional";
    const user = `
Rewrite this candidate's LinkedIn profile so it scores 90+ overall for a
${targetRole} targeting ${target}. Return ONLY VALID JSON matching this shape:

{
  "headline": string,                       // 220 char max, pipe-delimited keyword stack
  "about": string,                          // 3 short paragraphs, plain text with blank lines between
  "experience": [
    { "company": string, "role": string, "bullets": string[] }
  ],
  "skills": string[],                       // 12 to 20 recruiter-relevant skills, current + missing merged
  "keywords": string[],                     // 15 to 25 recruiter-search keywords for ${targetRole} in ${target}
  "targetSummary": string                   // one sentence e.g. "Positioned for ${targetRole} roles in ${target}"
}

Rules:
- Never invent employers, dates, degrees, or certifications.
- If a section is missing from the input, produce a short, honest, plausible
  version and leave a "[fill in]" placeholder for specifics the user must add.
- Every experience bullet uses the achievement shape: {strong verb} + {number
  or specific} + {what} + {timeframe or scale}. If the user gave no number,
  write "[how many]" instead of guessing.
- Skills list must include verifiable, recruiter-searchable terms for the
  target vertical. Not generic soft skills.
- Keywords list is what recruiters TYPE into search. Real roles, tools,
  certifications, cities.

${(0, human_voice_1.roleVerticalContext)(roleForVertical)}

Current profile input:
- Full name: ${input.fullName ?? "not given"}
- Current headline: ${input.currentHeadline ?? "not given"}
- About: ${input.aboutSection ?? "not given"}
- Experience:
${(input.experience ?? []).map((e, i) => `  ${i + 1}. ${e.role ?? "?"} at ${e.company ?? "?"} (${e.start ?? "?"} to ${e.end ?? "present"})
     ${e.responsibilities ?? ""}`).join("\n") || "  (none provided)"}
- Education: ${input.education ?? "not given"}
- Skills: ${(input.skills ?? []).join(", ") || "none"}
- Certifications: ${input.certifications ?? "none"}

Current scores (fix the lowest first):
${JSON.stringify(scores, null, 2)}
`.trim();
    return { system: BASE_SYSTEM, user };
}
/**
 * Refinement — user asks "target Canada" or "make the headline stronger".
 * We re-run the rewrite with the message steering the tone.
 */
function buildRefinePrompt(input, currentOutput, chatMessage) {
    const user = `
The candidate is refining their LinkedIn optimization. Their request:

"${chatMessage.slice(0, 500)}"

Rewrite the profile to honour this request. Keep everything factual (never
invent employers or credentials). Return VALID JSON in the same shape as
before:

{
  "headline": string,
  "about": string,
  "experience": [ { "company": string, "role": string, "bullets": string[] } ],
  "skills": string[],
  "keywords": string[],
  "targetSummary": string
}

Current input:
${JSON.stringify(input, null, 2)}

Current output (rewrite from here):
${JSON.stringify(currentOutput, null, 2)}
`.trim();
    return { system: BASE_SYSTEM, user };
}
