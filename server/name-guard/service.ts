/**
 * Name Guard — service layer (DB, caches, logging, abuse limits). 2026-11.
 *
 * checkName() is the single entry point used by:
 *   • POST /api/auth/name-check      (live, as the person types — no AI)
 *   • POST /api/auth/signup/start    (authoritative, before any account is created — AI for ambiguous names)
 *   • POST /api/auth/register        (legacy password signup)
 *
 * Privacy / data minimisation:
 *   • The client is identified only by a salted SHA-256 of its IP address
 *     (no device fingerprinting). The salt rotates daily.
 *   • The submitted text is stored ONLY for rejected or flagged entries
 *     (admins need it to review); accepted names are counted, not stored.
 *   • Events older than 90 days are deleted.
 */
import { createHash } from "crypto";
import { pool } from "../db";
import { SEED_TERMS, type Term } from "./lexicon";
import { normTerm, views } from "./normalize";
import { decideName, type NameDecision } from "./decide";
import { classifyAbuse, type AttemptEvent } from "./abuse";
import { aiScreenName } from "./ai";

let terms: Term[] = SEED_TERMS;
let allow = new Set<string>();
let loadedAt = 0;
let seeded = false;

export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  try {
    for (const t of SEED_TERMS) {
      await pool.query(
        `INSERT INTO name_guard_terms (term, norm, language, category, severity, mode, source)
         VALUES ($1,$2,$3,$4,$5,$6,'seed') ON CONFLICT (norm, mode) DO NOTHING`,
        [t.term, normTerm(t.term), t.language, t.category, t.severity, t.mode]);
    }
    seeded = true;
  } catch (e: any) { console.warn("[name-guard] seed failed (using built-in list):", e?.message); }
}

export async function loadLists(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < 5 * 60_000) return;
  try {
    await ensureSeeded();
    const { rows: t } = await pool.query(`SELECT term, language, category, severity, mode FROM name_guard_terms WHERE active`);
    const { rows: a } = await pool.query(`SELECT norm FROM name_guard_allow`);
    if (t.length) terms = t as Term[];
    allow = new Set(a.map((r: any) => r.norm));
    loadedAt = Date.now();
  } catch (e: any) { console.warn("[name-guard] list load failed (keeping cached list):", e?.message); }
}

export function clientHash(ip: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const salt = (process.env.SESSION_SECRET || "wah-name-guard").slice(0, 32);
  return createHash("sha256").update(`${salt}|${day}|${ip}`).digest("hex").slice(0, 32);
}

export function ipOf(req: any): string {
  return String(req.headers?.["x-forwarded-for"] || req.ip || "unknown").split(",")[0].trim().slice(0, 60);
}

export async function restriction(client: string): Promise<{ restricted: boolean; minutes: number }> {
  try {
    const { rows: [b] } = await pool.query(`SELECT until FROM name_guard_blocks WHERE client_hash = $1 AND until > now()`, [client]);
    if (b) return { restricted: true, minutes: Math.max(1, Math.ceil((new Date(b.until).getTime() - Date.now()) / 60_000)) };
  } catch { /* fail open */ }
  return { restricted: false, minutes: 0 };
}

export const RESTRICTED_MESSAGE = "Too many attempts with names that can't be accepted. Please wait a few minutes and enter your real name.";

export interface CheckResult extends NameDecision { restricted: boolean; restrictedMinutes: number; eventId: number | null }

export async function checkName(rawName: string, ctx: { req: any; context: "live" | "signup" | "register"; useAi: boolean; userId?: string | null }): Promise<CheckResult> {
  await loadLists();
  const client = clientHash(ipOf(ctx.req));
  const r0 = await restriction(client);
  if (r0.restricted) {
    return { decision: "reject", category: "random", message: RESTRICTED_MESSAGE, signals: { lexicon: [], hard: [], soft: [], ai: null, whitelisted: false }, restricted: true, restrictedMinutes: r0.minutes, eventId: null };
  }
  let aiError = false;
  const d = await decideName(rawName, {
    terms, allow,
    ai: ctx.useAi ? async (n) => { const v = await aiScreenName(n); if (!v) aiError = true; return v; } : null,
  });

  // Log: every authoritative check; live checks only when not accepted (abuse detection).
  let eventId: number | null = null;
  if (ctx.context !== "live" || d.decision !== "accept") {
    try {
      const keepText = d.decision !== "accept";
      const v = views(rawName);
      const { rows: [e] } = await pool.query(
        `INSERT INTO name_guard_events (client_hash, context, decision, category, reason_codes, ai, ai_error, name_text, name_norm, user_id, review_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [client, ctx.context, d.decision, d.category,
         JSON.stringify({ hard: d.signals.hard, soft: d.signals.soft, lexicon: d.signals.lexicon.map((h) => ({ term: h.term, language: h.language, category: h.category, severity: h.severity })) }),
         d.signals.ai ? JSON.stringify(d.signals.ai) : null, ctx.useAi && aiError && d.signals.lexicon.length + d.signals.soft.length > 0,
         keepText ? v.clean.slice(0, 120) : null, keepText ? v.joined.slice(0, 120) : null, ctx.userId ?? null,
         d.decision === "review" && ctx.context !== "live" ? "open" : null]);
      eventId = e?.id ?? null;
    } catch (err: any) { console.warn("[name-guard] event log failed:", err?.message); }
  }

  // Repeat-abuse check after a rejection.
  if (d.decision === "reject") {
    try {
      const { rows } = await pool.query(
        `SELECT at, decision, category FROM name_guard_events WHERE client_hash = $1 AND at > now() - interval '35 minutes' ORDER BY at DESC LIMIT 50`, [client]);
      const verdict = classifyAbuse(rows as AttemptEvent[]);
      if (verdict.restricted) {
        await pool.query(
          `INSERT INTO name_guard_blocks (client_hash, until, reason, created_by) VALUES ($1, now() + make_interval(mins => $2), $3, 'auto')
           ON CONFLICT (client_hash) DO UPDATE SET until = GREATEST(name_guard_blocks.until, EXCLUDED.until), reason = EXCLUDED.reason`,
          [client, verdict.minutes, `${verdict.rejectsInWindow} rejected names in 30 min (${verdict.risk} risk)`]);
        if (verdict.risk === "high") {
          await pool.query(`INSERT INTO name_guard_admin_log (actor_id, action, detail) VALUES ('system','auto_restriction_high_risk',$1)`,
            [JSON.stringify({ client: client.slice(0, 8), rejects: verdict.rejectsInWindow })]).catch(() => {});
        }
        return { ...d, restricted: true, restrictedMinutes: verdict.minutes, eventId };
      }
    } catch { /* fail open */ }
  }
  return { ...d, restricted: false, restrictedMinutes: 0, eventId };
}

/** Purge old events (data minimisation). */
export async function purgeOldEvents(): Promise<void> {
  await pool.query(`DELETE FROM name_guard_events WHERE at < now() - interval '90 days'`).catch(() => {});
  await pool.query(`DELETE FROM name_guard_blocks WHERE until < now() - interval '7 days'`).catch(() => {});
}
