/**
 * GET /api/admin/freemium-funnel?days=7 — is "explore first, pay when necessary" converting?
 *
 * UI events (funnel_events, written by POST /api/track-event from client/src/lib/conversion-events.ts):
 *   premium_click, upgrade_modal_view/dismiss/plan_select, job_unlock_view/dismiss/pay
 * Money (payments table — the source of truth, never the UI):
 *   plan payment attempts, verified successful plan payments, by plan.
 * Registrations/logins come from users / sessions where available.
 * Aggregates only — no names, phones or emails leave this endpoint.
 */
import type { Express } from "express";
import { pool } from "../db";
import { resolveEntitlement } from "../lib/feature-access";

const EVENTS = ["premium_click", "upgrade_modal_view", "upgrade_modal_dismiss", "upgrade_plan_select", "job_unlock_view", "job_unlock_dismiss", "job_unlock_pay"];

/** Date range from ?range=today|7d|30d|90d or ?from=YYYY-MM-DD&to=YYYY-MM-DD (Nairobi days). */
export function parseRange(q: any): { from: Date; to: Date; label: string } {
  const now = new Date();
  const dayStartNairobi = (d: Date) => new Date(new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 10) + "T00:00:00+03:00");
  if (q?.from && /^\d{4}-\d{2}-\d{2}$/.test(String(q.from))) {
    const from = new Date(`${q.from}T00:00:00+03:00`);
    const toDay = q?.to && /^\d{4}-\d{2}-\d{2}$/.test(String(q.to)) ? String(q.to) : now.toISOString().slice(0, 10);
    const to = new Date(new Date(`${toDay}T00:00:00+03:00`).getTime() + 86400e3);
    if (!isNaN(+from) && !isNaN(+to) && to > from && to.getTime() - from.getTime() <= 400 * 86400e3) return { from, to, label: `${q.from} → ${toDay}` };
  }
  const r = String(q?.range ?? "7d");
  if (r === "today") return { from: dayStartNairobi(now), to: now, label: "Today" };
  const days = r === "30d" ? 30 : r === "90d" ? 90 : 7;
  return { from: new Date(now.getTime() - days * 86400e3), to: now, label: `Last ${days} days` };
}

export function registerFreemiumFunnel(app: Express) {
  // ── Admin platform statistics (defined metrics, date-ranged) + integrity ──
  const requireAdmin = async (req: any, res: any) => {
    const uid = req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId;
    if (!uid) { res.status(401).json({ message: "Sign in" }); return false; }
    if (!(await resolveEntitlement(uid)).isAdmin) { res.status(403).json({ message: "Admins only" }); return false; }
    return true;
  };
  app.get("/api/admin/platform-stats", async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    const { getAdminStats, getPublicStats } = await import("../lib/platform-stats");
    const range = parseRange(req.query);
    const [stats, pub] = await Promise.all([getAdminStats(range), getPublicStats(true)]);
    res.setHeader("Cache-Control", "no-store");
    res.json({ label: range.label, ...stats, publicNow: pub });
  });
  app.get("/api/admin/data-integrity", async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    const { getIntegrityChecks } = await import("../lib/platform-stats");
    res.setHeader("Cache-Control", "no-store");
    res.json({ checkedAt: new Date().toISOString(), checks: await getIntegrityChecks() });
  });

  app.get("/api/admin/freemium-funnel", async (req: any, res) => {
    const uid = req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId;
    if (!uid) return res.status(401).json({ message: "Sign in" });
    if (!(await resolveEntitlement(uid)).isAdmin) return res.status(403).json({ message: "Admins only" });
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    try {
      const [ev, byFeature, pays, regs] = await Promise.all([
        pool.query(`SELECT event, count(*)::int n FROM funnel_events WHERE created_at > now() - make_interval(days => $1) AND event = ANY($2) GROUP BY 1`, [days, EVENTS]),
        pool.query(`SELECT event, COALESCE(metadata->>'feature','(none)') feature, COALESCE(metadata->>'plan','') plan, count(*)::int n
                      FROM funnel_events WHERE created_at > now() - make_interval(days => $1) AND event = ANY($2) GROUP BY 1,2,3 ORDER BY n DESC LIMIT 60`, [days, EVENTS]),
        pool.query(`SELECT service_id, count(*)::int attempts,
                           count(*) FILTER (WHERE status IN ('success','completed'))::int verified,
                           count(*) FILTER (WHERE status IN ('failed','cancelled'))::int failed,
                           count(*) FILTER (WHERE status NOT IN ('success','completed','failed','cancelled'))::int pending
                      FROM payments WHERE created_at > now() - make_interval(days => $1) AND service_id LIKE 'plan_%' GROUP BY 1 ORDER BY 1`, [days]),
        pool.query(`SELECT count(*)::int n FROM users WHERE created_at > now() - make_interval(days => $1)`, [days]),
      ]);
      const e = Object.fromEntries(EVENTS.map((k) => [k, 0])) as Record<string, number>;
      for (const r of ev.rows) e[r.event] = r.n;
      res.setHeader("Cache-Control", "no-store");
      res.json({
        days,
        registrations: regs.rows[0]?.n ?? 0,
        events: e,
        rates: {
          modalToPlanSelect: e.upgrade_modal_view ? +(e.upgrade_plan_select / e.upgrade_modal_view).toFixed(3) : null,
          jobUnlockToPay: e.job_unlock_view ? +(e.job_unlock_pay / e.job_unlock_view).toFixed(3) : null,
        },
        byFeature: byFeature.rows,
        planPayments: pays.rows, // attempts vs VERIFIED (status from M-Pesa/PayPal callbacks)
      });
    } catch (err: any) {
      console.error("[freemium-funnel]", err?.message);
      res.status(500).json({ message: "Could not load funnel." });
    }
  });
}
