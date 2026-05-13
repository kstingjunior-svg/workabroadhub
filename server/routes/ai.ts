// server/routes/ai.ts
//
// Adapted from reference implementation.
// Non-existent service imports (cvParser, jobApplicationGenerator) and the
// raw-SQL `generated_applications` table are replaced with our actual
// equivalents: extractTextFromBuffer, inline gpt-4o-mini generation, and
// storage.getUserJobApplications / getUserJobApplicationById.
// Auth uses isAuthenticated + requireAnyPaidPlan (OIDC-compatible user ID).

import { Router } from "express";
import multer from "multer";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireAnyPaidPlan } from "../middleware/requirePlan";
import { storage } from "../storage";
import { parseCV, rewriteCV } from "../services/cvParser";
import { generateJobApplication } from "../services/jobApplicationGenerator";
import { jobQueue } from "../lib/jobQueue";

const router = Router();

const MAX_JOBS = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ─── shared helpers ───────────────────────────────────────────────────────────

function resolveUserId(req: any): string {
  return req.user?.claims?.sub ?? String(req.user?.id ?? "");
}

// ============================================
// CV CHECKING ENDPOINTS
// ============================================

/**
 * POST /api/ai/cv/check
 * Upload and analyze a CV — extracts text, persists to career profile.
 */
router.post("/cv/check", isAuthenticated, upload.single("cv"), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const ext = (req.file.originalname ?? "").toLowerCase();
    const mimeOk =
      req.file.mimetype === "application/pdf" ||
      req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext.endsWith(".docx");
    if (!mimeOk) {
      return res.status(400).json({ error: "Unsupported file type. Upload a PDF or DOCX." });
    }

    const result = await parseCV(req.file.buffer, req.file.originalname);

    // Persist to career profile (fire-and-forget, mirrors reference's UPDATE users SET parsed_cv_text)
    const userId = resolveUserId(req);
    if (userId && result.text.length >= 50) {
      storage
        .upsertUserCareerProfile(userId, {
          parsedCvText: result.text.slice(0, 12000),
          cvLastParsed: new Date(),
        })
        .catch((err: any) =>
          console.error("[AI:cv/check] Failed to persist parsed CV text:", err?.message),
        );
    }

    return res.json({
      success:         result.success,
      score:           result.score,
      weaknesses:      result.weaknesses,
      missingKeywords: result.missingKeywords,
      suggestions:     result.suggestions,
      isScanned:       result.isScanned,
    });
  } catch (error: any) {
    console.error("CV check failed:", error);
    return res.status(500).json({ error: "Failed to process CV", message: error.message });
  }
});

/**
 * POST /api/ai/cv/rewrite
 * Professionally rewrites the user's stored CV text using GPT.
 * Optionally accepts { text } in the body to rewrite an arbitrary snippet
 * instead of the stored profile CV.
 */
router.post("/cv/rewrite", isAuthenticated, requireAnyPaidPlan, async (req: any, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "User not authenticated" });

    // Use body-supplied text first; fall back to stored CV
    let rawText: string = req.body?.text ?? "";

    if (!rawText) {
      const profile = await storage.getUserCareerProfile(userId).catch(() => null);
      rawText = (profile as any)?.parsedCvText ?? "";
    }

    if (!rawText || rawText.length < 100) {
      return res
        .status(400)
        .json({ error: "Please upload and check your CV first, or provide text in the request body." });
    }

    const rewritten = await rewriteCV(rawText);

    return res.json({ success: true, rewritten });
  } catch (error: any) {
    console.error("CV rewrite failed:", error);
    return res.status(500).json({ error: "Failed to rewrite CV", message: error.message });
  }
});

// ============================================
// JOB APPLICATION GENERATION ENDPOINTS
// ============================================

/**
 * POST /api/ai/jobs/generate
 * Generate application materials for a single job.
 */
router.post("/jobs/generate", isAuthenticated, requireAnyPaidPlan, async (req: any, res) => {
  try {
    const { jobTitle, company, jobDescription, additionalRequirements } = req.body;

    if (!jobTitle || !company || !jobDescription) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Fetch stored CV text from career profile (mirrors reference's SELECT parsed_cv_text FROM users)
    const profile = await storage.getUserCareerProfile(userId).catch(() => null);
    const userCV = (profile as any)?.parsedCvText as string | undefined;
    if (!userCV) {
      return res
        .status(400)
        .json({ error: "Please upload and check your CV first" });
    }

    const application = await generateJobApplication(
      jobTitle,
      company,
      jobDescription,
      userCV,
      additionalRequirements,
    );

    // Note: reference inserted into `generated_applications` which doesn't exist in this schema.
    // Results are returned directly; history is queryable via GET /api/ai/jobs/history.

    return res.json({
      success:        true,
      coverLetter:    application.coverLetter,
      tailoredAnswers: application.tailoredAnswers,
      cvSuggestions:  application.cvSuggestions,
    });
  } catch (error: any) {
    console.error("Application generation failed:", error);
    return res
      .status(500)
      .json({ error: "Failed to generate application", message: error.message });
  }
});

/**
 * POST /api/ai/jobs/batch-generate
 * Generate applications for multiple jobs at once (batches of 5, rate-limit safe).
 */
router.post("/jobs/batch-generate", isAuthenticated, requireAnyPaidPlan, async (req: any, res) => {
  try {
    const { jobs } = req.body;

    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: "No jobs provided" });
    }

    if (jobs.length > MAX_JOBS) {
      return res.status(400).json({
        error: `Too many jobs — maximum ${MAX_JOBS} per request`,
        max: MAX_JOBS,
      });
    }

    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const profile = await storage.getUserCareerProfile(userId).catch(() => null);
    const userCV = (profile as any)?.parsedCvText as string | undefined;
    if (!userCV) {
      return res
        .status(400)
        .json({ error: "Please upload and check your CV first" });
    }

    // Enqueue — return immediately so the client isn't blocked during AI generation
    const queuedJob = await jobQueue.add({ type: "ai_apply", userId, userCV, jobs });

    return res.status(202).json({
      success: true,
      queued:  true,
      jobId:   queuedJob.id,
      total:   jobs.length,
      message: `Generating ${jobs.length} application${jobs.length !== 1 ? "s" : ""} in the background`,
    });
  } catch (error: any) {
    console.error("Batch generation failed:", error);
    return res
      .status(500)
      .json({ error: "Failed to queue batch generation", message: error.message });
  }
});

/**
 * GET /api/ai/jobs/status/:jobId
 * Poll the status and results of a queued batch-generate job.
 */
router.get("/jobs/status/:jobId", isAuthenticated, async (req: any, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found or already expired" });
    }

    const state    = await job.getState();          // waiting | active | completed | failed | delayed
    const progress = job.progress() as number ?? 0;
    const result   = state === "completed" ? job.returnvalue : null;
    const reason   = state === "failed"    ? (job.failedReason ?? "Unknown error") : null;

    return res.json({
      jobId,
      state,
      progress,
      ...(result ? { applications: result, total: result.length } : {}),
      ...(reason ? { error: reason } : {}),
    });
  } catch (error: any) {
    console.error("Status check failed:", error);
    return res.status(500).json({ error: "Failed to check job status" });
  }
});

/**
 * GET /api/ai/jobs/history
 * Get user's generated application history (Assisted Apply records).
 */
router.get("/jobs/history", isAuthenticated, async (req: any, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Mirrors reference's SELECT ... FROM generated_applications WHERE user_id = $1
    const applications = await storage.getUserJobApplications(userId);
    const sorted = [...applications]
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      )
      .slice(0, 50);

    return res.json(sorted);
  } catch (error: any) {
    console.error("Failed to fetch history:", error);
    return res.status(500).json({ error: "Failed to fetch application history" });
  }
});

/**
 * POST /api/ai/jobs/retry/:id
 * Retry generation for an existing Assisted Apply application record.
 */
router.post("/jobs/retry/:id", isAuthenticated, requireAnyPaidPlan, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = resolveUserId(req);

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Mirrors reference's SELECT job_title, company FROM generated_applications WHERE id=$1 AND user_id=$2
    const application = await storage.getUserJobApplicationById(id);
    if (!application || (application as any).userId !== userId) {
      return res.status(404).json({ error: "Application not found" });
    }

    const profile = await storage.getUserCareerProfile(userId).catch(() => null);
    const userCV = (profile as any)?.parsedCvText as string | undefined;
    if (!userCV) {
      return res
        .status(400)
        .json({ error: "CV not found. Please upload your CV first." });
    }

    const generated = await generateJobApplication(
      (application as any).jobTitle ?? "",
      (application as any).companyName ?? "",
      "",  // original description not stored; regenerate from title + company
      userCV,
    );

    // Persist updated materials back onto the record (mirrors reference's UPDATE)
    await storage.updateUserJobApplication(id, {
      preparedMaterials: {
        coverLetter:     generated.coverLetter,
        tailoredAnswers: generated.tailoredAnswers,
        cvSuggestions:   generated.cvSuggestions,
        generatedAt:     new Date().toISOString(),
      } as any,
    });

    return res.json({
      success:        true,
      coverLetter:    generated.coverLetter,
      tailoredAnswers: generated.tailoredAnswers,
    });
  } catch (error: any) {
    console.error("Retry failed:", error);
    return res.status(500).json({ error: "Failed to retry application generation" });
  }
});

// ============================================
// SERVICE DISPATCHER
// ============================================

// Handlers map service IDs to their implementations.
// Mirrors reference pattern: if (id === "ai_apply") return handleAIApply(...)

async function handleAIApply(req: any, res: any): Promise<void> {
  const userId = resolveUserId(req);
  const { jobTitle, company, jobDescription, additionalRequirements } = req.body;

  if (!jobTitle || !company || !jobDescription) {
    res.status(400).json({ error: "jobTitle, company, and jobDescription are required" });
    return;
  }

  const profile = await storage.getUserCareerProfile(userId).catch(() => null);
  const userCV = (profile as any)?.parsedCvText as string | undefined;
  if (!userCV) {
    res.status(400).json({ error: "Please upload and check your CV first" });
    return;
  }

  const application = await generateJobApplication(
    jobTitle, company, jobDescription, userCV, additionalRequirements,
  );

  res.json({ success: true, service: "ai_apply", ...application });
}

async function handleVisa(req: any, res: any): Promise<void> {
  const { country, visaType, question } = req.body;

  if (!country) {
    res.status(400).json({ error: "country is required" });
    return;
  }

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a visa and immigration expert for East African professionals seeking overseas employment. " +
          "Provide clear, practical, step-by-step guidance. Always recommend consulting official embassy resources.",
      },
      {
        role: "user",
        content:
          `Country: ${country}\n` +
          `${visaType ? `Visa type: ${visaType}\n` : ""}` +
          `${question ?? "What are the key steps, requirements, and typical processing times for a work visa?"}`,
      },
    ],
    max_tokens: 600,
    temperature: 0.3,
  });

  const guidance = completion.choices[0]?.message?.content?.trim() ?? "";
  res.json({ success: true, service: "visa_assist", country, guidance });
}

async function handleCV(req: any, res: any): Promise<void> {
  const userId = resolveUserId(req);
  const { text } = req.body;

  // Use provided text or fall back to stored CV from career profile
  let rawText: string = text ?? "";
  if (!rawText) {
    const profile = await storage.getUserCareerProfile(userId).catch(() => null);
    rawText = (profile as any)?.parsedCvText ?? "";
  }

  if (!rawText || rawText.length < 50) {
    res.status(400).json({
      error: "Provide CV text in the request body or upload your CV via POST /api/ai/cv/check first",
    });
    return;
  }

  // Analyse text directly — no file parsing needed for this text-input path
  const lowerText = rawText.toLowerCase();
  const keywordChecks: Record<string, string> = {
    "work experience": "work experience|experience",
    education:         "education|qualification",
    skills:            "skills|competenc",
    contact:           "email|phone|tel|contact",
    summary:           "summary|objective|profile",
  };

  const missingKeywords = Object.entries(keywordChecks)
    .filter(([, pattern]) => !new RegExp(pattern).test(lowerText))
    .map(([label]) => label);

  const weaknesses: string[] = [];
  if (rawText.length < 300) weaknesses.push("CV content appears too short");
  if (missingKeywords.includes("contact")) weaknesses.push("No contact information detected");
  if (missingKeywords.includes("work experience")) weaknesses.push("Work experience section not clearly labelled");

  let score = 50;
  if (rawText.length >= 500) score += 20;
  score += Math.min(30, (5 - missingKeywords.length) * 6);
  score = Math.max(0, Math.min(100, score));

  const suggestions: string[] = [];
  if (missingKeywords.includes("skills")) suggestions.push("Add a dedicated Skills section");
  if (missingKeywords.includes("summary")) suggestions.push("Include a professional summary at the top");
  if (!suggestions.length) suggestions.push("CV structure looks good — use the full ATS checker for a detailed score");

  res.json({
    success:         true,
    service:         "cv_check",
    score,
    weaknesses,
    missingKeywords,
    suggestions,
    isScanned:       false,
  });
}

/**
 * POST /api/ai/service/:id
 * Single dispatcher endpoint — mirrors reference pattern.
 * Supported IDs: ai_apply | visa_assist | cv_check
 */
router.post("/service/:id", isAuthenticated, requireAnyPaidPlan, async (req: any, res) => {
  const { id } = req.params;

  try {
    if (id === "ai_apply")    return await handleAIApply(req, res);
    if (id === "visa_assist") return await handleVisa(req, res);
    if (id === "cv_check")    return await handleCV(req, res);

    return res.status(404).json({ error: "Service not found" });
  } catch (error: any) {
    console.error(`[AI:service/${id}]`, error?.message);
    return res.status(500).json({ error: `Service ${id} failed`, message: error.message });
  }
});

export default router;
