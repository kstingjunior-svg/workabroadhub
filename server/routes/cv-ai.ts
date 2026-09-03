// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cv-ai/generate — first callable endpoint for the new pipeline.
//
// Accepts multipart form with `cv` (PDF/DOCX) OR JSON body with `cvText`,
// plus optional `jobDescription`. Returns GenerationResult from
// server/lib/cv-ai/orchestrator.ts.
//
// Registered in server/index.ts BEFORE registerRoutes() so it's not
// swallowed by the /api catch-all. Same pattern as hub-routes and
// autoapply-routes.
// ─────────────────────────────────────────────────────────────────────────────

import type { Express, Request, Response } from "express";
import multer from "multer";
import { generateCv } from "../lib/cv-ai/orchestrator";
import { reportRejection } from "../lib/sentry";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB — same as ATS check
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

export function registerCvAiRoutes(app: Express): void {
  app.post(
    "/api/cv-ai/generate",
    upload.single("cv"),
    async (req: any, res: Response) => {
      try {
        // Auth: session-based. We don't require Pro here — the score gate
        // itself limits abuse (each generation is 5-6 LLM calls). Wire in
        // isAuthenticated + requireVerifiedForPayment upstream once the
        // paywall shape is decided.
        const userId =
          req.user?.claims?.sub ??
          req.user?.id ??
          req.session?.customUserId ??
          req.session?.userId;
        if (!userId) {
          return res.status(401).json({ message: "Sign in required." });
        }

        // ── Resolve raw CV text ────────────────────────────────────────
        // File upload takes precedence; pasted text is the fallback so the
        // "paste your CV" flow still works with no file selected.
        let cvText: string;
        if (req.file) {
          const { extractTextFromBuffer } = await import("../utils/extract-text");
          const extracted = await extractTextFromBuffer(
            req.file.buffer,
            req.file.mimetype,
            req.file.originalname,
          );
          cvText = extracted.text;
        } else if (typeof req.body?.cvText === "string") {
          cvText = req.body.cvText;
        } else {
          return res.status(400).json({
            message: "Provide either a CV file (field name 'cv') or pasted 'cvText' in the JSON body.",
          });
        }

        if (!cvText || cvText.trim().length < 150) {
          return res.status(400).json({
            message:
              "The CV text we could extract is too short (under 150 chars). " +
              "If you uploaded a scanned PDF, try re-exporting from Word as text-based PDF, or paste the text directly.",
          });
        }

        // ── Optional inputs ────────────────────────────────────────────
        const jdRaw = String(req.body?.jobDescription ?? "").trim();
        const jdText = jdRaw.length >= 40 ? jdRaw.slice(0, 8000) : undefined;
        const region = ["KE","UK","CA","AU","UAE","US","EU"].includes(req.body?.region)
          ? req.body.region
          : "KE";
        const industry = typeof req.body?.industry === "string"
          ? req.body.industry.slice(0, 60)
          : "general";

        // Optional regeneration counter — client bumps this when the user
        // clicks "try a different voice" so the style seed rotates.
        const generationN = Math.max(0, Math.min(9, Number(req.body?.generationN ?? 0) || 0));

        // ── Run the pipeline ───────────────────────────────────────────
        const t0 = Date.now();
        const result = await generateCv({
          cvText, jdText, region, industry,
          userId,                  // stable style seed
          generationN,             // rotate voice on user-requested regens
        });
        const elapsedMs = Date.now() - t0;

        console.log(
          `[cv-ai/generate] userId=${userId} score ${result.inputScore.score}→${result.outputScore.score} ` +
          `(+${result.improvement}) retries=${result.retries} in ${elapsedMs}ms`,
        );

        // 2026-09: honest response shape. If the score gate couldn't hit
        // the promised +15 lift, we surface the best attempt AND a flag
        // the client can use to show the "already-strong CV — try expert
        // review" upsell instead of pretending we hit the target.
        const hitTarget = result.improvement >= 15;

        // Collect any clarifying questions the Enricher emitted for
        // achievements it couldn't safely quantify — the client can show
        // these as an inline "make this stronger?" prompt.
        const clarifyingQuestions = (result.facts.roles as any[])
          .flatMap((r) => r.enrichedAchievements ?? [])
          .flatMap((a) => a.clarifyingQuestions ?? [])
          .slice(0, 6);

        res.json({
          ok: true,
          hitTarget,
          improvement: result.improvement,
          inputScore: result.inputScore.score,
          outputScore: result.outputScore.score,
          retries: result.retries,
          cvMarkdown: result.cvMarkdown,
          elapsedMs,
          message: hitTarget
            ? `Your CV is stronger by ${result.improvement} ATS points.`
            : `Your original CV was already strong — our AI improved it by ${result.improvement} points. For a larger lift, try our expert review.`,
          // 2026-09 (Pass 3): surface tailoring info + clarifying questions
          // so the UI can show "we tailored to N keywords" chip and inline
          // "make this bullet stronger?" prompts.
          tailoredTo: result.styleSpec.jd?.keywordsForInjection ?? [],
          voice: result.styleSpec.voice,
          structure: result.styleSpec.structure,
          clarifyingQuestions,
          generationN,
        });
      } catch (err: any) {
        // Wrong-document detection thrown by the extractor.
        if (err?.wrongDocument) {
          return res.status(422).json({
            message: err.message ?? "This does not look like a CV.",
            detected: err.detected ?? null,
            wrongDocument: true,
          });
        }
        reportRejection(err, "cv-ai/generate");
        console.error("[cv-ai/generate]", err?.message);
        res.status(500).json({
          message: "Could not generate your CV. Please try again in a moment.",
          diag: `err:${err?.name ?? "unknown"}`,
        });
      }
    },
  );

  console.log("[Server] ✓ POST /api/cv-ai/generate registered");
}
