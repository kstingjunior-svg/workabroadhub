/**
 * IELTS Prep — Phase 0 (demand validation).
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
 * If 200+ Kenyans sign up in 2 weeks → market is real, build the full system.
 * If 30 sign up → it's a soft signal, build a thin v1 (e.g. essay-feedback only).
 * If <10 sign up → save 6 months and pivot.
 *
 * Self-contained: schema is created on first POST via CREATE TABLE IF NOT
 * EXISTS, so no separate bootstrap module needed. Same pattern as the
 * notify-me table for unclaimed employers.
 */
import type { Express, Request, Response } from "express";
import { pool } from "../db";

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
}
