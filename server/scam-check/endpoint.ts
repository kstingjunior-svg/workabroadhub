/**
 * endpoint.ts — POST /api/tools/job-scam-check
 *
 * Multi-input: accepts either a text field ("chat", "email", "jobAd") OR an
 * image file OR both. At least one must be present. Rate-limited via the
 * global aiHotPathLimiter (see server/routes.ts).
 */

import type { Express, Request, Response } from "express";
import { requireToolCredit } from "../tools/tool-pay";
import { createToolScanJob, markToolScanJobDone, markToolScanJobError } from "../tools/tool-scan-jobs";
import multer from "multer";
import rateLimit from "express-rate-limit";

// 2026-08 (Tony): accept PDF + Word too — WhatsApp/Facebook job forwards
// often arrive as PDF attachments (the recruiter's "official offer" that
// turned out to be a template scam). PDF/Word are extracted to text and
// merged into the text-analysis path.
const ACCEPTED_MIMES = new Set<string>([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ACCEPTED_MIMES.has(file.mimetype));
  },
});

const scamLimiter = rateLimit({
  windowMs: 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "You're going a bit fast — please wait a minute and try again." },
});

export function registerScamCheckRoute(app: Express): void {
  app.post(
    "/api/tools/job-scam-check",
    scamLimiter,
    requireToolCredit("job_scam_check"),
    (req: any, res, next) => upload.single("file")(req, res, (err: any) => {
      if (!err) return next();
      const isSize = err?.code === "LIMIT_FILE_SIZE";
      return res.status(400).json({
        message: isSize
          ? "That file is larger than 10 MB. Please upload a smaller image."
          : "We couldn't process that upload. Please try a JPG, PNG or WEBP.",
      });
    }),
    async (req: any, res: Response) => {
      // 2026-09 (Tony's "people are paying but I can't tell" investigation):
      // this used to synchronously await analyzeScam() (a GPT-4o call that
      // can run well past Render's ~30s platform proxy timeout) before
      // responding. requireToolCredit() above has ALREADY atomically
      // consumed the user's KES 100 credit by this point, so a timeout here
      // meant: paid, credit gone, nothing delivered. Same confirmed failure
      // class as offer-verify, visa-verify, and ielts-verify-ai. Fix:
      // validate + extract text synchronously (fast, non-AI), then hand off
      // to a background job and respond 202 immediately so the client can
      // poll — same pattern already proven on /api/tools/ats-check.
      try {
        let text = String(req.body?.text ?? "").trim();
        const file = req.file as Express.Multer.File | undefined;

        if (!text && !file) {
          return res.status(400).json({
            ok: false,
            message: "Please paste the chat/email text OR upload a screenshot / document (or both).",
          });
        }

        // Route based on file type. Images → vision path. PDF/Word →
        // extract text and merge with whatever text the user already pasted.
        let imageDataUrl: string | undefined;
        if (file) {
          if (file.mimetype.startsWith("image/")) {
            imageDataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
          } else if (
            file.mimetype === "application/pdf" ||
            file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            file.mimetype === "application/msword"
          ) {
            // 2026-08 (Tony): pull PDF/Word text and merge into the analysis
            // text. The scam analyzer works great on pure text — same
            // employer-name checks, salary-vs-benchmark checks, scam-phrase
            // scanning as with pasted chat text.
            const { extractTextFromBuffer } = await import("../utils/extract-text");
            const extracted = await extractTextFromBuffer(file.buffer, file.mimetype, file.originalname);
            if (!extracted?.text || extracted.text.trim().length < 20) {
              return res.status(400).json({
                ok: false,
                message: "We couldn't read enough text from that file. If it's a scanned PDF, please upload a clear photo (JPG/PNG) instead — our vision engine handles those.",
              });
            }
            const joiner = text ? "\n\n---FROM UPLOADED DOCUMENT---\n" : "";
            text = (text + joiner + extracted.text.trim()).slice(0, 15_000);
          } else {
            return res.status(400).json({ ok: false, message: "Please upload an image, PDF, or Word document." });
          }
        }

        const userId: string | null = req.user?.claims?.sub ?? req.user?.id ?? null;
        const jobId = await createToolScanJob("job_scam_check", userId, req.toolPaymentId ?? null);
        res.status(202).json({ jobId, status: "processing" });

        const finalText = text;
        const finalImageDataUrl = imageDataUrl;

        (async () => {
          const t0 = Date.now();
          try {
            const { analyzeScam } = await import("./analyzer");
            const report = await analyzeScam({ text: finalText, imageDataUrl: finalImageDataUrl });

            if (report.ok === false) {
              await markToolScanJobError(jobId, report.message);
              return;
            }

            console.log(
              `[JobScamCheck] job=${jobId} verdict=${report.verdict} trust=${report.overallTrust} country=${report.country?.code ?? "?"} ` +
              `findings=${report.findings.length} inputMode=${finalImageDataUrl ? (finalText ? "text+image" : "image") : "text"} in ${Date.now() - t0}ms`,
            );

            await markToolScanJobDone(jobId, {
              ok: true,
              overallTrust:        report.overallTrust,
              confidence:          report.confidence,
              riskBand:            report.riskBand,
              verdict:             report.verdict,
              headline:            report.headline,
              explanation:         report.explanation,
              extractedFields:     report.extractedFields,
              country:             report.country ? {
                code:            report.country.code,
                name:            report.country.name,
                flag:            report.country.flag,
                links:           report.country.links,
                contacts:        report.country.contacts,
                nextStepAdvice:  report.country.nextStepAdvice,
              } : null,
              subScores:           report.subScores,
              findings:            report.findings,
              positiveIndicators:  report.positiveIndicators,
              recommendations:     report.recommendations,
              scamPatternsMatched: report.scamPatternsMatched,
              disclaimer:          "This is an AI-assisted screening — not a legal determination. Always verify the employer and recruiter through the official government portals below before making travel, payment, or contract decisions.",
            });
          } catch (err: any) {
            console.error(`[JobScamCheck] job=${jobId} background error:`, err?.message);
            await markToolScanJobError(jobId, "We couldn't complete the analysis right now. Please try again shortly.");
          }
        })();
      } catch (err: any) {
        console.error("[JobScamCheck] endpoint error:", err?.message);
        res.status(500).json({
          ok: false,
          message: "We couldn't complete the analysis right now. Please try again shortly.",
        });
      }
    },
  );

  console.log("[JobScamCheck] Route registered: POST /api/tools/job-scam-check (AI scam analyzer v2, async job+poll)");
}
