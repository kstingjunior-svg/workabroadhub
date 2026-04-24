// server/services/jobApplicationGenerator.ts
//
// Adapted from reference implementation.
// Uses gpt-4o-mini with JSON mode instead of gpt-4-turbo-preview without
// structured output — gives real tailored answers and CV suggestions rather
// than placeholder strings.

import OpenAI from "openai";
import { generateWithRetry } from "../utils/retry";

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
            "You are an expert job application writer helping a Kenyan professional apply for overseas employment. " +
            "Generate a professional cover letter and 3 tailored interview answers specific to the role. " +
            "The applicant is targeting overseas employment with visa sponsorship.",
        },
        {
          role: "user",
          content:
            `Job: ${jobTitle} at ${company}\n` +
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
      coverLetter:     parsed.coverLetter     ?? "Cover letter generation failed. Please try again.",
      tailoredAnswers: parsed.tailoredAnswers ?? [],
      cvSuggestions:   parsed.cvSuggestions   ?? ["Add more quantifiable achievements"],
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
