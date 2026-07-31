/**
 * endpoint.ts — POST /api/tools/job-scam-check
 *
 * Multi-input: accepts either a text field ("chat", "email", "jobAd") OR an
 * image file OR both. At least one must be present. Rate-limited via the
 * global aiHotPathLimiter (see server/routes.ts).
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith("image/") || file.mimetype === "application/pdf";
    cb(null, ok);
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
      const t0 = Date.now();
      try {
        const text = String(req.body?.text ?? "").trim();
        const file = req.file as Express.Multer.File | undefined;

        if (!text && !file) {
          return res.status(400).json({
            ok: false,
            message: "Please paste the chat/email text OR upload a screenshot (or both).",
          });
        }
        if (file && file.mimetype === "application/pdf") {
          return res.status(400).json({
            ok: false,
            message: "PDFs aren't supported. Please screenshot the PDF as an image (JPG or PNG) and try again.",
          });
        }

        let imageDataUrl: string | undefined;
        if (file) {
          if (!file.mimetype.startsWith("image/")) {
            return res.status(400).json({ ok: false, message: "Please upload an image (JPG, PNG or WEBP)." });
          }
          imageDataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
        }

        const { analyzeScam } = await import("./analyzer");
        const report = await analyzeScam({ text, imageDataUrl });

        if (!report.ok) {
          return res.status(502).json({ ok: false, message: report.message });
        }

        console.log(
          `[JobScamCheck] verdict=${report.verdict} trust=${report.overallTrust} country=${report.country?.code ?? "?"} ` +
          `findings=${report.findings.length} inputMode=${imageDataUrl ? (text ? "text+image" : "image") : "text"} in ${Date.now() - t0}ms`,
        );

        res.json({
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
        console.error("[JobScamCheck] endpoint error:", err?.message);
        res.status(500).json({
          ok: false,
          message: "We couldn't complete the analysis right now. Please try again shortly.",
        });
      }
    },
  );

  console.log("[JobScamCheck] Route registered: POST /api/tools/job-scam-check (AI scam analyzer v2)");
}
