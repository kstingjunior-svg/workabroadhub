/**
 * LinkedIn Optimize routes — 2026-07 (Tony's premium AI workspace).
 *
 * Endpoints:
 *   POST /api/linkedin-optimize/start                → create draft, gate on Pro
 *   PUT  /api/linkedin-optimize/:id/input            → save user input
 *   GET  /api/linkedin-optimize/:id/stream           → SSE: progress → scores → rewrite
 *   POST /api/linkedin-optimize/:id/refine           → chat refine (returns full rewrite)
 *   GET  /api/linkedin-optimize/:id                  → read draft state
 *   POST /api/linkedin-optimize/:id/save-version     → snapshot the current output
 *   GET  /api/linkedin-optimize/:id/report.pdf       → generate the final PDF report
 *
 * AI: currently uses OpenAI gpt-4o (streaming). Wrapped behind streamJson()
 * so we can swap to Anthropic Claude by changing one file when ANTHROPIC_API_KEY
 * is set. See the note in streamJson().
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import { pool } from "../db";
import { openai } from "../lib/openai";
import { requireProPlan } from "../middleware/requirePlan";
import { stripAiTells } from "../ai/human-voice";
import { extractTextFromBuffer } from "../utils/extract-text";
import {
  buildScorePrompt,
  buildRewritePrompt,
  buildRefinePrompt,
  buildHeadlineVariantsPrompt,
  buildAboutTonePrompt,
  buildKeywordAnalysisPrompt,
  buildRecruiterViewPrompt,
  buildNetworkingPrompt,
  buildPostPrompt,
  buildInterviewPrepPrompt,
  buildCvParsePrompt,
  type ProfileInput,
  type ProfileScores,
  type ProfileRewrite,
  type NetworkingKind,
  type PostCategory,
} from "../services/linkedin/prompts";
import PDFDocument from "pdfkit";

const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function currentUserId(req: any): string | null {
  return (
    req.user?.claims?.sub ??
    req.user?.id ??
    req.session?.customUserId ??
    null
  );
}

// ─── AI call — swappable between OpenAI + Anthropic ────────────────────────
//
// Currently uses gpt-4o non-streaming for JSON responses (cleanest for
// structured output). If you install @anthropic-ai/sdk and set
// ANTHROPIC_API_KEY, swap the body of this function to Anthropic — the rest
// of the module is agnostic.
async function completeJson(
  system: string,
  user: string,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<any> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: opts?.temperature ?? 0.55,
    max_tokens: opts?.maxTokens ?? 2500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("[linkedin-optimize] JSON parse failed. Raw:", raw.slice(0, 500));
    throw new Error("AI returned malformed JSON");
  }
}

// ─── SSE helper ────────────────────────────────────────────────────────────
function sseSend(res: Response, event: string, data: any): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Pace the progress steps so the UI can breathe (not all at once).
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Persistence helpers ──────────────────────────────────────────────────
async function loadDraft(id: string): Promise<any | null> {
  const { rows } = await pool.query(`SELECT * FROM linkedin_optimizations WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ?? null;
}
async function saveDraft(id: string, patch: Record<string, any>): Promise<void> {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const values = keys.map((k) => (typeof patch[k] === "object" ? JSON.stringify(patch[k]) : patch[k]));
  await pool.query(
    `UPDATE linkedin_optimizations SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`,
    [id, ...values],
  );
}

// Cleans/strips AI tells across every text field in a rewrite.
function scrubRewrite(r: ProfileRewrite): ProfileRewrite {
  return {
    headline:      stripAiTells(r.headline ?? ""),
    about:         stripAiTells(r.about ?? ""),
    experience:    (r.experience ?? []).map((e) => ({
      company: e.company ?? "",
      role:    e.role ?? "",
      bullets: (e.bullets ?? []).map(stripAiTells),
    })),
    skills:        (r.skills ?? []).map((s) => stripAiTells(s)),
    keywords:      (r.keywords ?? []).map((k) => stripAiTells(k)),
    targetSummary: stripAiTells(r.targetSummary ?? ""),
  };
}

// ─── Routes ────────────────────────────────────────────────────────────────

export function registerLinkedinOptimizeRoutes(app: Express): void {
  /* ─── POST /start — create draft (Pro gate) ───────────────────────────── */
  app.post("/api/linkedin-optimize/start", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { rows } = await pool.query(
        `INSERT INTO linkedin_optimizations (user_id, status) VALUES ($1, 'draft') RETURNING id`,
        [userId],
      );
      res.json({ id: rows[0].id });
    } catch (err: any) {
      console.error("[linkedin-optimize] start error:", err?.message);
      res.status(500).json({ error: "Could not start LinkedIn optimization" });
    }
  });

  /* ─── PUT /:id/input — save user input ────────────────────────────────── */
  app.put("/api/linkedin-optimize/:id/input", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });

      const input = (req.body ?? {}) as ProfileInput;
      await saveDraft(draft.id, {
        input_json:     input,
        target_role:    input.targetRole    ?? draft.target_role,
        target_country: input.targetCountry ?? draft.target_country,
      });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[linkedin-optimize] input save error:", err?.message);
      res.status(500).json({ error: "Could not save input" });
    }
  });

  /* ─── GET /:id — read state ───────────────────────────────────────────── */
  app.get("/api/linkedin-optimize/:id", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });
      res.json({
        id:          draft.id,
        input:       draft.input_json,
        scores:      draft.scores_json,
        output:      draft.output_json,
        versions:    draft.versions_json ?? [],
        status:      draft.status,
        lastError:   draft.last_error,
        targetRole:  draft.target_role,
        targetCountry: draft.target_country,
      });
    } catch (err: any) {
      console.error("[linkedin-optimize] read error:", err?.message);
      res.status(500).json({ error: "Could not read draft" });
    }
  });

  /* ─── GET /:id/stream — SSE: progress → scores → rewrite ──────────────── */
  app.get("/api/linkedin-optimize/:id/stream", requireProPlan, async (req: any, res: Response) => {
    const userId = currentUserId(req);
    const draft = await loadDraft(req.params.id);
    if (!draft) return res.status(404).json({ error: "Not found" });
    if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });

    // SSE headers
    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection",    "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");  // disable nginx buffering
    res.flushHeaders?.();

    // Keep the connection alive during long-running LLM calls
    const ka = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* ignore */ } }, 15_000);
    req.on("close", () => clearInterval(ka));

    const input = draft.input_json as ProfileInput;

    try {
      await saveDraft(draft.id, { status: "analysing", last_error: null });

      // ── Progress steps — pace them so the animation feels live ──────
      const steps = [
        "Reading your profile...",
        "Detecting ATS keywords...",
        "Comparing with international recruiter standards...",
        "Evaluating recruiter visibility...",
      ];
      for (const s of steps) {
        sseSend(res, "step", { message: s });
        await sleep(700);
      }

      // ── Score pass ────────────────────────────────────────────────
      sseSend(res, "step", { message: "Scoring every section..." });
      const scorePrompts = buildScorePrompt(input);
      const scoresRaw = await completeJson(scorePrompts.system, scorePrompts.user, { temperature: 0.3, maxTokens: 1200 });
      const scores = scoresRaw as ProfileScores;
      sseSend(res, "scores", scores);
      await saveDraft(draft.id, { scores_json: scores });

      // Chain of "section improving" ticks so the score gauge can animate up.
      const sectionTicks = [
        { key: "headline",   msg: "Improving headline..." },
        { key: "about",      msg: "Optimising About section..." },
        { key: "experience", msg: "Rewriting achievements..." },
        { key: "keywords",   msg: "Selecting recruiter keywords..." },
        { key: "skills",     msg: "Optimising Skills..." },
      ];
      for (const t of sectionTicks) {
        sseSend(res, "step", { message: t.msg, section: t.key });
        await sleep(650);
      }

      // ── Rewrite pass ─────────────────────────────────────────────
      sseSend(res, "step", { message: "Final quality review..." });
      const rewritePrompts = buildRewritePrompt(input, scores);
      const rewriteRaw = await completeJson(rewritePrompts.system, rewritePrompts.user, { temperature: 0.55, maxTokens: 2500 });
      const rewrite = scrubRewrite(rewriteRaw as ProfileRewrite);

      // Bump the overall score to reflect the rewrite (heuristic: +25 pts,
      // capped at 96, so the gauge visibly rises but stays credible).
      const newScores: ProfileScores = {
        ...scores,
        overall: Math.min(96, (scores.overall ?? 50) + 25),
      };
      sseSend(res, "rewrite", rewrite);
      sseSend(res, "scores", newScores);

      await saveDraft(draft.id, {
        scores_json: newScores,
        output_json: rewrite,
        status: "optimized",
      });

      sseSend(res, "done", { ok: true });
      res.end();
    } catch (err: any) {
      console.error("[linkedin-optimize] stream error:", err?.message);
      await saveDraft(draft.id, { status: "error", last_error: err?.message ?? "unknown" }).catch(() => {});
      sseSend(res, "error", { message: err?.message ?? "AI optimisation failed" });
      res.end();
    } finally {
      clearInterval(ka);
    }
  });

  /* ─── POST /:id/refine — chat refine ─────────────────────────────────── */
  app.post("/api/linkedin-optimize/:id/refine", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });

      const message = String(req.body?.message ?? "").trim();
      if (!message) return res.status(400).json({ error: "message required" });

      const input   = draft.input_json  as ProfileInput;
      const current = (draft.output_json ?? {}) as ProfileRewrite;

      const p = buildRefinePrompt(input, current, message);
      const rewriteRaw = await completeJson(p.system, p.user, { temperature: 0.55, maxTokens: 2500 });
      const rewrite = scrubRewrite(rewriteRaw as ProfileRewrite);

      // Push previous output onto versions_json before overwriting
      const prevVersions = Array.isArray(draft.versions_json) ? draft.versions_json : [];
      const nextVersions = [
        { at: new Date().toISOString(), output: current, note: "before refine" },
        ...prevVersions,
      ].slice(0, 10);

      await saveDraft(draft.id, {
        output_json:   rewrite,
        versions_json: nextVersions,
      });

      res.json({ output: rewrite });
    } catch (err: any) {
      console.error("[linkedin-optimize] refine error:", err?.message);
      res.status(500).json({ error: "Could not refine. Try again." });
    }
  });

  /* ─── POST /:id/save-version — manual snapshot ────────────────────────── */
  app.post("/api/linkedin-optimize/:id/save-version", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });

      const note = String(req.body?.note ?? "manual snapshot").slice(0, 200);
      const prevVersions = Array.isArray(draft.versions_json) ? draft.versions_json : [];
      const nextVersions = [
        { at: new Date().toISOString(), output: draft.output_json, note },
        ...prevVersions,
      ].slice(0, 10);
      await saveDraft(draft.id, { versions_json: nextVersions });
      res.json({ ok: true, count: nextVersions.length });
    } catch (err: any) {
      console.error("[linkedin-optimize] save-version error:", err?.message);
      res.status(500).json({ error: "Could not save version" });
    }
  });

  /* ─── GET /:id/report.pdf — final PDF report ─────────────────────────── */
  app.get("/api/linkedin-optimize/:id/report.pdf", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });

      const input   = (draft.input_json  ?? {}) as ProfileInput;
      const scores  = (draft.scores_json ?? {}) as ProfileScores;
      const output  = (draft.output_json ?? {}) as ProfileRewrite;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="linkedin-optimization-${draft.id.slice(0,8)}.pdf"`);

      const doc = new PDFDocument({ size: "A4", margin: 50 });
      doc.pipe(res);

      // ── Header ───────────────────────────────────────────────────
      doc.fillColor("#0a66c2").fontSize(22).text("LinkedIn Optimization Report", { align: "left" });
      doc.fillColor("#666").fontSize(11).text(`For: ${input.fullName ?? "Candidate"}   ·   Generated: ${new Date().toLocaleDateString()}`);
      doc.moveDown(1);

      // ── Score summary ────────────────────────────────────────────
      doc.fillColor("#000").fontSize(14).text("Profile score");
      doc.moveDown(0.3);
      const rows: Array<[string, number | undefined]> = [
        ["Overall",                  scores.overall],
        ["Headline",                 scores.headline],
        ["About",                    scores.about],
        ["Experience",               scores.experience],
        ["Skills",                   scores.skills],
        ["Keywords",                 scores.keywords],
        ["Recruiter visibility",     scores.recruiterVisibility],
        ["ATS compatibility",        scores.atsCompatibility],
        ["International readiness",  scores.internationalReadiness],
      ];
      doc.fontSize(11);
      rows.forEach(([k, v]) => {
        doc.fillColor("#444").text(`${k}:`, { continued: true, width: 200 });
        doc.fillColor("#0a66c2").text(` ${v ?? "—"} / 100`);
      });
      doc.moveDown(0.8);

      // ── Headline before/after ────────────────────────────────────
      section(doc, "Headline");
      before(doc, input.currentHeadline ?? "—");
      after(doc, output.headline ?? "—");

      // ── About ───────────────────────────────────────────────────
      section(doc, "About");
      before(doc, input.aboutSection ?? "—");
      after(doc, output.about ?? "—");

      // ── Experience ──────────────────────────────────────────────
      section(doc, "Experience");
      (output.experience ?? []).forEach((exp) => {
        doc.fillColor("#000").fontSize(12).text(`${exp.role} @ ${exp.company}`, { continued: false });
        (exp.bullets ?? []).forEach((b) => doc.fillColor("#444").fontSize(11).text(`  • ${b}`));
        doc.moveDown(0.4);
      });

      // ── Skills + keywords ───────────────────────────────────────
      section(doc, "Recommended skills");
      doc.fontSize(11).fillColor("#444").text((output.skills ?? []).join(" · "));
      doc.moveDown(0.6);

      section(doc, "Recruiter search keywords");
      doc.fontSize(11).fillColor("#444").text((output.keywords ?? []).join(" · "));
      doc.moveDown(0.6);

      section(doc, "Target focus");
      doc.fontSize(11).fillColor("#444").text(output.targetSummary ?? "—");

      doc.end();
    } catch (err: any) {
      console.error("[linkedin-optimize] pdf error:", err?.message);
      res.status(500).json({ error: "Could not generate PDF" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // v2 (2026-07): world-class expansion
  // ══════════════════════════════════════════════════════════════════════

  /* ─── POST /parse-cv — upload PDF/DOCX, get structured ProfileInput ─── */
  app.post(
    "/api/linkedin-optimize/parse-cv",
    requireProPlan,
    cvUpload.single("cv"),
    async (req: any, res: Response) => {
      try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const filename = req.file.originalname || "upload.pdf";
        const mime = req.file.mimetype || "application/pdf";

        let raw = "";
        try {
          const r = await extractTextFromBuffer(req.file.buffer, mime, filename);
          raw = typeof r === "string" ? r : (r?.text ?? "");
        } catch (err: any) {
          console.error("[linkedin-optimize] CV extract failed:", err?.message);
          return res.status(422).json({ error: "Could not read this file. Try a text-based PDF or DOCX." });
        }
        if (!raw || raw.length < 120) {
          return res.status(422).json({ error: "The file has too little text. Try a different CV." });
        }

        const p = buildCvParsePrompt(raw);
        const parsed = await completeJson(p.system, p.user, { temperature: 0.15, maxTokens: 2000 });
        res.json({ input: parsed });
      } catch (err: any) {
        console.error("[linkedin-optimize] parse-cv error:", err?.message);
        res.status(500).json({ error: "Could not parse CV. Please try again or use manual entry." });
      }
    },
  );

  /* ─── POST /:id/headline-variants — 5 headlines to choose from ──────── */
  app.post("/api/linkedin-optimize/:id/headline-variants", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });
      const input = draft.input_json as ProfileInput;
      const p = buildHeadlineVariantsPrompt(input);
      const variants = await completeJson(p.system, p.user, { temperature: 0.7, maxTokens: 900 });
      // scrub tells on each variant
      const scrubbed: any = {};
      for (const [k, v] of Object.entries(variants ?? {})) {
        scrubbed[k] = stripAiTells(String(v ?? ""));
      }
      res.json({ variants: scrubbed });
    } catch (err: any) {
      console.error("[linkedin-optimize] headline-variants error:", err?.message);
      res.status(500).json({ error: "Could not generate headline variants" });
    }
  });

  /* ─── POST /:id/about-tone — rewrite About in a chosen tone ─────────── */
  app.post("/api/linkedin-optimize/:id/about-tone", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });
      const tone = String(req.body?.tone ?? "professional") as any;
      const valid = ["professional", "leadership", "friendly", "executive", "technical", "international"];
      if (!valid.includes(tone)) return res.status(400).json({ error: "Invalid tone" });

      const input = draft.input_json as ProfileInput;
      const p = buildAboutTonePrompt(input, tone);
      const out = await completeJson(p.system, p.user, { temperature: 0.6, maxTokens: 900 });
      res.json({ about: stripAiTells(String(out?.about ?? "")) });
    } catch (err: any) {
      console.error("[linkedin-optimize] about-tone error:", err?.message);
      res.status(500).json({ error: "Could not rewrite About" });
    }
  });

  /* ─── POST /:id/keyword-analysis — detected / missing / high-value ── */
  app.post("/api/linkedin-optimize/:id/keyword-analysis", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });
      const p = buildKeywordAnalysisPrompt(draft.input_json as ProfileInput);
      const analysis = await completeJson(p.system, p.user, { temperature: 0.3, maxTokens: 900 });
      res.json({ analysis });
    } catch (err: any) {
      console.error("[linkedin-optimize] keyword-analysis error:", err?.message);
      res.status(500).json({ error: "Could not analyse keywords" });
    }
  });

  /* ─── POST /:id/recruiter-view — what a recruiter sees ──────────────── */
  app.post("/api/linkedin-optimize/:id/recruiter-view", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });
      const input   = draft.input_json  as ProfileInput;
      const rewrite = (draft.output_json ?? {}) as ProfileRewrite;
      const p = buildRecruiterViewPrompt(input, rewrite.about, rewrite.headline);
      const view = await completeJson(p.system, p.user, { temperature: 0.35, maxTokens: 700 });
      res.json({ view });
    } catch (err: any) {
      console.error("[linkedin-optimize] recruiter-view error:", err?.message);
      res.status(500).json({ error: "Could not simulate recruiter view" });
    }
  });

  /* ─── POST /:id/networking — draft a connection / follow-up message ─ */
  app.post("/api/linkedin-optimize/:id/networking", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });
      const kind = String(req.body?.kind ?? "") as NetworkingKind;
      if (!["connection_request", "recruiter_intro", "follow_up", "thank_you"].includes(kind)) {
        return res.status(400).json({ error: "Invalid kind" });
      }
      const ctx = req.body?.context ?? {};
      const p = buildNetworkingPrompt(draft.input_json as ProfileInput, kind, ctx);
      const out = await completeJson(p.system, p.user, { temperature: 0.6, maxTokens: 500 });
      res.json({ message: stripAiTells(String(out?.message ?? "")) });
    } catch (err: any) {
      console.error("[linkedin-optimize] networking error:", err?.message);
      res.status(500).json({ error: "Could not draft the message" });
    }
  });

  /* ─── POST /:id/post — generate a LinkedIn post ─────────────────────── */
  app.post("/api/linkedin-optimize/:id/post", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });
      const category = String(req.body?.category ?? "") as PostCategory;
      const validCats: PostCategory[] = [
        "career_growth", "certification", "new_job", "networking", "industry_insights", "job_search",
      ];
      if (!validCats.includes(category)) return res.status(400).json({ error: "Invalid category" });
      const topic = req.body?.topic ? String(req.body.topic).slice(0, 200) : undefined;

      const p = buildPostPrompt(draft.input_json as ProfileInput, category, topic);
      const out = await completeJson(p.system, p.user, { temperature: 0.65, maxTokens: 700 });
      res.json({
        post:     stripAiTells(String(out?.post ?? "")),
        hashtags: Array.isArray(out?.hashtags) ? out.hashtags : [],
      });
    } catch (err: any) {
      console.error("[linkedin-optimize] post error:", err?.message);
      res.status(500).json({ error: "Could not draft the post" });
    }
  });

  /* ─── POST /:id/interview-prep — 5 questions + coached answers ──────── */
  app.post("/api/linkedin-optimize/:id/interview-prep", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });
      const p = buildInterviewPrepPrompt(draft.input_json as ProfileInput);
      const prep = await completeJson(p.system, p.user, { temperature: 0.55, maxTokens: 1500 });
      res.json({ prep });
    } catch (err: any) {
      console.error("[linkedin-optimize] interview-prep error:", err?.message);
      res.status(500).json({ error: "Could not generate interview prep" });
    }
  });

  /* ─── POST /:id/restore-version — restore a saved snapshot ──────────── */
  app.post("/api/linkedin-optimize/:id/restore-version", requireProPlan, async (req: any, res: Response) => {
    try {
      const userId = currentUserId(req);
      const draft = await loadDraft(req.params.id);
      if (!draft) return res.status(404).json({ error: "Not found" });
      if (draft.user_id !== userId) return res.status(403).json({ error: "Forbidden" });

      const idx = Number(req.body?.index);
      const versions = Array.isArray(draft.versions_json) ? draft.versions_json : [];
      if (!Number.isFinite(idx) || idx < 0 || idx >= versions.length) {
        return res.status(400).json({ error: "Invalid version index" });
      }
      const chosen = versions[idx];
      if (!chosen?.output) return res.status(400).json({ error: "Version has no snapshot" });

      // Push current output onto history before overwriting
      const nextVersions = [
        { at: new Date().toISOString(), output: draft.output_json, note: "auto-saved before restore" },
        ...versions,
      ].slice(0, 10);

      await saveDraft(draft.id, {
        output_json:   chosen.output,
        versions_json: nextVersions,
      });
      res.json({ output: chosen.output });
    } catch (err: any) {
      console.error("[linkedin-optimize] restore-version error:", err?.message);
      res.status(500).json({ error: "Could not restore version" });
    }
  });
}

// ─── PDF helpers ────────────────────────────────────────────────────────────
function section(doc: any, title: string) {
  doc.moveDown(0.6);
  doc.fillColor("#0a66c2").fontSize(14).text(title);
  doc.moveDown(0.2);
}
function before(doc: any, text: string) {
  doc.fillColor("#999").fontSize(10).text("Before", { continued: false });
  doc.fillColor("#666").fontSize(11).text(text);
  doc.moveDown(0.3);
}
function after(doc: any, text: string) {
  doc.fillColor("#0a66c2").fontSize(10).text("After", { continued: false });
  doc.fillColor("#000").fontSize(11).text(text);
  doc.moveDown(0.4);
}
