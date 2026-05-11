// @ts-nocheck
/**
 * generateCV — ATS-optimised CV writer for East African professionals.
 *
 * Accepts the full User row plus an optional UserCareerProfile row.
 * If the career profile is absent the function still produces a usable CV
 * by inferring reasonable content from the job title and years of experience.
 *
 * Returns a plain-text CV (600 words max) ready to be stored in
 * users.generated_cv and delivered via WhatsApp.
 */

import { openai } from "../lib/openai";
import type { User } from "@shared/models/auth";

export interface CareerProfile {
  currentJobTitle?:         string | null;
  yearsExperience?:         number | null;
  educationLevel?:          string | null;  // "high_school" | "diploma" | "bachelors" | "masters" | "phd"
  fieldOfStudy?:            string | null;
  skills?:                  string[] | null;
  certifications?:          string[] | null;
  languages?:               { language: string; proficiency: string }[] | null;
  preferredCountries?:      string[] | null;
  preferredIndustries?:     string[] | null;
  hasWorkExperienceAbroad?: boolean | null;
}

const EDUCATION_LABEL: Record<string, string> = {
  high_school: "High School / Secondary Certificate",
  diploma:     "Diploma / Certificate",
  bachelors:   "Bachelor's Degree",
  masters:     "Master's Degree",
  phd:         "PhD / Doctorate",
};

export async function generateCV(
  user: User & Record<string, any>,
  careerProfile?: CareerProfile | null,
): Promise<string> {
  // ── Resolve fields from both sources, user row wins on conflict ────────────
  const firstName = user.firstName ?? user.first_name ?? "";
  const lastName  = user.lastName  ?? user.last_name  ?? "";
  const fullName  = [firstName, lastName].filter(Boolean).join(" ") || "Applicant";

  const jobTitle      = careerProfile?.currentJobTitle    ?? user.currentJobTitle    ?? "Professional";
  const yearsExp      = careerProfile?.yearsExperience    ?? user.yearsExperience    ?? null;
  const educationKey  = careerProfile?.educationLevel     ?? user.educationLevel     ?? null;
  const education     = educationKey ? (EDUCATION_LABEL[educationKey] ?? educationKey) : null;
  const fieldOfStudy  = careerProfile?.fieldOfStudy       ?? user.fieldOfStudy       ?? null;
  const abroadExp     = careerProfile?.hasWorkExperienceAbroad ?? user.hasWorkExperienceAbroad ?? false;

  const skills    = (careerProfile?.skills         ?? user.skills         ?? []).filter(Boolean) as string[];
  const certs     = (careerProfile?.certifications  ?? user.certifications  ?? []).filter(Boolean) as string[];
  const languages = (careerProfile?.languages       ?? user.languages       ?? []) as { language: string; proficiency: string }[];
  const countries = (careerProfile?.preferredCountries  ?? user.preferredCountries  ?? []) as string[];
  const industries = (careerProfile?.preferredIndustries ?? user.preferredIndustries ?? []) as string[];

  const targetMarkets = countries.length ? countries.join(", ") : (user.country ?? "UK, Canada, UAE");

  // ── Build the profile block — only include lines with real data ─────────────
  const profile = [
    `Full Name:            ${fullName}`,
    `Email:                ${user.email}`,
    user.phone                  ? `Phone:                ${user.phone}` : null,
    user.country                ? `Nationality/Based in: ${user.country}` : null,
    `Target Markets:       ${targetMarkets}`,
    `Current/Last Role:    ${jobTitle}`,
    yearsExp    != null         ? `Years of Experience:  ${yearsExp}` : null,
    education                   ? `Education:            ${education}` : null,
    fieldOfStudy                ? `Field of Study:       ${fieldOfStudy}` : null,
    skills.length               ? `Skills:               ${skills.join(", ")}` : null,
    certs.length                ? `Certifications:       ${certs.join("; ")}` : null,
    languages.length            ? `Languages:            ${languages.map(l => `${l.language} (${l.proficiency})`).join("; ")}` : null,
    industries.length           ? `Target Industries:    ${industries.join(", ")}` : null,
    abroadExp                   ? `International Experience: Yes` : null,
  ].filter(Boolean).join("\n");

  const userPrompt = [
    "Below is a candidate profile. Write a complete, ATS-optimised CV for overseas employment.",
    "",
    profile,
    "",
    "Instructions:",
    `1. Target hiring standards for: ${targetMarkets}.`,
    "2. Sections required: Professional Summary · Key Skills · Work Experience · Education · Certifications (if any) · Languages (if any).",
    "3. Write 2–3 specific, action-oriented bullet points per experience block even if experience is inferred from the job title and years stated.",
    "4. Do NOT use generic filler like 'hardworking', 'team player', or 'results-driven' — be specific.",
    "5. Include ATS keywords relevant to the target markets and role.",
    "6. Keep the total under 650 words — concise, scannable, no fluff.",
    "7. Do NOT include any placeholder text in square brackets.",
    "8. Output plain text only — no markdown headers, no asterisks.",
  ].join("\n");

  const response = await openai.chat.completions.create({
    model:       "gpt-4o",
    temperature: 0.35,
    max_tokens:  1200,
    messages: [
      {
        role: "system",
        content:
          "You are a professional CV writer specialising in ATS-optimised CVs for East African " +
          "professionals targeting overseas employment in the UK, Canada, UAE, Qatar, and Saudi Arabia. " +
          "Write real, specific content. If a field is missing, infer credible achievements from the " +
          "job title and years of experience provided. Never use placeholder text.",
      },
      { role: "user", content: userPrompt },
    ],
  });

  const cv = response.choices[0].message.content ?? "";
  console.log(`[aiCv] Generated ${cv.length} chars for "${fullName}" → ${jobTitle} | target=${targetMarkets}`);
  return cv;
}
