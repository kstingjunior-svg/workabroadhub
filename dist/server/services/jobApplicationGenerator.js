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
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function generateJobApplication(jobTitle, company, jobDescription, userCV, additionalRequirements) {
    return (0, retry_1.generateWithRetry)(async () => {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are an expert job application writer helping a Kenyan professional apply for overseas employment. " +
                        "Generate a professional cover letter and 3 tailored interview answers specific to the role. " +
                        "The applicant is targeting overseas employment with visa sponsorship.",
                },
                {
                    role: "user",
                    content: `Job: ${jobTitle} at ${company}\n` +
                        `Description: ${jobDescription.slice(0, 800)}\n` +
                        `${additionalRequirements ? `Additional Requirements: ${additionalRequirements.slice(0, 300)}\n` : ""}` +
                        `CV: ${userCV.slice(0, 3000)}\n\n` +
                        `Return JSON: { "coverLetter": "3-paragraph letter", "tailoredAnswers": [{"question":"...","answer":"..."}], "cvSuggestions": ["..."] }`,
                },
            ],
            response_format: { type: "json_object" },
            max_tokens: 1200,
            temperature: 0.7,
        });
        const raw = response.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw);
        return {
            coverLetter: parsed.coverLetter ?? "Cover letter generation failed. Please try again.",
            tailoredAnswers: parsed.tailoredAnswers ?? [],
            cvSuggestions: parsed.cvSuggestions ?? ["Add more quantifiable achievements"],
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
