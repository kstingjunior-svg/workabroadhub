// server/services/jobApplicationGenerator.ts
//
// Adapted from reference implementation.
// Uses gpt-4o-mini with JSON mode instead of gpt-4-turbo-preview without
// structured output — gives real tailored answers and CV suggestions rather
// than placeholder strings.

import OpenAI from "openai";
import { generateWithRetry } from "../utils/retry";
import { HUMAN_VOICE_RULES, roleVerticalContext, stripAiTells } from "../ai/human-voice";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface JobApplicationResult {
  coverLetter: string;
  tailoredAnswers: { question: string; answer: string }[];
  cvSuggestions: string[];
}

export async function generateJobApplication(
  jobTitle: string,
  company: string,
  jobDescription: string,
  userCV: string,
  additionalRequirements?: string,
): Promise<JobApplicationResult> {
  return generateWithRetry(async () => {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write cover letters and interview answers that sound like the candidate actually " +
            "wrote them, warm and specific, not templated. The applicant is a Kenyan professional " +
            "targeting overseas employment with visa sponsorship. Every sentence should be tailored " +
            "to THIS job at THIS company, not generic. Never open with 'I am writing to express my " +
            "interest'. Never use em-dashes. Return valid JSON only.\n\n" +
            HUMAN_VOICE_RULES,
        },
        {
          role: "user",
          content:
            `Job: ${jobTitle} at ${company}\n` +
            `Description: ${jobDescription.slice(0, 800)}\n` +
            `${additionalRequirements ? `Additional Requirements: ${additionalRequirements.slice(0, 300)}\n` : ""}` +
            `CV: ${userCV.slice(0, 3000)}\n\n` +
            `${roleVerticalContext(jobTitle)}\n\n` +
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
      coverLetter:     stripAiTells(parsed.coverLetter ?? "Cover letter generation failed. Please try again."),
      tailoredAnswers: (parsed.tailoredAnswers ?? []).map((a: any) => ({
        question: a?.question ?? "",
        answer:   stripAiTells(a?.answer ?? ""),
      })),
      cvSuggestions:   (parsed.cvSuggestions ?? ["Add more quantifiable achievements"]).map((s: string) => stripAiTells(s)),
    };
  });
}

export async function batchGenerateApplications(
  jobs: { title: string; company: string; description?: string; additionalRequirements?: string }[],
  userCV: string,
): Promise<{ job: (typeof jobs)[number]; application: JobApplicationResult }[]> {
  const MAX_JOBS = 5;
  const results: { job: (typeof jobs)[number]; application: JobApplicationResult }[] = [];

  for (const job of jobs.slice(0, MAX_JOBS)) {
    const application = await generateJobApplication(
      job.title,
      job.company,
      job.description ?? "",
      userCV,
      job.additionalRequirements,
    );
    results.push({ job, application });
  }

  return results;
}
