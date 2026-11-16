/**
 * Admin-only routes for the Intelligence Engine (2026-11).
 *
 *   GET  /api/admin/intel/overview            risk-level mix, alerts, linked indicators, review counts
 *   GET  /api/admin/intel/links               linked indicators (?kind=&status=)
 *   GET  /api/admin/intel/indicator           one indicator: linked reports + checks + review (?kind=&value=)
 *   POST /api/admin/intel/indicator/review    { kind, value, status: unreviewed|watch|confirmed|false_positive, notes }
 *   GET  /api/admin/intel/alerts              (?status=new|seen|dismissed|all)
 *   POST /api/admin/intel/alerts/:id          { status: seen|dismissed }
 *   POST /api/admin/intel/backfill            index finished offer checks that are not yet indexed
 *
 * Nothing here is public. Customer reports only ever see indicators an admin
 * marked "confirmed" (see confirmedIntelFindings).
 */
import type { Express, Response } from "express";
import { pool } from "../db";
import { backfillOfferChecks, indicatorDetail, linkedIndicators } from "./network";

type AdminWrap = (h: (req: any, res: Response, adminId: string) => Promise<any>) => (req: any, res: Response) => Promise<any>;

const KINDS = new Set(["phone", "email", "domain", "payment_account", "name", "template"]);
const STATUSES = new Set(["unreviewed", "watch", "confirmed", "false_positive"]);

export function registerIntelRoutes(app: Express, adminOnly: AdminWrap): void {
  app.get("/api/admin/intel/overview", adminOnly(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days ?? 30)));
    const [{ rows: risk }, { rows: [alerts] }, { rows: reviews }, { rows: [cov] }, { rows: topCodes }, { rows: [scam] }] = await Promise.all([
      pool.query(
        `SELECT coalesce(p.report->'risk'->>'level', 'BEFORE_RISK_LEVELS') AS level, r.tool, count(*)::int n
           FROM verifyx_reports p JOIN verifyx_requests r ON r.id=p.request_id
          WHERE r.created_at > now() - make_interval(days => $1) GROUP BY 1,2 ORDER BY 1`, [days]),
      pool.query(`SELECT count(*) FILTER (WHERE status='new')::int AS new, count(*)::int AS total FROM intel_alerts`),
      pool.query(`SELECT status, count(*)::int n FROM intel_indicator_reviews GROUP BY 1`),
      pool.query(
        `SELECT count(*) FILTER (WHERE r.tool='offer_check')::int offer_checks,
                count(*) FILTER (WHERE r.tool='offer_check' AND EXISTS (SELECT 1 FROM intel_indicators i WHERE i.source_type='offer_check' AND i.source_id=r.id::text))::int indexed
           FROM verifyx_requests r WHERE r.status='done' AND r.purged_at IS NULL`),
      pool.query(
        `SELECT f.code, f.status, count(*)::int n FROM verifyx_findings f JOIN verifyx_requests r ON r.id=f.request_id
          WHERE r.created_at > now() - make_interval(days => $1)
            AND f.code IN ('applicant_name_mismatch','applicant_name_variant','applicant_passport_mismatch','applicant_dob_mismatch',
                           'payment_to_personal_account','payment_requested','email_reply_to_differs','email_lookalike_domain',
                           'email_requests_payment','email_free_mailbox_for_company','email_domain_differs_from_employer','intel_confirmed_link')
          GROUP BY 1,2 ORDER BY 3 DESC`, [days]),
      pool.query(`SELECT count(*)::int total, count(*) FILTER (WHERE status='pending')::int pending FROM scam_reports`),
    ]);
    const links = await linkedIndicators({ limit: 500 });
    const byKind: Record<string, number> = {};
    for (const l of links) byKind[l.k] = (byKind[l.k] ?? 0) + 1;
    res.json({
      days, risk, alerts, reviews, coverage: cov, forensicsFindings: topCodes, scamReports: scam,
      linked: { total: links.length, byKind, unreviewed: links.filter((l: any) => l.review_status === "unreviewed").length },
      generatedAt: new Date().toISOString(),
    });
  }));

  app.get("/api/admin/intel/links", adminOnly(async (req, res) => {
    const kind = KINDS.has(String(req.query.kind)) ? String(req.query.kind) : undefined;
    const status = STATUSES.has(String(req.query.status)) ? String(req.query.status) : undefined;
    res.json({ links: await linkedIndicators({ kind, status, limit: 300 }) });
  }));

  app.get("/api/admin/intel/indicator", adminOnly(async (req, res) => {
    const kind = String(req.query.kind ?? "");
    const value = String(req.query.value ?? "").slice(0, 300);
    if (!KINDS.has(kind) || !value) return res.status(400).json({ message: "kind and value are required" });
    res.json(await indicatorDetail(kind, value));
  }));

  app.post("/api/admin/intel/indicator/review", adminOnly(async (req, res, adminId) => {
    const kind = String(req.body?.kind ?? "");
    const value = String(req.body?.value ?? "").slice(0, 300);
    const status = String(req.body?.status ?? "");
    const notes = req.body?.notes ? String(req.body.notes).slice(0, 4000) : null;
    if (!KINDS.has(kind) || !value || !STATUSES.has(status)) return res.status(400).json({ message: "kind, value and a valid status are required" });
    if (status === "confirmed" && (!notes || notes.trim().length < 15)) {
      return res.status(400).json({ message: "Write a short note on the evidence you reviewed before confirming a link (at least 15 characters)." });
    }
    if (status === "confirmed" && kind === "name") {
      return res.status(400).json({ message: "Names alone are too weak to confirm. Confirm the phone, email, domain or payment account instead." });
    }
    const { rows: [before] } = await pool.query(`SELECT * FROM intel_indicator_reviews WHERE kind=$1 AND value=$2`, [kind, value]);
    const { rows: [after] } = await pool.query(
      `INSERT INTO intel_indicator_reviews (kind, value, status, notes, reviewed_by, reviewed_at) VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (kind, value) DO UPDATE SET status=EXCLUDED.status, notes=COALESCE(EXCLUDED.notes, intel_indicator_reviews.notes),
         reviewed_by=EXCLUDED.reviewed_by, reviewed_at=now() RETURNING *`, [kind, value, status, notes, adminId]);
    await pool.query(`INSERT INTO intel_review_log (kind, value, before, after, actor_id) VALUES ($1,$2,$3,$4,$5)`,
      [kind, value, before ? JSON.stringify(before) : null, JSON.stringify(after), adminId]);
    if (status === "false_positive") {
      await pool.query(`UPDATE intel_alerts SET status='dismissed', seen_by=$3, seen_at=now() WHERE kind=$1 AND value=$2 AND status<>'dismissed'`, [kind, value, adminId]);
    }
    res.json({ review: after });
  }));

  app.get("/api/admin/intel/alerts", adminOnly(async (req, res) => {
    const status = ["new", "seen", "dismissed", "all"].includes(String(req.query.status)) ? String(req.query.status) : "new";
    const { rows } = await pool.query(
      `SELECT a.*, coalesce(rv.status,'unreviewed') AS review_status,
              CASE WHEN a.source_type='offer_check' THEN (SELECT reference_no FROM verifyx_requests r WHERE r.id::text=a.source_id) END AS reference_no
         FROM intel_alerts a LEFT JOIN intel_indicator_reviews rv ON rv.kind=a.kind AND rv.value=a.value
        WHERE ($1='all' OR a.status=$1) ORDER BY a.created_at DESC LIMIT 200`, [status]);
    res.json({ alerts: rows });
  }));

  app.post("/api/admin/intel/alerts/:id", adminOnly(async (req, res, adminId) => {
    const st = ["seen", "dismissed", "new"].includes(req.body?.status) ? req.body.status : null;
    if (!st) return res.status(400).json({ message: "status must be seen, dismissed or new" });
    const { rows: [row] } = await pool.query(
      `UPDATE intel_alerts SET status=$2, seen_by=$3, seen_at=now() WHERE id=$1 RETURNING *`, [Number(req.params.id), st, adminId]);
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json({ alert: row });
  }));

  app.post("/api/admin/intel/backfill", adminOnly(async (_req, res, adminId) => {
    const r = await backfillOfferChecks(500);
    console.log(`[intel] backfill by ${adminId}: indexed=${r.indexed} alerts=${r.alerts}`);
    res.json(r);
  }));

  console.log("[intel] ✓ admin routes registered (/api/admin/intel/*)");
}
