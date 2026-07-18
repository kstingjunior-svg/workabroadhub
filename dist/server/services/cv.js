"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCV = generateCV;
const openai_1 = require("../lib/openai");
const human_voice_1 = require("../ai/human-voice");
const EDUCATION_LABEL = {
    high_school: "High School / Secondary Certificate",
    diploma: "Diploma / Certificate",
    bachelors: "Bachelor's Degree",
    masters: "Master's Degree",
    phd: "PhD / Doctorate",
};
async function generateCV(user, careerProfile) {
    // ── Resolve fields from both sources, user row wins on conflict ────────────
    const firstName = user.firstName ?? user.first_name ?? "";
    const lastName = user.lastName ?? user.last_name ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Applicant";
    const jobTitle = careerProfile?.currentJobTitle ?? user.currentJobTitle ?? "Professional";
    const yearsExp = careerProfile?.yearsExperience ?? user.yearsExperience ?? null;
    const educationKey = careerProfile?.educationLevel ?? user.educationLevel ?? null;
    const education = educationKey ? (EDUCATION_LABEL[educationKey] ?? educationKey) : null;
    const fieldOfStudy = careerProfile?.fieldOfStudy ?? user.fieldOfStudy ?? null;
    const abroadExp = careerProfile?.hasWorkExperienceAbroad ?? user.hasWorkExperienceAbroad ?? false;
    const skills = (careerProfile?.skills ?? user.skills ?? []).filter(Boolean);
    const certs = (careerProfile?.certifications ?? user.certifications ?? []).filter(Boolean);
    const languages = (careerProfile?.languages ?? user.languages ?? []);
    const countries = (careerProfile?.preferredCountries ?? user.preferredCountries ?? []);
    const industries = (careerProfile?.preferredIndustries ?? user.preferredIndustries ?? []);
    const targetMarkets = countries.length ? countries.join(", ") : (user.country ?? "UK, Canada, UAE");
    // ── Build the profile block — only include lines with real data ─────────────
    const profile = [
        `Full Name:            ${fullName}`,
        `Email:                ${user.email}`,
        user.phone ? `Phone:                ${user.phone}` : null,
        user.country ? `Nationality/Based in: ${user.country}` : null,
        `Target Markets:       ${targetMarkets}`,
        `Current/Last Role:    ${jobTitle}`,
        yearsExp != null ? `Years of Experience:  ${yearsExp}` : null,
        education ? `Education:            ${education}` : null,
        fieldOfStudy ? `Field of Study:       ${fieldOfStudy}` : null,
        skills.length ? `Skills:               ${skills.join(", ")}` : null,
        certs.length ? `Certifications:       ${certs.join("; ")}` : null,
        languages.length ? `Languages:            ${languages.map(l => `${l.language} (${l.proficiency})`).join("; ")}` : null,
        industries.length ? `Target Industries:    ${industries.join(", ")}` : null,
        abroadExp ? `International Experience: Yes` : null,
    ].filter(Boolean).join("\n");
    const userPrompt = [
        "Below is a candidate profile. Write a complete, ATS-optimised CV for overseas employment.",
        "",
        profile,
        "",
        (0, human_voice_1.roleVerticalContext)(jobTitle),
        "",
        "Instructions:",
        `1. Target hiring standards for: ${targetMarkets}.`,
        "2. Sections required: Professional Summary, Key Skills, Work Experience, Education, Certifications (if any), Languages (if any).",
        "3. Every experience bullet uses the achievement shape: {verb} + {number or specific} + {what} + {timeframe or scale}. NO responsibility-list bullets.",
        "4. Professional Summary must open with a concrete, honest fact that a hiring manager will remember. Not 'Dedicated professional with X years of experience'.",
        "5. Include ATS keywords relevant to the target markets and role, but weave them into real sentences, not a keyword-stuffed list.",
        "6. Keep the total under 650 words. Concise, scannable, no fluff.",
        "7. Do NOT include any placeholder text in square brackets in the final CV.",
        "8. Output plain text only. No markdown headers, no asterisks.",
    ].join("\n");
    const response = await openai_1.openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.55,
        max_tokens: 1200,
        messages: [
            {
                role: "system",
                content: "You are a hiring-manager-turned-CV-writer who has read 10,000 CVs from East African " +
                    "professionals applying overseas. You know the difference between a CV that gets a call " +
                    "and a CV that gets ignored: warmth, specificity, and one memorable line the reader will " +
                    "quote back in the interview. You write real, specific content. If a field is missing, " +
                    "infer credible achievements from the job title and years of experience, but keep them " +
                    "plausible for a real Kenyan candidate. Never use placeholder text. Never use em-dashes.\n\n" +
                    human_voice_1.HUMAN_VOICE_RULES,
            },
            { role: "user", content: userPrompt },
        ],
    });
    const cv = (0, human_voice_1.stripAiTells)(response.choices[0].message.content ?? "");
    console.log(`[aiCv] Generated ${cv.length} chars for "${fullName}" → ${jobTitle} | target=${targetMarkets}`);
    return cv;
}
