/**
 * Name Guard HTTP routes (2026-11).
 *
 * Public:
 *   POST /api/auth/name-check            { name } → { decision, message, restricted }
 *        Live feedback while typing. Deterministic only (no AI). Never
 *        returns internal signals. 60 checks / 10 min per client.
 *
 * Admin (role-checked, every change logged in name_guard_admin_log):
 *   GET  /api/admin/name-guard/overview
 *   GET  /api/admin/name-guard/events?decision=&review=open
 *   POST /api/admin/name-guard/events/:id   { action: "allow" | "confirm_reject" | "dismiss", note }
 *   GET  /api/admin/name-guard/terms        POST (add)   PATCH /terms/:id (severity/active/language/category)
 *   GET  /api/admin/name-guard/allow        POST (add)   DELETE /allow/:id
 *   GET  /api/admin/name-guard/blocks       POST /blocks/lift { client }   POST /blocks/add { client, minutes }
 *   GET  /api/admin/name-guard/audit
 *   POST /api/admin/name-guard/users/:id/identity  { verified: boolean, note }   (separate from name screening)
 */
import type { Express, Response } from "express";
import { pool } from "../db";
import { checkName, clientHash, ipOf, loadLists, purgeOldEvents } from "./service";
import { normTerm, views } from "./normalize";

function sessionUserId(req: any): string | null {
  const id = req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId ?? null;
  return id ? String(id) : null;
}
async function isAdmin(uid: string | null): Promise<boolean> {
  if (!uid) return false;
  const { rows } = await pool.query(`SELECT is_admin, role FROM users WHERE id = $1`, [uid]).catch(() => ({ rows: [] as any[] }));
  const u = rows[0];
  return !!u && (u.is_admin === true || ["admin", "ADMIN", "SUPER_ADMIN"].includes(String(u.role ?? "")));
}
function admin(handler: (req: any, res: Response, adminId: string) => Promise<any>) {
  return async (req: any, res: Response) => {
    const uid = sessionUserId(req);
    if (!uid) return res.status(401).json({ message: "Please sign in." });
    if (!(await isAdmin(uid))) return res.status(403).json({ message: "Admin only." });
    try { await handler(req, res, uid); }
    catch (err: any) { console.error(`[name-guard-admin] ${req.method} ${req.path}:`, err?.message); res.status(500).json({ message: "Something went wrong. Nothing was changed." }); }
  };
}
async function log(actor: string, action: string, detail: any) {
  await pool.query(`INSERT INTO name_guard_admin_log (actor_id, action, detail) VALUES ($1,$2,$3)`, [actor, action, JSON.stringify(detail)]).catch(() => {});
}

const liveHits = new Map<string, number[]>();
function allowLive(key: string): boolean {
  const now = Date.now();
  const hits = (liveHits.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  if (hits.length >= 60) return false;
  hits.push(now); liveHits.set(key, hits);
  if (liveHits.size > 20000) liveHits.clear();
  return true;
}

const CATEGORIES = new Set(["profanity", "sexual", "insult", "slur", "hate", "abusive_phrase", "spam"]);

export function registerNameGuardRoutes(app: Express): void {
  loadLists(true).catch(() => {});
  setInterval(() => { purgeOldEvents().catch(() => {}); }, 6 * 3600_000);

  app.post("/api/auth/name-check", async (req: any, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.slice(0, 120) : "";
      if (!allowLive(clientHash(ipOf(req)))) return res.status(429).json({ decision: "review", message: null, throttled: true });
      const r = await checkName(name, { req, context: "live", useAi: false });
      res.json({ decision: r.decision, message: r.message, restricted: r.restricted });
    } catch {
      res.json({ decision: "review", message: null }); // never block typing on a server error
    }
  });

  app.get("/api/admin/name-guard/overview", admin(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days ?? 30)));
    const [{ rows: [tot] }, { rows: cats }, { rows: top }, { rows: [rep] }, { rows: [blk] }, { rows: [users] }, { rows: daily }] = await Promise.all([
      pool.query(`SELECT count(*) FILTER (WHERE context <> 'live')::int checked,
                         count(*) FILTER (WHERE context <> 'live' AND decision='accept')::int accepted,
                         count(*) FILTER (WHERE decision='reject')::int rejected,
                         count(*) FILTER (WHERE context <> 'live' AND decision='reject')::int rejected_at_submit,
                         count(*) FILTER (WHERE decision='review')::int flagged,
                         count(*) FILTER (WHERE review_status='open')::int open_reviews,
                         count(*) FILTER (WHERE review_status='allowed')::int false_positives_corrected,
                         count(*) FILTER (WHERE ai_error)::int ai_failures
                    FROM name_guard_events WHERE at > now() - make_interval(days => $1)`, [days]),
      pool.query(`SELECT category, count(*)::int n FROM name_guard_events WHERE decision='reject' AND at > now() - make_interval(days => $1) GROUP BY 1 ORDER BY 2 DESC`, [days]),
      pool.query(`SELECT h->>'term' AS term, h->>'language' AS language, count(*)::int n
                    FROM name_guard_events e, jsonb_array_elements(coalesce(e.reason_codes->'lexicon','[]'::jsonb)) h
                   WHERE e.at > now() - make_interval(days => $1) GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15`, [days]),
      pool.query(`SELECT count(*)::int clients FROM (SELECT client_hash FROM name_guard_events WHERE decision='reject' AND category <> 'incomplete'
                    AND at > now() - make_interval(days => $1) GROUP BY client_hash HAVING count(*) >= 3) x`, [days]),
      pool.query(`SELECT count(*) FILTER (WHERE until > now())::int active, count(*)::int total FROM name_guard_blocks`),
      pool.query(`SELECT count(*) FILTER (WHERE name_screen_status='screened')::int screened, count(*) FILTER (WHERE name_screen_status='flagged')::int flagged,
                         count(*) FILTER (WHERE identity_verified)::int identity_verified FROM users`),
      pool.query(`SELECT date(at AT TIME ZONE 'Africa/Nairobi') d, count(*) FILTER (WHERE decision='reject')::int rejected,
                         count(*) FILTER (WHERE decision='review')::int flagged, count(*) FILTER (WHERE context<>'live' AND decision='accept')::int accepted
                    FROM name_guard_events WHERE at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`),
    ]);
    res.json({ days, totals: tot, rejectCategories: cats, topTerms: top, repeatClients: rep?.clients ?? 0, blocks: blk, users, daily });
  }));

  app.get("/api/admin/name-guard/events", admin(async (req, res) => {
    const params: any[] = [];
    const where: string[] = [];
    if (["accept", "reject", "review"].includes(String(req.query.decision))) { params.push(req.query.decision); where.push(`decision = $${params.length}`); }
    if (req.query.review === "open") where.push(`review_status = 'open'`);
    if (req.query.repeat === "1") where.push(`client_hash IN (SELECT client_hash FROM name_guard_events WHERE decision='reject' AND at > now() - interval '7 days' GROUP BY 1 HAVING count(*) >= 3)`);
    const { rows } = await pool.query(
      `SELECT id, at, context, decision, category, reason_codes, ai, ai_error, name_text, review_status, reviewed_at, left(client_hash, 8) AS client
         FROM name_guard_events ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY at DESC LIMIT 200`, params);
    res.json({ events: rows });
  }));

  app.post("/api/admin/name-guard/events/:id", admin(async (req, res, adminId) => {
    const id = Number(req.params.id);
    const action = String(req.body?.action ?? "");
    const note = req.body?.note ? String(req.body.note).slice(0, 500) : null;
    if (!["allow", "confirm_reject", "dismiss"].includes(action)) return res.status(400).json({ message: "Unknown action" });
    const { rows: [e] } = await pool.query(`SELECT * FROM name_guard_events WHERE id = $1`, [id]);
    if (!e) return res.status(404).json({ message: "Not found" });
    if (action === "allow" && e.name_norm) {
      await pool.query(`INSERT INTO name_guard_allow (norm, display, note, created_by) VALUES ($1,$2,$3,$4) ON CONFLICT (norm) DO NOTHING`,
        [e.name_norm, e.name_text, note ?? "false positive corrected from review queue", adminId]);
      if (e.user_id) await pool.query(`UPDATE users SET name_screen_status = 'screened', name_screened_at = now() WHERE id = $1`, [e.user_id]);
      await loadLists(true);
    }
    const status = action === "allow" ? "allowed" : action === "confirm_reject" ? "confirmed" : "dismissed";
    await pool.query(`UPDATE name_guard_events SET review_status = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`, [id, status, adminId]);
    await log(adminId, `event_${action}`, { eventId: id, name: e.name_text, note });
    res.json({ ok: true, status });
  }));

  app.get("/api/admin/name-guard/terms", admin(async (_req, res) => {
    const { rows } = await pool.query(`SELECT id, term, language, category, severity, mode, active, source, updated_at FROM name_guard_terms ORDER BY language, term`);
    res.json({ terms: rows });
  }));
  app.post("/api/admin/name-guard/terms", admin(async (req, res, adminId) => {
    const term = String(req.body?.term ?? "").trim().slice(0, 60);
    const language = String(req.body?.language ?? "en").trim().toLowerCase().slice(0, 20) || "en";
    const category = String(req.body?.category ?? "");
    const severity = req.body?.severity === "review" ? "review" : "block";
    const mode = ["word", "contains", "phrase"].includes(req.body?.mode) ? req.body.mode : (term.includes(" ") ? "phrase" : "word");
    const norm = normTerm(term);
    if (!term || norm.length < 2) return res.status(400).json({ message: "Enter the word or phrase." });
    if (!CATEGORIES.has(category)) return res.status(400).json({ message: "Choose a category." });
    if (mode === "contains" && norm.length < 5) return res.status(400).json({ message: "'Anywhere in the name' needs at least 5 letters, otherwise real names get blocked. Use 'Whole word'." });
    const { rows: [t] } = await pool.query(
      `INSERT INTO name_guard_terms (term, norm, language, category, severity, mode, source, created_by) VALUES ($1,$2,$3,$4,$5,$6,'admin',$7)
       ON CONFLICT (norm, mode) DO UPDATE SET active = true, severity = EXCLUDED.severity, category = EXCLUDED.category, language = EXCLUDED.language, updated_at = now()
       RETURNING *`, [term, norm, language, category, severity, mode, adminId]);
    await log(adminId, "term_add", { term, language, category, severity, mode });
    await loadLists(true);
    res.json({ term: t });
  }));
  app.patch("/api/admin/name-guard/terms/:id", admin(async (req, res, adminId) => {
    const id = Number(req.params.id);
    const { rows: [before] } = await pool.query(`SELECT * FROM name_guard_terms WHERE id = $1`, [id]);
    if (!before) return res.status(404).json({ message: "Not found" });
    const severity = req.body?.severity === "review" || req.body?.severity === "block" ? req.body.severity : before.severity;
    const active = typeof req.body?.active === "boolean" ? req.body.active : before.active;
    const language = req.body?.language ? String(req.body.language).toLowerCase().slice(0, 20) : before.language;
    const category = CATEGORIES.has(req.body?.category) ? req.body.category : before.category;
    const { rows: [after] } = await pool.query(
      `UPDATE name_guard_terms SET severity=$2, active=$3, language=$4, category=$5, updated_at=now() WHERE id=$1 RETURNING *`, [id, severity, active, language, category]);
    await log(adminId, "term_update", { id, before: { severity: before.severity, active: before.active, language: before.language, category: before.category }, after: { severity, active, language, category } });
    await loadLists(true);
    res.json({ term: after });
  }));

  app.get("/api/admin/name-guard/allow", admin(async (_req, res) => {
    const { rows } = await pool.query(`SELECT id, display, norm, note, created_at FROM name_guard_allow ORDER BY created_at DESC LIMIT 500`);
    res.json({ allow: rows });
  }));
  app.post("/api/admin/name-guard/allow", admin(async (req, res, adminId) => {
    const text = String(req.body?.text ?? "").trim().slice(0, 120);
    const norm = views(text).joined;
    if (norm.length < 2) return res.status(400).json({ message: "Enter a name or a word." });
    await pool.query(`INSERT INTO name_guard_allow (norm, display, note, created_by) VALUES ($1,$2,$3,$4) ON CONFLICT (norm) DO NOTHING`,
      [norm, text, req.body?.note ? String(req.body.note).slice(0, 300) : null, adminId]);
    await log(adminId, "allow_add", { text });
    await loadLists(true);
    res.json({ ok: true });
  }));
  app.delete("/api/admin/name-guard/allow/:id", admin(async (req, res, adminId) => {
    const { rows: [a] } = await pool.query(`DELETE FROM name_guard_allow WHERE id = $1 RETURNING display`, [Number(req.params.id)]);
    await log(adminId, "allow_remove", { text: a?.display });
    await loadLists(true);
    res.json({ ok: true });
  }));

  app.get("/api/admin/name-guard/blocks", admin(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT left(b.client_hash, 8) AS client, b.client_hash AS client_full, b.until, b.reason, b.created_by, b.created_at,
              (SELECT count(*)::int FROM name_guard_events e WHERE e.client_hash = b.client_hash AND e.decision = 'reject') AS rejects
         FROM name_guard_blocks b ORDER BY b.until DESC LIMIT 100`);
    res.json({ blocks: rows });
  }));
  app.post("/api/admin/name-guard/blocks/lift", admin(async (req, res, adminId) => {
    const client = String(req.body?.client ?? "");
    await pool.query(`UPDATE name_guard_blocks SET until = now() WHERE client_hash = $1`, [client]);
    await log(adminId, "block_lift", { client: client.slice(0, 8) });
    res.json({ ok: true });
  }));
  app.post("/api/admin/name-guard/blocks/add", admin(async (req, res, adminId) => {
    const client = String(req.body?.client ?? "");
    const minutes = Math.min(7 * 24 * 60, Math.max(5, Number(req.body?.minutes ?? 60)));
    if (!/^[0-9a-f]{32}$/.test(client)) return res.status(400).json({ message: "Pick a client from the events list." });
    await pool.query(`INSERT INTO name_guard_blocks (client_hash, until, reason, created_by) VALUES ($1, now() + make_interval(mins => $2), $3, $4)
                      ON CONFLICT (client_hash) DO UPDATE SET until = EXCLUDED.until, reason = EXCLUDED.reason, created_by = EXCLUDED.created_by`,
      [client, minutes, req.body?.reason ? String(req.body.reason).slice(0, 200) : "restricted by admin", adminId]);
    await log(adminId, "block_add", { client: client.slice(0, 8), minutes });
    res.json({ ok: true });
  }));

  app.get("/api/admin/name-guard/audit", admin(async (_req, res) => {
    const { rows } = await pool.query(`SELECT at, actor_id, action, detail FROM name_guard_admin_log ORDER BY at DESC LIMIT 200`);
    res.json({ log: rows });
  }));

  // Identity verification is a SEPARATE status, set only after a real identity check.
  app.post("/api/admin/name-guard/users/:id/identity", admin(async (req, res, adminId) => {
    const verified = req.body?.verified === true;
    const note = String(req.body?.note ?? "").trim().slice(0, 500);
    if (verified && note.length < 10) return res.status(400).json({ message: "Describe how the identity was verified (document checked, by whom)." });
    const { rows: [u] } = await pool.query(
      `UPDATE users SET identity_verified = $2, identity_verified_at = CASE WHEN $2 THEN now() ELSE NULL END, identity_verified_by = CASE WHEN $2 THEN $3 ELSE NULL END
        WHERE id = $1 RETURNING id`, [String(req.params.id), verified, adminId]);
    if (!u) return res.status(404).json({ message: "User not found" });
    await log(adminId, verified ? "identity_verified" : "identity_unverified", { userId: u.id, note });
    res.json({ ok: true });
  }));

  console.log("[name-guard] ✓ routes registered (/api/auth/name-check, /api/admin/name-guard/*)");
}
