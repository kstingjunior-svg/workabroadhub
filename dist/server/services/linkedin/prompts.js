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
exports.buildHeadlineVariantsPrompt = buildHeadlineVariantsPrompt;
exports.buildAboutTonePrompt = buildAboutTonePrompt;
exports.buildKeywordAnalysisPrompt = buildKeywordAnalysisPrompt;
exports.buildRecruiterViewPrompt = buildRecruiterViewPrompt;
exports.buildNetworkingPrompt = buildNetworkingPrompt;
exports.buildPostPrompt = buildPostPrompt;
exports.buildInterviewPrepPrompt = buildInterviewPrepPrompt;
exports.buildCvParsePrompt = buildCvParsePrompt;
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
    const targets = input.targetCountries?.length
        ? input.targetCountries
        : [input.targetCountry ?? "Canada"];
    const user = `
Analyse this LinkedIn profile and score it. Return VALID JSON matching this exact TypeScript type:

{
  "overall": number,                    // 0 to 100
  "headline": number,
  "about": number,
  "experience": number,
  "skills": number,
  "keywords": number,
  "recruiterVisibility": number,
  "atsCompatibility": number,
  "internationalReadiness": number,
  "profileCompleteness": number,        // headline+about+experience+skills+education filled = 100
  "professionalBranding": number,       // tone, consistency, memorable positioning
  "networkingReadiness": number,        // does the profile invite conversation, "open to" clarity, contactable
  "countryMatch": {                     // 0..100 per target country based on keyword fit + hiring norms
${targets.map((c) => `    "${c}": number`).join(",\n")}
  },
  "explanations": {
    "headline": string,                 // 2-3 sentences: why this score, what's missing
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
countryMatch scores should reflect vocabulary + qualifications + certification
relevance for each specific country's hiring market.

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
function buildHeadlineVariantsPrompt(input) {
    const user = `
Generate FIVE alternative LinkedIn headlines for this candidate. Each headline
targets a different audience or angle. Return ONLY valid JSON:

{
  "professional":  string,   // clean, hireable positioning for a general recruiter
  "executive":     string,   // leadership tone, seniority forward
  "international": string,   // "open to" markets prominent, cross-border framing
  "countryFocus":  string,   // laser-targeted at ${input.targetCountry ?? "the primary target country"}
  "keywordDense":  string    // maximum ATS keyword coverage, pipe-delimited stack
}

Rules:
- Each headline: 220 char max.
- Never fabricate. Base every claim on the input.
- Zero em-dashes. Use commas or pipes.

${(0, human_voice_1.roleVerticalContext)(input.targetRole || input.currentRole || "")}

Candidate current headline: ${input.currentHeadline ?? "(none)"}
Target role: ${input.targetRole ?? input.currentRole ?? "unspecified"}
Target country: ${input.targetCountry ?? "unspecified"}
Years experience: ${input.yearsExperience ?? "unspecified"}
Skills: ${(input.skills ?? []).join(", ") || "none"}
`.trim();
    return { system: BASE_SYSTEM, user };
}
// ─── About tone rewrite ───────────────────────────────────────────────────
const TONE_INSTRUCTIONS = {
    professional: "Clean, direct, third-person-adjacent. Recruiter-friendly.",
    leadership: "Emphasises decisions, ownership, and impact on teams.",
    friendly: "Warm, conversational, first-person, still competent.",
    executive: "Senior tone, results-first, board-ready.",
    technical: "Deep specifics, tools, methodologies, technical vocabulary.",
    international: "Cross-border framing. Mentions 'open to' markets, cultural adaptability.",
};
function buildAboutTonePrompt(input, tone) {
    const user = `
Rewrite this candidate's LinkedIn About section in the ${tone} tone.

Tone guidance: ${TONE_INSTRUCTIONS[tone]}

Return VALID JSON:
{ "about": string }

Rules:
- 3 short paragraphs, blank line between.
- Never fabricate certifications, employers, degrees, or achievements.
- Zero em-dashes.

Current About: ${input.aboutSection ?? "(empty)"}
Current role: ${input.currentRole ?? "unknown"}
Target role: ${input.targetRole ?? "unspecified"}
Target country: ${input.targetCountry ?? "unspecified"}
Years experience: ${input.yearsExperience ?? "unknown"}
Skills: ${(input.skills ?? []).join(", ") || "none"}
`.trim();
    return { system: BASE_SYSTEM, user };
}
function buildKeywordAnalysisPrompt(input) {
    const user = `
Perform a recruiter keyword audit for a ${input.targetRole ?? input.currentRole ?? "candidate"}
targeting ${input.targetCountry ?? "international"} markets. Return VALID JSON:

{
  "detected":    string[],   // keywords found in the current profile text
  "missing":     string[],   // recruiter search terms the profile does NOT contain
  "highValue":   string[],   // top 5 to 8 highest-impact missing keywords
  "competition": string,     // one sentence assessing how crowded this role is in this market
  "suggestions": string[]    // 3 to 5 concrete tips for weaving missing keywords in naturally
}

${(0, human_voice_1.roleVerticalContext)(input.targetRole || input.currentRole || "")}

Profile text to audit:
Headline: ${input.currentHeadline ?? ""}
About: ${input.aboutSection ?? ""}
Experience:
${(input.experience ?? []).map((e) => `- ${e.role ?? ""} @ ${e.company ?? ""}: ${e.responsibilities ?? ""}`).join("\n")}
Skills: ${(input.skills ?? []).join(", ") || "none"}
`.trim();
    return { system: BASE_SYSTEM, user };
}
function buildRecruiterViewPrompt(input, rewriteAbout, rewriteHeadline) {
    const user = `
Simulate what an international recruiter sees when this profile appears in
search results. Return VALID JSON:

{
  "headline":          string,
  "aboutSnippet":      string,           // ~3 lines (~200 chars), what shows before "see more"
  "topSkills":         string[],         // top 5 recruiters would notice
  "searchKeywords":    string[],         // 8 to 12 terms this profile ranks for
  "experienceSummary": string,           // one sentence a recruiter would say to a hiring manager
  "visibilityRating":  "Low" | "Medium" | "High" | "Very High",
  "recruiterVerdict":  string            // one sentence: gut reaction on first impression
}

Profile (post-rewrite where available):
Headline: ${rewriteHeadline ?? input.currentHeadline ?? ""}
About: ${(rewriteAbout ?? input.aboutSection ?? "").slice(0, 800)}
Skills: ${(input.skills ?? []).join(", ") || "none"}
Target role: ${input.targetRole ?? "unspecified"}
Target country: ${input.targetCountry ?? "unspecified"}
`.trim();
    return { system: BASE_SYSTEM, user };
}
const NETWORK_GUIDANCE = {
    connection_request: "≤300 chars. Warm, specific, one line reference to the recipient's background if provided.",
    recruiter_intro: "5-line intro. Who you are, what you want, why you'd be relevant, ask for a quick chat, thanks.",
    follow_up: "4 lines. Reference the previous message, one sentence of new value, one sentence ask.",
    thank_you: "3 lines. Warm thanks, one specific detail from the conversation, forward-looking close.",
};
function buildNetworkingPrompt(input, kind, context) {
    const user = `
Write a LinkedIn ${kind.replace(/_/g, " ")} message. Return VALID JSON:

{ "message": string }

Guidance: ${NETWORK_GUIDANCE[kind]}

Sender profile:
- Name: ${input.fullName ?? "the candidate"}
- Role: ${input.currentRole ?? input.targetRole ?? "professional"}
- Target: ${input.targetRole ?? "same role"} in ${input.targetCountry ?? "any market"}
- Key skills: ${(input.skills ?? []).slice(0, 5).join(", ") || "n/a"}

Recipient (may be partial):
- Name: ${context?.recipientName ?? "not provided"}
- Role: ${context?.recipientRole ?? "not provided"}
- Company: ${context?.recipientCompany ?? "not provided"}
- Note: ${context?.note ?? "n/a"}

Rules: no em-dashes, no "I hope this message finds you well", no filler. Warm and specific.
`.trim();
    return { system: BASE_SYSTEM, user };
}
function buildPostPrompt(input, category, topic) {
    const user = `
Write a LinkedIn post in the "${category.replace(/_/g, " ")}" category.
Topic hint (optional): ${topic ?? "n/a"}

Return VALID JSON:
{ "post": string, "hashtags": string[] }

Guidance:
- 100 to 220 words.
- Hook in the first line.
- Short paragraphs, blank lines between (LinkedIn's mobile UX rewards air).
- 3 to 5 hashtags.
- No em-dashes. No "In today's fast-paced world". No "delve".

Author:
- Name: ${input.fullName ?? "the candidate"}
- Role: ${input.currentRole ?? "professional"}
- Target: ${input.targetRole ?? "same role"} in ${input.targetCountry ?? "international markets"}
`.trim();
    return { system: BASE_SYSTEM, user };
}
function buildInterviewPrepPrompt(input) {
    const user = `
Generate 5 realistic interview questions and coached answers for a
${input.targetRole ?? input.currentRole ?? "professional"} interviewing for a
role in ${input.targetCountry ?? "international markets"}. Return VALID JSON:

{
  "questions": [
    { "question": string, "tip": string, "sample": string }
  ],
  "overallCoaching": string
}

Sample answers must use only facts from the candidate's input. Do not
invent employers or credentials. Where a specific number is needed, use
"[fill in with your actual number]".

Candidate:
- Current role: ${input.currentRole ?? "unknown"}
- Years experience: ${input.yearsExperience ?? "unknown"}
- Skills: ${(input.skills ?? []).join(", ") || "none"}
- Recent role summary: ${(input.experience ?? [])[0]?.responsibilities ?? ""}
`.trim();
    return { system: BASE_SYSTEM, user };
}
// ─── CV parse → ProfileInput ──────────────────────────────────────────────
function buildCvParsePrompt(cvText) {
    const user = `
Parse this CV into structured JSON so we can pre-populate a LinkedIn profile
optimizer. Return VALID JSON matching this exact shape (leave fields empty
strings or empty arrays if not found — DO NOT INVENT):

{
  "fullName":         string,
  "currentHeadline":  string,
  "aboutSection":     string,
  "currentRole":      string,
  "yearsExperience":  number,
  "experience": [
    { "company": string, "role": string, "start": string, "end": string, "responsibilities": string }
  ],
  "education":        string,
  "skills":           string[],
  "certifications":   string,
  "languages":        string[],
  "awards":           string,
  "projects":         string,
  "licenses":         string,
  "volunteer":        string
}

CV text (first 6000 chars):
${cvText.slice(0, 6000)}
`.trim();
    return { system: BASE_SYSTEM, user };
}
