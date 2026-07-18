"use strict";
// server/services/jobApplicationGenerator.ts
//
// Adapted from reference implementation.
// Uses gpt-4o-mini with JSON mode instead of gpt-4-turbo-preview without
// structured output — gives real tailored answers and CV suggestions rather
// than placeholder strings.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateJobApplication = generateJobApplication;
exports.batchGenerateApplications = batchGenerateApplications;
const openai_1 = __importDefault(require("openai"));
const retry_1 = require("../utils/retry");
const human_voice_1 = require("../ai/human-voice");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function generateJobApplication(jobTitle, company, jobDescription, userCV, additionalRequirements) {
    return (0, retry_1.generateWithRetry)(async () => {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You write cover letters and interview answers that sound like the candidate actually " +
                        "wrote them, warm and specific, not templated. The applicant is a Kenyan professional " +
                        "targeting overseas employment with visa sponsorship. Every sentence should be tailored " +
                        "to THIS job at THIS company, not generic. Never open with 'I am writing to express my " +
                        "interest'. Never use em-dashes. Return valid JSON only.\n\n" +
                        human_voice_1.HUMAN_VOICE_RULES,
                },
                {
                    role: "user",
                    content: `Job: ${jobTitle} at ${company}\n` +
                        `Description: ${jobDescription.slice(0, 800)}\n` +
                        `${additionalRequirements ? `Additional Requirements: ${additionalRequirements.slice(0, 300)}\n` : ""}` +
                        `CV: ${userCV.slice(0, 3000)}\n\n` +
                        `${(0, human_voice_1.roleVerticalContext)(jobTitle)}\n\n` +
                        `Return JSON with exactly these fields:\n` +
                        `{\n` +
                        `  "coverLetter": "4 short paragraphs. Para 1: warm hook from the candidate's real life that maps to this job. Para 2: two concrete matches to the job needs, with numbers. Para 3: one honest sentence about why THIS company. Para 4: interview request + sign-off.",\n` +
                        `  "tailoredAnswers": [ 3 objects with 'question' and 'answer', each answer must reference a specific detail from the candidate's CV, not a generic response ],\n` +
                        `  "cvSuggestions": [ 3 specific ways this candidate's CV could be strengthened for this role ]\n` +
                        `}`,
                },
            ],
            response_format: { type: "json_object" },
            max_tokens: 1200,
            temperature: 0.65,
        });
        const raw = response.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw);
        return {
            coverLetter: (0, human_voice_1.stripAiTells)(parsed.coverLetter ?? "Cover letter generation failed. Please try again."),
            tailoredAnswers: (parsed.tailoredAnswers ?? []).map((a) => ({
                question: a?.question ?? "",
                answer: (0, human_voice_1.stripAiTells)(a?.answer ?? ""),
            })),
            cvSuggestions: (parsed.cvSuggestions ?? ["Add more quantifiable achievements"]).map((s) => (0, human_voice_1.stripAiTells)(s)),
        };
    });
}
async function batchGenerateApplications(jobs, userCV) {
    const MAX_JOBS = 5;
    const results = [];
    for (const job of jobs.slice(0, MAX_JOBS)) {
        const application = await generateJobApplication(job.title, job.company, job.description ?? "", userCV, job.additionalRequirements);
        results.push({ job, application });
    }
    return results;
}
