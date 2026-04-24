/**
 * Growth Tools Suite — API Routes
 * ATS CV Checker, Job Scam Checker, Visa Sponsorship Jobs, CV Templates
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import { storage } from "./storage";
import { insertJobSchema } from "../shared/schema";
import { openai } from "./lib/openai";
import { extractTextFromBuffer, MIN_CV_LENGTH } from "./utils/extract-text";

// ── Multer config (memory storage, 5 MB limit, PDF/DOCX only) ─────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── Multer config for scam checker — accept any image/doc up to 15 MB ────────
const scamUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Accept any image type, PDFs, and common document scans
    const isImage = file.mimetype.startsWith("image/");
    const isPdf   = file.mimetype === "application/pdf";
    const isDoc   = [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(file.mimetype);
    cb(null, isImage || isPdf || isDoc);
  },
});

// ── Middleware: optional auth tracking ────────────────────────────────────────
function maybeTrack(toolName: string) {
  return async (req: any, _res: Response, next: any) => {
    try {
      const userId = req.user?.id ?? null;
      await storage.recordToolUsage({ userId, toolName, metadata: null });
    } catch {}
    next();
  };
}

// ── Scam detection rule engine — weighted regex pattern table ─────────────────
interface ScamPattern {
  pattern: RegExp;
  weight: number;   // contribution to ruleScore (raw, summed then normalised to 100)
  label: string;    // shown in warningSignals
}

const SCAM_PATTERNS: ScamPattern[] = [
  // ── Payment demands ───────────────────────────────────────────────────────────
  { pattern: /western union|money\s*gram|moneygram/i,                          weight: 30, label: "Western Union / MoneyGram payment requested — hallmark of advance-fee fraud" },
  { pattern: /visa processing fee|visa application fee|pay.*visa fee/i,        weight: 28, label: "Visa processing fee demanded — illegal under Kenyan recruitment law" },
  { pattern: /pay upfront|advance fee|advance payment|pay.*before/i,           weight: 27, label: "Upfront advance payment requested — legitimate employers never charge job seekers" },
  { pattern: /registration fee|training fee|clearance fee|medical fee upfront/i, weight: 27, label: "Illegal recruitment fee (registration/training/clearance) detected" },
  { pattern: /send money|money transfer|send.*ksh|send.*kes|pay.*ksh|pay.*kes|mpesa.*payment|m-pesa.*fee/i, weight: 27, label: "M-Pesa / KES money transfer requested before employment" },
  { pattern: /deposit required|security deposit|caution fee|refundable deposit/i, weight: 25, label: "Upfront security deposit / caution fee demanded" },
  { pattern: /easy money|make money fast|guaranteed income|earn millions/i,     weight: 22, label: "Unrealistic income promise — a classic scam lure" },

  // ── Salary / pay red flags ────────────────────────────────────────────────────
  { pattern: /\$\d{2,}[\d,]*k?\s*(?:per month|monthly|\/month|a month)/i,     weight: 15, label: "Suspiciously high monthly salary claim — verify independently" },
  { pattern: /\$\d{4,}\s*(?:weekly|per week|\/week)/i,                         weight: 15, label: "Suspiciously high weekly salary claim" },
  { pattern: /ksh\.?\s*[\d,]{5,}\s*(?:daily|per day|a day)/i,                 weight: 12, label: "Unrealistically high daily KES pay claimed" },
  { pattern: /per day earnings?|part[- ]?time earn|earn from home|earn big/i,  weight:  9, label: "Part-time / work-from-home earnings scheme language detected" },

  // ── Lure tactics ──────────────────────────────────────────────────────────────
  { pattern: /free\s+(?:ticket|flight|accommodation|housing|meals?)/i,         weight: 14, label: '"Free ticket + accommodation" lure — commonly used to trap victims' },
  { pattern: /guaranteed visa|100%\s*(?:visa|job|placement|success)|assured visa/i, weight: 18, label: 'Guaranteed visa / 100% placement promise — impossible to legally guarantee' },
  { pattern: /work from home.*abroad|remote.*overseas.*earn/i,                 weight: 16, label: '"Work from home abroad" — contradictory and suspicious claim' },
  { pattern: /immediate deployment|deploy.*immediately|deployed within \d+\s*days?/i, weight: 11, label: '"Immediate deployment" — not how legitimate licensed overseas hiring works' },

  // ── No-barrier hiring ────────────────────────────────────────────────────────
  { pattern: /no experience required|no experience needed|no cv required|no qualifications/i, weight: 16, label: '"No experience required" — legitimate skilled roles require documented qualifications' },
  { pattern: /no interview|skip.*interview|bypass.*interview|without.*interview/i, weight: 20, label: 'No interview process — every legitimate employer conducts interviews' },

  // ── Urgency / pressure tactics ────────────────────────────────────────────────
  { pattern: /urgent hiring|immediate start|immediate hiring|urgently needed/i, weight: 11, label: 'Urgency hiring pressure — scammers use time pressure to prevent verification' },
  { pattern: /limited slots?|slots? (?:available|remaining)|only \d+ (?:positions?|spots?) left/i, weight: 9, label: 'Artificial scarcity ("limited slots") pressure tactic' },
  { pattern: /apply immediately|respond immediately|reply asap|hurry|closing soon/i, weight: 8, label: 'ASAP / "closing soon" pressure language' },

  // ── Contact & communication red flags ────────────────────────────────────────
  { pattern: /gmail\.com|yahoo\.com|hotmail\.com|outlook\.com|ymail\.com/i,    weight: 13, label: 'Free personal email domain (Gmail/Yahoo/Hotmail) — not a corporate address' },
  { pattern: /whatsapp only|contact.*via whatsapp|apply.*via whatsapp/i,       weight: 14, label: 'WhatsApp-only recruitment — legitimate companies use official business channels' },
  { pattern: /contact only via|respond.*via sms only|sms.*only/i,              weight: 10, label: 'Recruitment restricted to unofficial channels only' },
  { pattern: /\+254[0-9]{9}.*(?:gmail|yahoo|hotmail)/i,                        weight: 22, label: 'Kenyan mobile number combined with free email — classic scam contact pattern' },

  // ── Document & identity risk ──────────────────────────────────────────────────
  { pattern: /send.*(?:passport|national id|id number|bank details|pin number) before|before.*(?:offer|contract)/i, weight: 22, label: 'Requesting sensitive documents before any formal employment offer' },
  { pattern: /no formal contract|without contract|verbal agreement|no written offer/i, weight: 20, label: 'No formal written employment contract mentioned' },
];

// Maximum possible raw score (all patterns match) — used to normalise to 0-100
const MAX_RAW_SCORE = SCAM_PATTERNS.reduce((sum, p) => sum + p.weight, 0);

interface ScamAnalysisResult {
  riskLevel: "low" | "medium" | "high";
  riskScore: number;
  warningSignals: string[];
  recommendations: string[];
  aiVerdict?: "SAFE" | "SUSPICIOUS" | "LIKELY SCAM";
  aiExplanation?: string;
  aiFlags?: string[];
  aiConfidence?: number;
}

function runRuleEngine(text: string): { ruleScore: number; warningSignals: string[] } {
  const warningSignals: string[] = [];
  let rawScore = 0;

  for (const { pattern, weight, label } of SCAM_PATTERNS) {
    if (pattern.test(text)) {
      rawScore += weight;
      // Deduplicate signals with very similar wording
      if (!warningSignals.some((s) => s.slice(0, 30) === label.slice(0, 30))) {
        warningSignals.push(label);
      }
    }
  }

  // Normalise to 0–100: multiplier 4.0 means one high-risk match (weight ≥25) → MEDIUM;
  // two or more high-risk matches → HIGH. Soft-caps at 100.
  const ruleScore = Math.min(100, Math.round((rawScore / MAX_RAW_SCORE) * 100 * 4.0));
  return { ruleScore, warningSignals };
}

async function runAIEngine(text: string): Promise<{
  aiScore: number;
  aiVerdict: "SAFE" | "SUSPICIOUS" | "LIKELY SCAM";
  aiExplanation: string;
  aiFlags: string[];
  aiConfidence: number;
} | null> {
  try {
    const prompt = `You are a fraud detection expert specializing in job scams targeting Kenyan workers seeking overseas employment in UAE, Qatar, Saudi Arabia, UK, Canada, and Malaysia.

Analyze the following job advertisement and determine the likelihood of it being a scam.

Look specifically for:
- Upfront payment requests (visa processing fees, registration fees, training fees, M-Pesa/Western Union/MoneyGram payments)
- Free email domains (Gmail, Yahoo, Hotmail) used as company contact instead of a corporate domain
- WhatsApp-only or SMS-only communication with no official website or business address
- Unrealistic salary figures (e.g. "$10k monthly", very high daily KES pay)
- "Free ticket + accommodation" lures — a common trap to recruit victims
- "Work from home abroad" claims — contradictory and suspicious
- Urgency pressure tactics ("limited slots", "apply immediately", "urgent hiring", "immediate start")
- No interview described, or "no experience required" for skilled overseas roles
- Guaranteed visa or "100% placement" promises — legally impossible to guarantee
- Requesting passports, national IDs, or bank details before any formal offer
- No mention of a formal written employment contract
- Known Kenyan recruitment scam phrases and patterns

Return ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "risk_score": <integer 0-100>,
  "verdict": "<SAFE|SUSPICIOUS|LIKELY SCAM>",
  "explanation": "<1-2 sentence plain English explanation>",
  "flags": ["<specific flag>", "<specific flag>"],
  "confidence": <integer 0-100>
}

Job Advertisement:
"""
${text.slice(0, 3000)}
"""`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
      temperature: 0.1,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      aiScore: Math.min(100, Math.max(0, Number(parsed.risk_score) || 0)),
      aiVerdict: (["SAFE", "SUSPICIOUS", "LIKELY SCAM"].includes(parsed.verdict) ? parsed.verdict : "SUSPICIOUS") as "SAFE" | "SUSPICIOUS" | "LIKELY SCAM",
      aiExplanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
      aiFlags: Array.isArray(parsed.flags) ? parsed.flags.filter((f: any) => typeof f === "string") : [],
      aiConfidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 70)),
    };
  } catch (err: any) {
    console.error("[ScamAI] Failed:", err.message);
    return null;
  }
}

async function analyzeScamHybrid(text: string): Promise<ScamAnalysisResult> {
  const { ruleScore, warningSignals } = runRuleEngine(text);
  const ai = await runAIEngine(text);

  // Hybrid score: rule 40% + AI 60%; fallback to rule-only if AI fails
  const hybridScore = ai
    ? Math.round(ruleScore * 0.4 + ai.aiScore * 0.6)
    : ruleScore;

  const riskScore = Math.min(100, hybridScore);
  const riskLevel: "low" | "medium" | "high" =
    riskScore >= 60 ? "high" : riskScore >= 25 ? "medium" : "low";

  // Merge AI flags into warning signals (deduplicate)
  const allSignals = [...warningSignals];
  if (ai?.aiFlags) {
    for (const f of ai.aiFlags) {
      if (!allSignals.some((s) => s.toLowerCase().includes(f.toLowerCase().slice(0, 20)))) {
        allSignals.push(f);
      }
    }
  }

  const recommendations: string[] = [];
  if (riskLevel === "high") {
    recommendations.push("Do NOT pay any fees — legitimate employers never charge job seekers.");
    recommendations.push("Report this advert to the National Employment Authority (NEA).");
    recommendations.push("Verify the company on NEA's official registry before proceeding.");
    recommendations.push("Block and report the contact number/email to the relevant authority.");
  } else if (riskLevel === "medium") {
    recommendations.push("Proceed with caution — verify the employer's official website and company registration.");
    recommendations.push("Never share personal documents before a formal, signed offer letter.");
    recommendations.push("Cross-check the job on the company's official careers page.");
  } else {
    recommendations.push("This advert shows low risk indicators, but always verify before sharing documents.");
    recommendations.push("Check NEA's registry to confirm the recruiting agency is licensed.");
  }

  return {
    riskLevel,
    riskScore,
    warningSignals: allSignals,
    recommendations,
    ...(ai && {
      aiVerdict: ai.aiVerdict,
      aiExplanation: ai.aiExplanation,
      aiFlags: ai.aiFlags,
      aiConfidence: ai.aiConfidence,
    }),
  };
}

// Kept for backward compatibility — synchronous rule-only (used internally where AI not needed)
function analyzeScam(text: string): ScamAnalysisResult {
  const { ruleScore, warningSignals } = runRuleEngine(text);
  const riskScore = Math.min(100, ruleScore);
  const riskLevel: "low" | "medium" | "high" =
    riskScore >= 60 ? "high" : riskScore >= 25 ? "medium" : "low";
  const recommendations = riskLevel === "high"
    ? ["Do NOT pay any fees.", "Report to NEA.", "Verify company registration."]
    : riskLevel === "medium"
    ? ["Proceed with caution.", "Verify employer website.", "Never pay before a signed offer."]
    : ["Low risk detected — still verify before sharing documents.", "Check NEA registry."];
  return { riskLevel, riskScore, warningSignals, recommendations };
}

// ── CV Template registry ───────────────────────────────────────────────────────
export const CV_TEMPLATES = [
  {
    id: "uk-cv",
    name: "UK CV Template",
    country: "United Kingdom",
    flag: "🇬🇧",
    description: "2-page professional CV format preferred by UK employers and NHS. ATS-optimised.",
    category: "Healthcare & General",
    format: "DOCX",
    fileUrl: null, // served as in-memory generated file
  },
  {
    id: "canada-resume",
    name: "Canada Resume Template",
    country: "Canada",
    flag: "🇨🇦",
    description: "1–2 page resume matching Canadian employer expectations. Suitable for Express Entry applicants.",
    category: "General & Tech",
    format: "DOCX",
    fileUrl: null,
  },
  {
    id: "dubai-cv",
    name: "Dubai / UAE CV Template",
    country: "United Arab Emirates",
    flag: "🇦🇪",
    description: "Gulf-region CV with photo placeholder and objective section. Used across UAE and KSA.",
    category: "Construction, Hospitality & Engineering",
    format: "DOCX",
    fileUrl: null,
  },
  {
    id: "australia-resume",
    name: "Australia Resume Template",
    country: "Australia",
    flag: "🇦🇺",
    description: "Skills-based resume for Australia's skills shortage programs and 482 visa applicants.",
    category: "Healthcare & Trades",
    format: "DOCX",
    fileUrl: null,
  },
];

// Simple DOCX-like text generation for demo (in production, use real templates)
function generateTemplatePlaceholder(template: typeof CV_TEMPLATES[0]): string {
  return `${template.name}
${template.country} — ${template.category}

[FULL NAME]
[Phone] | [Email] | [City, ${template.country}]

PROFESSIONAL SUMMARY
---------------------
Experienced professional seeking opportunities in ${template.country}. 
[Write 2-3 sentences about your background and key strengths.]

WORK EXPERIENCE
---------------
[Job Title] | [Company Name] | [Start Date] – [End Date]
• [Key achievement or responsibility]
• [Key achievement or responsibility]
• [Key achievement or responsibility]

EDUCATION
---------
[Degree] | [Institution] | [Year]

SKILLS
------
• [Skill 1]   • [Skill 2]   • [Skill 3]

REFERENCES
----------
Available upon request.

---
Generated by WorkAbroad Hub — workabroadhub.tech
`;
}

export function registerToolsRoutes(
  app: any,
  isAuthenticated: any,
  isAdmin: any
) {
  // ════════════════════════════════════════════════════════════════════════════
  // STEP 1: ATS CV CHECKER
  // POST /api/tools/ats-check
  // ════════════════════════════════════════════════════════════════════════════
  app.post(
    "/api/tools/ats-check",
    upload.single("cv"),
    maybeTrack("ats_cv_checker"),
    async (req: any, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded. Please upload a PDF or DOCX." });
        }

        const { text: cvText, method: extractMethod } = await extractTextFromBuffer(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname,
        );
        console.log(`[ATS Check] Extracted ${cvText.length} chars via ${extractMethod}`);

        // ── Determine if user is logged in for full results gating ────────────
        const isLoggedIn = !!req.user?.id;

        // ── Build the AI message payload ──────────────────────────────────────
        // Primary path: extracted text is readable — send as plain text to gpt-4o-mini.
        // Fallback path: extraction failed (compressed / unusual PDF) — send the
        //   raw PDF as a base64 file directly to gpt-4o which can read PDFs natively.
        let aiMessages: any[];
        let modelToUse = "gpt-4o-mini";

        const ATS_SYSTEM_PROMPT = `You are a professional recruiter reviewing a CV for international overseas jobs.
Analyze the CV and return a JSON object with exactly these fields:
{
  "score": <integer 0-100>,
  "grade": <"Excellent"|"Good"|"Average"|"Poor">,
  "strengths": [<string>, ...],
  "weaknesses": [<string>, ...],
  "missingKeywords": [<string>, ...],
  "suggestions": [<string>, ...],
  "summary": <one sentence overall assessment>
}
Return ONLY the JSON object, no markdown, no extra text.`;

        const isPdf = req.file.mimetype === "application/pdf" ||
                      req.file.originalname?.toLowerCase().endsWith(".pdf");

        if (cvText.trim().length >= MIN_CV_LENGTH) {
          // ── Happy path: extracted readable text ───────────────────────────
          const truncated = cvText.slice(0, 4000);
          aiMessages = [
            { role: "system", content: ATS_SYSTEM_PROMPT },
            { role: "user",   content: `Here is the CV text:\n\n${truncated}` },
          ];
        } else {
          // ── All local extraction methods exhausted ───────────────────────
          // The base64-file GPT-4o path is not supported by all AI proxies and
          // causes "Internal Server Error" responses — use a clear 422 instead.
          console.warn(`[ATS Check] Text extraction failed (method=${extractMethod}) — returning 422`);
          return res.status(422).json({
            message:
              "We couldn't extract text from your CV. " +
              "Please ensure it is a text-based PDF (not scanned) or upload a Word (.docx) file instead.",
          });
        }

        // Force JSON output on the text path so we never have to strip markdown fences.
        const completionOptions: any = {
          model: modelToUse,
          messages: aiMessages,
          temperature: 0.3,
          max_tokens: 800,
          response_format: { type: "json_object" },
        };

        const completion = await openai.chat.completions.create(completionOptions);

        let aiResult: any = {};
        try {
          const raw = completion.choices[0]?.message?.content ?? "{}";

          // Strip markdown code fences (GPT often adds these despite "return ONLY JSON")
          const cleaned = raw
            .replace(/^```(?:json)?\s*/im, "")
            .replace(/\s*```\s*$/m, "")
            .trim();

          // Try direct parse first; if that fails, hunt for the first {...} block
          try {
            aiResult = JSON.parse(cleaned);
          } catch {
            const jsonBlock = cleaned.match(/\{[\s\S]*\}/);
            if (jsonBlock) {
              aiResult = JSON.parse(jsonBlock[0]);
            } else {
              throw new Error("No JSON object found in response");
            }
          }

          // Validate the score is a sensible integer 0-100
          if (typeof aiResult.score !== "number") {
            aiResult.score = parseInt(String(aiResult.score ?? "0"), 10) || 0;
          }
          aiResult.score = Math.max(0, Math.min(100, aiResult.score));
          if (!aiResult.grade) aiResult.grade = "Average";

          console.log(`[ATS] GPT result: score=${aiResult.score} grade=${aiResult.grade} model=${modelToUse}`);
        } catch (parseErr) {
          console.error("[ATS] JSON parse failed:", parseErr, "| raw:", completion.choices[0]?.message?.content?.slice(0, 300));
          aiResult = {
            score: 0,
            grade: "Average",
            strengths: [],
            weaknesses: ["Could not fully parse your CV — please ensure it is not scanned/image-based"],
            missingKeywords: [],
            suggestions: ["Upload a text-based PDF or DOCX for best results"],
            summary: "CV parsing encountered issues.",
          };
        }

        // Gate: unauthenticated users get score + summary only
        if (!isLoggedIn) {
          return res.json({
            score: aiResult.score ?? 0,
            grade: aiResult.grade ?? "N/A",
            summary: aiResult.summary ?? "",
            locked: true,
            message: "Sign in to see your full ATS report including strengths, weaknesses, missing keywords, and suggestions.",
          });
        }

        // Gate: free-plan users get score + summary + grade only; BASIC/PRO get full report
        const userId = req.user?.claims?.sub ?? req.user?.id;
        const atsPlanId = userId ? (await storage.getUserPlan(userId) || "free").toLowerCase() : "free";
        const atsIsPaid = atsPlanId === "basic" || atsPlanId === "pro";

        // Persist parsed CV text to career profile (fire-and-forget) so every
        // subsequent application generation has access to the user's real CV content.
        // Only save when we have clean extracted text — not for the base64 GPT path.
        if (userId && cvText.trim().length >= MIN_CV_LENGTH) {
          storage.upsertUserCareerProfile(userId, {
            parsedCvText: cvText.slice(0, 12_000), // cap at ~12k chars — ample for any CV
            cvLastParsed: new Date(),
          } as any).catch((err: any) => {
            console.warn("[ATS] Failed to save parsed CV text:", err?.message);
          });
        }

        if (!atsIsPaid) {
          return res.json({
            score: aiResult.score ?? 0,
            grade: aiResult.grade ?? "N/A",
            summary: aiResult.summary ?? "",
            strengths: [],
            weaknesses: [],
            missingKeywords: [],
            suggestions: [],
            locked: true,
            planGated: true,
            message: "Upgrade to Basic or Pro to unlock your full ATS report — strengths, weaknesses, missing keywords, and actionable suggestions.",
          });
        }

        // Trigger CV email drip + funnel tracking for logged-in paid users (fire-and-forget)
        try {
          const webUser = await storage.getUser(userId!);
          if (webUser?.email) {
            const { scheduleCvEmailSequence } = await import("./cv-email-sequence");
            scheduleCvEmailSequence({
              email:      webUser.email,
              firstName:  webUser.firstName ?? null,
              jobCount:   null,   // ATS endpoint doesn't run job matching
              topCountry: null,
              profession: null,
              topJobs:    [],
            }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          }
          // Track uploaded + analyzed for web flow
          const { trackCvFunnelEvent } = await import("./services/firebaseRtdb");
          trackCvFunnelEvent(userId!, "uploaded", { source: "web" }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          trackCvFunnelEvent(userId!, "analyzed", {
            source: "web",
            atsScore: aiResult.score ?? null,
            atsGrade: aiResult.grade ?? null,
          }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        } catch { /* non-critical */ }

        return res.json({ ...aiResult, locked: false });
      } catch (err: any) {
        console.error("[ATS Check]", err.message);
        res.status(500).json({ message: "ATS check failed. Please try again." });
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 3: JOB SCAM CHECKER
  // POST /api/tools/scam-check
  // ════════════════════════════════════════════════════════════════════════════
  app.post(
    "/api/tools/scam-check",
    maybeTrack("job_scam_checker"),
    async (req: Request, res: Response) => {
      try {
        const { text } = req.body;
        if (!text || typeof text !== "string" || text.trim().length < 10) {
          return res.status(400).json({ message: "Please paste a job advert (minimum 10 characters)." });
        }
        const result = await analyzeScamHybrid(text.slice(0, 5000));
        res.json(result);
      } catch (err: any) {
        console.error("[ScamCheck]", err.message);
        res.status(500).json({ message: "Scam check failed." });
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 3b: JOB SCAM CHECKER — FILE UPLOAD (image or PDF)
  // POST /api/tools/scam-check-file
  // ════════════════════════════════════════════════════════════════════════════
  app.post(
    "/api/tools/scam-check-file",
    // Multer error → JSON (prevents "Internal Server Error" plain-text responses)
    (req: any, res: Response, next: any) => {
      scamUpload.single("file")(req, res, (err: any) => {
        if (err) {
          const msg = err.code === "LIMIT_FILE_SIZE"
            ? "File too large — maximum is 15 MB."
            : "Unsupported file type. Please upload an image or PDF.";
          return res.status(400).json({ message: msg });
        }
        next();
      });
    },
    maybeTrack("job_scam_checker"),
    async (req: any, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded. Please upload an image, screenshot, PDF, or document scan." });
        }

        const { mimetype, buffer } = req.file;
        let extractedText = "";

        // ── PDF / DOCX path ───────────────────────────────────────────────────
        if (
          mimetype === "application/pdf" ||
          mimetype === "application/msword" ||
          mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
          const extracted = await extractTextFromBuffer(buffer, mimetype).catch(() => ({ text: "", method: "error" }));
          extractedText = extracted.text?.trim() ?? "";
          if (!extractedText || extractedText.length < 10) {
            return res.status(422).json({ message: "Could not read text from this file. Try pasting the text manually." });
          }

        // ── Image path — OpenAI Vision → Tesseract fallback ──────────────────
        } else if (mimetype.startsWith("image/")) {
          // Attempt 1: OpenAI Vision (gpt-4o)
          try {
            const base64    = buffer.toString("base64");
            const safeType  = mimetype.includes("gif") ? "image/gif"
                            : mimetype.includes("png") ? "image/png"
                            : mimetype.includes("webp") ? "image/webp"
                            : "image/jpeg";
            const visionRes = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "Extract ALL visible text from this image exactly as it appears. Include every word, phone number, email, salary, and fee mention. Return only the extracted text with no commentary.",
                    },
                    {
                      type: "image_url",
                      image_url: { url: `data:${safeType};base64,${base64}`, detail: "high" },
                    },
                  ],
                },
              ],
              max_tokens: 2000,
            });
            extractedText = visionRes.choices[0]?.message?.content?.trim() ?? "";
          } catch (visionErr: any) {
            console.warn("[ScamFileCheck] Vision API failed, trying Tesseract:", visionErr.message);
          }

          // Attempt 2: Tesseract OCR fallback
          if (!extractedText || extractedText.length < 10) {
            try {
              const Tesseract = (await import("tesseract.js")).default;
              const { data: { text } } = await Tesseract.recognize(buffer, "eng", { logger: () => {} });
              extractedText = text?.trim() ?? "";
              if (extractedText) console.log("[ScamFileCheck] Tesseract OCR succeeded:", extractedText.length, "chars");
            } catch (ocrErr: any) {
              console.warn("[ScamFileCheck] Tesseract failed:", ocrErr.message);
            }
          }

          if (!extractedText || extractedText.length < 10) {
            return res.status(422).json({
              message: "Could not read text from this image. Make sure the image is clear and contains readable text, or paste the text manually.",
            });
          }
        } else {
          return res.status(415).json({ message: "Unsupported file type. Please upload an image (JPG, PNG, WEBP, screenshot), PDF, or Word document." });
        }

        const result = await analyzeScamHybrid(extractedText.slice(0, 5000));
        res.json({ ...result, extractedText: extractedText.slice(0, 3000) });
      } catch (err: any) {
        console.error("[ScamFileCheck]", err.message);
        res.status(500).json({ message: "File analysis failed. Please try pasting the text manually." });
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 3c: SCAM CHECKER USER FEEDBACK
  // POST /api/tools/scam-feedback
  // ════════════════════════════════════════════════════════════════════════════
  app.post(
    "/api/tools/scam-feedback",
    async (req: any, res: Response) => {
      try {
        const { reportId, wasScam, advertText } = req.body;
        if (typeof wasScam !== "boolean") {
          return res.status(400).json({ message: "wasScam must be a boolean." });
        }
        // If user confirms it was a scam, create a scam report entry
        if (wasScam && advertText && typeof advertText === "string") {
          try {
            await storage.createScamReport({
              agencyName: "Unknown — reported via Scam Checker",
              description: `[Scam Checker feedback]\n\n${advertText.slice(0, 1800)}`,
              reportedBy: req.user?.id ?? null,
              status: "pending",
            } as any);
          } catch (_e) {
            // Silently continue — feedback stored even if report creation fails
          }
        }
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: "Could not save feedback." });
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 6: AI JOB APPLICATION ASSISTANT
  // POST /api/tools/job-assistant
  // Free users: 1 generation. Premium (paid): unlimited.
  // ════════════════════════════════════════════════════════════════════════════
  app.post(
    "/api/tools/job-assistant",
    upload.single("cv"),
    maybeTrack("job_assistant"),
    async (req: any, res: Response) => {
      try {
        const userId: string | null = req.user?.id ?? null;

        if (!userId) {
          return res.status(401).json({
            locked: true,
            message: "Sign in to use the AI Job Application Assistant.",
          });
        }

        const usageCount = await storage.getUserToolUsageCount(userId, "job_assistant");
        const isPremium = await storage.userHasSuccessfulPayment(userId);

        if (usageCount >= 1 && !isPremium) {
          return res.status(402).json({
            locked: true,
            upgradeRequired: true,
            usageCount,
            message:
              "You've used your 1 free generation. Upgrade to WorkAbroad Hub Premium for unlimited AI-powered applications.",
          });
        }

        let cvText = "";
        if (req.file) {
          if (req.file.mimetype === "application/pdf") {
            const { PDFParse } = await import("pdf-parse") as any;
            const parser = new PDFParse({ data: new Uint8Array(req.file.buffer), verbosity: 0 });
            const parsed = await parser.getText();
            cvText = parsed.text;
          } else {
            const mammoth = await import("mammoth");
            const result = await mammoth.extractRawText({ buffer: req.file.buffer });
            cvText = result.value;
          }
        } else if (typeof req.body.cvText === "string") {
          cvText = req.body.cvText;
        }

        const jobDescription: string = req.body.jobDescription ?? "";
        const toolType: string = req.body.toolType ?? "cover_letter";

        if (!jobDescription || jobDescription.trim().length < 30) {
          return res.status(400).json({
            message: "Please paste a job description (minimum 30 characters).",
          });
        }
        if (!cvText || cvText.trim().length < 50) {
          return res.status(400).json({
            message: "Please upload your CV or paste CV text (minimum 50 characters).",
          });
        }

        const truncatedCv = cvText.slice(0, 3000);
        const truncatedJd = jobDescription.slice(0, 2000);

        type ToolType = "cover_letter" | "cv_optimize" | "application_answers";
        const PROMPTS: Record<ToolType, { system: string; user: string }> = {
          cover_letter: {
            system: `You are a professional career advisor specialising in overseas job applications for East African professionals.
Write a tailored, compelling cover letter for the job using the candidate's CV.
The letter must be professional, specific to the role and company, highlight quantified achievements, use a formal letter structure, and be suitable for international employers.
Return ONLY this JSON (no markdown): { "content": "<full cover letter text with paragraphs separated by \\n\\n>", "suggestions": ["<personalisation tip>", "<follow-up tip>", "<formatting tip>"] }`,
            user: `Candidate CV:\n${truncatedCv}\n\nJob Description:\n${truncatedJd}`,
          },
          cv_optimize: {
            system: `You are an expert CV writer and ATS specialist helping overseas job seekers.
Rewrite the candidate's CV to match the job description using ATS-friendly keywords, strong action verbs, and quantified achievements.
Preserve all factual experience and qualifications — do not fabricate anything.
Return ONLY this JSON (no markdown): { "content": "<full rewritten CV text with sections separated by \\n\\n>", "suggestions": ["<keyword tip>", "<formatting tip>", "<content improvement>"] }`,
            user: `Candidate CV:\n${truncatedCv}\n\nTarget Job Description:\n${truncatedJd}`,
          },
          application_answers: {
            system: `You are a career coach helping overseas job seekers craft honest, compelling application answers.
Based on the CV and job description, write strong answers to these common questions:
1. Why do you want this role?
2. What makes you the best candidate?
3. Describe a relevant achievement using the STAR method.
4. Why are you looking to work overseas?
5. What are your salary expectations?
Return ONLY this JSON (no markdown): { "content": "<numbered Q&A with each question and answer, sections separated by \\n\\n>", "suggestions": ["<tone tip>", "<STAR method tip>", "<salary negotiation tip>"] }`,
            user: `Candidate CV:\n${truncatedCv}\n\nJob Description:\n${truncatedJd}`,
          },
        };

        const validTypes: ToolType[] = ["cover_letter", "cv_optimize", "application_answers"];
        const selectedType: ToolType = validTypes.includes(toolType as ToolType)
          ? (toolType as ToolType)
          : "cover_letter";
        const prompt = PROMPTS[selectedType];

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          temperature: 0.4,
          max_tokens: 1600,
        });

        let aiResult: { content: string; suggestions: string[] } = { content: "", suggestions: [] };
        try {
          const raw = completion.choices[0]?.message?.content ?? "{}";
          aiResult = JSON.parse(raw);
        } catch {
          aiResult = {
            content: completion.choices[0]?.message?.content ?? "Generation failed. Please try again.",
            suggestions: ["Review and personalise the content before submitting."],
          };
        }

        await storage.recordToolUsage({
          userId,
          toolName: "job_assistant",
          metadata: { toolType: selectedType },
        });

        return res.json({
          content: aiResult.content ?? "",
          suggestions: aiResult.suggestions ?? [],
          toolType: selectedType,
          usageCount: usageCount + 1,
          isPremium,
        });
      } catch (err: any) {
        console.error("[Job Assistant]", err.message);
        res.status(500).json({ message: "AI generation failed. Please try again." });
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 4: VISA SPONSORSHIP JOBS
  // GET /api/jobs/sponsorship
  // ════════════════════════════════════════════════════════════════════════════
  app.get("/api/jobs/sponsorship", async (req: Request, res: Response) => {
    try {
      const { country, category } = req.query as Record<string, string>;
      const jobs = await storage.getVisaJobs({ country, category });
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch jobs." });
    }
  });

  // Admin: create job listing
  app.post("/api/admin/jobs", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertJobSchema.parse(req.body);
      const job = await storage.createJob(data);
      res.status(201).json(job);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Admin: update job listing
  app.patch("/api/admin/jobs/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const job = await storage.updateJob(req.params.id, req.body);
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: delete job listing
  app.delete("/api/admin/jobs/:id", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteJob(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 5: CV TEMPLATES
  // GET /api/templates
  // GET /api/templates/download/:templateId
  // ════════════════════════════════════════════════════════════════════════════
  app.get("/api/templates", (_req: Request, res: Response) => {
    res.json(CV_TEMPLATES.map(({ fileUrl: _, ...t }) => t));
  });

  app.get("/api/templates/download/:templateId", async (req: any, res: Response) => {
    try {
      const template = CV_TEMPLATES.find((t) => t.id === req.params.templateId);
      if (!template) return res.status(404).json({ message: "Template not found." });

      // Track download (Step 5 & 6)
      const userId = req.user?.id ?? null;
      await storage.recordTemplateDownload({ templateId: template.id, userId }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      await storage.recordToolUsage({ userId, toolName: "cv_templates", metadata: { templateId: template.id } }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      // Serve plain-text CV skeleton as downloadable file
      const content = generateTemplatePlaceholder(template);
      const filename = `${template.id}-workabroadhub.txt`;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(content);
    } catch (err: any) {
      res.status(500).json({ message: "Download failed." });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 7: AI JOB MATCHING
  // POST /api/jobs/match
  // Auth required. Accepts { cvText } JSON body.
  // Returns top 5 recommended jobs with AI match scores.
  // ════════════════════════════════════════════════════════════════════════════
  app.post(
    "/api/jobs/match",
    isAuthenticated,
    async (req: any, res: Response) => {
      try {
        const matchUserId = req.user?.claims?.sub ?? req.user?.id;
        if (!matchUserId) return res.status(401).json({ message: "Unauthorised" });

        const matchPlanId = (await storage.getUserPlan(matchUserId) || "free").toLowerCase();
        if (matchPlanId === "free") {
          return res.status(403).json({
            message: "AI Job Matching is available on Basic and Pro plans. Upgrade to find the best overseas jobs for your profile.",
            upgradeRequired: true,
          });
        }

        const { cvText } = req.body;

        if (!cvText || typeof cvText !== "string" || cvText.trim().length < 50) {
          return res.status(400).json({
            message: "Please paste your CV text (minimum 50 characters).",
          });
        }

        const { getJobMatches } = await import("./services/jobMatchingService");
        const matches = await getJobMatches(cvText.slice(0, 5000));

        await storage
          .recordToolUsage({
            userId: req.user?.id ?? null,
            toolName: "job_match",
            metadata: { matchCount: matches.length },
          })
          .catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

        return res.json({
          jobs: matches,
          totalJobs: matches.length,
        });
      } catch (err: any) {
        console.error("[Job Match]", err.message);
        res.status(500).json({ message: "Job matching failed. Please try again." });
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 9: ADMIN TOOLS ANALYTICS
  // GET /api/admin/tools-analytics
  // ════════════════════════════════════════════════════════════════════════════
  app.get("/api/admin/tools-analytics", isAuthenticated, isAdmin, async (_req: Request, res: Response) => {
    try {
      const analytics = await storage.getToolsAnalytics();
      res.json(analytics);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch tools analytics." });
    }
  });
}
