"use strict";
/**
 * Write-from-Scratch prompts.
 *
 * Each prompt takes the user's short-form input (parsed from
 * write_from_scratch_drafts.input_json) and instructs gpt-4o-mini to emit a
 * clean, Kenyan-context-aware document body.
 *
 * OUTPUT FORMAT (strict): plain text using "# " for the top title,
 * "## " for section headings, "### " for sub-sections. Blank lines separate
 * paragraphs. This matches server/services/document-renderer.ts so we can
 * convert straight to .docx and .pdf without a second parsing pass.
 *
 * The AI must NEVER fabricate specific employers, dates, or credentials —
 * only expand on what the user actually gave us. Missing information should
 * be honestly labelled ("[Add previous employer here]") rather than made up.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCvPrompt = buildCvPrompt;
exports.buildCoverLetterPrompt = buildCoverLetterPrompt;
exports.buildRecruitmentCvPrompt = buildRecruitmentCvPrompt;
exports.buildReferenceLetterPrompt = buildReferenceLetterPrompt;
const BASE_INSTRUCTIONS = `
CRITICAL RULES:
- Never invent specific employers, exact dates, or credentials the user did
  not provide. If information is missing, leave a clearly-labelled placeholder
  like "[Add previous employer here]" or "[Add month/year]" — do NOT guess.
- Kenyan English tone: professional, direct, no American slang.
- Output MUST be plain text with "# " for the top title, "## " for section
  headings, "### " for sub-sections. Blank lines between paragraphs.
- Do NOT wrap the response in markdown code fences.
- Do NOT include a signature block image, ASCII art, tables, or emoji.
`.trim();
// ─── CV / RESUME ─────────────────────────────────────────────────────────────
function buildCvPrompt(input) {
    return `${BASE_INSTRUCTIONS}

Task: Write a clean, ATS-friendly one-page CV in Kenyan English tailored for
${input.targetCountry ? `a role in ${input.targetCountry}` : "the Kenyan job market or overseas job market"}.

Structure (use these exact section headings):
# ${input.fullName}
${input.location ? `${input.location}` : "[Location]"}${input.phone ? ` · ${input.phone}` : ""}${input.email ? ` · ${input.email}` : ""}

## Professional Summary
(2–3 sentences positioning the candidate for the target role.)

## Key Skills
(4–7 bullet-style lines, one skill per line, no leading dashes.)

## Work Experience
(Bullet-style entries; place a "[Add employer]" placeholder if the user didn't
give one. Focus on responsibilities and measurable outcomes.)

## Education
(One-liner per qualification.)

## Certifications & Languages
(If the user provided any; otherwise leave a labelled placeholder.)

INPUT:
- Full name: ${input.fullName}
- Target role: ${input.role}
- Years of experience: ${input.yearsExperience}
- Key skills (from user): ${input.keySkills}
- Education (from user): ${input.education ?? "[not provided]"}
- Extras (from user): ${input.extras ?? "[none]"}
- Target country: ${input.targetCountry ?? "unspecified"}

Write the CV now.`.trim();
}
// ─── COVER LETTER ────────────────────────────────────────────────────────────
function buildCoverLetterPrompt(input) {
    return `${BASE_INSTRUCTIONS}

Task: Write a persuasive one-page cover letter in Kenyan English${input.employerName ? ` addressed to the hiring team at ${input.employerName}` : ""}${input.targetCountry ? ` for a role in ${input.targetCountry}` : ""}.

Structure:
# Cover Letter — ${input.fullName}
${input.location ? `${input.location}` : "[Location]"}${input.phone ? ` · ${input.phone}` : ""}${input.email ? ` · ${input.email}` : ""}

## To
${input.employerName ?? "[Hiring Manager]"}${input.employerName ? "\n[Company address]" : ""}

## Re
${input.jobTitle ?? input.role}${input.jobSource ? ` (advert seen on ${input.jobSource})` : ""}

## Letter
(4–5 short paragraphs. Opening: state the role and why the candidate is
writing. Middle: 2 paragraphs matching the candidate's experience to what a
${input.role} typically needs. Closing: request an interview + polite sign-off.)

INPUT:
- Applicant: ${input.fullName}
- Applying for role: ${input.jobTitle ?? input.role}
- Years of experience: ${input.yearsExperience}
- Skills: ${input.keySkills}
- Employer: ${input.employerName ?? "[not specified]"}
- Target country: ${input.targetCountry ?? "unspecified"}
- Job source: ${input.jobSource ?? "[not specified]"}

Write the cover letter now.`.trim();
}
// ─── RECRUITMENT CV (Gulf / Kenyan-agency format) ────────────────────────────
//
// Recruitment CVs for Kenyan agencies bound for Saudi / UAE / Qatar have a
// very specific shape: passport-photo box on the top-right, personal details
// block (age, height, weight, marital status, religion) that Western CVs
// never include, and a heavier emphasis on domestic-worker / hospitality /
// driver skills. We don't generate the photo, but we structure the doc so
// agencies recognise it.
function buildRecruitmentCvPrompt(input) {
    return `${BASE_INSTRUCTIONS}

Task: Write a recruitment-CV in the format Kenyan overseas employment
agencies use for placements in ${input.destinationCountry}. This is NOT a
Western-style CV — it uses a Personal Data block and prioritises
domestic-worker / hospitality / driver / caregiver skills.

Structure:
# Recruitment CV — ${input.fullName}
Applying via: ${input.agencyName ?? "[Kenyan licensed recruitment agency]"}
Destination: ${input.destinationCountry}

## Personal Data
(Bullet-style lines: Full name, Age, Nationality: Kenyan, Marital status,
Religion, Height, Languages spoken. Use "[Add ...]" placeholders where the
user did not tell us.)

## Contact
${input.phone ?? "[Add phone]"}${input.email ? ` · ${input.email}` : ""}${input.location ? ` · ${input.location}` : ""}

## Position Applied For
${input.role}

## Work Experience
(Chronological, most recent first. Use "[Add employer]" if unknown.)

## Skills
(Practical skills — cooking cuisines, childcare age ranges, driving licence
categories, cleaning equipment, whatever fits the role.)

## Education
(Concise, one-liner per qualification.)

## Declaration
"I confirm the information above is true to the best of my knowledge and
consent to my details being shared with the destination employer."

INPUT:
- Full name: ${input.fullName}
- Role: ${input.role}
- Years of experience: ${input.yearsExperience}
- Key skills: ${input.keySkills}
- Education: ${input.education ?? "[not provided]"}
- Extras: ${input.extras ?? "[none]"}
- Destination: ${input.destinationCountry}
- Agency: ${input.agencyName ?? "[not specified]"}

Write the recruitment CV now.`.trim();
}
// ─── REFERENCE / RECOMMENDATION LETTER ───────────────────────────────────────
function buildReferenceLetterPrompt(input) {
    return `${BASE_INSTRUCTIONS}

Task: Write a professional reference letter FROM ${input.employerName} (${input.employerTitle}) at ${input.employerCompany}${input.employerCountry ? ` in ${input.employerCountry}` : ""},
vouching for ${input.candidateName} who worked there as a ${input.candidateRole}
for ${input.yearsWorked} year(s).

Structure:
# Letter of Reference

## From
${input.employerName}
${input.employerTitle}
${input.employerCompany}${input.employerCountry ? `\n${input.employerCountry}` : ""}
Date: [Add date]

## To Whom It May Concern

## Letter
(4 short paragraphs. Opening: state relationship and duration. Middle: 2
paragraphs specifically on ${input.candidateName}'s ${input.keyStrengths}
and their conduct as a ${input.candidateRole}. Closing: unconditional
recommendation + contact-me offer + sign-off.)

## Signature
${input.employerName}
${input.employerTitle}, ${input.employerCompany}

INPUT:
- Author: ${input.employerName} — ${input.employerTitle} — ${input.employerCompany}
- Candidate: ${input.candidateName} — ${input.candidateRole}
- Years worked: ${input.yearsWorked}
- Relationship: ${input.relationship ?? "supervisor"}
- Key strengths: ${input.keyStrengths}

Write the reference letter now.`.trim();
}
