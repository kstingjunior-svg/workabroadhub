/**
 * IELTS Prep — Phase 0 (demand validation) + Phase 1 (real v1 product).
 *
 * 2026-06: founder is exploring a KES 10,000 IELTS prep product. Before
 * spending 6-12 weeks on the full LMS, we ship a tiny "Notify me when
 * it's ready" capture so we know if the demand is real.
 *
 * What we learn from each signup:
 *   - email                      — proves they care enough to leave it
 *   - target_band                — distribution tells us which difficulty range to author for
 *   - planned_test_window        — urgency / lead time signal
 *   - current_proficiency        — beginner vs intermediate vs advanced mix
 *   - test_type                  — Academic vs General Training split
 *   - referral_source (optional) — how they heard about WAH IELTS
 *
 * The founder's own original decision framework (still worth honoring even
 * though we're proceeding now on a direct build request, not a signup count):
 *   If 200+ Kenyans sign up in 2 weeks → market is real, build the full system.
 *   If 30 sign up → it's a soft signal, build a thin v1 (e.g. essay-feedback only).
 *   If <10 sign up → save 6 months and pivot.
 * 2026-09: we're shipping the "thin v1" tier directly (AI Writing feedback +
 * one Reading mock test) rather than waiting on the signup count, per an
 * explicit build request. Everything below the waitlist code is that v1.
 *
 * Self-contained: schema is created on first POST via CREATE TABLE IF NOT
 * EXISTS, so no separate bootstrap module needed. Same pattern as the
 * notify-me table for unclaimed employers.
 */
import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { openai } from "../lib/openai";
import { storage } from "../storage";
import { allReadingTests, getReadingTestById, type ReadingQuestion } from "../ielts-content/reading-test-1";

const IELTS_SERVICE_SLUG = "ielts_prep";

const VALID_BANDS = new Set(["5.5", "6.0", "6.5", "7.0", "7.5", "8.0+", "unsure"]);
const VALID_WINDOWS = new Set(["within_1_month", "1_to_3_months", "3_to_6_months", "6_plus_months", "unsure"]);
const VALID_LEVELS  = new Set(["beginner", "intermediate", "advanced", "unsure"]);
const VALID_TYPES   = new Set(["academic", "general_training", "unsure"]);

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ielts_interest_signups (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id               UUID,                                 -- null for anonymous signups
      email                 VARCHAR(160) NOT NULL,
      target_band           VARCHAR(16),
      planned_test_window   VARCHAR(32),
      current_proficiency   VARCHAR(24),
      test_type             VARCHAR(24),
      referral_source       VARCHAR(120),
      notified_at           TIMESTAMP,                            -- set when admin emails them at launch
      created_at            TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `).catch(() => { /* table-creation is best-effort */ });
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_ielts_signups_email ON ielts_interest_signups(LOWER(email))`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ielts_signups_created ON ielts_interest_signups(created_at DESC)`).catch(() => {});
}

/**
 * Read the signed-in user's id from custom session OR passport, without
 * requiring an isAuthenticated middleware (which would 401 anonymous users).
 * Mirrors the readSessionUserId helper in local-jobs-routes.ts.
 */
function readSessionUserId(req: any): string | null {
  const fromReqUser = req.user?.claims?.sub ?? req.user?.id;
  if (fromReqUser) return String(fromReqUser);
  const fromSession = req.session?.customUserId;
  if (fromSession) return String(fromSession);
  return null;
}

// ─── Phase 1 — self-bootstrapping tables for the real product ──────────────
async function ensureWritingTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ielts_writing_submissions (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id               VARCHAR NOT NULL,
      task_type             VARCHAR(16) NOT NULL,        -- 'task1' | 'task2'
      prompt                TEXT NOT NULL,
      essay                 TEXT NOT NULL,
      word_count            INTEGER NOT NULL DEFAULT 0,
      overall_band          NUMERIC(3,1),
      task_response_band    NUMERIC(3,1),
      coherence_band        NUMERIC(3,1),
      lexical_band          NUMERIC(3,1),
      grammar_band          NUMERIC(3,1),
      feedback              JSONB,
      created_at            TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ielts_writing_user ON ielts_writing_submissions(user_id, created_at DESC)`).catch(() => {});
}

async function ensureReadingTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ielts_reading_attempts (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id               VARCHAR NOT NULL,
      test_id               VARCHAR(64) NOT NULL,
      score                 INTEGER NOT NULL,
      total_questions       INTEGER NOT NULL,
      answers               JSONB,
      review                JSONB,
      created_at            TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ielts_reading_user ON ielts_reading_attempts(user_id, created_at DESC)`).catch(() => {});
}

/**
 * Checks unlock status for the ielts_prep service.
 *
 * IMPORTANT: despite the `user_services.service_id` column comment saying
 * "FK to services.id", every real payment flow in this codebase (see
 * cv-fix-lite-instant-pay.tsx, service-order-flow.tsx) actually sends the
 * SERVICE SLUG (e.g. "cv_fix_lite") as `serviceId` to /api/payments/initiate,
 * and that raw string flows unchanged through payment.serviceId →
 * runPaymentPipeline → storage.unlockService(userId, serviceId, ...) — so
 * what actually lands in user_services.service_id is the slug, not the
 * services-table UUID. Traced end-to-end (routes.ts /api/payments/initiate,
 * the M-Pesa callback handler, paymentPipeline.ts Step 2) before writing
 * this — checking against the resolved UUID here would silently never
 * match and lock out every paying user. Check against the slug directly.
 */
async function userHasIeltsAccess(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    return await storage.hasServiceAccess(userId, IELTS_SERVICE_SLUG);
  } catch (err: any) {
    console.error("[ielts] userHasIeltsAccess check failed:", err?.message);
    return false;
  }
}

// Strips answer keys before a test is sent to the client — never let the
// correct answers leak into the browser bundle/network tab.
function toPublicTest(test: NonNullable<ReturnType<typeof getReadingTestById>>) {
  return {
    id: test.id,
    title: test.title,
    estimatedMinutes: test.estimatedMinutes,
    instructions: test.instructions,
    passage: test.passage,
    headingBank: test.headingBank,
    questions: test.questions.map((q) => ({
      id: q.id,
      type: q.type,
      paragraphRef: q.paragraphRef,
      prompt: q.prompt,
      options: q.options,
      // correctAnswer intentionally omitted
    })),
  };
}

function scoreReadingSubmission(
  questions: ReadingQuestion[],
  answers: Record<string, string>,
): { score: number; total: number; review: Array<{ id: number; yourAnswer: string | null; correctAnswer: string; isCorrect: boolean }> } {
  let score = 0;
  const review = questions.map((q) => {
    const raw = answers?.[String(q.id)];
    const given = typeof raw === "string" ? raw.trim() : null;
    const normalize = (s: string) => s.trim().toUpperCase();
    const isCorrect = !!given && normalize(given) === normalize(q.correctAnswer);
    if (isCorrect) score += 1;
    return { id: q.id, yourAnswer: given, correctAnswer: q.correctAnswer, isCorrect };
  });
  return { score, total: questions.length, review };
}

export function registerIeltsRoutes(app: Express): void {
  // ─── POST /api/ielts/interest ─────────────────────────────────────────────
  // Public — anyone can leave their email. If they're signed in we also stamp
  // their userId so we can later cross-reference with their plan tier
  // ("of the 200 signups, how many are already paying KES 99+ customers?")
  app.post("/api/ielts/interest", async (req: any, res: Response) => {
    try {
      await ensureTable();

      const email     = String(req.body?.email ?? "").trim().slice(0, 160).toLowerCase();
      const band      = String(req.body?.targetBand ?? "").trim().slice(0, 16);
      const window    = String(req.body?.plannedTestWindow ?? "").trim().slice(0, 32);
      const level     = String(req.body?.currentProficiency ?? "").trim().slice(0, 24);
      const testType  = String(req.body?.testType ?? "").trim().slice(0, 24);
      const referral  = String(req.body?.referralSource ?? "").trim().slice(0, 120) || null;

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email so we can notify you." });
      }
      // Light validation — invalid values fall through as null rather than rejecting,
      // so we don't lose a signup over a dropdown typo.
      const targetBand    = VALID_BANDS.has(band)     ? band      : null;
      const plannedWindow = VALID_WINDOWS.has(window) ? window    : null;
      const proficiency   = VALID_LEVELS.has(level)   ? level     : null;
      const tt            = VALID_TYPES.has(testType) ? testType  : null;

      const userId = readSessionUserId(req);

      const { rows: [row] } = await pool.query<{ id: string; was_inserted: boolean }>(`
        INSERT INTO ielts_interest_signups
          (user_id, email, target_band, planned_test_window, current_proficiency, test_type, referral_source)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (LOWER(email)) DO UPDATE
          SET target_band         = COALESCE(EXCLUDED.target_band, ielts_interest_signups.target_band),
              planned_test_window = COALESCE(EXCLUDED.planned_test_window, ielts_interest_signups.planned_test_window),
              current_proficiency = COALESCE(EXCLUDED.current_proficiency, ielts_interest_signups.current_proficiency),
              test_type           = COALESCE(EXCLUDED.test_type, ielts_interest_signups.test_type),
              user_id             = COALESCE(EXCLUDED.user_id, ielts_interest_signups.user_id)
        RETURNING id, (xmax = 0) AS was_inserted
      `, [userId, email, targetBand, plannedWindow, proficiency, tt, referral])
        .catch(async (err: any) => {
          if (err?.code === "42P01") {
            await ensureTable();
            return pool.query<{ id: string; was_inserted: boolean }>(`
              INSERT INTO ielts_interest_signups
                (user_id, email, target_band, planned_test_window, current_proficiency, test_type, referral_source)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING id, true AS was_inserted
            `, [userId, email, targetBand, plannedWindow, proficiency, tt, referral]);
          }
          throw err;
        });

      console.log(
        `[ielts/interest] ${row.was_inserted ? "NEW" : "UPDATED"} email=${email} ` +
        `band=${targetBand ?? "?"} window=${plannedWindow ?? "?"} ` +
        `proficiency=${proficiency ?? "?"} type=${tt ?? "?"} userId=${userId ?? "anon"}`,
      );

      // Notify Tony — single email per signup so he can feel the momentum.
      // No-op if SMTP is down.
      (async () => {
        try {
          if (!row.was_inserted) return; // Only email on NEW signups, not updates
          const { sendEmail } = await import("../email");
          await sendEmail({
            to: "hello@workabroadhub.tech",
            subject: `[IELTS Interest] +1 signup — ${email}`,
            html: `
              <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;color:#1a2530;">
                <h3 style="margin:0 0 10px;color:#0f766e;">New IELTS prep signup</h3>
                <p><strong>${email}</strong> wants to know when WorkAbroad Hub IELTS is ready.</p>
                <ul style="font-size:14px;color:#475569;">
                  <li>Target band: <strong>${targetBand ?? "—"}</strong></li>
                  <li>Test window: <strong>${plannedWindow ?? "—"}</strong></li>
                  <li>Current level: <strong>${proficiency ?? "—"}</strong></li>
                  <li>Test type: <strong>${tt ?? "—"}</strong></li>
                  ${referral ? `<li>Heard via: ${referral}</li>` : ""}
                  ${userId ? `<li style="color:#0f766e;">Already a WAH user (userId: ${userId})</li>` : ""}
                </ul>
                <p style="font-size:13px;"><a href="https://workabroadhub.tech/admin/ielts-interest">→ Full list in admin</a></p>
              </div>`,
            text: `New IELTS signup: ${email}\nBand: ${targetBand} | Window: ${plannedWindow} | Level: ${proficiency} | Type: ${tt}\nFull list: https://workabroadhub.tech/admin/ielts-interest`,
          });
        } catch (err: any) {
          console.warn(`[ielts/interest] founder-notify email failed: ${err?.message}`);
        }
      })();

      res.json({
        success: true,
        message: `Got it! We'll email ${email} the moment WorkAbroad Hub IELTS is ready. Aim for late 2026 if there's enough interest.`,
      });
    } catch (err: any) {
      console.error("[POST /api/ielts/interest]", err?.message);
      res.status(500).json({ message: "Could not save your signup. Try again or email hello@workabroadhub.tech." });
    }
  });

  // ─── GET /api/admin/ielts/interest ────────────────────────────────────────
  // Admin-only. Returns full list + aggregate stats so Tony can see at a
  // glance whether the demand is real before committing to the full build.
  app.get("/api/admin/ielts/interest", async (req: any, res: Response) => {
    const userId = readSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Sign in required." });
    try {
      const { storage } = await import("../storage");
      const isAdmin = await storage.isUserAdmin(userId).catch(() => false);
      if (!isAdmin) return res.status(403).json({ message: "Admin access required." });

      await ensureTable();

      const { rows } = await pool.query<{
        id: string; email: string; target_band: string | null;
        planned_test_window: string | null; current_proficiency: string | null;
        test_type: string | null; referral_source: string | null;
        user_id: string | null; created_at: Date; notified_at: Date | null;
      }>(`
        SELECT id, email, target_band, planned_test_window, current_proficiency,
               test_type, referral_source, user_id, created_at, notified_at
          FROM ielts_interest_signups
         ORDER BY created_at DESC
         LIMIT 500
      `);

      const totalSignups = rows.length;
      const last7d  = rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 7 * 86_400_000).length;
      const last24h = rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 86_400_000).length;
      const alreadyWahUsers = rows.filter((r) => !!r.user_id).length;

      const countBy = <T extends string | null>(field: (r: any) => T) => {
        const out: Record<string, number> = {};
        for (const r of rows) {
          const k = String(field(r) ?? "unknown");
          out[k] = (out[k] ?? 0) + 1;
        }
        return out;
      };

      res.json({
        totalSignups,
        last24h,
        last7d,
        alreadyWahUsers,
        byTargetBand:       countBy((r) => r.target_band),
        byTestWindow:       countBy((r) => r.planned_test_window),
        byCurrentLevel:     countBy((r) => r.current_proficiency),
        byTestType:         countBy((r) => r.test_type),
        signups: rows.map((r) => ({
          id:                 r.id,
          email:              r.email,
          targetBand:         r.target_band,
          plannedTestWindow:  r.planned_test_window,
          currentProficiency: r.current_proficiency,
          testType:           r.test_type,
          referralSource:     r.referral_source,
          isWahUser:          !!r.user_id,
          userId:             r.user_id,
          createdAt:          r.created_at,
          notifiedAt:         r.notified_at,
        })),
      });
    } catch (err: any) {
      console.error("[GET /api/admin/ielts/interest]", err?.message);
      res.status(500).json({ message: "Could not load IELTS interest list." });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 1 — the real product (2026-09): AI Writing feedback + Reading
  // mock test, gated behind the "ielts_prep" one-time unlock (KES 10,000,
  // reusing the generic services/payments/userServices pipeline — see
  // server/services/paymentPipeline.ts and server/services/delivery.ts).
  // ═══════════════════════════════════════════════════════════════════════

  // ─── GET /api/ielts/access ─────────────────────────────────────────────
  // Tells the client whether the signed-in user has unlocked IELTS Prep,
  // plus the current price so the paywall screen never hardcodes it.
  app.get("/api/ielts/access", async (req: any, res: Response) => {
    try {
      const userId = readSessionUserId(req);
      const service = await storage.getServiceBySlug(IELTS_SERVICE_SLUG);
      const hasAccess = await userHasIeltsAccess(userId);
      res.json({
        hasAccess,
        signedIn: !!userId,
        price: service?.price ?? 10000,
        currency: service?.currency ?? "KES",
        serviceId: service?.id ?? null,
      });
    } catch (err: any) {
      console.error("[GET /api/ielts/access]", err?.message);
      res.status(500).json({ message: "Could not check IELTS Prep access." });
    }
  });

  // ─── GET /api/ielts/reading/tests ─────────────────────────────────────
  // Public listing of available tests (metadata only, no questions) — safe
  // to show on the locked marketing screen so users know what they're
  // paying for.
  app.get("/api/ielts/reading/tests", async (_req: Request, res: Response) => {
    res.json({
      tests: allReadingTests.map((t) => ({
        id: t.id,
        title: t.title,
        estimatedMinutes: t.estimatedMinutes,
        questionCount: t.questions.length,
      })),
    });
  });

  // ─── GET /api/ielts/reading/tests/:testId ─────────────────────────────
  // Gated — serves the passage + questions WITHOUT answers.
  app.get("/api/ielts/reading/tests/:testId", async (req: any, res: Response) => {
    try {
      const userId = readSessionUserId(req);
      if (!userId) return res.status(401).json({ message: "Sign in required." });
      const hasAccess = await userHasIeltsAccess(userId);
      if (!hasAccess) return res.status(402).json({ message: "IELTS Prep isn't unlocked yet.", requiresUnlock: true });

      const test = getReadingTestById(String(req.params.testId));
      if (!test) return res.status(404).json({ message: "Test not found." });
      res.json({ test: toPublicTest(test) });
    } catch (err: any) {
      console.error("[GET /api/ielts/reading/tests/:testId]", err?.message);
      res.status(500).json({ message: "Could not load the reading test." });
    }
  });

  // ─── POST /api/ielts/reading/tests/:testId/submit ─────────────────────
  // Gated — server-side scoring against the answer key (never trust a
  // client-computed score for anything we display or store).
  app.post("/api/ielts/reading/tests/:testId/submit", async (req: any, res: Response) => {
    try {
      const userId = readSessionUserId(req);
      if (!userId) return res.status(401).json({ message: "Sign in required." });
      const hasAccess = await userHasIeltsAccess(userId);
      if (!hasAccess) return res.status(402).json({ message: "IELTS Prep isn't unlocked yet.", requiresUnlock: true });

      const test = getReadingTestById(String(req.params.testId));
      if (!test) return res.status(404).json({ message: "Test not found." });

      const answers = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
      const { score, total, review } = scoreReadingSubmission(test.questions, answers);

      await ensureReadingTable();
      await pool.query(
        `INSERT INTO ielts_reading_attempts (user_id, test_id, score, total_questions, answers, review)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, test.id, score, total, JSON.stringify(answers), JSON.stringify(review)],
      ).catch((err: any) => console.error("[ielts/reading/submit] persist failed (non-fatal):", err?.message));

      res.json({ score, total, review, scoringNote: test.scoringNote });
    } catch (err: any) {
      console.error("[POST /api/ielts/reading/tests/:testId/submit]", err?.message);
      res.status(500).json({ message: "Could not score your reading test." });
    }
  });

  // ─── POST /api/ielts/writing/grade ─────────────────────────────────────
  // Gated — sends the essay to an IELTS-examiner-style AI grading prompt,
  // returns structured band scores + feedback, and persists the submission.
  app.post("/api/ielts/writing/grade", async (req: any, res: Response) => {
    try {
      const userId = readSessionUserId(req);
      if (!userId) return res.status(401).json({ message: "Sign in required." });
      const hasAccess = await userHasIeltsAccess(userId);
      if (!hasAccess) return res.status(402).json({ message: "IELTS Prep isn't unlocked yet.", requiresUnlock: true });

      const taskType = req.body?.taskType === "task1" ? "task1" : "task2";
      const prompt = String(req.body?.prompt ?? "").trim().slice(0, 2000);
      const essay  = String(req.body?.essay ?? "").trim().slice(0, 12000);
      const wordCount = essay.split(/\s+/).filter(Boolean).length;

      if (!prompt) {
        return res.status(400).json({ message: "Add the task prompt/question you were given." });
      }
      const minWords = taskType === "task1" ? 100 : 180;
      if (wordCount < minWords) {
        return res.status(400).json({
          message: `Your response looks too short to grade fairly (${wordCount} words). IELTS ${taskType === "task1" ? "Task 1" : "Task 2"} expects at least ${taskType === "task1" ? 150 : 250} words — write a fuller response and try again.`,
        });
      }

      const systemPrompt = `You are an experienced, certified IELTS examiner grading a Writing ${taskType === "task1" ? "Task 1" : "Task 2"} response using the real official IELTS Writing band descriptors (Task Achievement/Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy), each scored 0-9 in 0.5 steps, plus an Overall band (average of the four, rounded to the nearest 0.5).

Be an honest, calibrated examiner: do not inflate scores. Most real candidates score in the 5.0-7.5 range; reserve 8+ for genuinely excellent, near-native writing with very few errors.

Respond with ONLY valid JSON (no markdown fences, no commentary outside the JSON) in exactly this shape:
{
  "overallBand": number,
  "taskResponseBand": number,
  "coherenceBand": number,
  "lexicalBand": number,
  "grammarBand": number,
  "strengths": [string, string, string],
  "improvements": [string, string, string],
  "detailedFeedback": string
}
"detailedFeedback" should be 150-300 words of specific, actionable feedback referencing actual phrases or issues from the essay — not generic advice.`;

      const userMessage = `TASK PROMPT:\n${prompt}\n\nCANDIDATE'S ESSAY (${wordCount} words):\n${essay}`;

      let parsed: any;
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          temperature: 0.3,
          max_tokens: 1500,
          response_format: { type: "json_object" } as any,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        });
        const raw = completion.choices[0]?.message?.content?.trim() ?? "";
        parsed = JSON.parse(raw);
      } catch (aiErr: any) {
        console.error("[ielts/writing/grade] AI grading failed:", aiErr?.message);
        return res.status(502).json({ message: "Our AI grader is temporarily unavailable. Please try again in a moment." });
      }

      const clampBand = (n: any) => {
        const v = Number(n);
        if (!Number.isFinite(v)) return null;
        return Math.min(9, Math.max(0, Math.round(v * 2) / 2));
      };
      const result = {
        overallBand: clampBand(parsed.overallBand),
        taskResponseBand: clampBand(parsed.taskResponseBand),
        coherenceBand: clampBand(parsed.coherenceBand),
        lexicalBand: clampBand(parsed.lexicalBand),
        grammarBand: clampBand(parsed.grammarBand),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5).map(String) : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements.slice(0, 5).map(String) : [],
        detailedFeedback: String(parsed.detailedFeedback ?? "").slice(0, 3000),
      };

      await ensureWritingTable();
      await pool.query(
        `INSERT INTO ielts_writing_submissions
           (user_id, task_type, prompt, essay, word_count, overall_band, task_response_band, coherence_band, lexical_band, grammar_band, feedback)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId, taskType, prompt, essay, wordCount,
          result.overallBand, result.taskResponseBand, result.coherenceBand, result.lexicalBand, result.grammarBand,
          JSON.stringify(result),
        ],
      ).catch((err: any) => console.error("[ielts/writing/grade] persist failed (non-fatal):", err?.message));

      res.json({ result, wordCount });
    } catch (err: any) {
      console.error("[POST /api/ielts/writing/grade]", err?.message);
      res.status(500).json({ message: "Could not grade your essay right now. Please try again." });
    }
  });

  // ─── GET /api/ielts/writing/history ────────────────────────────────────
  // Gated — lets a user see their past submissions (band trend over time).
  app.get("/api/ielts/writing/history", async (req: any, res: Response) => {
    try {
      const userId = readSessionUserId(req);
      if (!userId) return res.status(401).json({ message: "Sign in required." });
      const hasAccess = await userHasIeltsAccess(userId);
      if (!hasAccess) return res.status(402).json({ message: "IELTS Prep isn't unlocked yet.", requiresUnlock: true });

      await ensureWritingTable();
      const { rows } = await pool.query(
        `SELECT id, task_type, word_count, overall_band, task_response_band, coherence_band, lexical_band, grammar_band, created_at
           FROM ielts_writing_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [userId],
      );
      res.json({ submissions: rows });
    } catch (err: any) {
      console.error("[GET /api/ielts/writing/history]", err?.message);
      res.status(500).json({ message: "Could not load your writing history." });
    }
  });
}
