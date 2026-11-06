/**
 * VerifyX persistence: durable requests, findings, reports, corrections,
 * audit log, and retention enforcement. Original files are NEVER stored.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { pool } from "../db";
import { VERIFYX_ENGINE_VERSION } from "./evidence";
import type { VerifyXReport } from "./report";
import type { ModelUsage } from "./model";

export const RETENTION_DAYS = Math.max(1, Number(process.env.VERIFYX_RETENTION_DAYS ?? 30));

export function hashKey(k: string): string {
  return createHash("sha256").update(`vx:${k}`).digest("hex");
}

export function newAccessKey(): string {
  return randomBytes(24).toString("base64url");
}

function referenceNo(): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `VX-${ymd}-${s}`;
}

export async function audit(action: string, opts: { requestId?: string | null; actorId?: string | null; actorKind?: "system" | "user" | "admin"; detail?: any } = {}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO verifyx_audit_log (actor_id, actor_kind, action, request_id, detail) VALUES ($1,$2,$3,$4,$5)`,
      [opts.actorId ?? null, opts.actorKind ?? "system", action, opts.requestId ?? null, opts.detail ? JSON.stringify(opts.detail) : null],
    );
  } catch (err: any) {
    console.warn("[VerifyX] audit insert failed:", err?.message);
  }
}

export async function createRequest(args: {
  tool: "visa_check" | "offer_check"; userId: string | null; accessKey: string; paymentId: string | null;
  jobId: string; fileSha256: string; mime: string; fileKind: string | null;
}): Promise<{ id: string; referenceNo: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = referenceNo();
    try {
      const { rows } = await pool.query(
        `INSERT INTO verifyx_requests (reference_no, tool, user_id, guest_key_hash, payment_id, job_id, file_sha256, mime, file_kind, engine_version, consent_at, retention_expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), now() + make_interval(days => $11)) RETURNING id`,
        [ref, args.tool, args.userId, hashKey(args.accessKey), args.paymentId, args.jobId, args.fileSha256, args.mime, args.fileKind, VERIFYX_ENGINE_VERSION, RETENTION_DAYS],
      );
      await audit("request.created", { requestId: rows[0].id, actorId: args.userId, actorKind: args.userId ? "user" : "system", detail: { tool: args.tool, ref } });
      return { id: rows[0].id, referenceNo: ref };
    } catch (err: any) {
      if (!String(err?.message).includes("reference_no")) throw err;
    }
  }
  throw new Error("could not allocate reference number");
}

export async function saveResult(args: {
  requestId: string; report: VerifyXReport; extractedFields: Record<string, { value: string | null; confidence: number | null; userCorrected?: boolean }>;
  extractionJson: unknown; usage: ModelUsage | null; latencyMs: number | null; revision: number;
}): Promise<void> {
  const { requestId, report, revision } = args;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [field, v] of Object.entries(args.extractedFields)) {
      await client.query(
        `INSERT INTO verifyx_extracted_fields (request_id, field, value, confidence, user_corrected, corrected_at)
         VALUES ($1,$2,$3,$4,$5, CASE WHEN $5 THEN now() END)
         ON CONFLICT (request_id, field) DO UPDATE SET value=EXCLUDED.value, confidence=EXCLUDED.confidence,
           user_corrected = verifyx_extracted_fields.user_corrected OR EXCLUDED.user_corrected,
           corrected_at = COALESCE(EXCLUDED.corrected_at, verifyx_extracted_fields.corrected_at)`,
        [requestId, field, v.value, v.confidence, !!v.userCorrected],
      );
    }
    // The raw extraction (needed for re-checks after corrections) — purged with the rest.
    await client.query(
      `INSERT INTO verifyx_extracted_fields (request_id, field, value) VALUES ($1, '__extraction', $2)
       ON CONFLICT (request_id, field) DO UPDATE SET value = EXCLUDED.value`,
      [requestId, JSON.stringify(args.extractionJson)],
    );
    for (const f of report.findings) {
      await client.query(
        `INSERT INTO verifyx_findings (request_id, finding_id, revision, code, status, priority, method, rule_id, source_id, downgraded_from, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [requestId, f.id, revision, f.code, f.status, f.priority, f.method, f.source?.ruleId ?? null, f.source?.sourceId ?? null, f.downgradedFrom ?? null, JSON.stringify(f)],
      );
    }
    for (const r of report._rejected ?? []) {
      await client.query(`INSERT INTO verifyx_rejected_findings (request_id, code, reason) VALUES ($1,$2,$3)`, [requestId, r.code, r.reason]);
    }
    const { _rejected, ...publicReport } = report;
    await client.query(
      `INSERT INTO verifyx_reports (request_id, revision, report) VALUES ($1,$2,$3)
       ON CONFLICT (request_id) DO UPDATE SET revision=EXCLUDED.revision, report=EXCLUDED.report, updated_at=now()`,
      [requestId, revision, JSON.stringify(publicReport)],
    );
    await client.query(
      // 2026-11-06 hotfix: explicit casts — Postgres inferred $9 as integer
      // from COALESCE($9, 0) and rejected the fractional USD cost, failing
      // every check at the very last step.
      `UPDATE verifyx_requests SET status='done', outcome=$2::text, country_code=$3::text, document_kind=$4::text,
         latency_ms = COALESCE($5::int, latency_ms), model = COALESCE($6::text, model),
         model_input_tokens = COALESCE(model_input_tokens,0) + COALESCE($7::int,0),
         model_output_tokens = COALESCE(model_output_tokens,0) + COALESCE($8::int,0),
         model_cost_usd = COALESCE(model_cost_usd,0) + COALESCE($9::numeric,0), updated_at=now()
       WHERE id=$1`,
      [requestId, report.outcome, report.country?.code ?? null, report.documentKind, args.latencyMs, args.usage?.model ?? null,
       args.usage?.inputTokens ?? null, args.usage?.outputTokens ?? null, args.usage?.estCostUsd ?? null],
    );
    if (report.findings.some((f) => f.status === "manual_review_required")) {
      const { rows: open } = await client.query(`SELECT 1 FROM verifyx_review_cases WHERE request_id=$1 AND kind='auto_flag' AND status<>'resolved'`, [requestId]);
      if (!open.length) {
        await client.query(`INSERT INTO verifyx_review_cases (request_id, kind, user_message) VALUES ($1,'auto_flag','Report contains a finding that requires manual review.')`, [requestId]);
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function failRequest(requestId: string, message: string, latencyMs: number | null): Promise<void> {
  await pool.query(
    `UPDATE verifyx_requests SET status='error', error_message=$2, latency_ms=$3, updated_at=now() WHERE id=$1`,
    [requestId, message.slice(0, 500), latencyMs],
  ).catch(() => {});
}

export interface OwnedRequest {
  id: string; reference_no: string; tool: string; user_id: string | null; status: string;
  purged_at: string | null; retention_expires_at: string;
}

/** Load a request if (and only if) the caller owns it. */
export async function loadOwnedRequest(requestId: string, userId: string | null, accessKey: string | null): Promise<OwnedRequest | null> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return null;
  const { rows: [r] } = await pool.query(
    `SELECT id, reference_no, tool, user_id, guest_key_hash, status, purged_at, retention_expires_at FROM verifyx_requests WHERE id=$1`, [requestId],
  );
  if (!r) return null;
  const byUser = !!userId && r.user_id === userId;
  let byKey = false;
  if (accessKey && r.guest_key_hash) {
    const a = Buffer.from(hashKey(accessKey)); const b = Buffer.from(r.guest_key_hash);
    byKey = a.length === b.length && timingSafeEqual(a, b);
  }
  return byUser || byKey ? r : null;
}

export async function loadExtraction(requestId: string): Promise<any | null> {
  const { rows: [r] } = await pool.query(`SELECT value FROM verifyx_extracted_fields WHERE request_id=$1 AND field='__extraction'`, [requestId]);
  if (!r?.value) return null;
  try { return JSON.parse(r.value); } catch { return null; }
}

export async function loadCorrections(requestId: string): Promise<{ values: Record<string, string | null>; confirmed: string[] }> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (field) field, new_value FROM verifyx_corrections WHERE request_id=$1 ORDER BY field, id DESC`, [requestId],
  );
  const values: Record<string, string | null> = {};
  const confirmed: string[] = [];
  for (const r of rows) {
    if (r.new_value === "__confirmed__") confirmed.push(r.field);
    else values[r.field] = r.new_value;
  }
  return { values, confirmed };
}

export async function currentRevision(requestId: string): Promise<number> {
  const { rows: [r] } = await pool.query(`SELECT revision FROM verifyx_reports WHERE request_id=$1`, [requestId]);
  return r?.revision ?? 1;
}

export async function loadReport(requestId: string): Promise<any | null> {
  const { rows: [r] } = await pool.query(`SELECT report FROM verifyx_reports WHERE request_id=$1`, [requestId]);
  return r?.report ?? null;
}

// ── Retention ──────────────────────────────────────────────────────────

/**
 * Remove personal data from expired requests while keeping anonymous,
 * aggregate data (finding codes / statuses / outcome) for accuracy metrics.
 * Also anonymises the legacy visa_checks / offer_letter_checks tables, whose
 * 30-day retention was promised but never enforced.
 */
export async function runRetentionSweep(): Promise<{ requests: number; legacyVisa: number; legacyOffer: number }> {
  const res = { requests: 0, legacyVisa: 0, legacyOffer: 0 };
  const { rows } = await pool.query(
    `SELECT id FROM verifyx_requests WHERE purged_at IS NULL AND retention_expires_at < now() LIMIT 500`,
  );
  for (const r of rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM verifyx_extracted_fields WHERE request_id=$1`, [r.id]);
      await client.query(`DELETE FROM verifyx_corrections WHERE request_id=$1`, [r.id]);
      await client.query(
        `UPDATE verifyx_findings SET payload = jsonb_build_object('code', code, 'status', status, 'priority', priority, 'method', method, 'purged', true) WHERE request_id=$1`, [r.id],
      );
      await client.query(
        `UPDATE verifyx_reports SET report = jsonb_build_object('purged', true, 'outcome', report->'outcome', 'counts', report->'counts', 'engineVersion', report->'engineVersion'), updated_at=now() WHERE request_id=$1`, [r.id],
      );
      await client.query(`UPDATE verifyx_review_cases SET user_message = NULL WHERE request_id=$1`, [r.id]);
      await client.query(`UPDATE verifyx_requests SET purged_at=now(), file_sha256=NULL, guest_key_hash=NULL, updated_at=now() WHERE id=$1`, [r.id]);
      await client.query("COMMIT");
      res.requests++;
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.warn("[VerifyX] retention purge failed for", r.id, err?.message);
    } finally {
      client.release();
    }
  }
  const v = await pool.query(
    `UPDATE visa_checks SET ocr_text=NULL, visa_number=NULL, holder_name=NULL, mrz_raw=NULL, original_filename=NULL,
       ai_vision_notes=NULL, guest_fingerprint=NULL, image_sha256='anonymised', admin_notes=NULL,
       findings = CASE WHEN jsonb_typeof(findings::jsonb)='array' THEN (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', e->>'code', 'severity', e->>'severity')), '[]'::jsonb) FROM jsonb_array_elements(findings::jsonb) e) ELSE '[]'::jsonb END,
       anonymised_at=now()
     WHERE anonymised_at IS NULL AND COALESCE(retention_expires_at, created_at + interval '30 days') < now()`,
  ).catch((e: any) => { console.warn("[VerifyX] legacy visa anonymise failed:", e?.message); return { rowCount: 0 } as any; });
  const o = await pool.query(
    `UPDATE offer_letter_checks SET ocr_text=NULL, candidate_name=NULL, employer_name=NULL, original_filename=NULL,
       ai_vision_notes=NULL, guest_fingerprint=NULL, file_sha256='anonymised', sender_domain=NULL, admin_notes=NULL,
       findings = CASE WHEN jsonb_typeof(findings::jsonb)='array' THEN (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', e->>'code', 'severity', e->>'severity')), '[]'::jsonb) FROM jsonb_array_elements(findings::jsonb) e) ELSE '[]'::jsonb END,
       anonymised_at=now()
     WHERE anonymised_at IS NULL AND COALESCE(retention_expires_at, created_at + interval '30 days') < now()`,
  ).catch((e: any) => { console.warn("[VerifyX] legacy offer anonymise failed:", e?.message); return { rowCount: 0 } as any; });
  res.legacyVisa = v.rowCount ?? 0;
  res.legacyOffer = o.rowCount ?? 0;
  if (res.requests || res.legacyVisa || res.legacyOffer) {
    await audit("retention.sweep", { detail: res });
    console.log(`[VerifyX] retention sweep: ${res.requests} requests purged, legacy anonymised visa=${res.legacyVisa} offer=${res.legacyOffer}`);
  }
  return res;
}

let retentionStarted = false;
export function startRetentionSweep(): void {
  if (retentionStarted) return;
  retentionStarted = true;
  setTimeout(() => runRetentionSweep().catch(() => {}), 120_000);
  setInterval(() => runRetentionSweep().catch(() => {}), 6 * 3600_000);
  console.log(`[VerifyX] ✓ retention sweep scheduled (${RETENTION_DAYS}-day retention)`);
}
