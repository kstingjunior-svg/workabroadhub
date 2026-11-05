/**
 * VerifyX HTTP routes.
 *
 * Customer (owner = signed-in user or holder of the report access key):
 *   GET  /api/verifyx/requests/:id                  current report
 *   POST /api/verifyx/requests/:id/corrections      correct / confirm misread fields → free re-check (no AI call)
 *   POST /api/verifyx/requests/:id/review           request manual review / dispute a finding
 *
 * Admin:
 *   GET  /api/admin/verifyx/overview                volumes, outcomes, latency, cost, review queue, rejections
 *   GET  /api/admin/verifyx/requests                recent requests (filters: status, outcome, tool)
 *   GET  /api/admin/verifyx/requests/:id            full report + fields + corrections + audit trail
 *   GET  /api/admin/verifyx/reviews                 review queue
 *   POST /api/admin/verifyx/reviews/:id             record a decision (logged; never shown as government verification)
 *   GET  /api/admin/verifyx/sources                 source health + recent syncs + pending change events
 *   POST /api/admin/verifyx/sources/:id/sync        run a sync now
 *   POST /api/admin/verifyx/changes/:id             accept / dismiss a detected source change
 *   POST /api/admin/verifyx/rules/:ruleId/:version  approve / reject a rule's citation
 */
import type { Express, Response } from "express";
import { pool } from "../db";
import {
  audit, currentRevision, loadCorrections, loadExtraction, loadOwnedRequest, loadReport, saveResult,
} from "./store";
import { publicReport } from "./report";

function sessionUserId(req: any): string | null {
  const id = req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId ?? null;
  return id ? String(id) : null;
}
function accessKeyOf(req: any): string | null {
  const k = req.headers["x-verifyx-key"] ?? req.headers["x-poll-key"];
  return k ? String(k).slice(0, 200) : null;
}
async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { rows } = await pool.query(`SELECT is_admin, role FROM users WHERE id = $1`, [userId]).catch(() => ({ rows: [] as any[] }));
  const u = rows[0];
  return !!u && (u.is_admin === true || ["admin", "ADMIN", "SUPER_ADMIN"].includes(String(u.role ?? "")));
}
function adminOnly(handler: (req: any, res: Response, adminId: string) => Promise<any>) {
  return async (req: any, res: Response) => {
    const uid = sessionUserId(req);
    if (!uid) return res.status(401).json({ message: "Please sign in." });
    if (!(await isAdmin(uid))) return res.status(403).json({ message: "Admin only." });
    try { await handler(req, res, uid); }
    catch (err: any) {
      console.error(`[verifyx-admin] ${req.method} ${req.path}:`, err?.message);
      res.status(500).json({ message: "Something went wrong. Nothing was changed." });
    }
  };
}

// Simple per-request rate limit on free re-checks.
const recheckHits = new Map<string, number[]>();
function allowRecheck(id: string): boolean {
  const now = Date.now();
  const hits = (recheckHits.get(id) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 10) return false;
  hits.push(now); recheckHits.set(id, hits);
  return true;
}

export function registerVerifyxRoutes(app: Express): void {
  // ── Customer ─────────────────────────────────────────────────────────
  app.get("/api/verifyx/requests/:id", async (req: any, res) => {
    const r = await loadOwnedRequest(req.params.id, sessionUserId(req), accessKeyOf(req)).catch(() => null);
    if (!r) return res.status(404).json({ message: "Report not found." });
    if (r.purged_at) return res.status(410).json({ message: "This report's personal data was deleted under our retention policy." });
    const report = await loadReport(r.id);
    if (!report) return res.status(404).json({ message: "Report not ready." });
    await audit("report.viewed", { requestId: r.id, actorId: sessionUserId(req), actorKind: "user" });
    res.json(report);
  });

  app.post("/api/verifyx/requests/:id/corrections", async (req: any, res) => {
    try {
      const uid = sessionUserId(req);
      const r = await loadOwnedRequest(req.params.id, uid, accessKeyOf(req));
      if (!r) return res.status(404).json({ message: "Report not found." });
      if (r.purged_at) return res.status(410).json({ message: "This report has expired." });
      if (!allowRecheck(r.id)) return res.status(429).json({ message: "Too many re-checks for this report. Please try again later." });

      const values: Record<string, string | null> = {};
      const raw = req.body?.values ?? {};
      if (raw && typeof raw === "object") {
        for (const [k, v] of Object.entries(raw).slice(0, 25)) {
          if (!/^[a-zA-Z]{2,40}$/.test(k)) continue;
          values[k] = v == null ? null : String(v).slice(0, 300);
        }
      }
      const confirmed: string[] = Array.isArray(req.body?.confirmed)
        ? req.body.confirmed.filter((x: any) => typeof x === "string" && /^[a-zA-Z]{2,40}$/.test(x)).slice(0, 25) : [];
      if (!Object.keys(values).length && !confirmed.length) return res.status(400).json({ message: "Nothing to change." });

      const extraction = await loadExtraction(r.id);
      if (!extraction) return res.status(409).json({ message: "This report can't be re-checked." });

      const { rows: oldRows } = await pool.query(`SELECT field, value FROM verifyx_extracted_fields WHERE request_id=$1`, [r.id]);
      const old = new Map(oldRows.map((x: any) => [x.field, x.value]));
      for (const [field, nv] of Object.entries(values)) {
        await pool.query(`INSERT INTO verifyx_corrections (request_id, user_id, field, old_value, new_value) VALUES ($1,$2,$3,$4,$5)`,
          [r.id, uid, field, old.get(field) ?? null, nv]);
      }
      for (const field of confirmed) {
        if (field in values) continue;
        await pool.query(`INSERT INTO verifyx_corrections (request_id, user_id, field, old_value, new_value) VALUES ($1,$2,$3,$4,'__confirmed__')`,
          [r.id, uid, field, old.get(field) ?? null]);
      }
      const all = await loadCorrections(r.id);
      const revision = (await currentRevision(r.id)) + 1;

      let report: any;
      if (r.tool === "visa_check") {
        const { evaluateVisa } = await import("../visa-verify/analyzer");
        // PDF structure scan results are stored in findings; re-derive nothing from the file (never stored).
        report = await evaluateVisa(extraction, { pdf: extraction.__pdf ?? null, corrections: all, revision });
      } else {
        const { evaluateOffer } = await import("../offer-verify/analyzer");
        report = await evaluateOffer(extraction, { corrections: all, revision });
      }
      report = { ...report, requestId: r.id, referenceNo: r.reference_no };
      const fieldMap: Record<string, any> = {};
      for (const fv of report.extractedFields) fieldMap[fv.field] = { value: fv.value, confidence: fv.confidence, userCorrected: fv.userCorrected };
      await saveResult({ requestId: r.id, report, extractedFields: fieldMap, extractionJson: extraction, usage: null, latencyMs: null, revision });
      await audit("report.rechecked", { requestId: r.id, actorId: uid, actorKind: "user", detail: { fields: Object.keys(values), confirmed, revision } });
      res.json(publicReport(report));
    } catch (err: any) {
      console.error("[VerifyX] recheck failed:", err?.message);
      res.status(500).json({ message: "Could not re-check right now. Please try again." });
    }
  });

  app.post("/api/verifyx/requests/:id/review", async (req: any, res) => {
    try {
      const uid = sessionUserId(req);
      const r = await loadOwnedRequest(req.params.id, uid, accessKeyOf(req));
      if (!r) return res.status(404).json({ message: "Report not found." });
      const message = String(req.body?.message ?? "").trim().slice(0, 2000);
      const kind = req.body?.kind === "dispute" ? "dispute" : "manual_review";
      const { rows: open } = await pool.query(
        `SELECT id FROM verifyx_review_cases WHERE request_id=$1 AND kind=$2 AND status<>'resolved'`, [r.id, kind],
      );
      if (open.length) return res.json({ ok: true, caseId: open[0].id, alreadyOpen: true });
      const { rows } = await pool.query(
        `INSERT INTO verifyx_review_cases (request_id, opened_by, kind, user_message) VALUES ($1,$2,$3,$4) RETURNING id`,
        [r.id, uid, kind, message || null],
      );
      await audit("review.requested", { requestId: r.id, actorId: uid, actorKind: "user", detail: { kind, caseId: rows[0].id } });
      try {
        const { notifyFinanceAdmins } = await import("../lib/finance-notify");
        await notifyFinanceAdmins({
          kind: "review", title: `VerifyX ${kind === "dispute" ? "dispute" : "review request"} — ${r.reference_no}`,
          body: message ? message.slice(0, 300) : "Customer requested a manual review.", dedupeKey: `vx-review-${rows[0].id}`,
        });
      } catch { /* best effort */ }
      res.json({ ok: true, caseId: rows[0].id });
    } catch (err: any) {
      console.error("[VerifyX] review request failed:", err?.message);
      res.status(500).json({ message: "Could not send your request. Please try again." });
    }
  });

  // ── Admin ────────────────────────────────────────────────────────────
  app.get("/api/admin/verifyx/overview", adminOnly(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days ?? 30)));
    const [{ rows: [tot] }, { rows: byTool }, { rows: byCountry }, { rows: byOutcome }, { rows: byStatus }, { rows: [rev] }, { rows: [rej] }, { rows: topCodes }] = await Promise.all([
      pool.query(`SELECT count(*)::int n, count(*) FILTER (WHERE status='error')::int errors,
                         round(avg(latency_ms) FILTER (WHERE status='done'))::int avg_latency_ms,
                         percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status='done') p95_latency_ms,
                         round(sum(model_cost_usd)::numeric, 4) cost_usd
                    FROM verifyx_requests WHERE created_at > now() - make_interval(days => $1)`, [days]),
      pool.query(`SELECT tool, count(*)::int n FROM verifyx_requests WHERE created_at > now() - make_interval(days => $1) GROUP BY 1`, [days]),
      pool.query(`SELECT coalesce(country_code,'unknown') country, count(*)::int n FROM verifyx_requests WHERE created_at > now() - make_interval(days => $1) GROUP BY 1 ORDER BY 2 DESC LIMIT 20`, [days]),
      pool.query(`SELECT coalesce(outcome, status) outcome, count(*)::int n FROM verifyx_requests WHERE created_at > now() - make_interval(days => $1) GROUP BY 1`, [days]),
      pool.query(`SELECT f.status, count(*)::int n FROM verifyx_findings f JOIN verifyx_requests r ON r.id=f.request_id
                   WHERE r.created_at > now() - make_interval(days => $1)
                     AND f.revision = (SELECT max(revision) FROM verifyx_findings x WHERE x.request_id=f.request_id) GROUP BY 1`, [days]),
      pool.query(`SELECT count(*) FILTER (WHERE status<>'resolved')::int open, count(*) FILTER (WHERE kind='dispute')::int disputes,
                         count(*) FILTER (WHERE false_positive)::int false_positives, count(*) FILTER (WHERE false_negative)::int false_negatives,
                         count(*) FILTER (WHERE decision='corrected')::int corrected
                    FROM verifyx_review_cases WHERE created_at > now() - make_interval(days => $1)`, [days]),
      pool.query(`SELECT count(*)::int n FROM verifyx_rejected_findings WHERE created_at > now() - make_interval(days => $1)`, [days]),
      pool.query(`SELECT code, status, count(*)::int n FROM verifyx_findings f JOIN verifyx_requests r ON r.id=f.request_id
                   WHERE r.created_at > now() - make_interval(days => $1) AND f.status IN ('confirmed_discrepancy','potential_risk_indicator','manual_review_required')
                   GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15`, [days]),
    ]);
    const { rows: corrections } = await pool.query(
      `SELECT count(DISTINCT request_id)::int n FROM verifyx_corrections WHERE created_at > now() - make_interval(days => $1)`, [days]);
    res.json({ days, totals: tot, byTool, byCountry, byOutcome, findingsByStatus: byStatus, reviews: rev,
               rejectedFindings: rej?.n ?? 0, topRiskCodes: topCodes, requestsWithCorrections: corrections[0]?.n ?? 0 });
  }));

  app.get("/api/admin/verifyx/requests", adminOnly(async (req, res) => {
    const params: any[] = [];
    const where: string[] = [];
    if (req.query.tool) { params.push(String(req.query.tool)); where.push(`r.tool = $${params.length}`); }
    if (req.query.outcome) { params.push(String(req.query.outcome)); where.push(`r.outcome = $${params.length}`); }
    if (req.query.status) { params.push(String(req.query.status)); where.push(`r.status = $${params.length}`); }
    if (req.query.q) { params.push(String(req.query.q).toUpperCase()); where.push(`r.reference_no = $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT r.id, r.reference_no, r.tool, r.status, r.outcome, r.country_code, r.document_kind, r.latency_ms, r.model_cost_usd,
              r.created_at, r.purged_at, r.error_message,
              (SELECT count(*)::int FROM verifyx_review_cases c WHERE c.request_id=r.id AND c.status<>'resolved') open_reviews
         FROM verifyx_requests r ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY r.created_at DESC LIMIT 200`, params);
    res.json({ requests: rows });
  }));

  app.get("/api/admin/verifyx/requests/:id", adminOnly(async (req, res, adminId) => {
    const id = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ message: "Not found" });
    const [{ rows: [r] }, report, { rows: fields }, { rows: corrections }, { rows: reviews }, { rows: trail }, { rows: rejected }] = await Promise.all([
      pool.query(`SELECT * FROM verifyx_requests WHERE id=$1`, [id]),
      loadReport(id),
      pool.query(`SELECT field, value, confidence, user_corrected, corrected_at FROM verifyx_extracted_fields WHERE request_id=$1 AND field<>'__extraction' ORDER BY field`, [id]),
      pool.query(`SELECT * FROM verifyx_corrections WHERE request_id=$1 ORDER BY id`, [id]),
      pool.query(`SELECT * FROM verifyx_review_cases WHERE request_id=$1 ORDER BY id`, [id]),
      pool.query(`SELECT at, actor_kind, actor_id, action, detail FROM verifyx_audit_log WHERE request_id=$1 ORDER BY at`, [id]),
      pool.query(`SELECT code, reason, created_at FROM verifyx_rejected_findings WHERE request_id=$1 ORDER BY id`, [id]),
    ]);
    if (!r) return res.status(404).json({ message: "Not found" });
    await audit("admin.viewed_request", { requestId: id, actorId: adminId, actorKind: "admin" });
    const { guest_key_hash, ...safe } = r;
    res.json({ request: safe, report, fields, corrections, reviews, auditTrail: trail, rejectedFindings: rejected });
  }));

  app.get("/api/admin/verifyx/reviews", adminOnly(async (req, res) => {
    const status = String(req.query.status ?? "open");
    const { rows } = await pool.query(
      `SELECT c.*, r.reference_no, r.tool, r.outcome, r.country_code FROM verifyx_review_cases c JOIN verifyx_requests r ON r.id=c.request_id
        WHERE ($1 = 'all' OR ($1 = 'open' AND c.status <> 'resolved') OR c.status = $1)
        ORDER BY c.created_at DESC LIMIT 200`, [status]);
    res.json({ reviews: rows });
  }));

  app.post("/api/admin/verifyx/reviews/:id", adminOnly(async (req, res, adminId) => {
    const id = Number(req.params.id);
    const decision = ["upheld", "corrected", "needs_government_confirmation"].includes(req.body?.decision) ? req.body.decision : null;
    const status = ["open", "in_review", "resolved"].includes(req.body?.status) ? req.body.status : (decision ? "resolved" : "in_review");
    const notes = req.body?.notes ? String(req.body.notes).slice(0, 4000) : null;
    const fp = typeof req.body?.falsePositive === "boolean" ? req.body.falsePositive : null;
    const fn = typeof req.body?.falseNegative === "boolean" ? req.body.falseNegative : null;
    const { rows: [before] } = await pool.query(`SELECT * FROM verifyx_review_cases WHERE id=$1`, [id]);
    if (!before) return res.status(404).json({ message: "Not found" });
    const { rows: [after] } = await pool.query(
      `UPDATE verifyx_review_cases SET status=$2, decision=COALESCE($3, decision), decision_notes=COALESCE($4, decision_notes),
         false_positive=COALESCE($5, false_positive), false_negative=COALESCE($6, false_negative), reviewer_id=$7,
         resolved_at = CASE WHEN $2='resolved' THEN now() ELSE NULL END
       WHERE id=$1 RETURNING *`, [id, status, decision, notes, fp, fn, adminId]);
    await audit("review.decision", { requestId: before.request_id, actorId: adminId, actorKind: "admin", detail: { caseId: id, before, after } });
    res.json({ review: after });
  }));

  app.get("/api/admin/verifyx/sources", adminOnly(async (_req, res) => {
    const [{ rows: sources }, { rows: syncs }, { rows: changes }, { rows: rules }] = await Promise.all([
      pool.query(`SELECT * FROM verifyx_official_sources ORDER BY country, id`),
      pool.query(`SELECT * FROM verifyx_source_syncs ORDER BY started_at DESC LIMIT 30`),
      pool.query(`SELECT * FROM verifyx_rule_change_events ORDER BY detected_at DESC LIMIT 50`),
      pool.query(`SELECT * FROM verifyx_rules ORDER BY country, rule_id, version`),
    ]);
    res.json({ sources, syncs, changes, rules });
  }));

  app.post("/api/admin/verifyx/sources/:id/sync", adminOnly(async (req, res, adminId) => {
    const id = String(req.params.id);
    const m = await import("./source-sync");
    let result: any;
    if (id === "uk_sponsor_register") result = await m.syncUkSponsorRegister(true);
    else if (id === "ke_nea_register") { await m.refreshNeaHealth(); result = { status: "refreshed" }; }
    else if (id === "guidance") { await m.checkGuidanceChanges(); result = { status: "checked" }; }
    else return res.status(400).json({ message: "This source has no automated connector." });
    await audit("admin.source_sync", { actorId: adminId, actorKind: "admin", detail: { id, result } });
    res.json(result);
  }));

  app.post("/api/admin/verifyx/changes/:id", adminOnly(async (req, res, adminId) => {
    const st = ["accepted", "dismissed"].includes(req.body?.status) ? req.body.status : null;
    if (!st) return res.status(400).json({ message: "status must be accepted or dismissed" });
    const { rows: [row] } = await pool.query(
      `UPDATE verifyx_rule_change_events SET review_status=$2, reviewed_by=$3, reviewed_at=now(), notes=$4 WHERE id=$1 RETURNING *`,
      [Number(req.params.id), st, adminId, req.body?.notes ? String(req.body.notes).slice(0, 2000) : null]);
    await audit("admin.change_event", { actorId: adminId, actorKind: "admin", detail: row });
    res.json({ change: row });
  }));

  app.post("/api/admin/verifyx/rules/:ruleId/:version", adminOnly(async (req, res, adminId) => {
    const st = ["approved", "pending_review", "rejected"].includes(req.body?.status) ? req.body.status : null;
    if (!st) return res.status(400).json({ message: "invalid status" });
    const { rows: [row] } = await pool.query(
      `UPDATE verifyx_rules SET review_status=$3, reviewed_by=$4, reviewed_at=now(), last_verified_at=now() WHERE rule_id=$1 AND version=$2 RETURNING *`,
      [String(req.params.ruleId), Number(req.params.version), st, adminId]);
    if (!row) return res.status(404).json({ message: "Not found" });
    await audit("admin.rule_review", { actorId: adminId, actorKind: "admin", detail: row });
    res.json({ rule: row, note: "Rule review status is recorded for audit. Code-side rules take effect on the next deploy." });
  }));

  console.log("[VerifyX] ✓ routes registered (/api/verifyx/*, /api/admin/verifyx/*)");
}
