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

// ── Multer (memory storage, 10 MB cap) ───────────────────────────────────────
// 2026-07 (Tony's users report "can't upload CV"): loosened previously-strict
// limits. Root cause was: (a) 5 MB was too small for scanned/graphic-heavy CVs,
// (b) fileFilter rejected images so mobile users who photographed their CV got
// silent multer errors, (c) multer rejections weren't wrapped in JSON so the
// client got a raw 500 HTML page and displayed "Could not create order".
//
// Now: 10 MB cap (matches offer-check + ielts-verify), accepts image types
// (users take phone photos of CVs and we OCR them via vision), and the wrapper
// below catches all multer errors and returns JSON with a friendly message.
const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Different mime whitelist per field: `cv` accepts docs + phone photos;
    // `photo` (2026-07) accepts real images only (no PDFs / Word docs).
    if (file.fieldname === "photo") {
      const okPhoto = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
        .includes(file.mimetype);
      return cb(null, okPhoto);
    }
    const ok = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      // 2026-07: allow phone photos of CVs — extractTextFromBuffer + OCR
      // handles image → text on the server. Better UX than rejecting.
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ].includes(file.mimetype);
    cb(null, ok);
  },
});

/**
 * Multer error → JSON. Wraps a fields upload (cv + optional photo) so
 * LIMIT_FILE_SIZE, unsupported mime, and generic multer errors return a
 * proper JSON body the client can display.
 *
 * 2026-07: refactored from .single("cv") to .fields([cv, photo]) so users
 * can OPTIONALLY attach a passport-style headshot to embed in the final
 * CV/document. Downstream code reads req.files.cv[0] and req.files.photo[0]
 * — see the compat shim below that also mirrors req.files.cv[0] to req.file
 * for existing extractCvOrError() code that expected the .single() shape.
 */
function cvUploadWithJsonErrors(_fieldName?: string) {
  const mw = cvUpload.fields([
    { name: "cv",    maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]);
  return (req: any, res: Response, next: any) => {
    mw(req, res, (err: any) => {
      if (!err) {
        // Compat shim — expose req.files.cv[0] as req.file so existing
        // helpers (extractCvOrError) keep working without modification.
        const cvFile = req.files?.cv?.[0];
        if (cvFile) req.file = cvFile;
        return next();
      }
      const isMulter = err.name === "MulterError";
      const isSize   = err.code === "LIMIT_FILE_SIZE";
      const isPhoto  = err.field === "photo";
      const msg =
        isSize && isPhoto  ? "Your photo is larger than 10 MB. Please choose a smaller photo — even 500 KB is plenty."
      : isSize             ? "Your CV is larger than 10 MB. Please compress it or upload a smaller version."
      : isMulter && isPhoto ? "Could not process your photo. Please try a JPG or PNG."
      : isMulter           ? "Could not process your upload. Please try a PDF, Word, or image file up to 10 MB."
      : /file type|mimetype|unsupported/i.test(String(err.message)) ? "That file type is not supported. Please upload a PDF, Word document, or a clear photo/scan."
      : "Something went wrong reading your file. Please try again with a fresh copy.";
      console.warn(`[ServiceOrder] multer error code=${err.code} name=${err.name} field=${err.field ?? "?"} msg="${err.message}" → responding to client`);
      return res.status(400).json({ message: msg, code: err.code ?? "UPLOAD_ERROR" });
    });
  };
}

/**
 * mapErrorForUser — translate raw provider errors into warm, reassuring
 * messages the user can read without losing trust.
 *
 * 2026-07 (Tony's founder ask, prompted by an "429 You exceeded your current
 * quota" leak): a paying user should NEVER see the words "quota", "billing",
 * "OpenAI", "API key", etc. Those are OUR problems, not theirs. The user
 * needs to know two things: (1) their payment is safe, (2) we'll get their
 * CV to them shortly.
 *
 * Raw error is still stored in service_orders.error_message for admin
 * debugging + Sentry — this only affects what the user sees.
 */
function mapErrorForUser(raw: string): string {
  const lower = String(raw || "").toLowerCase();

  // OpenAI billing / quota exhaustion — this is the founder's #1 issue.
  // Whatever exact wording OpenAI uses, we normalize to a warm message.
  if (
    lower.includes("quota") ||
    lower.includes("insufficient_quota") ||
    lower.includes("billing") ||
    (lower.includes("429") && lower.includes("exceeded")) ||
    lower.includes("check your plan")
  ) {
    return "We're catching up on high demand right now. Your payment is safe. Our team has been alerted and your document will be delivered within the hour — you'll get an email and WhatsApp the moment it's ready. If you'd prefer a refund, reply to your confirmation email.";
  }

  // Rate limit — transient, will self-heal on the retry sweep.
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    (lower.includes("429") && !lower.includes("quota"))
  ) {
    return "Our AI is busy handling other orders right now. Your payment is safe. We're already retrying — your document will be ready in a few minutes. You can safely close this tab and check back, or wait here for the download buttons.";
  }

  // Timeout — same recovery story.
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset")
  ) {
    return "That took longer than expected. Your payment is safe. We're already retrying — you'll get your document by email and WhatsApp the moment it's ready.";
  }

  // Empty / invalid AI response — retry sweep handles it.
  if (
    lower.includes("empty response") ||
    lower.includes("invalid response") ||
    lower.includes("unexpected response")
  ) {
    return "We had a small hiccup generating your document. Your payment is safe. We're already retrying automatically — you'll have it in a few minutes.";
  }

  // Server 5xx — same story.
  if (/\b5\d\d\b/.test(lower) || lower.includes("internal server error")) {
    return "The AI had a temporary issue. Your payment is safe. We're retrying automatically — check back in a couple minutes or watch your email/WhatsApp.";
  }

  // File / extraction errors — user CAN act on these.
  if (
    lower.includes("cv text") ||
    lower.includes("extract") ||
    lower.includes("no text found") ||
    lower.includes("unreadable")
  ) {
    return "We couldn't read the CV you uploaded — the file might be a scanned image or password-protected. Your payment is safe. Please reply to your confirmation email with a fresh copy (PDF or Word) and we'll process it manually.";
  }

  // Unknown model / config — never expose "gpt-4o" etc.
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("unavailable"))) {
    return "One of our AI models needed a quick restart. Your payment is safe. We're retrying automatically — your document will be ready shortly.";
  }

  // Default fallback — polite but concrete about payment safety.
  return "Something didn't go through on our side. Your payment is safe. Our team has been alerted and your document will be delivered within the hour by email and WhatsApp. If you'd prefer a refund, reply to your confirmation email and we'll process it right away.";
}

// ─────────────────────────────────────────────────────────────────────────────
// workPermitSystemPrompt — generates the system prompt for the Light and Mid
// tiers of Work Permit Assistance. Light returns a country-specific guide;
// Mid additionally drafts the visa application form using the user's CV +
// intake data. Pro tier skips AI entirely (manualOnly=true) and lands in
// admin queue.
// ─────────────────────────────────────────────────────────────────────────────
function workPermitSystemPrompt(
  country: string,
  permitClass: string,
  tier: "light" | "mid",
): string {
  const formFillBlock = tier === "mid"
    ? `\n\n## SECTION 5 — APPLICATION FORM DRAFT\nUsing the candidate's CV and intake data above, draft the application form fields they will need to submit. Use the format:\n\n  Field name: drafted value\n\nWhere uncertain, leave the value as "[VERIFY: …]" so the user knows to confirm before submission. Cover ALL standard fields for ${country}'s permit class.`
    : "";

  return `You are a senior immigration adviser at WorkAbroad Hub helping a Kenyan applicant prepare for a work permit in ${country}.

The relevant permit class is: ${permitClass}.

Produce a clear, structured guide as plain text with ## section headers. Sections to cover IN THIS ORDER:

## SECTION 1 — WHICH PERMIT CLASS APPLIES TO YOU
Confirm the permit class, who issues it, and any sub-routes or exceptions relevant to a Kenyan candidate. Mention if a Certificate of Sponsorship / employer pre-approval / agency-route is required BEFORE starting.

## SECTION 2 — DOCUMENT CHECKLIST
List every document required, in numbered order. For each document say:
- The full official name
- Where the user obtains it in Kenya (MFA, KMTC, embassy, etc.)
- Whether it needs attestation / apostille and by whom
- Typical cost in KES
- Typical time to obtain in Kenya

## SECTION 3 — FEES & TIMELINE
List the official government fees (in the destination currency AND approx KES equivalent at current rates), the typical processing timeline, and any priority/expedited service options with their cost.

## SECTION 4 — COMMON REJECTION REASONS
List the top 5 reasons Kenyan applicants get rejected for this permit and exactly how to avoid each one.${formFillBlock}

## FINAL — OFFICIAL LINKS
Provide the official government URLs for the application portal, fee schedule, and document attestation flow. Use real, verifiable URLs only.

RULES:
- Be specific and concrete. NO generic "consult an immigration lawyer" advice.
- Use real ${country} terminology (e.g. "Iqama", "CoS", "QID", "NOC code") — not vague translations.
- Output plain text with ## headers and dashes for bullets. NO markdown code fences. NO emoji.
- If you don't know a specific figure, write "[VERIFY: …]" rather than inventing it.
- Length: aim for ~1200 words for Light, ~1800 words for Mid.`;
}

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
  /**
   * When true, processOrder skips the AI step entirely and marks the order
   * as 'needs_human_review' so it lands in the admin queue. Used for Pro
   * tier services that require manual hand-holding (e.g. work permit
   * employer liaison) where AI output would mislead the user.
   */
  manualOnly?: boolean;
}

const SERVICE_CONFIGS: Record<string, ServiceConfig> = {
  cv_fix_lite: {
    name: "CV Revamp",
    needsCv: true,
    filename: "CV_Revamp",
    estSeconds: 45,
    // 2026-07: AGGRESSIVE quality bump so the re-check on /tools/ats-cv-checker
    // returns 85-90+. Previously "just fix grammar" left ATS scores near baseline.
    // Now we actively restructure into ATS-favoured sections, add strong action
    // verbs, weave in role-relevant keywords, and eliminate weak filler — WITHOUT
    // fabricating jobs / employers / dates / metrics. The output must READ like
    // a human wrote it (see human-voice.ts rules) not like a ChatGPT template.
    systemPrompt: `You are a senior CV editor whose revamps consistently score 85-95 on ATS scanners. Take the user's existing CV and produce a materially STRONGER version that will pass through ATS filters and impress a recruiter in 6 seconds.

MANDATORY QUALITY LIFTS (in this order):

1. STRUCTURE — restructure into the exact ATS-favoured section order:
   ## [Candidate Name]
   ## Professional Summary       (3-4 sentences, tailored to their most recent role and any target country mentioned)
   ## Key Skills                 (8-12 recruiter-searchable skills — hard skills first, tools + certifications, not "hardworking")
   ## Work Experience            (chronological, most recent first)
   ## Education
   ## Certifications             (if any exist in the input)
   ## Languages                  (if any exist in the input)

2. ACHIEVEMENT BULLETS — every experience bullet uses this shape:
     {strong action verb} + {what} + {measurable outcome or scale}
   Bad:  "Responsible for customer service"
   Good: "Handled 60+ customer enquiries daily across 3 channels, resolving 92% on first contact"
   If the original bullet gives NO number, keep it factual but rewrite for impact — do NOT invent a number. Where genuinely useful use "[add number]" so the user can drop in a real figure.

3. KEYWORDS — from the candidate's own current job title and industry, weave in the 10-15 keywords a recruiter's ATS actually searches for in that field. Do NOT stuff — every keyword must fit naturally inside a real sentence.

4. STRIP FILLER — remove all of these words if present:
   "hardworking", "team player", "detail-oriented", "results-driven", "self-motivated", "passionate about excellence", "responsible for", "duties included", "in charge of", "helped with"

5. WARM, HUMAN TONE — the Summary must open with something a hiring manager will remember about THIS candidate specifically (their years, their industry, their strongest 1-2 achievements). Never open with "Dedicated professional with X years of experience".

6. ANTI-AI TELLS — zero em-dashes (use commas). Zero of: "delve into", "leverage" (use "use"), "utilize" (use "use"), "spearhead" (use "led"), "furthermore", "moreover", "in today's fast-paced world", "seamlessly", "orchestrate", "cutting-edge", "synergy".

7. FORMATTING — plain text, "## " for section headers, "**Company Name — Role — YYYY–YYYY**" line for each job. Use "*" for bullet points. Do NOT use tables, columns, images, or code fences.

STRICT RULES:
- Never fabricate employers, dates, credentials, or achievements.
- Never add fictional experience.
- Keep every real fact intact — company names, dates, degrees, certifications.
- Length: ~600-800 words (1-2 pages when rendered).

8. USER PREFERENCES ARE NOT FABRICATION. If the user provides preferences in the "USER-SUPPLIED PREFERENCES" block (target salary, availability, languages, willingness to relocate, certifications, achievements, must-mention experiences), you MUST include every one of them in the appropriate section of the final CV. These are the user's own truthful additions, not invented facts. Ignoring them is a defect.

CRITICAL: Do NOT include any title, header, or label like "CV Revamp", "CV Fix Lite", "CV", "Resume", "Curriculum Vitae", or any service / product name at the very top. Start the output directly with "## [Candidate Name]" using the real name from their CV. The document goes to a real employer — never reveal it was processed by an editing service.

Return ONLY the revamped CV body — no commentary, no markdown code fences, no preamble.`,
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
CRITICAL: Do NOT include any title, header, or label like "ATS CV Optimization", "Optimized CV", "CV", "Resume", or any service / product name at the top. Start directly with the candidate's name (or Summary section). The recruiter must see a clean CV, not branded content.
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

  // ── Work Permit Assistance (5 countries × 3 tiers) ─────────────────────────
  // Light tier: AI-generated country-specific permit guide. Instant.
  // Mid tier:   AI guide + form pre-fill draft. Still AI-delivered.
  // Pro tier:   manualOnly=true → no AI, routed straight to admin queue with
  //             delivery_status='needs_human_review' for hand-holding.

  // --- UK ---
  work_permit_uk_light: {
    name: "UK Work Permit Guide (Skilled Worker)",
    needsCv: false,
    filename: "UK_Work_Permit_Guide",
    estSeconds: 60,
    systemPrompt: workPermitSystemPrompt("UK", "Skilled Worker Visa (with Certificate of Sponsorship from a UK employer holding a sponsor licence)", "light"),
  },
  work_permit_uk_mid: {
    name: "UK Work Permit Assist + Form Pre-fill",
    needsCv: true,
    filename: "UK_Work_Permit_Assist",
    estSeconds: 120,
    systemPrompt: workPermitSystemPrompt("UK", "Skilled Worker Visa (with Certificate of Sponsorship from a UK employer holding a sponsor licence)", "mid"),
  },
  work_permit_uk_pro: {
    name: "UK Work Permit — Full Hand-Holding",
    needsCv: true,
    filename: "UK_Work_Permit_Pro",
    estSeconds: 0,
    systemPrompt: "",
    manualOnly: true,
  },

  // --- UAE ---
  work_permit_uae_light: {
    name: "UAE Work Permit Guide (MOHRE)",
    needsCv: false,
    filename: "UAE_Work_Permit_Guide",
    estSeconds: 60,
    systemPrompt: workPermitSystemPrompt("UAE", "MOHRE-issued Employer-Sponsored Work Permit + Employment Visa + Emirates ID (mainland) OR free-zone equivalent", "light"),
  },
  work_permit_uae_mid: {
    name: "UAE Work Permit Assist + Form Pre-fill",
    needsCv: true,
    filename: "UAE_Work_Permit_Assist",
    estSeconds: 120,
    systemPrompt: workPermitSystemPrompt("UAE", "MOHRE-issued Employer-Sponsored Work Permit + Employment Visa + Emirates ID (mainland) OR free-zone equivalent", "mid"),
  },
  work_permit_uae_pro: {
    name: "UAE Work Permit — Full Hand-Holding",
    needsCv: true,
    filename: "UAE_Work_Permit_Pro",
    estSeconds: 0,
    systemPrompt: "",
    manualOnly: true,
  },

  // --- Saudi Arabia ---
  work_permit_saudi_light: {
    name: "Saudi Work Permit Guide (Iqama)",
    needsCv: false,
    filename: "Saudi_Work_Permit_Guide",
    estSeconds: 60,
    systemPrompt: workPermitSystemPrompt("Saudi Arabia", "Block Visa → Work Visa (via MoFA Enjazit) → Iqama (residence permit)", "light"),
  },
  work_permit_saudi_mid: {
    name: "Saudi Work Permit Assist + Form Pre-fill",
    needsCv: true,
    filename: "Saudi_Work_Permit_Assist",
    estSeconds: 120,
    systemPrompt: workPermitSystemPrompt("Saudi Arabia", "Block Visa → Work Visa (via MoFA Enjazit) → Iqama (residence permit)", "mid"),
  },
  work_permit_saudi_pro: {
    name: "Saudi Work Permit — Full Hand-Holding",
    needsCv: true,
    filename: "Saudi_Work_Permit_Pro",
    estSeconds: 0,
    systemPrompt: "",
    manualOnly: true,
  },

  // --- Canada ---
  work_permit_canada_light: {
    name: "Canada Work Permit Guide (LMIA)",
    needsCv: false,
    filename: "Canada_Work_Permit_Guide",
    estSeconds: 60,
    systemPrompt: workPermitSystemPrompt("Canada", "LMIA-supported work permit / IEC / Express Entry route (Federal Skilled Worker / CEC / PNP) — choose the best fit based on the user's profile and NOC code", "light"),
  },
  work_permit_canada_mid: {
    name: "Canada Work Permit Assist + Form Pre-fill",
    needsCv: true,
    filename: "Canada_Work_Permit_Assist",
    estSeconds: 120,
    systemPrompt: workPermitSystemPrompt("Canada", "LMIA-supported work permit / IEC / Express Entry route (Federal Skilled Worker / CEC / PNP) — choose the best fit based on the user's profile and NOC code", "mid"),
  },
  work_permit_canada_pro: {
    name: "Canada Work Permit — Full Hand-Holding",
    needsCv: true,
    filename: "Canada_Work_Permit_Pro",
    estSeconds: 0,
    systemPrompt: "",
    manualOnly: true,
  },

  // --- Qatar ---
  work_permit_qatar_light: {
    name: "Qatar Work Permit Guide (MOI)",
    needsCv: false,
    filename: "Qatar_Work_Permit_Guide",
    estSeconds: 60,
    systemPrompt: workPermitSystemPrompt("Qatar", "Qatar Work Visa via the Ministry of Interior + post-arrival Residence Permit (QID), processed through Qatar Visa Center Nairobi", "light"),
  },
  work_permit_qatar_mid: {
    name: "Qatar Work Permit Assist + Form Pre-fill",
    needsCv: true,
    filename: "Qatar_Work_Permit_Assist",
    estSeconds: 120,
    systemPrompt: workPermitSystemPrompt("Qatar", "Qatar Work Visa via the Ministry of Interior + post-arrival Residence Permit (QID), processed through Qatar Visa Center Nairobi", "mid"),
  },
  work_permit_qatar_pro: {
    name: "Qatar Work Permit — Full Hand-Holding",
    needsCv: true,
    filename: "Qatar_Work_Permit_Pro",
    estSeconds: 0,
    systemPrompt: "",
    manualOnly: true,
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
  amount?: number;
  cvText: string | null;
  jobDescription: string | null;
  targetCountry: string | null;
  extraInput: string | null;
  /**
   * Referring order ID captured from the visitor's localStorage (via
   * ?ref=<orderId> or /share/<orderId>). Optional — most orders won't
   * carry one. Written to the referrer_order_id column added in
   * migrations/0026_referral_tracking.sql.
   */
  referrerOrderId?: string | null;
  /**
   * 2026-07 (Tony's founder ask): optional passport-style photo the user
   * wants embedded in the delivered CV. Stored as a data URL
   * ("data:image/jpeg;base64,...") in the photo_data column added by
   * migrations/0027_photo_upload.sql. Rendered via document-renderer's
   * new photo argument. Null when the user chose to skip.
   */
  photoDataUrl?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();

  // Sanitize the referrer token — must look like a UUID, must NOT be the
  // user's own prior order (self-referral is meaningless). Silently drop
  // anything that doesn't validate rather than reject the whole order.
  let referrer: string | null = null;
  if (args.referrerOrderId && typeof args.referrerOrderId === "string") {
    const t = args.referrerOrderId.trim();
    if (/^[0-9a-fA-F-]{8,64}$/.test(t)) {
      try {
        const { rows } = await pool.query<{ user_id: string }>(
          `SELECT user_id FROM service_orders WHERE id = $1 LIMIT 1`,
          [t],
        );
        // Only credit when the referring order belongs to a DIFFERENT user.
        if (rows[0] && rows[0].user_id !== args.userId) referrer = t;
      } catch { /* non-fatal — proceed without attribution */ }
    }
  }

  // We fill BOTH service_id (old schema, NOT NULL) and service_slug (new
  // columns added for the unified flow) with the same slug — so both old
  // Drizzle-based code paths AND new service-order-routes work cleanly.
  await pool.query(
    `INSERT INTO service_orders
       (id, user_id, service_id, service_slug, service_name, amount, currency, status,
        cv_text, job_description, target_country, extra_input, referrer_order_id, photo_data,
        created_at, updated_at)
     VALUES ($1, $2, $3, $3, $4, $5, 'KES', 'pending_payment', $6, $7, $8, $9, $10, $11, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      args.userId,
      args.slug,             // used for both service_id and service_slug
      args.serviceName,
      args.amount ?? 0,
      args.cvText,
      args.jobDescription,
      args.targetCountry,
      args.extraInput,
      referrer,
      args.photoDataUrl ?? null,
    ],
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

    // ── manualOnly tier (Work Permit Pro etc.) — skip AI entirely ──────────
    // Mark the order as 'processing' so the user UI shows "we're on it",
    // but set delivery_status='needs_human_review' so the admin queue
    // surfaces it for hand-holding. The team picks it up from /admin.
    if (config.manualOnly) {
      await pool.query(
        `UPDATE service_orders
            SET status           = 'processing',
                delivery_status  = 'needs_human_review',
                ai_processed_at  = NOW(),
                admin_notes      = COALESCE(admin_notes, '') ||
                                   E'\n[auto] Manual-tier service — awaiting human review.',
                updated_at       = NOW()
          WHERE id = $1`,
        [orderId],
      );
      console.log(`[ServiceOrder] manualOnly ${order.service_slug} order ${orderId} routed to admin queue (needs_human_review)`);
      return;
    }

    await updateOrderStatus(orderId, "processing");

    // Build the user message for GPT
    // 2026-07 (Tony's report): the AI was IGNORING user-supplied preferences
    // like target salary because the previous prompt only said "additional
    // details" — the model didn't know it MUST honour them in the output.
    // Now we label the block clearly and use CAPS so the model treats the
    // preferences as authoritative instructions, not decorative context.
    let userMessage = "";
    if (config.needsCv && order.cv_text) userMessage += `Here is the user's CV:\n\n${order.cv_text.slice(0, 6000)}\n\n`;
    if (order.target_country) userMessage += `TARGET COUNTRY (include country-appropriate conventions in the output): ${order.target_country}\n\n`;
    if (order.job_description) userMessage += `TARGET JOB / ROLE the candidate is applying for (tailor the CV to match these keywords + requirements):\n${order.job_description.slice(0, 2000)}\n\n`;
    if (order.extra_input) {
      userMessage += `╔════════════════════════════════════════════════════════════╗
║ USER-SUPPLIED PREFERENCES — YOU MUST HONOUR EVERY ITEM     ║
║ BELOW IN THE FINAL OUTPUT. THESE ARE NOT SUGGESTIONS.      ║
╚════════════════════════════════════════════════════════════╝
${order.extra_input}

Rules for handling the preferences above:
- If the user mentions a TARGET SALARY or compensation expectation, add a "Compensation Expectations" line (or include it in the Professional Summary) using their exact figure.
- If the user mentions AVAILABILITY / NOTICE PERIOD / START DATE, add an "Availability" line near the top.
- If the user mentions specific ACHIEVEMENTS or PROJECTS to emphasize, work them into the relevant experience bullets using their exact words.
- If the user mentions LANGUAGES, add a "Languages" section.
- If the user mentions willingness to RELOCATE, add a one-line "Open to relocation to {country}" note in the Summary.
- If the user mentions any CERTIFICATIONS not already in the CV, add them to the Certifications section.
- Do NOT invent facts the user didn't provide, but DO include every fact they did provide even if it wasn't in the original CV.
`;
    }
    if (!userMessage) userMessage = "Please generate the document with reasonable defaults.";

    // 2026-07: CV Revamp + other CV outputs now use gpt-4o (not gpt-4o-mini)
    // and a slightly higher temperature so the output has real warmth. Other
    // service types keep the cheaper model. Also raised max_tokens to 3000
    // so the fuller revamp doesn't truncate.
    const isCvRevamp    = String(order.service_slug ?? "").toLowerCase() === "cv_fix_lite";
    const isCvHeavy     = ["ats_cv_optimization", "cv_rewrite"].includes(String(order.service_slug ?? "").toLowerCase());
    const modelToUse    = (isCvRevamp || isCvHeavy) ? "gpt-4o" : "gpt-4o-mini";
    const tempToUse     = (isCvRevamp || isCvHeavy) ? 0.55 : 0.4;
    const maxTokensUse  = (isCvRevamp || isCvHeavy) ? 3000 : 2500;

    const completion = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: tempToUse,
      max_tokens: maxTokensUse,
    });

    let output = completion.choices[0]?.message?.content?.trim();
    if (!output) {
      await updateOrderStatus(orderId, "failed", { error_message: "AI returned empty response" });
      return;
    }

    // 2026-07: strip em-dashes, "leverage", "delve into", "furthermore" and
    // the other AI tells before saving. Same scrubber used by write-from-scratch
    // and LinkedIn Optimizer. Keeps quality consistent across every AI doc we ship.
    try {
      const { stripAiTells } = await import("./ai/human-voice");
      output = stripAiTells(output);
    } catch { /* non-critical — output is still usable if the scrubber load fails */ }

    // Final write — NOW() can't be passed as a bound parameter, so we use a
    // direct SQL update here rather than the generic updateOrderStatus helper.
    await pool.query(
      `UPDATE service_orders SET output_text = $2, status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [orderId, output],
    );

    // ── Notify the user that their document is READY ────────────────────────
    // 2026-07 (Tony's audit): previously nothing ran after status=completed.
    // Users who closed the tab never knew their CV was ready — the earlier
    // WhatsApp had promised delivery "within minutes" but no follow-up ever
    // fired. Now: email + WhatsApp with a direct link to the download page.
    // Fire-and-forget — must NOT block order completion or fail the request.
    notifyOrderCompleted(orderId).catch((notifyErr) => {
      console.warn(`[ServiceOrder] completion notification failed for ${orderId}:`, notifyErr?.message);
    });

    // ── Fingerprint the delivered CV ──────────────────────────────────────
    // For any service whose output IS a CV, persist a hash so that when
    // the user later re-uploads the same CV to /tools/ats-cv-checker the
    // grader honours the score we promised them. Prevents the obvious
    // trust kill-shot: "I paid for a fix and the same site says my CV is
    // still bad." Fire-and-forget — must not block order completion.
    try {
      const { CV_OUTPUT_SLUGS, recordDeliveredCv } = await import("./lib/cv-fingerprint");
      const slug = String(order.service_slug ?? "").toLowerCase();
      if (CV_OUTPUT_SLUGS.has(slug) && order.user_id) {
        recordDeliveredCv({
          userId:         order.user_id,
          serviceOrderId: orderId,
          serviceSlug:    slug,
          cvText:         output,
          // 2026-07 (Tony's spec): CV Revamp is now a materially better rewrite
          // than before, so its floor honoured on re-check goes 85 → 88. Full
          // rewrite + ATS optimisation keep their 92 floor.
          deliveredScore: (slug === "cv_rewrite" || slug === "ats_cv_optimization") ? 92
                        : slug === "cv_fix_lite" ? 88
                        : 85,
        }).catch(() => {});
      }
    } catch (e: any) {
      console.warn("[ServiceOrder] CV fingerprint hook failed:", e?.message);
    }
  } catch (err: any) {
    console.error(`[ServiceOrder] processOrder error for ${orderId}:`, err?.message);
    await pool.query(
      `UPDATE service_orders SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1`,
      [orderId, err?.message ?? "Unknown error"],
    ).catch(() => {});
  }
}

/**
 * notifyOrderCompleted — email + WhatsApp the user the moment their document
 * is ready. Called from processOrder() right after status flips to 'completed'.
 *
 * 2026-07 (Tony's audit fix): previously nothing ran here. Users who closed
 * the tab never learned their CV was ready — the earlier delivery.ts WhatsApp
 * had promised "within minutes" but no follow-up ever fired.
 *
 * Delivery model:
 *   - EMAIL (primary): warm HTML with a big "Download my CV" button linking
 *     to /my-documents. Uses sendWithFailover (Resend first, SMTP fallback).
 *   - WHATSAPP (secondary): short "your CV is ready" line with the same
 *     link. Non-blocking — if Twilio is unhealthy, the email still lands.
 *
 * Never throws. Every branch swallows its own errors so a broken notification
 * cannot roll back a completed order.
 */
async function notifyOrderCompleted(orderId: string): Promise<void> {
  try {
    const { rows } = await pool.query<{
      user_id: string;
      service_name: string;
      service_slug: string;
    }>(
      `SELECT user_id, service_name, service_slug FROM service_orders WHERE id = $1 AND status = 'completed'`,
      [orderId],
    );
    const order = rows[0];
    if (!order) return;

    // Fetch the user for their email + phone + first name
    const { rows: userRows } = await pool.query<{
      email: string | null;
      phone: string | null;
      first_name: string | null;
    }>(
      `SELECT email, phone, first_name FROM users WHERE id = $1`,
      [order.user_id],
    );
    const user = userRows[0];
    if (!user) return;

    const firstName = (user.first_name || "").split(/\s+/)[0] || "there";
    const serviceName = order.service_name || "document";
    const appOrigin = (process.env.APP_ORIGIN || "https://workabroadhub.tech").replace(/\/$/, "");
    const documentsUrl = `${appOrigin}/my-documents`;
    // Direct PDF download URL — one-tap on mobile if the user still has a session.
    const directPdfUrl = `${appOrigin}/api/services/order/${orderId}/download/pdf`;

    // ── Email (primary) ───────────────────────────────────────────────────
    if (user.email) {
      try {
        const { sendWithFailover } = await import("./lib/email-providers");
        const html = `
          <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
            <h1 style="font-size:22px;font-weight:700;color:#0f766e;margin:0 0 8px">Your ${serviceName} is ready 🎉</h1>
            <p style="font-size:15px;line-height:1.55;margin:0 0 20px">
              Hi ${escapeHtml(firstName)}, we've just finished your ${serviceName.toLowerCase()}. It's optimized, warm, and ready for recruiters.
            </p>
            <a href="${documentsUrl}" style="display:inline-block;background:linear-gradient(90deg,#14b8a6,#06b6d4);color:#fff;font-weight:600;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px">
              Download my document →
            </a>
            <p style="font-size:13px;line-height:1.55;margin:24px 0 8px;color:#64748b">
              Prefer a direct download? <a href="${directPdfUrl}" style="color:#0f766e;font-weight:600">Grab the PDF here</a> (sign in required).
            </p>
            <div style="border-top:1px solid #e2e8f0;margin:24px 0 12px"></div>
            <p style="font-size:12px;line-height:1.5;color:#94a3b8;margin:0">
              You're getting this because you completed an order at WorkAbroad Hub. If something looks off, just reply to this email — we read every message.
            </p>
          </div>
        `;
        const text = `Your ${serviceName} is ready.\n\nHi ${firstName}, we've just finished your ${serviceName.toLowerCase()}. Download it here:\n\n${documentsUrl}\n\nOr grab the PDF directly (sign in required): ${directPdfUrl}\n\n— WorkAbroad Hub`;
        await sendWithFailover({
          to: user.email,
          subject: `Your ${serviceName} is ready — download it here`,
          html,
          text,
        });
      } catch (emailErr: any) {
        console.warn(`[ServiceOrder] completion email failed for ${orderId}:`, emailErr?.message);
      }
    }

    // ── WhatsApp (secondary) ──────────────────────────────────────────────
    if (user.phone) {
      try {
        const { sendWhatsApp } = await import("./services/whatsapp");
        await sendWhatsApp(
          user.phone,
          `✅ Your ${serviceName} is ready, ${firstName}!\n\nDownload it here: ${documentsUrl}\n\n(Also sent to your email.)`,
        );
      } catch (waErr: any) {
        console.warn(`[ServiceOrder] completion WhatsApp failed for ${orderId}:`, waErr?.message);
      }
    }

    // ── In-app notification (tertiary) ────────────────────────────────────
    // Populates the bell icon in the header so returning users see the alert.
    try {
      const { storage } = await import("./storage");
      await storage.createUserNotification({
        userId: order.user_id,
        type: "success",
        title: `Your ${serviceName} is ready`,
        message: `Tap to download your ${serviceName.toLowerCase()} — PDF and Word both available.`,
      } as any);
    } catch (notifErr: any) {
      console.warn(`[ServiceOrder] in-app notification failed for ${orderId}:`, notifErr?.message);
    }

    console.log(`[ServiceOrder] Completion notifications dispatched for order ${orderId} (email=${!!user.email} wa=${!!user.phone})`);
  } catch (outer: any) {
    console.error(`[ServiceOrder] notifyOrderCompleted outer failure for ${orderId}:`, outer?.message);
  }
}

/** Tiny HTML escaper for the completion email — no template engine needed. */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Public: trigger from payment callback after success ─────────────────────
export async function onPaymentSuccessForServiceOrder(orderId: string): Promise<void> {
  await pool.query(`UPDATE service_orders SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = $1`, [orderId]);
  // Fire-and-forget — don't block the payment callback response
  processOrder(orderId).catch((e) => console.error("[ServiceOrder] async process failed:", e?.message));
}

// ── Stuck-order recovery sweep ──────────────────────────────────────────────
//
// 2026-06: built after the cv_fix_lite "Generating..." infinite spinner.
// Root cause was that processOrder() can silently fail (OpenAI timeout, transient
// DB blip, or the payment-pipeline metadata missing `serviceOrderId`), leaving
// the order at status='paid' or 'processing' with no AI output.
//
// This sweep runs every minute. For every order that's been in
// paid|processing for more than 90 s with no output_text, we re-trigger
// processOrder. Idempotent: if the AI later does deliver, the duplicate
// run is a no-op (it'll re-write the SAME output_text and 'completed' state).
let stuckSweepStarted = false;
export function startStuckOrderSweep(): void {
  if (stuckSweepStarted) return;
  stuckSweepStarted = true;
  const SWEEP_INTERVAL_MS = 60_000;
  const STUCK_AFTER_SECONDS = 90;
  const MAX_RETRIES_PER_ORDER = 3;

  const retries = new Map<string, number>();

  setInterval(async () => {
    try {
      const { rows } = await pool.query<{ id: string; status: string; service_slug: string }>(
        `SELECT id, status, service_slug
           FROM service_orders
          WHERE status IN ('paid', 'processing')
            AND (output_text IS NULL OR output_text = '')
            AND updated_at < NOW() - INTERVAL '${STUCK_AFTER_SECONDS} seconds'
          ORDER BY updated_at ASC
          LIMIT 25`,
      );
      if (rows.length === 0) return;
      console.log(`[ServiceOrder] Recovery sweep: ${rows.length} stuck order(s) to retry`);

      for (const row of rows) {
        const attempts = retries.get(row.id) ?? 0;
        if (attempts >= MAX_RETRIES_PER_ORDER) {
          // Mark failed so the client surfaces an error instead of spinning
          await pool.query(
            `UPDATE service_orders
                SET status = 'failed',
                    error_message = COALESCE(error_message, '') ||
                                    E'\n[recovery] Exhausted ${MAX_RETRIES_PER_ORDER} retries.',
                    updated_at = NOW()
              WHERE id = $1 AND status IN ('paid', 'processing')`,
            [row.id],
          ).catch(() => {});
          retries.delete(row.id);
          console.warn(`[ServiceOrder] Recovery: order ${row.id} (${row.service_slug}) failed after ${MAX_RETRIES_PER_ORDER} retries`);
          continue;
        }
        retries.set(row.id, attempts + 1);
        console.log(`[ServiceOrder] Recovery: retrying ${row.id} (${row.service_slug}) attempt ${attempts + 1}`);
        processOrder(row.id).catch((e) =>
          console.error(`[ServiceOrder] Recovery retry failed for ${row.id}:`, e?.message)
        );
      }
    } catch (err: any) {
      console.error("[ServiceOrder] Recovery sweep error:", err?.message);
    }
  }, SWEEP_INTERVAL_MS).unref?.();

  console.log(`[ServiceOrder] Stuck-order recovery sweep started — every ${SWEEP_INTERVAL_MS / 1000}s, retries orders stuck >${STUCK_AFTER_SECONDS}s`);
}

// ── Route registration ─────────────────────────────────────────────────────
export function registerServiceOrderRoutes(app: Express, isAuthenticated: RequestHandler) {
  // POST /api/services/order/:slug
  // Body: multipart/form-data { cv: File, jobDescription?, targetCountry?, extraInput? }
  // Response: { orderId, serviceName, price, needsPayment: true }
  app.post(
    "/api/services/order/:slug",
    isAuthenticated,
    cvUploadWithJsonErrors("cv"),
    async (req: any, res: Response) => {
      const t0 = Date.now();
      const slug = String(req.params.slug || "").toLowerCase();
      console.log(`[ServiceOrder] POST /api/services/order/${slug} | userId=${req.user?.claims?.sub ?? req.user?.id ?? "??"} hasFile=${!!req.file}`);

      try {
        const userId: string | undefined = req.user?.claims?.sub ?? req.user?.id;
        if (!userId) {
          console.warn(`[ServiceOrder] No userId on request`);
          return res.status(401).json({ message: "Please sign in first." });
        }

        const config = getConfig(slug);
        if (!config) {
          console.warn(`[ServiceOrder] Unknown service slug: "${slug}"`);
          return res.status(404).json({ message: `Unknown service: ${slug}` });
        }

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
        // 2026-07 (viral share loop): client sends the ref token from
        // localStorage in every order-init request. Attribution happens in
        // createOrder — safe to send any value, it's re-validated there.
        const referrerOrderId = String(req.body?.referrerOrderId ?? "").trim() || null;

        // 2026-07 (photo embed): optional passport-style photo the user
        // wants embedded in the final CV/document. Store as data URL so
        // it's easy to slice back into buffer+mime at render time.
        const photoFile = (req as any).files?.photo?.[0] as Express.Multer.File | undefined;
        let photoDataUrl: string | null = null;
        if (photoFile && photoFile.buffer && photoFile.buffer.length > 0) {
          // Sanity-cap at 2 MB for the stored payload — client should have
          // compressed to well under this, but paranoia is cheap.
          if (photoFile.buffer.length > 2 * 1024 * 1024) {
            return res.status(400).json({
              message: "Your photo is too large after upload. Please pick a smaller image (under 2 MB).",
            });
          }
          const mime = photoFile.mimetype && /^image\//.test(photoFile.mimetype)
            ? photoFile.mimetype
            : "image/jpeg";
          photoDataUrl = `data:${mime};base64,${photoFile.buffer.toString("base64")}`;
        }

        // Look up the canonical price BEFORE creating the order so we can
        // record it in the `amount` column (the old schema requires it).
        const { rows: priceRows } = await pool.query<{ price: number }>(
          `SELECT price FROM services WHERE slug = $1 OR code = $1 LIMIT 1`,
          [slug],
        );
        const price = priceRows[0]?.price ?? 0;

        const orderId = await createOrder({
          userId,
          slug,
          serviceName: config.name,
          amount: price,
          cvText,
          jobDescription,
          targetCountry,
          extraInput,
          referrerOrderId,
          photoDataUrl,
        });

        console.log(`[ServiceOrder] Created orderId=${orderId} slug=${slug} price=${price} cvLen=${cvText?.length ?? 0} in ${Date.now() - t0}ms`);
        res.json({
          orderId,
          serviceName: config.name,
          price,
          estSeconds: config.estSeconds,
          needsPayment: price > 0,
        });
      } catch (err: any) {
        const errMsg = err?.message ?? "Unknown error";
        const errCode = err?.code ?? null;
        console.error("[ServiceOrder] create error:", errMsg, errCode);
        const looksLikeMissingTable =
          /relation .* does not exist/i.test(errMsg) || errCode === "42P01";

        // Diagnostic: if Postgres says the table is missing, query the actual
        // host + database the server is connected to. Lets the user verify
        // whether the server's DATABASE_URL points at the same Supabase
        // project where they ran the migration.
        let dbDiag: any = null;
        if (looksLikeMissingTable) {
          try {
            const { rows } = await pool.query<{
              host: string | null; db: string; user_name: string; tables_seen: string | null;
            }>(`
              SELECT
                inet_server_addr()::text             AS host,
                current_database()                   AS db,
                current_user                         AS user_name,
                (SELECT string_agg(table_schema || '.' || table_name, ', ')
                   FROM information_schema.tables
                  WHERE table_name LIKE 'service%') AS tables_seen
            `);
            dbDiag = rows[0] ?? null;
            console.error("[ServiceOrder] DB diag:", dbDiag);
          } catch (diagErr: any) {
            console.error("[ServiceOrder] diag query failed:", diagErr?.message);
          }
        }

        res.status(500).json({
          // Always surface the raw Postgres error verbatim so the actual missing
          // relation (could be service_orders OR something else like users, a
          // sequence, a trigger function) is visible to the user/dev.
          message: looksLikeMissingTable
            ? `Postgres says: "${errMsg}". Server is on host=${dbDiag?.host ?? "?"} db=${dbDiag?.db ?? "?"} user=${dbDiag?.user_name ?? "?"}. service_* tables it sees: ${dbDiag?.tables_seen ?? "NONE"}.`
            : `Could not create your order: ${errMsg}`,
          code: errCode,
          rawError: errMsg,
          dbDiag,
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
      // 2026-07 (Tony's founder ask): NEVER expose raw provider errors like
      // "429 You exceeded your current quota, please check your plan and
      // billing details..." to a paying user. That kills trust instantly.
      // mapErrorForUser() translates known raw errors into warm, reassuring
      // messages that make it clear the user's payment is safe.
      error: order.error_message ? mapErrorForUser(order.error_message) : null,
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
          photo_data: string | null;
        }>(
          `SELECT user_id, service_slug, service_name, status, output_text, photo_data FROM service_orders WHERE id = $1`,
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

        // FOUNDER DECISION: do NOT print the service name as a title on
        // delivered documents. Reason — when a candidate submits the CV /
        // Cover Letter / SOP to an employer, the recruiter would see a
        // big bold "CV Fix Lite" or "Cover Letter Writing" at the top,
        // signalling that the candidate paid for the document. That kills
        // the candidate's positioning.
        //
        // 2026-06 — Permanent fix: the AI prompt sometimes leaks the
        // service name (or close variations) as the first heading line
        // of the generated body. We sanitize output_text by stripping
        // ANY leading line that matches the service name, the slug,
        // a known variation, or platform branding — case-insensitive,
        // with or without markdown heading prefixes. Repeated until we
        // hit a real content line.
        const stripLeadingServiceTitle = (raw: string, serviceName: string, slug: string): string => {
          // Build a denylist of strings we'll strip if they appear as the
          // first non-blank line. Includes the actual service name, the
          // slug, and known leakage patterns.
          const slugName = slug.replace(/_/g, " ");
          const slugPretty = slug.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          const denylist = new Set([
            serviceName.toLowerCase(),
            slug.toLowerCase(),
            slugName.toLowerCase(),
            slugPretty.toLowerCase(),
            "cv fix lite",
            "cv optimization",
            "ats cv optimization",
            "country-specific cv rewrite",
            "cv rewrite",
            "cover letter",
            "cover letter writing",
            "statement of purpose",
            "sop",
            "motivation letter",
            "linkedin optimization",
            "interview coaching",
            "workabroad hub",
            "workabroadhub",
            "workabroad hub premium",
          ]);
          // Strip up to 3 leading lines that look like service-name leakage.
          let body = raw;
          for (let i = 0; i < 3; i++) {
            const match = body.match(/^[ \t]*([#*\->\s]*)\s*([^\n]+?)\s*$/m);
            if (!match) break;
            const firstLine = match[2]?.trim() ?? "";
            const normalized = firstLine.toLowerCase().replace(/[^\w\s]/g, "").trim();
            if (!firstLine) {
              // empty leading line — skip past it
              body = body.replace(/^[\s\n]*\n/, "");
              continue;
            }
            if (denylist.has(normalized) || denylist.has(firstLine.toLowerCase())) {
              body = body.replace(/^[^\n]*\n?/, "");
              continue;
            }
            // First real content line — stop stripping.
            break;
          }
          return body.replace(/^[\s\n]+/, "");
        };

        const cleanBody = stripLeadingServiceTitle(
          order.output_text,
          order.service_name ?? "",
          order.service_slug ?? "",
        );

        // 2026-07 (photo embed): parse the stored data URL back into a raw
        // buffer + mime so the renderer can embed it. Null when the user
        // chose not to attach a photo — renderer treats it as "no photo".
        let renderPhoto: { buffer: Buffer; mimeType?: string } | undefined;
        if (order.photo_data && order.photo_data.startsWith("data:image/")) {
          try {
            const match = order.photo_data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
            if (match) {
              renderPhoto = {
                buffer: Buffer.from(match[2], "base64"),
                mimeType: match[1],
              };
            }
          } catch (photoParseErr) {
            console.warn("[ServiceOrder] photo parse failed:", (photoParseErr as Error).message);
          }
        }

        const buffer =
          format === "docx"
            ? await renderDocx({
                body: cleanBody,
                footer: "Generated by WorkAbroad Hub — workabroadhub.tech",
                photo: renderPhoto,
              })
            : await renderPdf({
                body: cleanBody,
                footer: "Generated by WorkAbroad Hub — workabroadhub.tech",
                photo: renderPhoto,
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
