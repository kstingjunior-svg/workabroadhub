// @ts-nocheck
/**
 * Service order routes — unified upload → pay → AI → download flow.
 *
 * Endpoints (mounted by registerServiceOrderRoutes from routes.ts):
 *   POST  /api/services/order/:slug            Create order + STK push, accept CV upload
 *   GET   /api/services/order/:orderId/status  Poll: { status, progress, error? }
 *   GET   /api/services/order/:orderId/download/:format   format = "docx" | "pdf"
 *
 * Service config: per-slug rules for what input is needed (CV upload? job
 * description? target country?), the AI system prompt, and the output title.
 */

import type { Express, Request, Response, RequestHandler } from "express";
import multer from "multer";
import crypto from "crypto";
import { pool, db } from "./db";
import { storage } from "./storage";
import { openai } from "./lib/openai";
import { extractTextFromBuffer, MIN_CV_LENGTH } from "./utils/extract-text";
import { renderDocx, renderPdf } from "./services/document-renderer";

// ── Multer (memory storage, 5 MB cap, PDF/DOCX only) ─────────────────────────
const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ].includes(file.mimetype);
    cb(null, ok);
  },
});

// ── Per-service configuration ────────────────────────────────────────────────
interface ServiceConfig {
  /** Human-friendly display name shown in UI + DOCX title */
  name: string;
  /** Does this service require the user to upload a CV? */
  needsCv: boolean;
  /** GPT system prompt for the generation */
  systemPrompt: string;
  /** Suggested output filename (without extension) */
  filename: string;
  /** Approx time the user should expect to wait (for UI messaging) */
  estSeconds: number;
}

const SERVICE_CONFIGS: Record<string, ServiceConfig> = {
  cv_fix_lite: {
    name: "CV Fix Lite",
    needsCv: true,
    filename: "CV_Fix_Lite",
    estSeconds: 30,
    systemPrompt: `You are a professional CV editor. Take the user's existing CV and produce a cleaner, more professional version:
- Fix grammar, spelling, and punctuation
- Standardize formatting (consistent date format, capitalization, spacing)
- Improve weak phrasing without changing factual content
- Keep the same sections and length — DO NOT add fictional experience
- Output in plain text with section headers like "## Experience" / "## Education" / "## Skills"
- Use **bold** sparingly for job titles and company names
Return ONLY the rewritten CV body — no commentary, no markdown code fences.`,
  },
  ats_cv_optimization: {
    name: "ATS CV Optimization",
    needsCv: true,
    filename: "ATS_Optimized_CV",
    estSeconds: 60,
    systemPrompt: `You are an ATS optimization expert. Rewrite the user's CV to maximize Applicant Tracking System compatibility:
- Use standard section headers (Summary, Experience, Education, Skills, Certifications)
- Add quantifiable achievements (use metrics where reasonable based on the CV)
- Inject industry-relevant keywords naturally
- Remove any tables, columns, graphics, fancy formatting
- Use bullet points for achievements (each starting with a strong action verb)
- Keep to 2 pages worth (~800 words)
- Output as plain text with ## headings and * bullets
Return ONLY the rewritten CV body.`,
  },
  cv_rewrite: {
    name: "Country-Specific CV Rewrite",
    needsCv: true,
    filename: "Country_CV_Rewrite",
    estSeconds: 90,
    systemPrompt: `You are a CV expert for international relocation. Rewrite the user's CV to match the conventions of their TARGET COUNTRY (provided in user message):
- UK: 2 pages max, British spelling, no photo, include nationality + work auth status
- Canada: 1-2 pages, no photo, plain professional format
- USA: 1 page, no photo, results-driven bullets, no DOB/marital status
- Australia: 2-3 pages, achievement-based, Australian spelling
- Germany/EU: include Europass-style headers, German if applying within DE
- UAE/Gulf: include photo OK, nationality OK, 2 pages
Output as plain text with ## section headings.`,
  },
  cover_letter: {
    name: "Cover Letter",
    needsCv: true,
    filename: "Cover_Letter",
    estSeconds: 25,
    systemPrompt: `You are a professional cover-letter writer. Using the CV provided + any job details in the user message, produce a 250-350 word cover letter:
- Address it to "Dear Hiring Manager," unless a name is provided
- Opening: state the role + 1-line hook
- Middle: 2 short paragraphs connecting CV experience to the job's requirements
- Close: state availability + thank
- Sign off with the candidate's name from the CV
Output as plain text. No markdown headings.`,
  },
  sop_writing: {
    name: "Statement of Purpose",
    needsCv: false,
    filename: "Statement_of_Purpose",
    estSeconds: 90,
    systemPrompt: `You are a university admissions essay writer. Using the user's details, produce an 800-1000 word Statement of Purpose:
- Hook opening tied to a personal experience
- Academic background paragraph (degree, key courses, GPA if shared)
- Research/professional interests paragraph
- Why this university, why this program
- Career goals (short and long term)
- Closing: alignment with the program's strengths
Output as plain text. Use ## for section headers if it helps flow.`,
  },
  motivation_letter: {
    name: "Motivation Letter",
    needsCv: false,
    filename: "Motivation_Letter",
    estSeconds: 60,
    systemPrompt: `You are a scholarship/EU motivation letter expert. Produce a 500-700 word motivation letter using the user's details:
- Formal but warm tone
- Specific reasons WHY this program/job/scholarship
- Concrete examples from background
- Future contribution / goals
Output as plain text. No markdown.`,
  },
  linkedin_optimization: {
    name: "LinkedIn Profile Optimization",
    needsCv: true,
    filename: "LinkedIn_Optimization",
    estSeconds: 60,
    systemPrompt: `You are a LinkedIn optimization expert. Using the user's CV, output a guide with these sections:
## Headline (3 options)
## About / Summary (compelling 2-3 paragraph version)
## Featured skills (top 10 to add)
## Experience bullets (improved versions for each role)
## Suggested keywords + groups to join
Use ## for headings and bullets where useful.`,
  },
  interview_coaching: {
    name: "Interview Coaching Pack",
    needsCv: true,
    filename: "Interview_Prep",
    estSeconds: 90,
    systemPrompt: `You are an interview coach. Using the user's CV + target role, produce a complete prep pack:
## Likely questions (15 specific to this role/CV)
## STAR-method answers (sample answers to the top 5 questions)
## Questions YOU should ask the interviewer (5 strong ones)
## Red flags to avoid
## Salary negotiation tips for the role
Use ## headers and bullets.`,
  },
  ats_cover_bundle: {
    name: "ATS + Cover Letter Bundle",
    needsCv: true,
    filename: "ATS_CV_and_Cover_Letter",
    estSeconds: 90,
    systemPrompt: `You are a CV + cover letter expert. Produce BOTH documents in a single response, separated by a clear divider:

# ATS-OPTIMIZED CV

(Rewrite the user's CV with:
- Standard ATS section headers (Summary, Experience, Education, Skills, Certifications)
- Quantified achievements where reasonable
- Industry keywords woven in naturally
- Plain text format, no tables/columns
- ## section headings, * bullets for achievements)

# ---

# COVER LETTER

(Now produce a 300-word cover letter:
- Addressed to "Dear Hiring Manager,"
- Connects CV experience to the job specifics provided
- Strong opening hook + closing ask
- Signed off with candidate's name)

Output as plain text. Use ## for the two main section dividers above.`,
  },
};

// Each service may also be referenced by its DB UUID; we look up by slug only here.
function getConfig(slug: string): ServiceConfig | null {
  return SERVICE_CONFIGS[slug.toLowerCase()] ?? null;
}

// ── Helper: extract CV text or return null with a friendly error ────────────
async function extractCvOrError(req: Request): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const file = (req as any).file;
  if (!file) return { ok: false, error: "Please upload your CV (PDF or Word document)." };
  try {
    const { text } = await extractTextFromBuffer(file.buffer, file.mimetype, file.originalname);
    if (text.trim().length < MIN_CV_LENGTH) {
      return { ok: false, error: "Couldn't extract enough text from your CV. Try a text-based PDF or .docx file." };
    }
    return { ok: true, text };
  } catch (err: any) {
    return { ok: false, error: "Could not read your CV file. Please try a different format." };
  }
}

// ── DB helpers ──────────────────────────────────────────────────────────────
async function createOrder(args: {
  userId: string;
  slug: string;
  serviceName: string;
  cvText: string | null;
  jobDescription: string | null;
  targetCountry: string | null;
  extraInput: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO service_orders
       (id, user_id, service_slug, service_name, status, cv_text, job_description, target_country, extra_input, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'pending_payment', $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, args.userId, args.slug, args.serviceName, args.cvText, args.jobDescription, args.targetCountry, args.extraInput],
  );
  return id;
}

async function updateOrderStatus(orderId: string, status: string, fields: Record<string, any> = {}): Promise<void> {
  const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 3}`);
  const values = Object.values(fields);
  await pool.query(
    `UPDATE service_orders SET status = $2, updated_at = NOW()${sets.length ? ", " + sets.join(", ") : ""} WHERE id = $1`,
    [orderId, status, ...values],
  );
}

// ── AI processing — async, fired after payment confirms ─────────────────────
async function processOrder(orderId: string): Promise<void> {
  try {
    const { rows } = await pool.query<{
      service_slug: string;
      cv_text: string | null;
      job_description: string | null;
      target_country: string | null;
      extra_input: string | null;
      user_id: string;
    }>(`SELECT service_slug, cv_text, job_description, target_country, extra_input, user_id FROM service_orders WHERE id = $1`, [orderId]);
    const order = rows[0];
    if (!order) return;

    const config = getConfig(order.service_slug);
    if (!config) {
      await updateOrderStatus(orderId, "failed", { error_message: `Unknown service slug: ${order.service_slug}` });
      return;
    }

    await updateOrderStatus(orderId, "processing");

    // Build the user message for GPT
    let userMessage = "";
    if (config.needsCv && order.cv_text) userMessage += `Here is the user's CV:\n\n${order.cv_text.slice(0, 6000)}\n\n`;
    if (order.target_country) userMessage += `Target country: ${order.target_country}\n`;
    if (order.job_description) userMessage += `Job description / role they're applying for:\n${order.job_description.slice(0, 2000)}\n`;
    if (order.extra_input) userMessage += `Additional details:\n${order.extra_input}\n`;
    if (!userMessage) userMessage = "Please generate the document with reasonable defaults.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
      max_tokens: 2500,
    });

    const output = completion.choices[0]?.message?.content?.trim();
    if (!output) {
      await updateOrderStatus(orderId, "failed", { error_message: "AI returned empty response" });
      return;
    }

    // Final write — NOW() can't be passed as a bound parameter, so we use a
    // direct SQL update here rather than the generic updateOrderStatus helper.
    await pool.query(
      `UPDATE service_orders SET output_text = $2, status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [orderId, output],
    );
  } catch (err: any) {
    console.error(`[ServiceOrder] processOrder error for ${orderId}:`, err?.message);
    await pool.query(
      `UPDATE service_orders SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1`,
      [orderId, err?.message ?? "Unknown error"],
    ).catch(() => {});
  }
}

// ── Public: trigger from payment callback after success ─────────────────────
export async function onPaymentSuccessForServiceOrder(orderId: string): Promise<void> {
  await pool.query(`UPDATE service_orders SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = $1`, [orderId]);
  // Fire-and-forget — don't block the payment callback response
  processOrder(orderId).catch((e) => console.error("[ServiceOrder] async process failed:", e?.message));
}

// ── Route registration ─────────────────────────────────────────────────────
export function registerServiceOrderRoutes(app: Express, isAuthenticated: RequestHandler) {
  // POST /api/services/order/:slug
  // Body: multipart/form-data { cv: File, jobDescription?, targetCountry?, extraInput? }
  // Response: { orderId, serviceName, price, needsPayment: true }
  app.post(
    "/api/services/order/:slug",
    isAuthenticated,
    cvUpload.single("cv"),
    async (req: any, res: Response) => {
      try {
        const userId: string | undefined = req.user?.claims?.sub ?? req.user?.id;
        if (!userId) return res.status(401).json({ message: "Please sign in first." });

        const slug = String(req.params.slug || "").toLowerCase();
        const config = getConfig(slug);
        if (!config) return res.status(404).json({ message: "Unknown service." });

        // CV extraction if required
        let cvText: string | null = null;
        if (config.needsCv) {
          const extracted = await extractCvOrError(req);
          if (!extracted.ok) return res.status(400).json({ message: extracted.error });
          cvText = extracted.text;
        }

        const jobDescription = String(req.body?.jobDescription ?? "").trim() || null;
        const targetCountry  = String(req.body?.targetCountry ?? "").trim() || null;
        const extraInput     = String(req.body?.extraInput ?? "").trim() || null;

        const orderId = await createOrder({
          userId,
          slug,
          serviceName: config.name,
          cvText,
          jobDescription,
          targetCountry,
          extraInput,
        });

        // Look up the canonical price from the services table by slug
        const { rows: priceRows } = await pool.query<{ price: number }>(
          `SELECT price FROM services WHERE slug = $1 OR code = $1 LIMIT 1`,
          [slug],
        );
        const price = priceRows[0]?.price ?? 0;

        res.json({
          orderId,
          serviceName: config.name,
          price,
          estSeconds: config.estSeconds,
          needsPayment: price > 0,
        });
      } catch (err: any) {
        // Surface the underlying cause so the client can show it to the user
        // (and so logs make the failure mode obvious — e.g. missing table).
        const errMsg = err?.message ?? "Unknown error";
        const errCode = err?.code ?? null;
        console.error("[ServiceOrder] create error:", errMsg, errCode);
        // Common case: migration not run yet
        const looksLikeMissingTable =
          /relation .* does not exist/i.test(errMsg) || errCode === "42P01";
        res.status(500).json({
          message: looksLikeMissingTable
            ? "Service-order table not yet created on this database. Run migrations/0005_service_orders.sql in Supabase first."
            : `Could not create your order: ${errMsg}`,
          code: errCode,
        });
      }
    },
  );

  // GET /api/services/order/:orderId/status
  app.get("/api/services/order/:orderId/status", isAuthenticated, async (req: any, res: Response) => {
    const userId: string | undefined = req.user?.claims?.sub ?? req.user?.id;
    if (!userId) return res.status(401).json({ message: "Please sign in." });
    const { rows } = await pool.query<{
      id: string;
      user_id: string;
      service_slug: string;
      service_name: string;
      status: string;
      error_message: string | null;
      created_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT id, user_id, service_slug, service_name, status, error_message, created_at, completed_at
         FROM service_orders WHERE id = $1`,
      [req.params.orderId],
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.user_id !== userId) return res.status(403).json({ message: "Not your order." });
    res.json({
      orderId: order.id,
      serviceSlug: order.service_slug,
      serviceName: order.service_name,
      status: order.status, // pending_payment | paid | processing | completed | failed
      error: order.error_message,
      createdAt: order.created_at,
      completedAt: order.completed_at,
      downloadAvailable: order.status === "completed",
    });
  });

  // GET /api/services/order/:orderId/download/:format
  app.get(
    "/api/services/order/:orderId/download/:format",
    isAuthenticated,
    async (req: any, res: Response) => {
      try {
        const userId: string | undefined = req.user?.claims?.sub ?? req.user?.id;
        if (!userId) return res.status(401).json({ message: "Please sign in." });
        const format = String(req.params.format || "").toLowerCase();
        if (!["docx", "pdf"].includes(format)) {
          return res.status(400).json({ message: "Format must be 'docx' or 'pdf'." });
        }

        const { rows } = await pool.query<{
          user_id: string;
          service_slug: string;
          service_name: string;
          status: string;
          output_text: string | null;
        }>(
          `SELECT user_id, service_slug, service_name, status, output_text FROM service_orders WHERE id = $1`,
          [req.params.orderId],
        );
        const order = rows[0];
        if (!order) return res.status(404).json({ message: "Order not found." });
        if (order.user_id !== userId) return res.status(403).json({ message: "Not your order." });
        if (order.status !== "completed" || !order.output_text) {
          return res.status(409).json({ message: "Order is not ready yet." });
        }

        const config = getConfig(order.service_slug);
        const filenameBase = config?.filename ?? order.service_name.replace(/\s+/g, "_");
        const filename = `${filenameBase}.${format}`;

        const buffer =
          format === "docx"
            ? await renderDocx({
                title: order.service_name,
                body: order.output_text,
                footer: "Generated by WorkAbroad Hub — workabroadhub.tech",
              })
            : await renderPdf({
                title: order.service_name,
                body: order.output_text,
                footer: "Generated by WorkAbroad Hub — workabroadhub.tech",
              });

        res.setHeader(
          "Content-Type",
          format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf",
        );
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(buffer);
      } catch (err: any) {
        console.error("[ServiceOrder] download error:", err?.message);
        res.status(500).json({ message: "Could not generate the document. Please try again." });
      }
    },
  );

  console.log("[ServiceOrder] Routes registered: POST /api/services/order/:slug, GET /api/services/order/:orderId/{status,download/:format}");
}
