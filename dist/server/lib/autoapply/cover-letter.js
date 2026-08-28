"use strict";
/**
 * Cover-letter drafter — generates a tailored cover letter for a matched
 * job using the same OpenAI client the rest of the platform uses.
 *
 * Called from server/lib/autoapply/index.ts on the top 5 fresh matches
 * per scan. Cached in autoapply_matches.cover_letter — never re-generated
 * for the same match.
 *
 * If OpenAI is unavailable (no key, rate limit, timeout), returns a
 * high-quality template letter with basic personalisation so the user
 * still gets SOMETHING useful. Fail-open, never fail-hard.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.draftCoverLetter = draftCoverLetter;
const openai_1 = require("../openai");
const SYSTEM_PROMPT = `You are a professional career advisor writing cover letters for Kenyan job-seekers applying to overseas jobs.

Rules:
- 3 paragraphs, roughly 220-260 words total
- Opening: express interest in the specific role, mention the employer by name once
- Middle: highlight 2-3 CV skills/experiences that directly match the job requirements
- Closing: state visa/relocation readiness (if UK/Canada/USA/Australia) or availability (if UAE/Gulf), invite an interview
- Tone: professional, confident, warm — NEVER servile ("I would be honoured…"), NEVER generic ("dynamic team player")
- Do NOT invent qualifications the CV doesn't mention
- Do NOT use "Dear Sir/Madam" — use "Dear Hiring Team" or "Dear [Employer] Hiring Team"
- End with "Kind regards," then a blank line — do NOT sign a name (the applicant adds their own)
- Do NOT include address blocks, dates, or subject lines — just the letter body`;
async function draftCoverLetter(args) {
    const userPrompt = `Job Title: ${args.jobTitle}
Employer: ${args.employer}
Country: ${args.country}

Job description (may be truncated):
${args.jobDescription}

---

Applicant's CV (may be truncated):
${args.cvText}

---

Draft the cover letter following the rules exactly. Only output the letter body, nothing else.`;
    try {
        const completion = await Promise.race([
            openai_1.openai.chat.completions.create({
                model: "gpt-4o-mini",
                temperature: 0.6,
                max_tokens: 500,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userPrompt },
                ],
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("openai timeout")), 20000)),
        ]);
        const text = completion?.choices?.[0]?.message?.content?.trim();
        if (!text)
            throw new Error("openai returned empty");
        return text;
    }
    catch (err) {
        console.warn("[autoapply/cover-letter] LLM failed, using template:", err?.message);
        return templateFallback(args);
    }
}
// ─── Template fallback — used when LLM is unavailable ────────────────
function templateFallback(args) {
    const employer = args.employer || "the hiring team";
    const country = args.country ? countryDisplayName(args.country) : "your organisation";
    return `Dear ${employer} Hiring Team,

I am writing to apply for the ${args.jobTitle} role at ${employer}. Your team's work in ${country} caught my attention because it aligns closely with the direction I have been building my career.

Over the past several years I have developed relevant skills through hands-on experience and continuous professional development. My CV outlines specific projects and outcomes that directly relate to the requirements you have set out for this role. I am confident I can contribute to your team from day one while also learning quickly from those around me.

I am fully prepared to relocate and complete any visa, medical, or licensing steps required, and I would welcome the opportunity to discuss how I can add value to ${employer}. Thank you for considering my application — I look forward to hearing from you.

Kind regards,

`;
}
function countryDisplayName(code) {
    const map = {
        gb: "the United Kingdom",
        uk: "the United Kingdom",
        ca: "Canada",
        us: "the United States",
        au: "Australia",
        nz: "New Zealand",
        de: "Germany",
        nl: "the Netherlands",
        pl: "Poland",
        za: "South Africa",
        ae: "the UAE",
        uae: "the UAE",
        sa: "Saudi Arabia",
    };
    return map[code.toLowerCase()] || code;
}
