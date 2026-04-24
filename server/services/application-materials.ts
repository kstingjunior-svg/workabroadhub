/**
 * generateApplicationMaterials
 *
 * Generates a job-tailored CV and cover letter for a specific application
 * using the user's career profile + the job description as context.
 *
 * On completion:
 *   - Stores results in user_job_applications.prepared_materials (jsonb)
 *   - Updates application status → "materials_ready"
 *   - Fires a push notification to every active browser subscription for the user
 *   - Fires a WebSocket event so the page refreshes immediately
 */

import { db, pool } from "../db";
import { openai } from "../lib/openai";
import { storage } from "../storage";
import { userCareerProfiles } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendPushNotification } from "./push-notifications";
import { trackTokenUsage } from "../lib/aiStats";
import type { User } from "@shared/models/auth";

export interface JobAnalysis {
  id: string;
  title: string;
  company: string;
  country: string;
  description?: string | null;
}

export interface ApplicationMaterials {
  cv:             string;
  coverLetter:    string;
  generatedAt:    string;
  tailoredAnswers?: Array<{ question: string; answer: string }>;
  cvSuggestions?:  string[];
  cvUrl?:          string;
  coverLetterUrl?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function generateJobTailoredCV(
  user: User & Record<string, any>,
  careerProfile: Record<string, any> | null,
  job: JobAnalysis,
  packType: string,
): Promise<string> {
  const firstName = user.firstName ?? user.first_name ?? "";
  const lastName  = user.lastName  ?? user.last_name  ?? "";
  const fullName  = [firstName, lastName].filter(Boolean).join(" ") || "Applicant";
  const jobTitle  = careerProfile?.currentJobTitle ?? user.currentJobTitle ?? "Professional";
  const yearsExp  = careerProfile?.yearsExperience ?? user.yearsExperience ?? null;
  const skills    = (careerProfile?.skills ?? user.skills ?? []).filter(Boolean).join(", ");
  const isPremium = packType === "premium";

  const storedCv = (careerProfile as any)?.parsedCvText as string | null | undefined;

  const prompt = [
    `Candidate: ${fullName} | Role: ${jobTitle} | Experience: ${yearsExp ?? "not specified"} years`,
    `Skills: ${skills || "not specified"}`,
    `Target Job: ${job.title} at ${job.company} (${job.country})`,
    job.description ? `Job Description:\n${job.description.slice(0, 800)}` : "",
    storedCv ? `\nCandidate's actual CV text (use this as the primary source of truth for their background):\n${storedCv.slice(0, 3_000)}` : "",
    "",
    "Instructions:",
    "1. Tailor the Professional Summary directly to this specific job and company.",
    "2. Highlight skills from the candidate's profile that match the job description keywords.",
    "3. Sections: Professional Summary · Key Skills · Work Experience · Education · Certifications · Languages.",
    isPremium
      ? "4. Premium format: include quantified achievements, leadership examples, and a strong personal brand statement."
      : "4. Standard format: concise, ATS-friendly, plain text.",
    "5. Under 650 words. No placeholders. No markdown. No asterisks.",
  ].join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content:
          "You are an expert CV writer for East African professionals targeting overseas employment. " +
          "Write specific, tailored, ATS-optimised content. Never use placeholder text.",
      },
      { role: "user", content: prompt },
    ],
  });

  // Track real token usage (fire-and-forget)
  if (response.usage) {
    trackTokenUsage(response.usage.prompt_tokens, response.usage.completion_tokens).catch(() => {});
  }

  return response.choices[0].message.content ?? "";
}

export async function generateCoverLetter(
  user: User & Record<string, any>,
  careerProfile: Record<string, any> | null,
  job: JobAnalysis,
): Promise<string> {
  const firstName = user.firstName ?? user.first_name ?? "";
  const lastName  = user.lastName  ?? user.last_name  ?? "";
  const fullName  = [firstName, lastName].filter(Boolean).join(" ") || "Applicant";
  const jobTitle  = careerProfile?.currentJobTitle ?? user.currentJobTitle ?? "Professional";
  const summary   = (careerProfile as any)?.summary ?? `${jobTitle} with international career ambitions`;
  const storedCv  = (careerProfile as any)?.parsedCvText as string | null | undefined;

  const prompt = [
    `Write a compelling cover letter for ${fullName} applying for: ${job.title} at ${job.company} (${job.country}).`,
    "",
    `Candidate background: ${summary}`,
    job.description ? `Key job requirements: ${job.description.slice(0, 500)}` : "",
    storedCv ? `\nCandidate's actual CV (use for specific details — achievements, employer names, dates):\n${storedCv.slice(0, 2_000)}` : "",
    "",
    "Requirements:",
    "- 3–4 paragraphs, professional tone, enthusiastic but not generic.",
    "- Opening: express specific interest in this company and role.",
    "- Body: connect the candidate's experience directly to the job requirements.",
    "- Closing: clear call to action (request interview).",
    "- Sign off with the candidate's full name.",
    "- Plain text only. Under 350 words.",
  ].join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.4,
    max_tokens: 700,
    messages: [
      {
        role: "system",
        content:
          "You are a professional cover letter writer. Write personalized, specific, persuasive letters. " +
          "Never use generic filler. Always connect the candidate directly to the company.",
      },
      { role: "user", content: prompt },
    ],
  });

  // Track real token usage (fire-and-forget)
  if (response.usage) {
    trackTokenUsage(response.usage.prompt_tokens, response.usage.completion_tokens).catch(() => {});
  }

  return response.choices[0].message.content ?? "";
}

/**
 * generateInterviewPrep
 *
 * Produces three tailored interview Q&A pairs and a list of specific CV
 * customisation suggestions for the given job. Uses JSON-mode GPT so the
 * response is guaranteed to parse without markdown cleanup.
 * Never throws — returns empty arrays on failure so the rest of the pipeline
 * is unaffected.
 */
export async function generateInterviewPrep(
  user:          User & Record<string, any>,
  careerProfile: Record<string, any> | null,
  job:           JobAnalysis,
): Promise<{ tailoredAnswers: Array<{ question: string; answer: string }>; cvSuggestions: string[] }> {
  const firstName = user.firstName ?? user.first_name ?? "";
  const lastName  = user.lastName  ?? user.last_name  ?? "";
  const fullName  = [firstName, lastName].filter(Boolean).join(" ") || "Applicant";
  const jobTitle  = careerProfile?.currentJobTitle ?? user.currentJobTitle ?? "Professional";
  const yearsExp  = careerProfile?.yearsExperience ?? user.yearsExperience ?? null;
  const skills    = (careerProfile?.skills ?? user.skills ?? []).filter(Boolean).join(", ");
  const storedCv  = (careerProfile as any)?.parsedCvText as string | null | undefined;

  const prompt = [
    `Candidate: ${fullName} | Current role: ${jobTitle} | Experience: ${yearsExp ?? "not specified"} years`,
    `Skills: ${skills || "not specified"}`,
    `Target Job: ${job.title} at ${job.company} (${job.country})`,
    job.description ? `Job Description:\n${job.description.slice(0, 600)}` : "",
    storedCv ? `\nCandidate's actual CV (use for specific role names, employers, and achievements):\n${storedCv.slice(0, 2_000)}` : "",
    "",
    "Generate:",
    `1. Three tailored interview answers for this specific role and candidate. Each answer must be 2-3 sentences.`,
    `2. Three to five specific CV customisation suggestions the candidate should make to better match this job.`,
    "",
    'Return JSON: { "tailoredAnswers": [{ "question": "...", "answer": "..." }, ...], "cvSuggestions": ["...", ...] }',
  ].join("\n");

  try {
    const response = await openai.chat.completions.create({
      model:           "gpt-4o-mini",
      temperature:     0.4,
      max_tokens:      900,
      response_format: { type: "json_object" },
      messages: [
        {
          role:    "system",
          content: "You are a professional career coach for East African overseas job seekers. Return only valid JSON.",
        },
        { role: "user", content: prompt },
      ],
    });

    if (response.usage) {
      trackTokenUsage(response.usage.prompt_tokens, response.usage.completion_tokens).catch(() => {});
    }

    const raw    = response.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(raw);

    return {
      tailoredAnswers: Array.isArray(parsed.tailoredAnswers) ? parsed.tailoredAnswers : [],
      cvSuggestions:   Array.isArray(parsed.cvSuggestions)   ? parsed.cvSuggestions   : [],
    };
  } catch (err: any) {
    console.warn("[AppMaterials] generateInterviewPrep failed:", err?.message);
    return { tailoredAnswers: [], cvSuggestions: [] };
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateApplicationMaterials(
  user: User & Record<string, any>,
  applicationId: string,
  job: JobAnalysis,
  packType: string = "standard",
): Promise<ApplicationMaterials> {
  console.log(
    `[AppMaterials] START | userId=${user.id} | appId=${applicationId} | job="${job.title}" @ ${job.company}`,
  );

  // 1. Mark as processing so the UI shows the spinner immediately
  await storage.updateUserJobApplication(applicationId, { status: "preparing" }).catch((err: any) => {
    console.error("[AppMaterials] Could not set status=preparing:", err?.message);
  });

  // 2. Fetch career profile for richer context
  const [careerProfile] = await db
    .select()
    .from(userCareerProfiles)
    .where(eq(userCareerProfiles.userId, user.id))
    .catch(() => [null]);

  // 3. Generate CV, cover letter, and interview prep in parallel
  const [cv, coverLetter, interviewPrep] = await Promise.all([
    generateJobTailoredCV(user, careerProfile ?? null, job, packType),
    generateCoverLetter(user, careerProfile ?? null, job),
    generateInterviewPrep(user, careerProfile ?? null, job),
  ]);

  console.log(
    `[AppMaterials] Generated | cv=${cv.length} chars | cl=${coverLetter.length} chars | ` +
    `answers=${interviewPrep.tailoredAnswers.length} | suggestions=${interviewPrep.cvSuggestions.length} | userId=${user.id}`,
  );

  const materials: ApplicationMaterials = {
    cv,
    coverLetter,
    tailoredAnswers: interviewPrep.tailoredAnswers,
    cvSuggestions:   interviewPrep.cvSuggestions,
    generatedAt:     new Date().toISOString(),
  };

  // 4. Persist to preparedMaterials + flip status
  await storage.updateUserJobApplication(applicationId, {
    preparedMaterials: materials as any,
    status: "materials_ready",
    statusMessage: "Your CV and cover letter are ready to download.",
  }).catch((err: any) => {
    console.error("[AppMaterials] Failed to save materials:", { error: err?.message, applicationId });
    throw err; // re-throw — caller needs to know
  });

  // 5. Push notification to all of the user's browser subscriptions (fire-and-forget)
  sendUserPushNotification(user.id, {
    title: "📄 Your application is ready!",
    body: `CV and cover letter for ${job.title} at ${job.company} are ready to download.`,
    url: "/assisted-apply",
  }).catch((err: any) => {
    console.error("[AppMaterials] Push notification failed:", err?.message);
  });

  // 6. WebSocket — import dynamically to avoid circular dependency
  import("../websocket").then(({ notifyApplicationReady }) => {
    notifyApplicationReady(user.id, {
      type: "application_ready",
      applicationId,
      jobTitle: job.title,
      company: job.company,
    });
  }).catch((err: any) => {
    console.error("[AppMaterials] WS notify failed:", err?.message);
  });

  // 7. In-app notification
  storage.createUserNotification({
    userId: user.id,
    type: "success",
    title: "Application Materials Ready",
    message: `Your CV and cover letter for ${job.title} at ${job.company} are ready to download.`,
  }).catch((err: any) => {
    console.error("[AppMaterials] createUserNotification failed:", err?.message);
  });

  console.log(`[AppMaterials] DONE | appId=${applicationId} | userId=${user.id}`);
  return materials;
}

// ── Push helper: userId-level (looks up all subscriptions for a user) ─────────

export async function sendUserPushNotification(
  userId: string,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  const { rows } = await pool.query<{
    endpoint: string; p256dh: string; auth: string;
  }>(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1 AND is_active = true`,
    [userId],
  );

  if (rows.length === 0) return;

  await Promise.allSettled(
    rows.map((sub) =>
      sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
      ),
    ),
  );
}
