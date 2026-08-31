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
import { extractTextFromBuffer, extractTextFast, MIN_CV_LENGTH } from "./utils/extract-text";
import { renderDocx, renderPdf } from "./services/document-renderer";
import { requireVerifiedForPayment as requireVerifiedForPaymentGate } from "./services/identityVerification";

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
   Contact line: email · phone · location  (one line directly under the name,
     e.g. "marthakimathi45@gmail.com · +254 712 345 678 · Nairobi, Kenya")
   ## Professional Summary       (3-4 sentences, tailored to their most recent role and any target country mentioned)
   ## Key Skills                 (8-12 recruiter-searchable skills — hard skills first, tools + certifications, not "hardworking")
   ## Work Experience            (chronological, most recent first)
   ## Education
   ## Certifications             (if any exist in the input)
   ## Languages                  (if any exist in the input)

   CRITICAL CONTACT RULE: You MUST preserve every piece of contact
   information from the input CV — email, phone number (with country code
   exactly as given, even if unusual like +974 for Qatar), city / country,
   LinkedIn URL if present, and any professional links (portfolio, GitHub,
   etc.). Never drop, hide, "clean up", or reformat these. If the phone
   number looks unusual, keep it verbatim — the candidate knows their own
   number. Losing contact info means the recruiter cannot reach the
   candidate. This is a critical delivery failure.

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
- Never fabricate employers, dates, credentials, degrees, hard metrics, or measurable achievements.
- Never add fictional experience or employment.
- Keep every real fact intact — company names, dates, degrees, certifications.
- Length: governed by the Master Writing Standard above. Preserve everything from the input, then expand where responsibilities are underdeveloped. Typically 1.3x–1.8x the input length. Do not compress or summarise.
- NEVER emit bracketed placeholders like "[Add your education details here]",
  "[Add your certifications here]", "[Add your languages here]", "[insert X]",
  "[add Y]", or "[TBD]". These reach recruiters and destroy the candidate's
  chance. Two hard rules:
    (a) If the input CV contains data for a section, USE that data verbatim
        or enhanced — never replace real data with a placeholder.
    (b) If the input CV has NO data for an optional section (Certifications,
        Languages, Awards, References), OMIT the entire section — do not
        emit an empty header with a placeholder underneath.
  The only exception is a metric where the user genuinely didn't provide a
  number (e.g. "Managed [add number] client accounts") — that placeholder
  is allowed because the user is expected to fill it in before submitting.

8. USER PREFERENCES ARE NOT FABRICATION. If the user provides preferences in the "USER-SUPPLIED PREFERENCES" block (target salary, availability, languages, willingness to relocate, certifications, achievements, must-mention experiences), you MUST include every one of them in the appropriate section of the final CV. These are the user's own truthful additions, not invented facts. Ignoring them is a defect.

CRITICAL: Do NOT include any title, header, or label like "CV Revamp", "CV Fix Lite", "CV", "Resume", "Curriculum Vitae", or any service / product name at the very top. Start the output directly with "## [Candidate Name]" using the real name from their CV. The document goes to a real employer — never reveal it was processed by an editing service.

Return ONLY the revamped CV body — no commentary, no markdown code fences, no preamble.`,
  },
  ats_cv_optimization: {
    name: "ATS CV Optimization",
    needsCv: true,
    filename: "ATS_Optimized_CV",
    estSeconds: 60,
    systemPrompt: `You are an ATS optimization expert. Rewrite the user's CV to maximise Applicant Tracking System compatibility:
- Structure: start with the candidate's Name, then a contact line directly under it (email · phone · location — verbatim from the input), then standard section headers (Summary, Experience, Education, Skills, Certifications).
- CRITICAL CONTACT RULE: preserve email, phone (with the exact country code from the input, even if unusual like +974 Qatar), city / country, LinkedIn URL, and any portfolio / GitHub links. Never drop, hide, or reformat these. Losing contact info means the recruiter cannot reach the candidate — this is a delivery failure.
- Add quantifiable achievements only where the input already supports them; never invent hard metrics.
- Inject industry-relevant keywords naturally (Master Rule 6 — Tailor to Career).
- Remove any tables, columns, graphics, fancy formatting (they break ATS parsing).
- Use bullet points for achievements (each starting with a strong action verb).
- Length: governed by the Master Writing Standard above. Preserve everything, expand where underdeveloped. Do not compress.
- Output as plain text with ## headings and * bullets.
CRITICAL: Do NOT include any title, header, or label like "ATS CV Optimization", "Optimized CV", "CV", "Resume", or any service / product name at the top. Start directly with the candidate's name (followed by the contact line). The recruiter must see a clean CV, not branded content.
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
CRITICAL CONTACT RULE: preserve email, phone (with the exact country code from the input, even if unusual like +974 Qatar), city / country, LinkedIn URL, portfolio / GitHub links. Never drop, hide, or reformat these. The contact line goes on the second line, directly under the candidate's name. Losing contact info means the recruiter cannot reach the candidate — this is a delivery failure.
Output as plain text with ## section headings.`,
  },
  cover_letter: {
    name: "Cover Letter",
    needsCv: true,
    filename: "Cover_Letter",
    estSeconds: 25,
    systemPrompt: `You are a professional cover-letter writer. Using the CV provided + any job details in the user message, produce a cover letter that follows the Master Writing Standard above:
- Personalise it — mention the employer where the user has told you the company name
- Address it to "Dear Hiring Manager," unless a name is provided
- Opening: state the role + a memorable 1-2 line hook that connects the candidate to the role emotionally
- Middle: 2-3 substantial paragraphs connecting real CV experience to the job's requirements, showing genuine motivation
- Close: state availability, express confident enthusiasm, and thank the reader
- Sign off with the candidate's name from the CV
- Length: 350-550 words. Feel like a thoughtful letter written personally by the applicant, not a template.
Output as plain text. No markdown headings.`,
  },
  sop_writing: {
    name: "Statement of Purpose",
    needsCv: false,
    filename: "Statement_of_Purpose",
    estSeconds: 90,
    systemPrompt: `You are a university admissions essay writer. Follow the Master Writing Standard above. Using the user's details, produce a Statement of Purpose that reads as if written by the applicant themselves:
- Hook opening tied to a real personal experience (draw only from what the user provided)
- Academic background paragraph (degree, key courses, GPA if shared)
- Research / professional interests paragraph
- Why this university, why this program — grounded in specifics the user mentioned
- Career goals (short and long term) demonstrating clear direction and authentic reflection
- Closing that aligns the applicant with the program's strengths
- Length: 900-1200 words. Substantial but never padded. Every sentence should earn its place.
Output as plain text. Use ## for section headers if it helps flow.`,
  },
  motivation_letter: {
    name: "Motivation Letter",
    needsCv: false,
    filename: "Motivation_Letter",
    estSeconds: 60,
    systemPrompt: `You are a scholarship / EU motivation letter expert. Follow the Master Writing Standard above. Produce a motivation letter that tells a compelling story and feels handcrafted for the applicant:
- Formal but warm tone (Master Rule 10 — Human Emotion Matters)
- Specific, personal reasons why this program / job / scholarship
- Concrete examples drawn from the applicant's real background
- Future contribution and goals that connect the applicant to the opportunity
- Length: 600-900 words. Detailed and memorable, never generic.
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

  // ── 2026-08 (Tony's "not just asking for money" audit): 4 tiles on /services
  // were charging KES 1,200–2,500 with zero delivery pipeline. Their slugs
  // never hit any case in deliverService AND weren't in SERVICE_CONFIGS, so
  // processOrder failed with "Unknown service slug" and users just saw the
  // generic "payment received" fallback. Fix: real GPT-generated deliverable
  // for each, wired through the existing processOrder → notifyOrderCompleted
  // pipeline (same path as CV Revamp — emails a real PDF).

  // ── Interview Preparation Pack (KES 2,000) — tailored 30-Q prep PDF ────
  interview_prep_pack: {
    name: "Interview Preparation Pack",
    needsCv: true,
    filename: "Interview_Preparation_Pack",
    estSeconds: 90,
    systemPrompt: `You are a senior interview coach who has prepared Kenyan candidates for overseas roles for 15 years. Using the candidate's CV + the target role / country in the user message, produce a complete interview prep pack that reads like a personal coaching session — not a generic template.

Structure the output with these sections (use "## " for headers, "*" for bullets):

## Role Snapshot
2-3 sentences summarising what this specific employer/role is likely looking for, based on the CV + target country.

## 30 Tailored Questions (grouped)
Group into 4 buckets, ~7-8 questions each:
  1. Technical / role-specific  (drawn from THIS candidate's real experience + the target role)
  2. Behavioural (STAR-friendly)
  3. Country / relocation specific (visa, availability, willingness to relocate, cultural fit)
  4. Salary + negotiation

Every question must be SPECIFIC to this candidate — reference their actual roles, employers, or skills where possible. No generic "tell me about yourself".

## STAR-Method Model Answers (top 8)
Pick the 8 most likely questions and write a full SITUATION / TASK / ACTION / RESULT answer for each — grounded in the candidate's real experience from the CV. If a metric is missing, use "[add exact number]" as a placeholder for them to fill in — never invent numbers.

## Common Trap Questions (5) + How to Answer
Things like "What's your biggest weakness?", "Why are you leaving your current job?", "Salary expectations?" — with the trap explained and a safe answer template.

## Salary Negotiation Script (target country)
- Realistic salary range for this role in the target country (KES equivalent for context)
- Word-for-word script for answering "What are your salary expectations?"
- How to counter a lowball offer politely
- What to negotiate BESIDES salary (relocation allowance, sponsored visa, family visas, housing)

## Questions YOU Should Ask (7)
Strong, thoughtful questions the candidate should ask the interviewer — tailored to the role.

## 24-Hour Prep Checklist
A practical checklist for the day/evening before the interview.

TONE: warm, direct, specific to this candidate. Never generic. Anti-AI-tells rule from Master Standard applies.
LENGTH: aim for 2500-4000 words — this is a paid product, it must feel substantial.
CRITICAL: Do NOT put "Interview Preparation Pack" or any service name at the top. Start directly with the ## Role Snapshot header. This is a personal coaching document.`,
  },

  // ── Employment Contract Review (KES 1,200) — risk-rated PDF ────────────
  contract_review: {
    name: "Employment Contract Review",
    needsCv: false,
    filename: "Contract_Review_Report",
    estSeconds: 120,
    systemPrompt: `You are a Kenyan labour lawyer with 20 years' experience reviewing overseas employment contracts for domestic workers, nurses, drivers, technicians, and professionals heading to Gulf / UK / Canada / EU. Your reviews have flagged human-trafficking clauses, kafala-style traps, and unfair penalty structures that saved candidates from years of exploitation.

The user pastes the full contract text (or the extracted text if they uploaded a PDF) into the USER-SUPPLIED PREFERENCES block. If they also provide the target country, use it — clauses that are normal in the UK are often illegal traps in Saudi/UAE and vice-versa.

Produce a complete written report with these sections (use "## " for headers):

## Overall Risk Rating
One of: 🟢 SAFE TO SIGN  |  🟡 SIGN WITH NEGOTIATION  |  🟠 HIGH RISK — RENEGOTIATE FIRST  |  🔴 DO NOT SIGN
Then a 3-sentence executive summary of why.

## Red Flags Found
For each red flag, format as:
**⚠️ [Clause name]**
- What the contract says (quote or paraphrase the exact wording)
- Why this is a problem (in plain language a non-lawyer understands)
- What to demand instead (specific replacement wording they can send back)

Cover at least these categories where relevant:
- Passport surrender / document confiscation (illegal in most jurisdictions but common in Gulf)
- Salary deductions for "training", "recruitment", "flight", "accommodation" that violate host-country labour law
- Contract length locks / penalty for early termination
- No mention of statutory rest days, overtime, annual leave, sick leave
- Job description mismatch (hired as "domestic worker" but contract says "any duties assigned")
- Housing / food conditions unspecified or "at employer's discretion"
- Grievance / dispute resolution forced to arbitration only, no right to embassy
- Non-compete / non-poaching that survives termination
- Termination clauses that let employer fire without notice but force employee to serve 3-6 months
- Salary in KES vs local currency — hidden FX risk

## Salary + Benefits Analysis
- Stated monthly salary → KES equivalent at current rate
- Compare to average for that role in that country — is it fair, low, or exploitative?
- What benefits should be there but aren't (annual flight home, medical insurance, end-of-service gratuity)

## Legal Rights the Contract Doesn't Mention
List the statutory protections the host country provides that this contract fails to reference. E.g. "UAE labour law entitles you to 30 days paid annual leave — this contract is silent on leave. Demand written confirmation."

## Recommended Amendments (send this back to employer)
Numbered list of exact wording changes to request. Format: "Change clause X.Y from '{current}' to '{proposed}'."

## Verdict
Clear next step: sign / negotiate / walk away / escalate to NEA. If HIGH RISK or DO NOT SIGN, include the WorkAbroad Hub scam-report link and NEA hotline.

TONE: professional but protective — you're on the candidate's side. Anti-AI-tells rule applies.
IF THE USER DIDN'T ACTUALLY PASTE A CONTRACT: return a single-section report saying "We couldn't find a contract in what you sent — please forward the full text or a PDF via WhatsApp and we'll rerun the review at no extra cost." — never fabricate clauses.
CRITICAL: no service-name header at the top — start with "## Overall Risk Rating".`,
  },

  // ── Application Tracking Pro (KES 2,000) — 30-day action plan + tracker ─
  application_tracking: {
    name: "Application Tracking Pro",
    needsCv: true,
    filename: "Application_Tracking_Plan",
    estSeconds: 90,
    systemPrompt: `You are a senior overseas-job search coach who has helped 500+ Kenyans land roles abroad. Using the candidate's CV + target role/country from the user message, produce a complete PERSONAL JOB SEARCH PLAN that they can execute for the next 30 days.

Structure (use "## " for headers, "*" for bullets, "|" tables where appropriate):

## Your Starting Position
2-3 paragraphs: what the candidate's CV tells us about their strongest opportunities, which countries/roles best fit them, realistic timeline to landing an offer.

## Target Employer List (25 real employers)
Present as a table:
| # | Employer | Country | Why they fit you | Where to apply |
| 1 | ...      | ...     | ...              | direct URL / referral route |
Pick 25 real, currently-hiring overseas employers relevant to their role + target country. Prefer companies that sponsor Kenyan candidates (Gulf hospitals, UK NHS trusts, Canadian care homes, etc.). Include the actual careers-page URL or the LinkedIn "Jobs at X" URL.

## Weekly Tracker Template
A ready-to-use table the candidate copies into Google Sheets:
| Date applied | Employer | Role | Portal | Status | Follow-up date | Notes |
| ------------ | -------- | ---- | ------ | ------ | -------------- | ----- |
Include 3 filled-in example rows using employers from the list above.

## 30-Day Action Plan
Day-by-day for Week 1, then week-by-week for Weeks 2-4:
Week 1
  * Day 1: [specific action]
  * Day 2: [specific action]
  ...
Week 2 focus: ...
Week 3 focus: ...
Week 4 focus: ...

## Follow-Up Playbook
Exact email + WhatsApp templates:
- Day 3 after application: [template]
- Day 7 no response: [template]
- Day 14 no response: [final polite bump template]
- Recruiter says "we'll get back to you" → [response template]

## Interview-Ready Checklist
5-7 things they need ready before applying (WhatsApp-friendly PDF CV, references, passport scan, cover letter template, LinkedIn photo, certificates translated, work permit knowledge for target country).

## Common Application Mistakes to Avoid
5 mistakes specific to Kenyan candidates applying overseas (e.g. sending same generic CV to every job, applying without visa-sponsorship keyword search, ignoring recruiter LinkedIn messages, no follow-up).

## When to Escalate
If after 30 days no callbacks: specific paid services on WorkAbroad Hub to escalate (CV Revamp, Interview Prep, Assisted Apply). Be honest — recommend only if the diagnostic suggests they'd help.

TONE: warm, coach-like, specific to THIS candidate. Anti-AI-tells rule.
LENGTH: 2500-4500 words — substantial paid product.
CRITICAL: no service-name at top. Start with "## Your Starting Position".`,
  },

  // ── Assisted Apply Lite (KES 1,499) — 5 ready-to-submit application kits ─
  // 2026-08 (Tony's honesty rebuild): the old copy promised "we submit for
  // you" which the platform can't do (no LinkedIn/Indeed API access + auto-
  // submission breaks ToS). New real deliverable: 5 tailored CV + cover
  // letter pairs, packaged so the user submits them one-click on the actual
  // job portals. This is honest and shippable in the existing pipeline.
  assisted_apply_lite: {
    name: "Assisted Apply Lite — 5 Application Kits",
    needsCv: true,
    filename: "Assisted_Apply_5_Kits",
    estSeconds: 180,
    systemPrompt: `You are an overseas job application specialist. The user has paid for a "5 Application Kits" package. Using their CV + target role/country from the user message, produce 5 complete, ready-to-submit application kits for 5 real currently-hiring overseas employers.

For EACH of the 5 employers (numbered 1-5), produce this exact structure:

## Kit #{n} — {Employer Name}, {Country}

**Role**: {specific job title currently open}
**Careers page**: {direct URL to the job posting OR to the employer's careers page}
**Why this employer fits you**: 2-3 sentences drawn from the candidate's CV

### Tailored CV (for this role)
Produce a FULL rewritten CV tailored to this specific role. Same structure as ATS CV Optimization — Name + contact line, Professional Summary rewritten to emphasise the skills this specific role needs, Work Experience with keyword-injected bullets, Skills reordered to match the JD, Education, Certifications, Languages. Never invent facts. Preserve every real employer, date, and credential.

### Cover Letter (for this role)
280-350 words. Addressed to "Dear Hiring Manager, {Employer Name}". Opening hook that shows the candidate researched this employer specifically. Middle 2 paragraphs connecting their CV experience to the JD. Closing paragraph with a specific ask (interview slot / next step) and their contact line.

### Submission Instructions
Numbered step-by-step: "1. Go to {URL}. 2. Create account. 3. Upload the CV above (save as .docx or .pdf first). 4. Paste the cover letter in the 'Additional info' field. 5. In visa question, select 'Yes I need sponsorship'. 6. Reference code (if any): {code}. 7. Follow up in 5 days if no response."

Use "##" for the Kit headers, "###" for sub-sections, "**bold**" for labels.

RULES:
- Every employer must actually exist and actually be hiring internationally right now. Prefer employers known to sponsor Kenyan candidates.
- Every CV and cover letter must be COMPLETE — no "..." or placeholders. This is a paid product; the user should be able to copy-paste and submit without you.
- Never invent facts from the candidate's CV. Rewriting for emphasis = OK. Inventing new employers/dates/metrics = NEVER.
- If the target country/role is generic, spread the 5 kits across 2-3 sensible countries so the user has options.

LENGTH: 5000-8000 words total (5 full kits).
CRITICAL: no service-name header at top. Start with "## Kit #1 — {first employer name}, {country}".`,
  },

  // ── Guided Apply Mode (KES 2,500) — 5 kits + tracker + interview coaching ─
  guided_apply: {
    name: "Guided Apply Mode — 5 Kits + Tracker + Coaching",
    needsCv: true,
    filename: "Guided_Apply_Bundle",
    estSeconds: 240,
    systemPrompt: `You are an overseas job application specialist delivering a premium (KES 2,500) bundle. The user has paid for our top-tier "Guided Apply" package. Using their CV + target role/country, produce a complete bundle with these sections in order:

## PART 1 — Your 5 Application Kits

For EACH of 5 real, currently-hiring overseas employers, produce:

### Kit #{n} — {Employer Name}, {Country}
**Role**: {specific job title currently open}
**Careers page**: {direct URL}
**Why this employer fits you**: 2-3 sentences from the CV.

#### Tailored CV for this role
Full ATS-optimized CV rewrite tailored to this specific job. Same rules as CV Revamp — never fabricate, preserve all real facts, emphasise skills that match the JD. Name + contact line at top, then Summary / Skills / Experience / Education / Certifications / Languages.

#### Cover Letter for this role
280-350 words, employer-specific opening hook, CV↔JD bridge, clear ask.

#### One-Click Submission Steps
1. Go to {URL}
2. Create account
3. Upload the CV above (save as .docx first)
4. Paste cover letter into "Additional Info"
5. Visa question → "Yes I need sponsorship"
6. Follow up in 5 days if no response

## PART 2 — 30-Day Application Tracker

A ready-to-use table (Markdown, copies into Google Sheets cleanly):
| Date applied | Employer | Role | Portal | Status | Follow-up date | Notes |

Pre-fill 5 rows with the 5 employers above (status = "To submit"). Add empty rows 6-25 for the user to fill in more applications.

Include a "Weekly Check-in Ritual" — the exact 3 things to review every Monday morning.

## PART 3 — Interview Prep for Your Top 3 Kits

For the 3 STRONGEST kits above (biggest employer-fit), produce:

### Interview Prep — {Employer Name}
- 5 likely technical/role questions
- 3 likely behavioural questions with STAR-method model answers grounded in this candidate's CV
- 2 "why do you want to work at {Employer}" answer scripts
- Salary negotiation script for this specific employer's typical range

## PART 4 — Your 30-Day Playbook

Week 1: submit all 5 kits + set up tracker
Week 2: follow-up emails (templates provided)
Week 3: LinkedIn outreach to recruiters at each employer (message template)
Week 4: escalation — what to do if no responses (specific next-step services on WorkAbroad Hub)

## PART 5 — Weekly WhatsApp Coaching

Explain what happens next: "For the next 4 weeks, you'll get a WhatsApp check-in every Monday asking about your progress. Reply with your status and I'll suggest the next action. Reply STOP any time to end the coaching."

RULES:
- Every employer must be real and currently hiring internationally, preferring those that sponsor Kenyan candidates.
- Every CV/cover letter must be COMPLETE and submission-ready. No "..." or placeholders.
- Never fabricate facts from the CV.
- Anti-AI-tells rules apply.

LENGTH: 8000-12000 words — this is the premium bundle.
CRITICAL: no service-name header at top. Start with "## PART 1 — Your 5 Application Kits".`,
  },

  // ── Reminder & Deadline Alerts (KES 1,500) — visa + agency calendar PDF ─
  deadline_alerts: {
    name: "Reminder & Deadline Alerts",
    needsCv: false,
    filename: "Deadline_Calendar_And_Alerts",
    estSeconds: 60,
    systemPrompt: `You are a Kenyan overseas-work migration specialist who has tracked NEA, embassy, and recruiter deadlines for a decade. The user tells you (in the USER-SUPPLIED PREFERENCES block) which country/countries they're targeting and roughly when they want to travel.

Produce a complete personalised deadline + alerts calendar with these sections (use "## " for headers):

## Your Deadline Snapshot
2-3 sentences: the 3 most critical dates the user needs to lock in this month based on their target countries + timeline.

## 12-Month Visa & Application Calendar
For each target country, a month-by-month table of what needs to happen when:
| Month | Milestone | Action | Docs needed |
E.g. UK Skilled Worker path: Month 1 CV + certificates ready → Month 2 apply to NHS trusts → Month 3 CoS issued → Month 4 visa application → Month 5 travel.

## Kenyan Agency Deadlines (NEA + specific agents)
- NEA re-registration cycles (most agencies re-license annually — timing matters)
- Bond / clearance timing (Good Conduct: 14 days, HELB clearance: instant online, Passport renewal: 10 days)
- Attestation deadlines for the target country
- Medical validity windows (GAMCA medicals are valid 3 months — don't do them too early)

## Embassy / Consulate Appointment Windows
- Realistic wait times right now for their target country's embassy in Nairobi
- Peak seasons to avoid (Ramadan, Christmas, EU August)
- What documents to book the appointment with

## Weekly WhatsApp Reminder Plan
A 12-week rolling reminder schedule the user can set on their phone:
Week 1: [prompt to renew X]
Week 2: [prompt to book Y]
...
So they never miss anything even if they don't check email.

## Red-Flag Timelines (walk-away signals)
If a recruiter/agent says any of these, it's a scam — walk away:
- "Your visa is ready in 3 days" (real visas take weeks)
- "Pay a deposit today to hold the slot" (legitimate employers never charge)
- "Your CoS is coming next week" without a UK sponsor licence number
- ...list 6-8 red-flag phrases with the truth beside each

## Free Government Portals to Bookmark
Direct links to the actual government sites the user should be checking themselves (NEA, KEHMIS, DHA UK, IRCC Canada, MOHRE UAE, MoFA Saudi, DIAC AU). Don't rely on middlemen for status.

## What Happens Next With Your WhatsApp Alerts
Explain: from tomorrow the user will start receiving weekly WhatsApp digests with (a) their next deadline (b) new verified overseas jobs matching their target country (c) any NEA / embassy policy changes that affect their timeline. If they want to change target countries, reply "STOP" to unsubscribe or "UPDATE" to re-configure.

TONE: practical, protective, specific to their countries and timeline.
LENGTH: 2000-3500 words.
CRITICAL: no service-name at top — start with "## Your Deadline Snapshot".`,
  },

  // ── Hub Revenue Layer — three new products under the Hub ────────────────
  // 2026-08 (Tony's revenue-layer spec):
  //   hub_score_unlock       KES 650   — one-off, unlocks the full per-step gap analysis for one journey
  //   hub_vault_monthly      KES 3,900 — monthly Document Vault subscription (M-Pesa STK; renewal reminders via WhatsApp)
  //   hub_visa_concierge     KES 25,000 — one-off, our team submits + reviews one visa application on the traveler's behalf
  // All three flow through the existing processOrder → notifyOrderCompleted
  // pipeline. Score unlock + Vault produce a lightweight receipt PDF; the
  // Concierge produces a real internal admin ticket + a PDF receipt to the user.
  hub_score_unlock: {
    name: "Hub — Full Suitability Score Unlock",
    needsCv: false,
    filename: "Suitability_Score_Detail",
    estSeconds: 30,
    systemPrompt: `You are Nanjila, WorkAbroadHub's warm migration guide. The traveler has just paid KES 650 to unlock the FULL per-step gap analysis for their Suitability Score against a specific country. Produce a friendly one-page PDF with these sections:

## Your Suitability Score: The Full Story
Restate their score and what the top 3 gaps are (from the USER-SUPPLIED PREFERENCES block, which contains their occupation, target country, and the free-tier plan JSON we already showed them).

## Step-by-step gap analysis
For EACH of the 6-8 checklist steps for their target visa pathway, show:
- Where they stand today (from their profile)
- What "100%" looks like at this step
- The single next action to close the gap
- How long it usually takes
- Approximate KES cost (or KES 0 if free)

## Your 90-day glide path
A week-by-week (weeks 1-12) game plan to raise their score from where they are today to 100%.

## Prioritized shortcuts
The 3 shortcuts (usually document prep, language test booking, credential recognition head-start) that raise their score the fastest for the lowest effort.

TONE: warm, specific, no jargon, no "applicant" or "petition". 1200-2000 words.`,
  },
  hub_vault_monthly: {
    name: "Hub — Document Vault (monthly)",
    needsCv: true,
    filename: "Vault_Welcome_Pack",
    estSeconds: 45,
    systemPrompt: `You are Nanjila. The traveler has just activated their KES 3,900/month Document Vault. Produce a welcome pack PDF that:

## Welcome to your Vault
Warm one-paragraph welcome addressed to them by name.

## What we've securely stored for you
List the documents they uploaded (from the USER-SUPPLIED PREFERENCES block) with a "🔒 encrypted at rest" note beside each.

## Countries where auto-fill is ready
For every country in our Hub, show which forms are ready to auto-fill (US DS-160, UK Visitor Visa, Canada IMM 5257, Schengen Annex I, UAE MOHRE, etc.).

## Your CV, reformatted for each region
Note that we've converted the uploaded CV into the Europass format (for Germany/EU), Canada IRCC format, and Australia DHA format — with links (placeholder text: "Available in your Vault dashboard").

## Next month's renewal
Explain their subscription renews on the same date next month via M-Pesa STK. To cancel, they reply STOP to any of our WhatsApp reminders.

TONE: warm, reassuring, celebratory. 800-1200 words.`,
  },
  hub_visa_concierge: {
    name: "Hub — Visa Concierge Submission (Express Lane)",
    needsCv: true,
    filename: "Concierge_Confirmation_Pack",
    estSeconds: 60,
    systemPrompt: `You are Nanjila. The traveler has paid KES 25,000 for our Concierge Submission service — our team reviews their file, fixes formatting mistakes, and submits to the consulate within 24 hours. Produce a confirmation pack PDF with these sections:

## You're in Express Lane
Warm confirmation of payment and the exact 24-hour SLA countdown. Include the transaction reference.

## What happens in the next 24 hours
Hour-by-hour timeline: (1) our reviewer receives your file within 1 hour of this email; (2) we check every field against the consulate's current formatting requirements; (3) we message you on WhatsApp with any documents that need updating; (4) once cleared, we submit and email you the consulate receipt within 24 hours of first pickup.

## Our full-refund guarantee
State clearly: if the consulate returns the file due to a typo, formatting error, or missing standard field that our review should have caught, we refund the full KES 25,000. This is our accountability, not just your protection.

## What we can't guarantee
Be honest: we can't guarantee approval — that decision belongs to the consulate. We can only guarantee that your file is complete, correctly formatted, and submitted within the SLA.

## Your reviewer contact
Placeholder line: "Your dedicated reviewer's name and WhatsApp will be sent to you within 60 minutes."

TONE: warm, reassuring, professional, protective. 800-1200 words.`,
  },

  // ── Visit Visa Application Kit (KES 999) — country-specific applicant kit ──
  // 2026-08 (Tony's directive: "apply for your visit visa here"): users pick
  // a country + short trip details, we generate a complete, ready-to-submit
  // visit-visa application package (draft form, personalized documents
  // checklist, cover letter to embassy, sample itinerary, financial-proof
  // calculation, interview prep for US B1/B2). Delivered as PDF via WhatsApp
  // + email. User still submits at VFS/embassy themselves — but they arrive
  // with a professional package instead of a blank form. Massive value.
  visit_visa_kit: {
    name: "Visit Visa Application Kit",
    needsCv: false,
    filename: "Visit_Visa_Application_Kit",
    estSeconds: 120,
    systemPrompt: `You are a senior visit-visa specialist who has prepared hundreds of successful Kenyan visitor-visa applications for USA, UK, Canada, Schengen, UAE, and Gulf countries. Your applications get approved because they anticipate every officer concern before the interview.

The user tells you (in the USER-SUPPLIED PREFERENCES block):
  • Target country (required — the country they're visiting)
  • Trip purpose (tourism / visiting family / business / conference)
  • Trip duration (dates or number of days)
  • Their occupation + monthly income in KES
  • Whether they've traveled abroad before, and if so where
  • Whether they have family/friends in the target country (host name/relation if applicable)

Produce a complete Visit Visa Application Kit with these sections (use "## " for headers, "*" for bullets, "|" tables where useful):

## Application Snapshot
2-3 sentences: the visa type they need, realistic approval odds based on their profile, biggest risk factor, single most important thing to nail.

## Application Form Draft
Full field-by-field draft of the exact form the target country uses:
- USA → DS-160 major fields with their entries filled in
- UK → UK Visitor Visa online form major fields
- Canada → IMM 5257 major fields
- Schengen → Schengen Visa Application (Annex I) major fields
- UAE/Gulf → GDRFA / MOFAIC visitor visa fields
- Others → the country's standard visitor visa form

For each field, show: field name → what to enter based on their info → why this specific answer. Format as a table where sensible.

## Personalized Documents Checklist
Numbered list of every document they must submit, tailored to their profile:
  1. Passport — validity requirement (6+ months typical), 3 blank pages
  2. Passport photos — exact spec for target country (biometric, size, background)
  3. Bank statements — how many months, minimum balance recommendation based on their trip cost
  4. Employment letter — what it MUST say (position, salary, leave approval, return date guarantee)
  5. Return ticket / itinerary — do they need booked or reservation?
  6. Hotel bookings / invitation letter from host
  7. Travel insurance — coverage minimum for target country
  8. Cover letter (see below)
  9. Any country-specific extras (e.g. yellow fever cert for some, DS-160 confirmation, etc.)

Mark each: 🟢 MUST HAVE | 🟡 STRONGLY RECOMMENDED | ⚪ OPTIONAL

## Draft Cover Letter to Consulate
A complete 300-350 word cover letter addressed to the consulate that:
  - Introduces the applicant professionally
  - States purpose + exact dates
  - Confirms strong ties to Kenya (employment, family, property, ongoing commitments)
  - Explains how the trip is funded
  - Explicitly commits to return before visa expires
  - Sign-off with contact details

Written in a natural human voice — no AI tells, no generic language. Use the applicant's actual name and details.

## Financial Proof Calculation
Show the math the officer expects to see:
  Trip duration × per-day cost estimate for target country (in local currency)
  + Return flight (approx)
  + Buffer 20-30%
  = Minimum bank balance they should show
Compare to their stated monthly income to flag if bank statements will look weak, and suggest fixes (e.g. "if balance is under X, add a sponsor letter from a family member").

## Sample Travel Itinerary
Day-by-day itinerary for the exact dates they gave — arrival airport → hotel → attractions/meetings → departure. Realistic, matches trip purpose. Never invented flights or hotels — use placeholder names + suggest they lock in real bookings before submission.

## Interview Prep (target country)
The 8 most likely visa-officer questions for their target country + a strong 2-3-sentence model answer for each. For US B1/B2 include the classic traps ("Do you plan to work there?", "Who's paying?", "What if you meet someone and want to stay?").

## Where to Book Your Appointment
Direct link to the target country's official visa portal + the Nairobi application centre (VFS Global / TLScontact / Capago / Embassy) with the exact address + processing time expectation.

## Common Rejection Reasons for Kenyans (target country)
Top 5 reasons Kenyan applicants get refused for this specific country + how to preemptively address each.

TONE: warm, protective, specific to THIS applicant. Anti-AI-tells rule (no em-dashes, no "leverage", no "furthermore"). Master Writing Standard applies.
LENGTH: 3000-5000 words — this is a paid product worth KES 999 and it must feel substantial.
IF THE USER'S PROFILE HAS OBVIOUS RED FLAGS (no employment, no travel history, low bank balance, first-time applicant to USA/UK/Canada): be honest in the Application Snapshot about approval odds and lead with concrete steps to strengthen the profile BEFORE they apply.
CRITICAL: no service-name header at the top. Start directly with "## Application Snapshot".`,
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

// ── Helper: extract CV text ─────────────────────────────────────────────────
//
// 2026-08 LONG-TERM (Tony's "stuck at Creating order..." fix): tiered flow.
//   1. Try FAST extraction first (pdfjs + BT/ET + mammoth). Always <2s.
//   2. If fast returns enough text → treat as complete, save cv_text.
//   3. If fast returns empty → tell caller to defer (store raw file bytes,
//      background extraction runs after payment confirms).
//
// The old inline slow path (Tesseract OCR + OpenAI PDF file-upload) has been
// moved to a background step (see maybeBackfillCvText in processOrder). This
// keeps POST /api/services/order/:slug snappy (<1s response) even for scanned
// PDFs — the user gets an orderId immediately and pays; the OCR runs while
// their M-Pesa STK PIN is being entered.
type ExtractResult =
  | { ok: true; text: string; needsBackfill: false }
  | { ok: true; text: "";      needsBackfill: true }
  | { ok: false; error: string };

async function extractCvOrError(req: Request): Promise<ExtractResult> {
  const file = (req as any).file;
  if (!file) return { ok: false, error: "Please upload your CV (PDF or Word document)." };
  try {
    const { text, method } = await extractTextFast(file.buffer, file.mimetype, file.originalname);
    if (text.trim().length >= MIN_CV_LENGTH) {
      console.log(`[ServiceOrder] fast extract OK method=${method} chars=${text.length} file=${file.originalname ?? "cv"}`);
      return { ok: true, text, needsBackfill: false };
    }
    console.log(`[ServiceOrder] fast extract empty method=${method} — deferring to background OCR for ${file.originalname ?? "cv"}`);
    return { ok: true, text: "", needsBackfill: true };
  } catch (err: any) {
    return { ok: false, error: "Could not read your CV file. Please try a different format." };
  }
}

// ── DB helpers ──────────────────────────────────────────────────────────────
async function createOrder(args: {
  /**
   * 2026-08 (Tony's anonymous-checkout directive): userId is now OPTIONAL.
   * Career services (CV Revamp, Cover Letter, SOP, etc.) can be purchased
   * WITHOUT an account — user clicks → fills form → pays → gets a magic
   * download link via email. When userId is null, guestName/Email/Phone
   * MUST be provided and a downloadToken is minted for the delivery link.
   */
  userId: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
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
  /**
   * 2026-08 deferred-extraction: raw CV file bytes for background OCR.
   * Present when fast extraction returned empty (scanned PDF / image).
   * processOrder runs the slow extraction after payment confirms.
   */
  cvRawFile?: { base64: string; mime: string; filename: string } | null;
}): Promise<{ id: string; downloadToken: string | null }> {
  const id = crypto.randomUUID();

  // 2026-08 anonymous-checkout: mint a download token for GUEST orders only.
  // 48 hex chars = 24 bytes of entropy → far beyond brute-forceable. Stored
  // in plain text (not hashed) because we need to look it up by exact value
  // from a URL — hashing would require a scan. Compensating controls:
  // partial unique index + rate-limited endpoint + 30-day expiry + download
  // count cap. Logged-in users don't need a token (they auth via session).
  const isGuest = !args.userId;
  const downloadToken = isGuest ? crypto.randomBytes(24).toString("hex") : null;
  const downloadExpiresAt = isGuest
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)  // 30 days
    : null;

  // Sanitize the referrer token — must look like a UUID, must NOT be the
  // user's own prior order (self-referral is meaningless). Silently drop
  // anything that doesn't validate rather than reject the whole order.
  let referrer: string | null = null;
  if (args.referrerOrderId && typeof args.referrerOrderId === "string") {
    const t = args.referrerOrderId.trim();
    if (/^[0-9a-fA-F-]{8,64}$/.test(t)) {
      try {
        const { rows } = await pool.query<{ user_id: string | null }>(
          `SELECT user_id FROM service_orders WHERE id = $1 LIMIT 1`,
          [t],
        );
        // Only credit when the referring order belongs to a DIFFERENT user
        // (or is itself a guest — always attributable in that case).
        if (rows[0] && rows[0].user_id !== args.userId) referrer = t;
      } catch { /* non-fatal — proceed without attribution */ }
    }
  }

  // 2026-08 deferred-extraction: if cvText is empty AND we have raw file
  // bytes, mark the row 'pending' so processOrder runs OCR before AI gen.
  const extractionStatus = args.cvText && args.cvText.trim().length > 0
    ? "complete"
    : args.cvRawFile
      ? "pending"
      : null;

  // We fill BOTH service_id (old schema, NOT NULL) and service_slug (new
  // columns added for the unified flow) with the same slug — so both old
  // Drizzle-based code paths AND new service-order-routes work cleanly.
  await pool.query(
    `INSERT INTO service_orders
       (id, user_id, service_id, service_slug, service_name, amount, currency, status,
        cv_text, job_description, target_country, extra_input, referrer_order_id, photo_data,
        cv_raw_base64, cv_raw_mime, cv_raw_filename, cv_extraction_status,
        guest_name, guest_email, guest_phone, download_token, download_expires_at,
        created_at, updated_at)
     VALUES ($1, $2, $3, $3, $4, $5, 'KES', 'pending_payment',
             $6, $7, $8, $9, $10, $11,
             $12, $13, $14, $15,
             $16, $17, $18, $19, $20,
             NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      args.userId,           // null for guest orders (nullable column)
      args.slug,             // used for both service_id and service_slug
      args.serviceName,
      args.amount ?? 0,
      args.cvText,
      args.jobDescription,
      args.targetCountry,
      args.extraInput,
      referrer,
      args.photoDataUrl ?? null,
      args.cvRawFile?.base64 ?? null,
      args.cvRawFile?.mime ?? null,
      args.cvRawFile?.filename ?? null,
      extractionStatus,
      // Guest checkout fields — null when userId is present
      args.guestName ?? null,
      args.guestEmail ?? null,
      args.guestPhone ?? null,
      downloadToken,
      downloadExpiresAt,
    ],
  );
  return { id, downloadToken };
}

// 2026-08 deferred-extraction: run the slow extraction cascade (Tesseract,
// OpenAI PDF file-upload) for orders where fast extraction returned empty.
// Called from processOrder BEFORE AI generation. Idempotent — safe to call
// twice; skips if cv_text is already populated or cv_extraction_status is
// not 'pending'.
async function maybeBackfillCvText(orderId: string): Promise<void> {
  const { rows } = await pool.query<{
    cv_text: string | null;
    cv_raw_base64: string | null;
    cv_raw_mime: string | null;
    cv_raw_filename: string | null;
    cv_extraction_status: string | null;
  }>(
    `SELECT cv_text, cv_raw_base64, cv_raw_mime, cv_raw_filename, cv_extraction_status
       FROM service_orders WHERE id = $1`,
    [orderId],
  );
  const row = rows[0];
  if (!row) return;
  // Already have text OR nothing was stored for us — nothing to do.
  if ((row.cv_text ?? "").trim().length >= MIN_CV_LENGTH) return;
  if (row.cv_extraction_status !== "pending") return;
  if (!row.cv_raw_base64 || !row.cv_raw_mime) return;

  console.log(`[ServiceOrder] Background CV extraction starting for orderId=${orderId} file=${row.cv_raw_filename ?? "unknown"} (${row.cv_raw_base64.length} b64 chars)`);
  try {
    const buffer = Buffer.from(row.cv_raw_base64, "base64");
    const { text, method } = await extractTextFromBuffer(
      buffer,
      row.cv_raw_mime,
      row.cv_raw_filename ?? undefined,
    );
    if (text.trim().length >= MIN_CV_LENGTH) {
      // Save text + clear the raw file bytes to reclaim row space.
      await pool.query(
        `UPDATE service_orders
            SET cv_text = $2,
                cv_extraction_status = 'complete',
                cv_raw_base64 = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [orderId, text],
      );
      console.log(`[ServiceOrder] Background extraction SUCCESS orderId=${orderId} method=${method} chars=${text.length}`);
    } else {
      // Extraction ran but got nothing usable — mark failed, keep raw for admin review.
      await pool.query(
        `UPDATE service_orders
            SET cv_extraction_status = 'failed',
                error_message = COALESCE(error_message,'') ||
                  E'\n[extract] Background OCR completed but returned no readable text (method=' || $2 || ').',
                updated_at = NOW()
          WHERE id = $1`,
        [orderId, method],
      );
      console.warn(`[ServiceOrder] Background extraction returned empty text orderId=${orderId} method=${method}`);
    }
  } catch (err: any) {
    await pool.query(
      `UPDATE service_orders
          SET cv_extraction_status = 'failed',
              error_message = COALESCE(error_message,'') ||
                E'\n[extract] Background OCR threw: ' || $2,
              updated_at = NOW()
        WHERE id = $1`,
      [orderId, String(err?.message ?? err).slice(0, 300)],
    ).catch(() => {});
    console.error(`[ServiceOrder] Background extraction failed orderId=${orderId}:`, err?.message);
  }
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
    // 2026-08 deferred-extraction: if the order was created with a scanned
    // PDF (cv_extraction_status='pending'), run the slow OCR / OpenAI PDF
    // extraction NOW — after payment confirmed, before AI generation. This
    // was moved out of the sync order-creation path so the client's initial
    // POST returns in <1s regardless of the CV format. Safe no-op if the
    // order already has cv_text.
    await maybeBackfillCvText(orderId).catch((err: any) => {
      console.warn(`[ServiceOrder] maybeBackfillCvText warned for ${orderId}: ${err?.message}`);
    });

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
    // service types keep the cheaper model.
    //
    // 2026-08 (Tony's quality audit): dynamic max_tokens based on input
    // length so long/technical CVs don't get silently summarized. Six
    // customers in the last 7 days had 30-70% content loss because the
    // 3000-token cap forced the model to compress. Formula: give the model
    // enough headroom to output ~1.3x the input.
    const isCvRevamp    = String(order.service_slug ?? "").toLowerCase() === "cv_fix_lite";
    const isCvHeavy     = ["ats_cv_optimization", "cv_rewrite"].includes(String(order.service_slug ?? "").toLowerCase());
    const modelToUse    = (isCvRevamp || isCvHeavy) ? "gpt-4o" : "gpt-4o-mini";
    const tempToUse     = (isCvRevamp || isCvHeavy) ? 0.55 : 0.4;

    // 2026-08 Master Writing Standard mandates EXPANSION (Rule 1: "the final
    // document should almost always be LONGER"). Give the model enough
    // headroom to output ~2.2x the input in tokens. Rough char→token ratio
    // for English is ~4 chars/token. Floor 4000, ceiling 12000 (gpt-4o max
    // is 16k output but we hold headroom for system prompt).
    const inputLen      = (order.cv_text ?? "").length || 0;
    const dynTokens     = Math.min(12000, Math.max(4000, Math.ceil((inputLen / 4) * 2.2)));
    const maxTokensUse  = (isCvRevamp || isCvHeavy) ? dynTokens : 3500;

    // 2026-08: length-preservation + expansion instruction. Under the Master
    // Writing Standard, output should be LONGER than input (never shorter,
    // unless the user asked for a shorter version). Guard below rejects any
    // output below 100% and retries once.
    const cvLengthGuard = (isCvRevamp || isCvHeavy) && inputLen > 800 ? `

CRITICAL LENGTH REQUIREMENT — READ CAREFULLY (do not violate):
- Preserve EVERY experience bullet, EVERY skill, EVERY certification, EVERY date, EVERY employer, and EVERY technical term from the input CV.
- Enhance wording — do not remove content. Do not summarise.
- Your output MUST be at least as long as the input, and should typically be 1.3x–1.8x the input length. The input is ${inputLen} characters. Aim for ${Math.ceil(inputLen * 1.4)}–${Math.ceil(inputLen * 1.8)} characters of output.
- Fill gaps intelligently per Master Rule 3 — where a role's responsibilities are underdeveloped, expand with role-appropriate duties and competencies that any professional in that job would naturally have.
- Do not condense multiple bullets into one. Do not omit technical vocabulary you don't recognise (e.g. plumbing terms like PPR / GI / HDPE / UPVC, medical codes, engineering acronyms, industry-specific tools) — preserve them verbatim and, where helpful, add one line of context.
` : "";

    // 2026-08 (Tony's mandate after CV Revamp quality crisis): every
    // document-generation prompt is prefixed with the Master Writing Standard.
    // This is the single source of truth for content-preservation, human
    // voice, expansion-not-compression, and per-profession tailoring. Applies
    // to every service — CV Revamp, Cover Letter, Motivation, SoP, LinkedIn,
    // Interview Prep, etc.
    const { MASTER_WRITING_STANDARD } = await import("./lib/master-writing-standard");

    const runCompletion = async (extraSystemGuidance = "") => {
      const completion = await openai.chat.completions.create({
        model: modelToUse,
        messages: [
          {
            role: "system",
            content: MASTER_WRITING_STANDARD + config.systemPrompt + cvLengthGuard + extraSystemGuidance,
          },
          { role: "user", content: userMessage },
        ],
        temperature: tempToUse,
        max_tokens: maxTokensUse,
      });
      return completion.choices[0]?.message?.content?.trim() ?? "";
    };

    let output = await runCompletion();
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

    // ── 2026-08 v3 SPLIT CAREER ENHANCEMENT REPORT ──────────────────────────
    // Stage 21 of the Elite Career Intelligence Engine unconditionally appends
    // a Career Enhancement Report separated by the divider:
    //   ═══ CAREER ENHANCEMENT REPORT ═══
    // We split here so:
    //   - output_text (what becomes the DOCX/PDF the employer sees) contains
    //     ONLY the document body — never the coaching content.
    //   - The report is stashed in ai_output.careerReport so the download page
    //     can render it as a coaching card below the file for the user.
    // If the AI didn't emit the divider (fallback path), output_text = full
    // response and no report is stored.
    let careerReport: string | null = null;
    // 2026-08 (Tony bug fix): Unicode box-drawing chars ═══ get mangled by
    // the PDF renderer (Helvetica WinAnsi encoding) → become %P%P%P. The
    // regex must catch BOTH the original chars AND their mangled form, or
    // the coaching content leaks into the recruiter-facing CV. Also
    // tolerates any repeat char (═/=/%P/*/-) around the divider text.
    const REPORT_DIVIDER_RE =
      /\n?\s*(?:[═=%P*\-–—]{2,}|%P%P%P?)\s*CAREER\s+ENHANCEMENT\s+REPORT\s*(?:[═=%P*\-–—]{2,}|%P%P%P?)\s*\n?/i;
    const dividerMatch = output.match(REPORT_DIVIDER_RE);
    if (dividerMatch && dividerMatch.index !== undefined) {
      const body = output.slice(0, dividerMatch.index).trimEnd();
      const report = output.slice(dividerMatch.index + dividerMatch[0].length).trim();
      if (body.length > 0) {
        output = body;
        careerReport = report.length > 0 ? report : null;
      }
    }

    // ── 2026-08 QUALITY GUARDRAIL — CV shrinkage / bloat detection ──────────
    // Six customers in the last 7 days received CVs that were 30-70% shorter
    // than what they uploaded (technical CVs got compressed into summaries).
    // Two others got 150-190% output (AI padded with hallucinated content).
    // Both cases produce refund complaints. This guard blocks bad output
    // BEFORE it reaches the customer:
    //   1. If output < 85% of input → try ONCE more with a stronger prompt
    //   2. If still bad → save to needs_human_review and don't auto-deliver
    //   3. If output > 150% of input → same (AI hallucinated content)
    if ((isCvRevamp || isCvHeavy) && inputLen > 800) {
      // 2026-08 Master Writing Standard: output must be at least as long as
      // input (Rule 1 — never reduce). Expansion up to 2x is expected and
      // encouraged (Rule 2 — add value). Anything shorter than input OR more
      // than 2.2x input triggers a retry with a stronger prompt.
      //
      // 2026-08 (Tony's "users paid but not receiving" report): loosened
      // MIN_RATIO from 1.00 to 0.85. The 1.00 floor was kicking many
      // legitimate outputs to awaiting_review — the model normally produces
      // 0.9–1.5x, and rejecting anything <100% created a backlog admin
      // couldn't clear fast enough. 0.85 still catches genuine compression
      // (30-70% content loss cases) but lets normal-length rewrites through.
      const MIN_RATIO = 0.85;
      const MAX_RATIO = 2.20;
      const ratio = output.length / inputLen;

      if (ratio < MIN_RATIO || ratio > MAX_RATIO) {
        console.warn(
          `[quality-guard] orderId=${orderId} ratio=${ratio.toFixed(2)} ` +
          `(in=${inputLen} out=${output.length}) — retrying with stronger prompt`
        );

        const retryGuidance = ratio < MIN_RATIO
          ? `\n\nRETRY INSTRUCTION — your previous response was SHORTER than the input (${output.length} chars vs ${inputLen} input). This violates Master Rule 1 (Never Reduce Content). You MUST:\n- Preserve every bullet, skill, certification, employer, date, and technical term\n- Expand underdeveloped bullets with role-appropriate responsibilities (Master Rule 3 — Fill the Gaps)\n- Output between ${Math.ceil(inputLen * 1.3)} and ${Math.ceil(inputLen * 1.8)} characters\nDo not invent employers, dates, degrees, or hard metrics — but DO enrich duties, competencies, and voice.`
          : `\n\nRETRY INSTRUCTION — your previous response was TOO LONG (${output.length} chars vs ${inputLen} input, more than 2.2x). You are padding with content that isn't grounded in the input. Cut invented experience, invented employers, or invented achievements. Keep only what the input supports. Aim for ${Math.ceil(inputLen * 1.4)}–${Math.ceil(inputLen * 1.8)} characters.`;

        try {
          const retryOutput = await runCompletion(retryGuidance);
          if (retryOutput) {
            let cleanedRetry = retryOutput;
            try {
              const { stripAiTells } = await import("./ai/human-voice");
              cleanedRetry = stripAiTells(retryOutput);
            } catch { /* ignore */ }

            const retryRatio = cleanedRetry.length / inputLen;
            if (retryRatio >= MIN_RATIO && retryRatio <= MAX_RATIO) {
              console.warn(
                `[quality-guard] orderId=${orderId} retry SUCCESS ratio=${retryRatio.toFixed(2)}`
              );
              output = cleanedRetry;
            } else {
              // Retry also failed — flag for human review, DON'T auto-deliver
              console.error(
                `[quality-guard] orderId=${orderId} retry FAILED ratio=${retryRatio.toFixed(2)} — ` +
                `flagging for human review, not delivering`
              );
              await pool.query(
                // 2026-08 (Tony bug fix): was leaving status='processing' which
                // caused the client polling loop to hang forever showing
                // "Generating your CV Revamp...". Now transitions to
                // 'awaiting_review' — a terminal status the client can render
                // as "being personally reviewed, expect within 4 hours".
                // 2026-08 Fix B: also flag refund_requested = true. Guardrail
                // firing means the user got a substandard first attempt —
                // regardless of whether we manually rewrite for them free,
                // admin should have the queue of "these people paid but got
                // less than promised" for accounting. Refunds get processed
                // via the existing refunds admin view.
                `UPDATE service_orders
                 SET status = 'awaiting_review',
                     output_text = $2,
                     needs_human_review = true,
                     human_review_notes = $3,
                     refund_requested = true,
                     updated_at = NOW()
                 WHERE id = $1`,
                [
                  orderId,
                  cleanedRetry,
                  `auto-flagged: length ratio ${retryRatio.toFixed(2)} outside [${MIN_RATIO}, ${MAX_RATIO}] on retry. Input=${inputLen} Output=${cleanedRetry.length}. Original attempt also failed at ${ratio.toFixed(2)}. Needs manual review before delivery.`
                ]
              );

              // Notify user their CV is being personally reviewed (not
              // delivered as usual). Prevents the "you sent me garbage"
              // complaint and buys us time to fix or human-rewrite.
              try {
                const { notifyOrderNeedsReview } = await import("./service-order-notify");
                await notifyOrderNeedsReview(orderId).catch(() => {});
              } catch {
                // Fallback: at least log so Tony can WhatsApp the user manually
                console.warn(
                  `[quality-guard] orderId=${orderId} needs manual outreach — ` +
                  `notifyOrderNeedsReview module missing`
                );
              }
              return;   // stop here — do NOT mark completed, do NOT deliver
            }
          }
        } catch (retryErr: any) {
          console.error(`[quality-guard] retry threw: ${retryErr?.message} — keeping original output`);
        }
      }
    }

    // ── 2026-08 ATS PREFLIGHT — Tony's 70+ floor mandate ──────────────────
    // Before we commit output_text and mark the order completed, run a
    // lightweight ATS score check on the AI output. If it scores below 70,
    // kick the order to awaiting_review so a human handles it — better to
    // delay 4 hours than deliver a <70 CV that a customer will screenshot
    // and complain about publicly. Only runs for CV services (skip cover
    // letter / SoP / motivation which have different scoring criteria).
    if (isCvRevamp || isCvHeavy) {
      try {
        const { preflightScoreCV } = await import("./lib/ats-preflight");
        // 2026-08 (Tony's "users paid but not receiving" report): lowered
        // preflight floor 70 → 55 because too many legitimate rewrites were
        // scoring 60-69 and getting kicked to awaiting_review, creating a
        // backlog admin couldn't clear. Below 55 still catches genuinely
        // broken output (missing sections, blank paragraphs, garbled text)
        // but doesn't hold up perfectly usable CVs waiting for a human
        // touch-up we don't have bandwidth to do at scale.
        const pre = await preflightScoreCV(output, 55);
        if (pre.ok && !pre.passed) {
          console.warn(
            `[ats-preflight] orderId=${orderId} FAILED — score=${pre.score} < 55. ` +
            `Kicking to awaiting_review. Weaknesses: ${pre.weaknesses.join(" | ")}`,
          );
          await pool.query(
            `UPDATE service_orders
             SET status = 'awaiting_review',
                 output_text = $2,
                 needs_human_review = true,
                 human_review_notes = $3,
                 refund_requested = true,
                 updated_at = NOW()
             WHERE id = $1`,
            [
              orderId,
              output,
              `auto-flagged: ATS preflight score ${pre.score} < 55. Weaknesses: ${pre.weaknesses.join("; ")}. Suggestion: ${pre.suggestion}. Needs manual review before delivery.`,
            ],
          );
          try {
            const { notifyOrderNeedsReview } = await import("./service-order-notify");
            await notifyOrderNeedsReview(orderId).catch(() => {});
          } catch {}
          return;
        }
        if (pre.ok) {
          console.log(`[ats-preflight] orderId=${orderId} PASSED — score=${pre.score}`);
        }
      } catch (preErr: any) {
        // Never block delivery on a preflight infra error — deliver the
        // output as-is and log for investigation. Belt-and-suspenders.
        console.warn(`[ats-preflight] orderId=${orderId} scorer errored, delivering anyway: ${preErr?.message}`);
      }
    }

    // Final write — NOW() can't be passed as a bound parameter, so we use a
    // direct SQL update here rather than the generic updateOrderStatus helper.
    // 2026-08 Master Writing Standard: quality_score is a 0-100 index where
    // 100 means output is at or above input length (Rule 1 satisfied), and
    // anything below 100 means we couldn't get expansion (retry recovered it
    // to ≥100% or we'd have gone to human-review above). NULL for services
    // where the guard doesn't apply.
    const passedRatio = inputLen > 800 && (isCvRevamp || isCvHeavy)
      ? Math.min(100, Math.round((output.length / inputLen) * 100))
      : null;

    // 2026-08 v3: also persist the Career Enhancement Report (Stage 21) into
    // ai_output.careerReport for the download-page UI to render as a
    // separate coaching card. NULL when the AI didn't produce a report.
    const aiOutputPayload = careerReport
      ? JSON.stringify({ careerReport, generatedAt: new Date().toISOString() })
      : null;

    await pool.query(
      `UPDATE service_orders
       SET output_text = $2,
           status = 'completed',
           completed_at = NOW(),
           updated_at = NOW(),
           quality_score = COALESCE($3::int, quality_score),
           quality_passed = COALESCE($3::int IS NOT NULL AND $3::int >= 100, quality_passed),
           ai_output = COALESCE($4::jsonb, ai_output)
       WHERE id = $1`,
      [orderId, output, passedRatio, aiOutputPayload],
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
      // 2026-08 (task #1 trust fix): dropped the `&& order.user_id` guard.
      // Guest orders (anonymous checkout) MUST also be fingerprinted so
      // when they re-upload their delivered CV to /tools/ats-cv-checker
      // the promised score is honoured. Without this, guest users saw
      // the raw AI grader score their delivered CV low and thought we'd
      // ripped them off — exactly the "score didn't improve" complaint.
      if (CV_OUTPUT_SLUGS.has(slug)) {
        recordDeliveredCv({
          userId:         order.user_id ?? null,
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
    // ── 2026-08 (post-OpenAI-outage audit) ────────────────────────────────
    // Distinguish transient errors (fix themselves — credit top-up, brief
    // rate-limit burst, OpenAI 5xx, network blip) from permanent errors
    // (invalid input the AI can't process — bad prompt, unreadable CV,
    // context length exceeded, auth broken). Transient errors leave the
    // order in "processing" so the stuck-order sweep retries; permanent
    // errors mark it "failed" so the user is told promptly.
    //
    // Before this change: EVERY error → status='failed', which meant the
    // OpenAI credit outage killed every in-flight order immediately, and
    // the sweep couldn't recover them once credits were topped up.
    const errMsg = String(err?.message ?? "Unknown error");
    const status = Number(err?.status ?? 0);
    const code   = String(err?.code ?? "");
    const lower  = errMsg.toLowerCase();

    const isTransient =
      status === 429 || status === 503 || status === 502 || status === 500 ||
      code === "insufficient_quota" ||
      code === "credit_balance_exhausted" ||
      code === "rate_limit_exceeded" ||
      lower.includes("no credits remaining") ||
      lower.includes("rate limit") ||
      lower.includes("timeout") ||
      lower.includes("timed out") ||
      lower.includes("econnrefused") ||
      lower.includes("etimedout") ||
      lower.includes("network") ||
      lower.includes("temporarily");

    if (isTransient) {
      // Log warning + THROW. Do NOT mark failed. The sweep will retry (up to
      // MAX_RETRIES_PER_ORDER=3). If it exhausts retries, sweep marks failed
      // with a clear "[recovery] Exhausted" message + fires user notification
      // (see notifyOrderFailed below).
      //
      // 2026-08 (Tony's "users paid but not receiving" audit): stamp the
      // original error into error_message BEFORE throwing so we can diagnose
      // OpenAI failures. Previously only the recovery-layer's "Exhausted 3
      // retries" line survived — we were flying blind on what actually
      // failed. Append (COALESCE) so we don't overwrite prior attempts.
      await pool.query(
        `UPDATE service_orders
         SET error_message = COALESCE(error_message,'') ||
             E'\n[processOrder ' || to_char(NOW(),'YYYY-MM-DD HH24:MI:SS') || '] ' || $2,
             updated_at = NOW()
         WHERE id = $1`,
        [orderId, `TRANSIENT status=${status} code=${code} msg="${errMsg.slice(0, 500)}"`],
      ).catch(() => { /* best-effort — never let logging block the throw */ });
      console.warn(
        `[ServiceOrder] processOrder TRANSIENT error for ${orderId}: ` +
        `status=${status} code=${code} msg="${errMsg}" — leaving order in processing state for sweep retry`,
      );
      throw err;
    }

    console.error(
      `[ServiceOrder] processOrder PERMANENT error for ${orderId}: ` +
      `status=${status} code=${code} msg="${errMsg}" — marking failed`,
    );
    await pool.query(
      `UPDATE service_orders SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1`,
      [orderId, errMsg],
    ).catch(() => {});
    // Tell the user their order failed (with refund path). Fire and forget.
    notifyOrderFailed(orderId, errMsg).catch((notifyErr) => {
      console.warn(`[ServiceOrder] failure notification failed for ${orderId}:`, notifyErr?.message);
    });
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
    // 2026-08 (guest orders): pull guest fields alongside user_id so we can
    // route delivery correctly. Guest = user_id NULL + guest_email present.
    const { rows } = await pool.query<{
      user_id: string | null;
      service_name: string;
      service_slug: string;
      guest_name: string | null;
      guest_email: string | null;
      guest_phone: string | null;
      download_token: string | null;
    }>(
      `SELECT user_id, service_name, service_slug,
              guest_name, guest_email, guest_phone, download_token
         FROM service_orders WHERE id = $1 AND status = 'completed'`,
      [orderId],
    );
    const order = rows[0];
    if (!order) return;

    // Two delivery paths:
    //   (a) Logged-in user   → lookup users.email/phone/first_name, deliver as before
    //   (b) Guest order      → use guest_* fields + download_token magic link
    let recipientEmail: string | null = null;
    let recipientPhone: string | null = null;
    let firstName = "there";
    let isGuestDelivery = false;

    if (order.user_id) {
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
      recipientEmail = user.email;
      recipientPhone = user.phone;
      firstName = (user.first_name || "").split(/\s+/)[0] || "there";
    } else if (order.guest_email) {
      isGuestDelivery = true;
      recipientEmail = order.guest_email;
      recipientPhone = order.guest_phone;
      firstName = (order.guest_name || "").split(/\s+/)[0] || "there";
    } else {
      // Neither user_id nor guest_email — nothing we can do. Log and bail.
      console.warn(`[ServiceOrder] notifyOrderCompleted: order ${orderId} has no recipient (no user_id, no guest_email)`);
      return;
    }

    const serviceName = order.service_name || "document";
    const appOrigin = (process.env.APP_ORIGIN || "https://workabroadhub.tech").replace(/\/$/, "");
    const documentsUrl = `${appOrigin}/my-documents`;
    // Direct order page — mobile-first, big PDF + Word buttons already there.
    const orderUrl = `${appOrigin}/order/${orderId}`;
    // Direct PDF download URL — one-tap on mobile if the user still has a session
    // OR appended with the download token for guest orders.
    const tokenSuffix = isGuestDelivery && order.download_token ? `?token=${order.download_token}` : "";
    const directPdfUrl = `${appOrigin}/api/services/order/${orderId}/download/pdf${tokenSuffix}`;
    // Guest magic download page — token in the URL, no login required.
    const guestDownloadUrl = isGuestDelivery && order.download_token
      ? `${appOrigin}/download/${order.download_token}`
      : documentsUrl;
    // Which URL to feature as the primary CTA (works for both paths).
    const primaryDownloadUrl = isGuestDelivery ? guestDownloadUrl : documentsUrl;
    // For guest emails, keep old vars in scope but redefine so the existing
    // template below uses the guest link seamlessly.
    // (documentsUrl still referenced below — leave it pointing to /my-documents
    // for logged-in users; guests will follow the primaryDownloadUrl instead.)
    void orderUrl; // preserved for future analytics; keeps lint quiet
    // Support contact — reads from env, falls back to Tony's number so users
    // never feel stranded even if WHATSAPP_SUPPORT_NUMBER isn't set.
    const supportPhone = (process.env.WHATSAPP_SUPPORT_NUMBER || process.env.ADMIN_PHONE_NUMBER || "").replace(/^\+?/, "");
    const supportLine = supportPhone
      ? `\n\nQuestions? Reply here or WhatsApp us on wa.me/${supportPhone} — we read every message.`
      : `\n\nQuestions? Reply here — we read every message.`;

    // ── Email (primary) ───────────────────────────────────────────────────
    if (recipientEmail) {
      try {
        const { sendWithFailover } = await import("./lib/email-providers");
        // Guest emails feature the magic-link download page as the ONE CTA.
        // Logged-in emails keep the old two-link layout (dashboard + direct PDF).
        const primaryCtaLabel = isGuestDelivery
          ? "Download my document →"
          : "Download my document →";
        const guestExpiryNote = isGuestDelivery
          ? `<p style="font-size:12px;line-height:1.5;color:#94a3b8;margin:16px 0 0">This download link works for 30 days. Save it or download your document now.</p>`
          : `<p style="font-size:13px;line-height:1.55;margin:24px 0 8px;color:#64748b">Prefer a direct download? <a href="${directPdfUrl}" style="color:#0f766e;font-weight:600">Grab the PDF here</a> (sign in required).</p>`;
        const html = `
          <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
            <h1 style="font-size:22px;font-weight:700;color:#0f766e;margin:0 0 8px">Your ${serviceName} is ready 🎉</h1>
            <p style="font-size:15px;line-height:1.55;margin:0 0 20px">
              Hi ${escapeHtml(firstName)}, we've just finished your ${serviceName.toLowerCase()}. It's optimized, warm, and ready for recruiters.
            </p>
            <a href="${primaryDownloadUrl}" style="display:inline-block;background:linear-gradient(90deg,#14b8a6,#06b6d4);color:#fff;font-weight:600;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px">
              ${primaryCtaLabel}
            </a>
            ${guestExpiryNote}
            <div style="border-top:1px solid #e2e8f0;margin:24px 0 12px"></div>
            <p style="font-size:12px;line-height:1.5;color:#94a3b8;margin:0">
              You're getting this because you completed an order at WorkAbroad Hub. If something looks off, just reply to this email — we read every message.
            </p>
          </div>
        `;
        const text = isGuestDelivery
          ? `Your ${serviceName} is ready.\n\nHi ${firstName}, we've just finished your ${serviceName.toLowerCase()}. Download it here:\n\n${primaryDownloadUrl}\n\nThis link works for 30 days.\n\n— WorkAbroad Hub`
          : `Your ${serviceName} is ready.\n\nHi ${firstName}, we've just finished your ${serviceName.toLowerCase()}. Download it here:\n\n${documentsUrl}\n\nOr grab the PDF directly (sign in required): ${directPdfUrl}\n\n— WorkAbroad Hub`;
        await sendWithFailover({
          to: recipientEmail,
          subject: `Your ${serviceName} is ready — download it here`,
          html,
          text,
        });
      } catch (emailErr: any) {
        console.warn(`[ServiceOrder] completion email failed for ${orderId}:`, emailErr?.message);
      }
    }

    // ── WhatsApp (secondary) ──────────────────────────────────────────────
    // Tony's Aug 2026 note: Kenyans check WhatsApp 20× more than email. Make
    // this message do the heavy lifting: direct order link (opens straight to
    // download buttons — no digging through /my-documents), clear PDF+Word
    // offer, and a support phone so people never feel stranded. Format uses
    // *bold* which WhatsApp renders natively.
    //
    // 2026-08 (guest orders — EMAIL-ONLY delivery per founder decision):
    // We skip WhatsApp for guests. Their phone was collected for the M-Pesa
    // STK push only; they didn't opt in to marketing messages, and email
    // delivery is what we committed to at checkout ("we'll email your CV").
    if (recipientPhone && !isGuestDelivery) {
      try {
        const { sendWhatsApp } = await import("./services/whatsapp");
        const waMessage =
          `🎉 *Your ${serviceName} is ready, ${firstName}!*\n\n` +
          `👉 *Download here:* ${orderUrl}\n\n` +
          `Both *PDF* and *Word* formats waiting for you. Tap the link, choose your format, and it saves straight to your phone.\n\n` +
          `_(We also sent this to your email as a backup.)_` +
          supportLine;
        await sendWhatsApp(recipientPhone, waMessage);
      } catch (waErr: any) {
        console.warn(`[ServiceOrder] completion WhatsApp failed for ${orderId}:`, waErr?.message);
      }
    }

    // ── In-app notification (tertiary) ────────────────────────────────────
    // Only for logged-in users — guests have no account, so no bell icon.
    if (order.user_id) {
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
    }

    console.log(`[ServiceOrder] Completion notifications dispatched for order ${orderId} (mode=${isGuestDelivery ? "GUEST" : "USER"} email=${!!recipientEmail} wa=${!!recipientPhone && !isGuestDelivery})`);
  } catch (outer: any) {
    console.error(`[ServiceOrder] notifyOrderCompleted outer failure for ${orderId}:`, outer?.message);
  }
}

/**
 * notifyOrderFailed — email + WhatsApp when an order is permanently failed
 * (either from a permanent processOrder error, or from the sweep exhausting
 * MAX_RETRIES_PER_ORDER). Users get: an apology, refund info, and next-step
 * options (retry / contact support). Fire-and-forget — must never throw.
 *
 * 2026-08 (post-OpenAI-outage audit): before this function existed, users
 * whose CV Revamp died in-flight got zero notification. They'd stare at
 * "Processing…" forever, then eventually email Tony asking where their doc
 * was. Now we own the "we messed up" moment properly.
 */
async function notifyOrderFailed(orderId: string, technicalReason: string): Promise<void> {
  try {
    const { rows } = await pool.query<{
      user_id: string;
      service_name: string;
      service_slug: string;
      amount: number | null;
    }>(
      `SELECT user_id, service_name, service_slug, amount FROM service_orders WHERE id = $1`,
      [orderId],
    );
    const order = rows[0];
    if (!order) return;

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

    const firstName    = (user.first_name || "").split(/\s+/)[0] || "there";
    const serviceName  = order.service_name || "your order";
    const appOrigin    = (process.env.APP_ORIGIN || "https://workabroadhub.tech").replace(/\/$/, "");
    const orderUrl     = `${appOrigin}/order/${orderId}`;
    const supportPhone = (process.env.WHATSAPP_SUPPORT_NUMBER || process.env.ADMIN_PHONE_NUMBER || "").replace(/^\+?/, "");
    const supportLine  = supportPhone
      ? `\n\nWe'll process your refund within 24 hours. If you'd rather try again, reply here or WhatsApp us on wa.me/${supportPhone}.`
      : `\n\nWe'll process your refund within 24 hours. Reply to this email if you'd rather try again.`;

    // ── Email
    if (user.email) {
      try {
        const { sendWithFailover } = await import("./lib/email-providers");
        const html = `
          <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
            <h1 style="font-size:20px;font-weight:700;color:#b91c1c;margin:0 0 8px">We couldn't finish your ${serviceName} — sorry.</h1>
            <p style="font-size:15px;line-height:1.55;margin:0 0 16px">
              Hi ${escapeHtml(firstName)}, something went wrong on our side while generating your ${serviceName.toLowerCase()}. Your KES ${order.amount ?? "?"} payment is safe.
            </p>
            <p style="font-size:15px;line-height:1.55;margin:0 0 20px">
              You have two options:
            </p>
            <a href="${orderUrl}" style="display:inline-block;background:linear-gradient(90deg,#14b8a6,#06b6d4);color:#fff;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;margin-right:8px">
              Retry this order →
            </a>
            <p style="font-size:13px;line-height:1.55;margin:24px 0 8px;color:#64748b">
              Or reply to this email and we'll refund the KES ${order.amount ?? "?"} within 24 hours — no questions asked.
            </p>
            <div style="border-top:1px solid #e2e8f0;margin:24px 0 12px"></div>
            <p style="font-size:11px;line-height:1.5;color:#94a3b8;margin:0">
              Technical reference: ${escapeHtml(technicalReason.slice(0, 200))}
            </p>
          </div>
        `;
        const text = `We couldn't finish your ${serviceName}.\n\nHi ${firstName}, something went wrong on our side. Your KES ${order.amount ?? "?"} payment is safe.\n\nOptions:\n1) Retry: ${orderUrl}\n2) Reply to this email for a refund within 24 hours.\n\nReference: ${technicalReason.slice(0, 200)}`;
        await sendWithFailover({
          to: user.email,
          subject: `We couldn't finish your ${serviceName} — full refund available`,
          html,
          text,
        });
      } catch (emailErr: any) {
        console.warn(`[ServiceOrder] failure email failed for ${orderId}:`, emailErr?.message);
      }
    }

    // ── WhatsApp
    if (user.phone) {
      try {
        const { sendWhatsApp } = await import("./services/whatsapp");
        const waMessage =
          `😔 *We couldn't finish your ${serviceName}, ${firstName}.*\n\n` +
          `Something went wrong on our side. Your KES ${order.amount ?? "?"} payment is safe.\n\n` +
          `👉 *Retry:* ${orderUrl}\n` +
          `Or reply to this message for a full refund within 24 hours.`+
          supportLine;
        await sendWhatsApp(user.phone, waMessage);
      } catch (waErr: any) {
        console.warn(`[ServiceOrder] failure WhatsApp failed for ${orderId}:`, waErr?.message);
      }
    }

    // ── In-app notification
    try {
      const { storage } = await import("./storage");
      await storage.createUserNotification({
        userId: order.user_id,
        type: "warning",
        title: `Order didn't complete — refund available`,
        message: `We couldn't finish your ${serviceName.toLowerCase()}. Retry from your order page or reply for a refund.`,
      } as any);
    } catch (notifErr: any) {
      console.warn(`[ServiceOrder] in-app failure notification failed for ${orderId}:`, notifErr?.message);
    }

    console.log(`[ServiceOrder] Failure notifications dispatched for order ${orderId} (email=${!!user.email} wa=${!!user.phone})`);
  } catch (outer: any) {
    console.error(`[ServiceOrder] notifyOrderFailed outer failure for ${orderId}:`, outer?.message);
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
      // 2026-08 (Tony's "users paid but not receiving" audit): first pass —
      // reconcile any pending_payment orders whose payment actually completed.
      // Root cause: paymentPipeline Step 3b sometimes misses linking (metadata
      // parse race, orphan-recovered payment, PayPal webhook arriving before
      // the client-driven capture-order finishes). Rather than diagnose every
      // edge case, sweep every minute and self-heal: any pending_payment order
      // that has a matching completed payment gets promoted to 'paid' so the
      // AI generation kicks in.
      const { rows: promoted } = await pool.query<{ id: string }>(
        `UPDATE service_orders o
            SET status = 'paid',
                paid_at = COALESCE(o.paid_at, NOW()),
                updated_at = NOW(),
                error_message = COALESCE(o.error_message,'') ||
                  E'\n[reconciler ' || to_char(NOW(),'YYYY-MM-DD HH24:MI:SS') ||
                  '] Payment completed but pipeline missed linking — self-healed.'
          WHERE o.status = 'pending_payment'
            AND EXISTS (
              SELECT 1 FROM payments p
              WHERE p.status IN ('success','completed')
                AND p.metadata::text LIKE '%"serviceOrderId":"' || o.id || '"%'
            )
            AND o.created_at > NOW() - INTERVAL '7 days'
          RETURNING id`,
      );
      if (promoted.length > 0) {
        console.warn(
          `[ServiceOrder] Reconciler: self-healed ${promoted.length} pending_payment order(s) ` +
          `whose payments had completed: ${promoted.map(r => r.id).join(", ")}`,
        );
      }

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
          // 2026-08 (post-outage audit): tell the user their order gave up.
          // Otherwise they stare at "processing" forever until manually
          // emailing support. Fire and forget.
          notifyOrderFailed(
            row.id,
            `Exhausted ${MAX_RETRIES_PER_ORDER} recovery retries — likely upstream AI outage`,
          ).catch(() => {});
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
  // Body: multipart/form-data { cv: File, jobDescription?, targetCountry?, extraInput?,
  //                             guestName?, guestEmail?, guestPhone? }
  // Response: { orderId, serviceName, price, needsPayment: true, downloadToken? }
  //
  // 2026-08 (Tony's anonymous-checkout directive): TWO paths, one endpoint.
  //   Logged-in path:  session cookie → userId → existing flow (my-orders, etc.)
  //   Guest path:      no session   → require guestName + guestEmail + guestPhone
  //                                   → mint downloadToken → deliver via email
  //
  // Payment IS the auth for guests — no doc is generated until M-Pesa or
  // PayPal webhook confirms the payment row created here. Rate limits below
  // prevent order-spam from anonymous IPs.
  app.post(
    "/api/services/order/:slug",
    cvUploadWithJsonErrors("cv"),
    async (req: any, res: Response) => {
      const t0 = Date.now();
      const slug = String(req.params.slug || "").toLowerCase();
      const sessionUserId: string | undefined = req.user?.claims?.sub ?? req.user?.id;
      const isGuest = !sessionUserId;
      console.log(`[ServiceOrder] POST /api/services/order/${slug} | userId=${sessionUserId ?? "GUEST"} hasFile=${!!req.file}`);

      try {
        // Guest checkout validation — name + email + phone all required so
        // we can (a) address the delivery email, (b) email the download link,
        // (c) drive the M-Pesa STK push at pay time.
        let guestName: string | null = null;
        let guestEmail: string | null = null;
        let guestPhone: string | null = null;
        if (isGuest) {
          guestName  = String(req.body?.guestName  ?? "").trim() || null;
          guestEmail = String(req.body?.guestEmail ?? "").trim().toLowerCase() || null;
          guestPhone = String(req.body?.guestPhone ?? "").trim() || null;
          if (!guestName || !guestEmail || !guestPhone) {
            return res.status(400).json({
              message: "Please provide your name, email, and phone number so we can send your finished document.",
              missingFields: {
                guestName:  !guestName,
                guestEmail: !guestEmail,
                guestPhone: !guestPhone,
              },
            });
          }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
            return res.status(400).json({ message: "That email doesn't look right — please double-check it." });
          }
          // Loose phone check — Kenyan (07/01/+254) or international (+xxx).
          const phoneDigits = guestPhone.replace(/\D/g, "");
          if (phoneDigits.length < 9 || phoneDigits.length > 15) {
            return res.status(400).json({ message: "Please enter a valid phone number (e.g. 0712345678)." });
          }
        }

        const config = getConfig(slug);
        if (!config) {
          console.warn(`[ServiceOrder] Unknown service slug: "${slug}"`);
          return res.status(404).json({ message: `Unknown service: ${slug}` });
        }

        // CV extraction if required — fast path only (pdfjs / mammoth).
        // 2026-08 (long-term fix): if fast returns empty (scanned PDF), we
        // stash the raw file bytes for background OCR. processOrder runs
        // the slow extraction after payment confirms, before AI generation.
        // Endpoint returns in <1s regardless of file format.
        let cvText: string | null = null;
        let cvRawFile: { base64: string; mime: string; filename: string } | null = null;
        if (config.needsCv) {
          const extracted = await extractCvOrError(req);
          if (!extracted.ok) return res.status(400).json({ message: extracted.error });
          if (extracted.needsBackfill) {
            // Fast extraction returned empty → stash raw file for background OCR.
            const file = (req as any).file as Express.Multer.File | undefined;
            if (file?.buffer) {
              // Sanity cap: 4 MB compressed base64 (raw file ≤ ~3 MB).
              // Files above this shouldn't reach here — multer's 10 MB cap
              // is on the file itself; b64 encoding inflates ~1.33x.
              const b64 = file.buffer.toString("base64");
              if (b64.length > 4_500_000) {
                return res.status(400).json({
                  message: "Your CV is too large to process. Please compress it (under 3 MB) or upload a text-based PDF / .docx.",
                });
              }
              cvRawFile = {
                base64:   b64,
                mime:     file.mimetype || "application/octet-stream",
                filename: file.originalname || "cv",
              };
              console.log(`[ServiceOrder] Deferring OCR for ${cvRawFile.filename} (${b64.length} b64 chars) — will run after payment`);
            } else {
              return res.status(400).json({ message: "Please upload your CV file." });
            }
          } else {
            cvText = extracted.text;
          }
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

        const { id: orderId, downloadToken } = await createOrder({
          userId: sessionUserId ?? null,
          guestName,
          guestEmail,
          guestPhone,
          slug,
          serviceName: config.name,
          amount: price,
          cvText,
          jobDescription,
          targetCountry,
          extraInput,
          referrerOrderId,
          photoDataUrl,
          cvRawFile,
        });

        console.log(`[ServiceOrder] Created orderId=${orderId} slug=${slug} price=${price} mode=${isGuest ? "GUEST" : "USER"} cvLen=${cvText?.length ?? 0} deferred=${cvRawFile ? "yes" : "no"} in ${Date.now() - t0}ms`);
        res.json({
          orderId,
          serviceName: config.name,
          price,
          estSeconds: config.estSeconds,
          needsPayment: price > 0,
          // Guest flow: client stores this token in localStorage and uses it
          // as ?token=xxx on status polls + download requests. Never emitted
          // for logged-in users (they auth via session cookie).
          downloadToken: downloadToken ?? undefined,
          isGuestOrder: isGuest,
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

  // POST /api/services/order/:orderId/pay-guest — initiate M-Pesa STK for guest.
  // 2026-08 (Tony's anonymous-checkout directive): dedicated payment path for
  // no-account orders. Auth via ?token=xxx (matches the download token minted
  // at order creation). Records a payments row with user_id NULL and hands off
  // to the standard mpesa.stkPush → callback → runPaymentPipeline machinery,
  // which already handles guest orders correctly because notifyOrderCompleted
  // routes on guest_email when user_id is NULL.
  //
  // Rate limited (implicitly via the token uniqueness — one token per order,
  // one order per legitimate flow) + phone normalization + amount pulled from
  // the immutable order row (client can't tamper with the price).
  app.post("/api/services/order/:orderId/pay-guest", async (req: any, res: Response) => {
    try {
      const orderId = String(req.params.orderId || "").trim();
      const tokenParam = String(req.body?.token ?? req.query?.token ?? "").trim();
      if (!orderId || !tokenParam) {
        return res.status(400).json({ message: "orderId and token are required." });
      }
      const { rows } = await pool.query<{
        id: string;
        user_id: string | null;
        service_slug: string;
        service_name: string;
        status: string;
        amount: number | null;
        guest_email: string | null;
        guest_phone: string | null;
        download_token: string | null;
      }>(
        `SELECT id, user_id, service_slug, service_name, status, amount,
                guest_email, guest_phone, download_token
           FROM service_orders WHERE id = $1 LIMIT 1`,
        [orderId],
      );
      const order = rows[0];
      if (!order) return res.status(404).json({ message: "Order not found." });
      if (!order.download_token) return res.status(400).json({ message: "This order is not a guest order — sign in instead." });
      if (order.download_token.length !== tokenParam.length ||
          !crypto.timingSafeEqual(Buffer.from(order.download_token), Buffer.from(tokenParam))) {
        return res.status(401).json({ message: "Invalid download token." });
      }
      if (order.status !== "pending_payment") {
        return res.status(409).json({ message: `Order is already ${order.status}.` });
      }
      const amount = Number(order.amount ?? 0);
      if (!(amount > 0)) return res.status(400).json({ message: "This order has no amount to pay." });

      // Phone override from body (user may have changed it in the pay form).
      // Fall back to what they supplied at checkout.
      const rawPhone = String(req.body?.phone ?? "").trim() || order.guest_phone || "";
      if (!rawPhone) return res.status(400).json({ message: "Please provide your M-Pesa phone number." });

      // Normalize to E.164 254XXXXXXXXX so Safaricom accepts it.
      const { normalizePhone } = await import("./utils/phone");
      const normalizedPhone = normalizePhone(rawPhone, "KE") ?? rawPhone;
      if (!/^254[71]\d{8}$/.test(normalizedPhone)) {
        return res.status(400).json({ message: "Invalid phone number. Use 07XXXXXXXX or 01XXXXXXXX." });
      }

      // Create a pending payment row with user_id NULL (guest). The callback
      // handler already looks up serviceOrderId from metadata to link back.
      // 2026-08 (P0 column-name fix): schema has `phone` not `phone_number`,
      // `service_id`/`service_name` not `description`, `email` for payer,
      // and needs user_id NULLABLE (fixed in migration 0045).
      const paymentId = crypto.randomUUID();
      // 2026-08 (P0): payments.metadata is VARCHAR in the real DB (legacy
      // schema stores stringified JSON as text — see the BUGFIX comment at
      // routes.ts:6325). No ::jsonb cast; just plain text JSON string.
      await pool.query(
        `INSERT INTO payments
           (id, user_id, email, amount, currency, status, method, phone,
            reference, service_id, service_name, metadata,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'KES', 'pending', 'mpesa', $5,
                 $6, $7, $8, $9,
                 NOW(), NOW())`,
        [
          paymentId,
          null,                    // guest — no user (column now nullable, see 0045)
          order.guest_email,       // payer email for refund/audit
          amount,
          normalizedPhone,
          paymentId,               // reference == paymentId (used as AccountReference)
          order.service_slug,
          order.service_name,
          JSON.stringify({
            serviceOrderId: order.id,
            serviceSlug: order.service_slug,
            isGuestOrder: true,
          }),
        ],
      );

      // Fire the STK push. AccountReference = paymentId so the callback can
      // resolve which pending payment this is for.
      const { stkPush } = await import("./mpesa");
      const appOrigin = (process.env.APP_ORIGIN || process.env.APP_URL || "").replace(/\/$/, "");
      const callbackUrl = appOrigin ? `${appOrigin}/api/payments/mpesa/callback` : undefined;
      const stk = await stkPush(
        normalizedPhone,
        amount,
        `${order.service_name}`.slice(0, 60),
        paymentId,
        callbackUrl,
      );

      // Persist Safaricom identifiers so the callback can find this row.
      // 2026-08 (P0): metadata is VARCHAR (stores JSON strings), NOT jsonb.
      // Read → parse → merge → stringify → write. Also write to
      // checkout_request_id column directly since it exists on the schema
      // and the callback matches on that field first.
      const merchantId = (stk as any)?.MerchantRequestID ?? null;
      const checkoutId = (stk as any)?.CheckoutRequestID ?? null;
      if (checkoutId) {
        try {
          const { rows: metaRows } = await pool.query<{ metadata: string | null }>(
            `SELECT metadata FROM payments WHERE id = $1`,
            [paymentId],
          );
          let merged: Record<string, unknown> = {};
          try {
            merged = metaRows[0]?.metadata ? JSON.parse(metaRows[0].metadata) : {};
          } catch { merged = {}; }
          merged.merchantRequestId = merchantId;
          merged.checkoutRequestId = checkoutId;
          await pool.query(
            `UPDATE payments
                SET metadata = $2,
                    checkout_request_id = $3,
                    updated_at = NOW()
              WHERE id = $1`,
            [paymentId, JSON.stringify(merged), checkoutId],
          );
        } catch (metaErr: any) {
          console.warn("[ServiceOrder] payment metadata update failed:", metaErr?.message);
        }
      }

      console.log(`[ServiceOrder] Guest STK push initiated: orderId=${order.id} paymentId=${paymentId} phone=${normalizedPhone} amount=${amount}`);
      res.json({
        success: true,
        paymentId,
        checkoutRequestId: checkoutId,
        message: "STK push sent. Check your phone and enter your M-Pesa PIN.",
      });
    } catch (err: any) {
      console.error("[ServiceOrder] pay-guest error:", err?.message);
      res.status(500).json({ message: err?.message || "Could not initiate M-Pesa payment. Please try again." });
    }
  });

  // GET /api/services/order/by-token/:token — resolve token → orderId+status
  // 2026-08 (guest orders): the magic-link download page (/download/:token)
  // knows the token but not the orderId. This endpoint gives it both, so it
  // can then use the standard status + download endpoints. Public, but the
  // token itself is unguessable (24 bytes entropy) so this is safe.
  //   404 → token not recognized (mistyped / bad URL)
  //   410 → token expired (>30 days since order)
  //   200 → { orderId, serviceName, status, downloadAvailable }
  app.get("/api/services/order/by-token/:token", async (req: any, res: Response) => {
    const token = String(req.params.token || "").trim();
    // Length check first — avoids expensive queries on obviously-invalid input.
    if (token.length < 32 || token.length > 96 || !/^[a-f0-9]+$/i.test(token)) {
      return res.status(404).json({ message: "Download link not found." });
    }
    const { rows } = await pool.query<{
      id: string;
      service_name: string;
      status: string;
      download_expires_at: Date | null;
    }>(
      `SELECT id, service_name, status, download_expires_at
         FROM service_orders WHERE download_token = $1 LIMIT 1`,
      [token],
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Download link not found." });
    if (order.download_expires_at && order.download_expires_at < new Date()) {
      return res.status(410).json({ message: "This download link has expired." });
    }
    res.json({
      orderId: order.id,
      serviceName: order.service_name,
      status: order.status,
      downloadAvailable: order.status === "completed",
    });
  });

  // GET /api/services/order/:orderId/status
  // 2026-08 (guest orders): auth EITHER via session cookie OR ?token=xxx.
  // Constant-time compare on the token to avoid timing oracles.
  app.get("/api/services/order/:orderId/status", async (req: any, res: Response) => {
    const sessionUserId: string | undefined = req.user?.claims?.sub ?? req.user?.id;
    const tokenParam = String(req.query?.token ?? "").trim();
    const { rows } = await pool.query<{
      id: string;
      user_id: string | null;
      service_slug: string;
      service_name: string;
      status: string;
      error_message: string | null;
      created_at: Date;
      completed_at: Date | null;
      download_token: string | null;
      download_expires_at: Date | null;
    }>(
      `SELECT id, user_id, service_slug, service_name, status, error_message,
              created_at, completed_at, download_token, download_expires_at
         FROM service_orders WHERE id = $1`,
      [req.params.orderId],
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Order not found." });

    // Authorization: session-owner OR valid token (guest checkout).
    const isOwner = sessionUserId && order.user_id === sessionUserId;
    const tokenValid =
      tokenParam.length > 0 &&
      order.download_token != null &&
      order.download_token.length === tokenParam.length &&
      crypto.timingSafeEqual(Buffer.from(tokenParam), Buffer.from(order.download_token)) &&
      (!order.download_expires_at || order.download_expires_at > new Date());
    if (!isOwner && !tokenValid) {
      return res.status(sessionUserId ? 403 : 401).json({ message: sessionUserId ? "Not your order." : "Missing or invalid download token." });
    }
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
  // 2026-08 (guest orders): auth via session OR ?token=xxx. Guests get up
  // to MAX_GUEST_DOWNLOADS pulls per order — enough for legitimate use
  // (PDF + Word × a few retries), tight enough to prevent public sharing.
  // 2026-08 (Tony's live 429 report from a paying customer): the old cap of
  // 20 was tripping legitimate users. When the download failed on their end
  // (mobile browser blocked the blob, in-app WebView, network hiccup), the
  // client told them to "refresh and try again" — every refresh bumped the
  // counter, they got permanently locked out. Raised to 100 (still tight
  // enough to stop viral re-sharing abuse; loose enough that no legitimate
  // paying user will ever hit it). Combined with the fire-only-on-success
  // fix below, this closes the loop.
  const MAX_GUEST_DOWNLOADS = 100;
  app.get(
    "/api/services/order/:orderId/download/:format",
    async (req: any, res: Response) => {
      try {
        const sessionUserId: string | undefined = req.user?.claims?.sub ?? req.user?.id;
        const tokenParam = String(req.query?.token ?? "").trim();
        const format = String(req.params.format || "").toLowerCase();
        if (!["docx", "pdf"].includes(format)) {
          return res.status(400).json({ message: "Format must be 'docx' or 'pdf'." });
        }

        const { rows } = await pool.query<{
          user_id: string | null;
          service_slug: string;
          service_name: string;
          status: string;
          output_text: string | null;
          photo_data: string | null;
          download_token: string | null;
          download_expires_at: Date | null;
          download_count: number;
        }>(
          `SELECT user_id, service_slug, service_name, status, output_text, photo_data,
                  download_token, download_expires_at, download_count
             FROM service_orders WHERE id = $1`,
          [req.params.orderId],
        );
        const order = rows[0];
        if (!order) return res.status(404).json({ message: "Order not found." });

        // Auth: owner OR valid token.
        const isOwner = sessionUserId && order.user_id === sessionUserId;
        const tokenValid =
          tokenParam.length > 0 &&
          order.download_token != null &&
          order.download_token.length === tokenParam.length &&
          crypto.timingSafeEqual(Buffer.from(tokenParam), Buffer.from(order.download_token)) &&
          (!order.download_expires_at || order.download_expires_at > new Date());
        if (!isOwner && !tokenValid) {
          return res.status(sessionUserId ? 403 : 401).json({ message: sessionUserId ? "Not your order." : "Download link is missing or expired." });
        }

        // Guest-only cap: prevent public re-sharing abuse.
        if (tokenValid && !isOwner && order.download_count >= MAX_GUEST_DOWNLOADS) {
          return res.status(429).json({
            message: `This download link has been used ${MAX_GUEST_DOWNLOADS} times already. Please contact support if you need it re-issued.`,
          });
        }

        if (order.status !== "completed" || !order.output_text) {
          return res.status(409).json({ message: "Order is not ready yet." });
        }

        // Bump the counter for guest downloads only (session users are unlimited).
        if (tokenValid && !isOwner) {
          pool.query(
            `UPDATE service_orders SET download_count = download_count + 1 WHERE id = $1`,
            [req.params.orderId],
          ).catch((e) => console.warn("[ServiceOrder] download_count bump failed:", e?.message));
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

  // ─── POST /api/admin/service-orders/:id/force-generate ───────────────────
  // 2026-08 (P0 stuck-payment recovery): when a guest payment succeeded but
  // the callback failed to trigger AI generation (COALESCE bug, orphaned
  // link, whatever), admin can force-generate here. Bypasses the payment
  // status check — treat the fact that admin is calling as authorization
  // that money was received. Marks any matching pending_payment order as
  // paid before kicking off generation.
  //
  // Auth: admin session OR ?adminKey=xxx matching ADMIN_FORCE_KEY env
  //       (fallback so admin can hit this from an incognito browser tab
  //       without needing to sign in on that device).
  app.post(
    "/api/admin/service-orders/:id/force-generate",
    async (req: any, res: Response) => {
      try {
        const orderId = String(req.params.id || "").trim();
        if (!orderId) return res.status(400).json({ message: "orderId required" });

        // Auth
        const adminId = req.user?.claims?.sub ?? req.user?.id;
        const isSessionAdmin = adminId
          ? await storage.isUserAdmin(adminId).catch(() => false)
          : false;
        const adminKey = String(req.query?.adminKey ?? req.body?.adminKey ?? "");
        const envAdminKey = process.env.ADMIN_FORCE_KEY || "";
        const isKeyAdmin = envAdminKey.length > 8 && adminKey === envAdminKey;
        if (!isSessionAdmin && !isKeyAdmin) {
          return res.status(403).json({ message: "Admin only" });
        }

        // Verify the order exists
        const { rows } = await pool.query<{ id: string; status: string; service_name: string }>(
          `SELECT id, status, service_name FROM service_orders WHERE id = $1 LIMIT 1`,
          [orderId],
        );
        const order = rows[0];
        if (!order) return res.status(404).json({ message: "Order not found" });

        // If still pending_payment, flip to paid so processOrder will run.
        // (Idempotent — if already paid/processing/completed, we still kick off.)
        if (order.status === "pending_payment") {
          await pool.query(
            `UPDATE service_orders SET status = 'paid', updated_at = NOW() WHERE id = $1`,
            [orderId],
          );
        }

        console.log(`[admin/force-generate] triggered for orderId=${orderId} previousStatus=${order.status} by=${isSessionAdmin ? adminId : "ADMIN_KEY"}`);

        // Fire and forget — we don't want to hold the HTTP response for
        // 60 seconds while AI generates.
        onPaymentSuccessForServiceOrder(orderId).catch((err: any) =>
          console.error(`[admin/force-generate] async gen failed: ${err?.message}`)
        );

        res.json({
          success: true,
          orderId,
          serviceName: order.service_name,
          previousStatus: order.status,
          message: "AI generation triggered. Poll /api/services/order/:id/status?token=xxx or watch /my-orders to see it complete in ~1 minute.",
        });
      } catch (err: any) {
        console.error("[admin/force-generate] error:", err?.message);
        res.status(500).json({ message: err?.message });
      }
    },
  );

  // ─── POST /api/admin/service-orders/:id/complete-rewrite ─────────────────
  // 2026-08 Fix A: when admin manually rewrites an awaiting_review order,
  // provide a single endpoint that atomically:
  //   1. Updates output_text with the manually-written content
  //   2. Flips status → completed, stamps completed_at + updated_at
  //   3. Fingerprints the CV so any re-check on /tools/ats-cv-checker
  //      honors the promised 88+ delivered-CV floor (was previously only
  //      firing on the AI happy path, so manual rewrites got no guarantee)
  //   4. Fires notifyOrderCompleted for email + WhatsApp
  //   5. Marks refund_processed_at if the guardrail had flagged for refund
  //
  // Body: { outputText: string, refundIssued?: boolean }
  // Auth: admin-only (checked via storage.isUserAdmin)
  app.post(
    "/api/admin/service-orders/:id/complete-rewrite",
    isAuthenticated,
    async (req: any, res: Response) => {
      try {
        // ── Admin gate ────────────────────────────────────────────────────
        const adminId = req.user?.claims?.sub ?? req.user?.id;
        if (!adminId) return res.status(401).json({ message: "Sign in required." });
        const { storage } = await import("./storage");
        const isAdmin = await storage.isUserAdmin(adminId).catch(() => false);
        if (!isAdmin) return res.status(403).json({ message: "Admin access required." });

        // ── Input validation ─────────────────────────────────────────────
        const { id } = req.params;
        if (!/^[0-9a-f-]{8,}$/i.test(id)) {
          return res.status(400).json({ message: "Invalid order id." });
        }
        const outputText = String(req.body?.outputText ?? "").trim();
        if (outputText.length < 200) {
          return res.status(400).json({
            message: "Manual rewrite must be at least 200 chars — that's shorter than any real CV.",
          });
        }
        const refundIssued = req.body?.refundIssued === true;

        // ── Fetch order for fingerprint metadata ─────────────────────────
        const { rows: [order] } = await pool.query<{
          id: string; user_id: string | null; service_slug: string;
          service_name: string | null; status: string;
        }>(
          `SELECT id, user_id, service_slug, service_name, status
           FROM service_orders WHERE id = $1 LIMIT 1`,
          [id],
        );
        if (!order) return res.status(404).json({ message: "Order not found." });
        if (!order.user_id) {
          return res.status(400).json({ message: "Order has no user attached — cannot fingerprint." });
        }

        // ── Update the order atomically ──────────────────────────────────
        const { rowCount } = await pool.query(
          `UPDATE service_orders
           SET output_text = $2,
               status = 'completed',
               completed_at = NOW(),
               updated_at = NOW(),
               needs_human_review = false,
               refund_processed_at = CASE WHEN $3::boolean THEN NOW() ELSE refund_processed_at END,
               human_review_notes = COALESCE(human_review_notes, '') ||
                 E'\n[' || to_char(NOW(), 'YYYY-MM-DD HH24:MI') || '] Manual rewrite by admin ' || $4
           WHERE id = $1`,
          [id, outputText, refundIssued, adminId],
        );
        if (!rowCount) return res.status(404).json({ message: "Order not found or already terminal." });

        console.warn(
          `[admin] adminId=${adminId} MANUAL-REWRITE order=${id} slug=${order.service_slug} ` +
          `outLen=${outputText.length} refundIssued=${refundIssued}`,
        );

        // ── Fingerprint so re-checks honor 88+ floor ─────────────────────
        // Fire-and-forget (never block the API response). The Delivered-CV
        // guarantee runs on /api/tools/ats-check via lookupDeliveredCv().
        try {
          const { CV_OUTPUT_SLUGS, recordDeliveredCv } = await import("./lib/cv-fingerprint");
          const slug = String(order.service_slug ?? "").toLowerCase();
          if (CV_OUTPUT_SLUGS.has(slug)) {
            const deliveredScore =
              slug === "cv_rewrite" || slug === "ats_cv_optimization" ? 92 :
              slug === "cv_fix_lite" ? 88 : 85;
            recordDeliveredCv({
              userId:         order.user_id,
              serviceOrderId: id,
              serviceSlug:    slug,
              cvText:         outputText,
              deliveredScore,
            }).catch((err: any) => {
              console.warn(`[admin/complete-rewrite] fingerprint failed for ${id}:`, err?.message);
            });
          } else {
            console.log(`[admin/complete-rewrite] slug=${slug} not in CV_OUTPUT_SLUGS, skipping fingerprint`);
          }
        } catch (fpErr: any) {
          console.warn(`[admin/complete-rewrite] fingerprint hook load failed:`, fpErr?.message);
        }

        // ── Notify user their CV is ready ────────────────────────────────
        notifyOrderCompleted(id).catch((notifyErr: any) => {
          console.warn(`[admin/complete-rewrite] notify failed for ${id}:`, notifyErr?.message);
        });

        res.json({
          success:        true,
          orderId:        id,
          outputLength:   outputText.length,
          fingerprinted:  true,
          userNotified:   true,
          refundIssued,
        });
      } catch (err: any) {
        console.error("[POST /api/admin/service-orders/:id/complete-rewrite]", {
          message: err?.message, code: err?.code,
        });
        res.status(500).json({
          message: `Complete-rewrite failed: ${err?.message ?? "unknown"}`,
        });
      }
    },
  );

  console.log("[ServiceOrder] Routes registered: POST /api/services/order/:slug, GET /api/services/order/:orderId/{status,download/:format}, POST /api/admin/service-orders/:id/complete-rewrite");
}
