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
 * The AI must NEVER fabricate specific employers, dates, or credentials.
 * Missing information should be honestly labelled ("[Add previous employer
 * here]") rather than made up.
 *
 * 2026-07: rewritten to pull in server/ai/human-voice.ts. Users were
 * telling Tony our documents felt generic and obviously AI. The shared
 * voice rules + role-vertical block now make a farm worker CV sound
 * different from a pilot CV, and both sound like a person wrote them.
 */

import { HUMAN_VOICE_RULES, roleVerticalContext } from "../../ai/human-voice";

export interface CvInput {
  fullName: string;
  role: string;                 // e.g. "Registered Nurse", "Truck Driver"
  yearsExperience: number;
  keySkills: string;            // comma-separated or free text
  location?: string;            // e.g. "Nairobi, Kenya"
  targetCountry?: string;       // e.g. "Saudi Arabia", "UK"
  phone?: string;
  email?: string;
  education?: string;           // one-liner or paragraph
  extras?: string;              // catch-all: certifications, languages, etc.
}

export interface CoverLetterInput extends CvInput {
  employerName?: string;        // e.g. "Al Ahli Hospital"
  jobTitle?: string;            // e.g. "Staff Nurse — ICU"
  jobSource?: string;           // e.g. "LinkedIn", "employer website"
}

export interface RecruitmentCvInput extends CvInput {
  destinationCountry: string;   // required — recruitment CV is destination-shaped
  agencyName?: string;
}

export interface ReferenceLetterInput {
  employerName: string;         // the "author" of the letter
  employerTitle: string;        // e.g. "General Manager, ABC Restaurant"
  employerCompany: string;
  employerCountry?: string;
  candidateName: string;        // the person being referenced
  candidateRole: string;        // what they did for the employer
  yearsWorked: number;
  keyStrengths: string;         // free text
  relationship?: string;        // e.g. "direct supervisor for 3 years"
}

const BASE_INSTRUCTIONS = `
${HUMAN_VOICE_RULES}

STRUCTURAL RULES:
- Never invent specific employers, exact dates, or credentials the user did
  not provide. If information is missing, leave a clearly-labelled placeholder
  like "[Add previous employer here]" or "[Add month/year]". Do NOT guess.
- Kenyan English tone: professional, direct, no American slang.
- Output MUST be plain text with "# " for the top title, "## " for section
  headings, "### " for sub-sections. Blank lines between paragraphs.
- Do NOT wrap the response in markdown code fences.
- Do NOT include a signature block image, ASCII art, tables, or emoji.
- Do NOT use em-dashes at all. Ever. Use commas or periods.
`.trim();

// ─── CV / RESUME ─────────────────────────────────────────────────────────────

export function buildCvPrompt(input: CvInput): string {
  return `${BASE_INSTRUCTIONS}

${roleVerticalContext(input.role)}

Task: Write a clean, ATS-friendly one-page CV in Kenyan English tailored for
${input.targetCountry ? `a ${input.role} role in ${input.targetCountry}` : `a ${input.role} role in the East African or overseas job market`}.

This CV competes against 200+ others for the same job. It has to sound like
a real person who has actually done this work, not a template. Use the
vertical voice cues above.

Structure (use these exact section headings):
# ${input.fullName}
${input.location ? `${input.location}` : "[Location]"}${input.phone ? ` · ${input.phone}` : ""}${input.email ? ` · ${input.email}` : ""}

## Professional Summary
(2 to 3 sentences. Open with a specific fact from the candidate's life that
maps to the target role. NOT "Dedicated professional with X years of
experience". Something warm and concrete a hiring manager will remember.)

## Key Skills
(4 to 7 lines, one skill per line, no leading dashes. Skills should be
verifiable and specific to the vertical, not generic soft skills.)

## Work Experience
(Chronological, most recent first. For each role: employer name on one
line, then 2 to 3 bullets using the achievement shape "{verb} + {number} +
{what} + {timeframe}". Place a "[Add employer]" placeholder if the user did
not name one, but still write realistic bullets in the correct vertical
voice. NO responsibility-list bullets.)

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

export function buildCoverLetterPrompt(input: CoverLetterInput): string {
  return `${BASE_INSTRUCTIONS}

${roleVerticalContext(input.role)}

Task: Write a warm, specific one-page cover letter in Kenyan English${
    input.employerName ? ` addressed to the hiring team at ${input.employerName}` : ""
  }${input.targetCountry ? ` for a ${input.role} role in ${input.targetCountry}` : ""}.

This letter has to make a hiring manager stop scrolling. Follow the voice
rules above. Do NOT open with "I am writing to express my interest…".
Open with a real detail from the candidate's life that maps to this job.

Structure:
# Cover Letter, ${input.fullName}
${input.location ? `${input.location}` : "[Location]"}${input.phone ? ` · ${input.phone}` : ""}${input.email ? ` · ${input.email}` : ""}

## To
${input.employerName ?? "[Hiring Manager]"}${input.employerName ? "\n[Company address]" : ""}

## Re
${input.jobTitle ?? input.role}${input.jobSource ? ` (advert seen on ${input.jobSource})` : ""}

## Letter
(4 short paragraphs, all human.
Para 1 (2 to 3 sentences): open with a concrete, personal hook that shows
this is written for THIS role. A specific memory or fact from the
candidate's life that connects to this job. State the role at the end of
the paragraph.
Para 2: pull two things from their experience that match what a ${input.role}
in ${input.targetCountry ?? "the destination country"} actually needs. Use
numbers and specifics. Show, do not tell.
Para 3: one honest sentence about why THIS employer, not any employer.
Reference something the reader would recognise about their operation or
market.
Para 4: polite request for a call or interview. One sentence. Sign off.)

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

export function buildRecruitmentCvPrompt(input: RecruitmentCvInput): string {
  return `${BASE_INSTRUCTIONS}

${roleVerticalContext(input.role)}

Task: Write a recruitment-CV in the format Kenyan overseas employment
agencies use for placements in ${input.destinationCountry}. This is NOT a
Western-style CV. It uses a Personal Data block and prioritises
domestic-worker, hospitality, driver, or caregiver skills.

Even though this is a structured agency form, the Skills and Work
Experience sections still need to sound like a real person. Apply the
achievement shape and vertical voice cues above.

Structure:
# Recruitment CV, ${input.fullName}
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
(Practical skills, cooking cuisines, childcare age ranges, driving licence
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

export function buildReferenceLetterPrompt(input: ReferenceLetterInput): string {
  return `${BASE_INSTRUCTIONS}

${roleVerticalContext(input.candidateRole)}

Task: Write a professional reference letter FROM ${input.employerName} (${
    input.employerTitle
  }) at ${input.employerCompany}${input.employerCountry ? ` in ${input.employerCountry}` : ""},
vouching for ${input.candidateName} who worked there as a ${input.candidateRole}
for ${input.yearsWorked} year(s).

The letter must sound like ${input.employerName} actually wrote it. Warm,
specific, one memorable story or moment about the candidate. NOT a
template. Include one concrete detail only a real supervisor would know
(a shift they worked, a project they handled, a difficult customer they
resolved). Apply the vertical voice cues above.

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
- Author: ${input.employerName}, ${input.employerTitle}, ${input.employerCompany}
- Candidate: ${input.candidateName}, ${input.candidateRole}
- Years worked: ${input.yearsWorked}
- Relationship: ${input.relationship ?? "supervisor"}
- Key strengths: ${input.keyStrengths}

Write the reference letter now.`.trim();
}
