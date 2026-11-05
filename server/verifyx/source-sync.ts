/**
 * VerifyX Immigration Intelligence Synchronization Engine.
 *
 * Runs in the background, completely separate from document processing:
 *   - seeds the source + rule registry tables from code (sources.ts)
 *   - downloads public datasets on a schedule (UK register of licensed sponsors)
 *   - detects content changes on official guidance pages → rule_change_events
 *     for human review (nothing is auto-applied)
 *   - tracks connector health and raises admin alerts on failure / staleness
 *
 * SSRF: only URLs from the hard-coded registry are ever fetched.
 */
import { createHash } from "crypto";
import { pool } from "../db";
import { OFFICIAL_SOURCES, IMMIGRATION_RULES } from "./sources";
import { normalizeEmployerName, parseCsv, splitTradingNames } from "./names";

const UK_CONTENT_API = "https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers";
const ALLOWED_DOWNLOAD_HOSTS = new Set(["www.gov.uk", "assets.publishing.service.gov.uk", "www.canada.ca", "u.ae", "immi.homeaffairs.gov.au", "www.icao.int", "ceac.state.gov", "www.e-verify.gov", "neaims.go.ke"]);

function sha256(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

async function safeFetch(url: string, timeoutMs = 60_000): Promise<Response> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !ALLOWED_DOWNLOAD_HOSTS.has(u.hostname)) {
    throw new Error(`blocked host ${u.hostname}`);
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "WorkAbroadHub-VerifyX/1.0 (+https://workabroadhub.tech)" },
    });
    const finalHost = new URL(res.url || url).hostname;
    if (!ALLOWED_DOWNLOAD_HOSTS.has(finalHost)) throw new Error(`redirected to blocked host ${finalHost}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function notifyAdmins(title: string, body: string, dedupeKey: string): Promise<void> {
  try {
    const { notifyFinanceAdmins } = await import("../lib/finance-notify");
    await notifyFinanceAdmins({ kind: "review", title, body, dedupeKey });
  } catch { /* best effort */ }
}

export async function seedRegistry(): Promise<void> {
  for (const s of OFFICIAL_SOURCES) {
    await pool.query(
      `INSERT INTO verifyx_official_sources (id, country, authority, title, url, capability, max_age_hours, connector_status, last_reviewed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET country=EXCLUDED.country, authority=EXCLUDED.authority, title=EXCLUDED.title,
         url=EXCLUDED.url, capability=EXCLUDED.capability, max_age_hours=EXCLUDED.max_age_hours,
         last_reviewed=EXCLUDED.last_reviewed, updated_at=now(),
         connector_status = CASE WHEN verifyx_official_sources.connector_status IN ('operational','degraded','unavailable')
                                  AND EXCLUDED.capability = 'synced_dataset'
                                 THEN verifyx_official_sources.connector_status ELSE EXCLUDED.connector_status END`,
      [s.id, s.country, s.authority, s.title, s.url, s.capability, s.maxAgeHours ?? null,
       s.capability === "synced_dataset" ? "unavailable" : s.capability === "not_available" ? "not_built" : "awaiting_authorization",
       s.lastReviewed],
    );
  }
  for (const r of IMMIGRATION_RULES) {
    await pool.query(
      `INSERT INTO verifyx_rules (rule_id, version, country, document_type, source_id, rule_text, effective_from, effective_to, retrieved_at, review_status, content_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (rule_id, version) DO UPDATE SET rule_text=EXCLUDED.rule_text, effective_from=EXCLUDED.effective_from,
         effective_to=EXCLUDED.effective_to, source_id=EXCLUDED.source_id, content_hash=EXCLUDED.content_hash,
         review_status = CASE WHEN verifyx_rules.reviewed_by IS NOT NULL THEN verifyx_rules.review_status ELSE EXCLUDED.review_status END`,
      [r.ruleId, r.version, r.country, r.documentType, r.sourceId, r.ruleText, r.effectiveFrom, r.effectiveTo, r.retrievedAt, r.reviewStatus, sha256(r.ruleText)],
    );
  }
}

async function startSync(sourceId: string): Promise<number> {
  const { rows } = await pool.query(`INSERT INTO verifyx_source_syncs (source_id) VALUES ($1) RETURNING id`, [sourceId]);
  await pool.query(`UPDATE verifyx_official_sources SET last_attempt_at=now() WHERE id=$1`, [sourceId]);
  return rows[0].id;
}

async function finishSync(syncId: number, sourceId: string, status: "success" | "unchanged" | "failed", extra: { rows?: number; url?: string; hash?: string; error?: string }) {
  await pool.query(
    `UPDATE verifyx_source_syncs SET finished_at=now(), status=$2, rows=$3, content_url=$4, content_hash=$5, error=$6 WHERE id=$1`,
    [syncId, status, extra.rows ?? null, extra.url ?? null, extra.hash ?? null, extra.error ?? null],
  );
  if (status === "failed") {
    await pool.query(`UPDATE verifyx_official_sources SET last_error=$2, connector_status='degraded', updated_at=now() WHERE id=$1`, [sourceId, extra.error ?? "unknown"]);
    await notifyAdmins(
      `VerifyX source sync failed: ${sourceId}`,
      `The scheduled sync for ${sourceId} failed: ${extra.error ?? "unknown error"}. Reports will show this source as unavailable/stale until it recovers.`,
      `vx-sync-fail-${sourceId}-${new Date().toISOString().slice(0, 10)}`,
    );
  } else {
    await pool.query(
      `UPDATE verifyx_official_sources SET last_success_at=now(), last_error=NULL, connector_status='operational',
         content_url=COALESCE($2, content_url), content_hash=COALESCE($3, content_hash), row_count=COALESCE($4, row_count), updated_at=now()
       WHERE id=$1`,
      [sourceId, extra.url ?? null, extra.hash ?? null, extra.rows ?? null],
    );
  }
}

/** Download the UK register of licensed sponsors (Worker & Temporary Worker). */
export async function syncUkSponsorRegister(force = false): Promise<{ status: string; rows?: number; error?: string }> {
  const sourceId = "uk_sponsor_register";
  const syncId = await startSync(sourceId);
  try {
    const metaRes = await safeFetch(UK_CONTENT_API, 30_000);
    if (!metaRes.ok) throw new Error(`content API HTTP ${metaRes.status}`);
    const meta: any = await metaRes.json();
    const attachments: any[] = meta?.details?.attachments ?? [];
    const csv = attachments.find((a) => /\.csv($|\?)/i.test(String(a?.url ?? "")) && /worker/i.test(String(a?.title ?? a?.filename ?? a?.url)))
      ?? attachments.find((a) => /\.csv($|\?)/i.test(String(a?.url ?? "")));
    if (!csv?.url) throw new Error("no CSV attachment found on the publication page");
    const csvUrl = String(csv.url).startsWith("http") ? String(csv.url) : `https://www.gov.uk${csv.url}`;

    const { rows: [cur] } = await pool.query(`SELECT content_url, content_hash, row_count FROM verifyx_official_sources WHERE id=$1`, [sourceId]);
    if (!force && cur?.content_url === csvUrl && (cur?.row_count ?? 0) > 1000) {
      await finishSync(syncId, sourceId, "unchanged", { url: csvUrl, hash: cur.content_hash, rows: cur.row_count });
      return { status: "unchanged", rows: cur.row_count };
    }

    const res = await safeFetch(csvUrl, 180_000);
    if (!res.ok) throw new Error(`CSV HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 80_000_000) throw new Error("CSV unexpectedly large");
    const hash = sha256(text);
    const parsed = parseCsv(text);
    const header = (parsed.shift() ?? []).map((h) => h.trim().toLowerCase());
    const iName = header.indexOf("organisation name");
    const iTown = header.indexOf("town/city");
    const iCounty = header.indexOf("county");
    const iType = header.indexOf("type & rating");
    const iRoute = header.indexOf("route");
    if (iName < 0 || iRoute < 0) throw new Error(`unexpected CSV header: ${header.join("|")}`);

    const names: string[] = [], norms: string[] = [], towns: (string | null)[] = [], counties: (string | null)[] = [], types: (string | null)[] = [], routes: (string | null)[] = [];
    for (const r of parsed) {
      const name = (r[iName] ?? "").trim();
      if (!name) continue;
      for (const alias of splitTradingNames(name)) {
        const norm = normalizeEmployerName(alias);
        if (!norm) continue;
        names.push(name); norms.push(norm);
        towns.push((r[iTown] ?? "").trim() || null);
        counties.push(iCounty >= 0 ? (r[iCounty] ?? "").trim() || null : null);
        types.push(iType >= 0 ? (r[iType] ?? "").trim() || null : null);
        routes.push((r[iRoute] ?? "").trim() || null);
      }
    }
    if (names.length < 1000) throw new Error(`only ${names.length} rows parsed — refusing to replace the register`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM verifyx_employer_registry WHERE registry_id=$1`, [sourceId]);
      const CHUNK = 5000;
      for (let i = 0; i < names.length; i += CHUNK) {
        await client.query(
          `INSERT INTO verifyx_employer_registry (registry_id, name, name_norm, town, county, type_rating, route)
           SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])`,
          [sourceId, names.slice(i, i + CHUNK), norms.slice(i, i + CHUNK), towns.slice(i, i + CHUNK), counties.slice(i, i + CHUNK), types.slice(i, i + CHUNK), routes.slice(i, i + CHUNK)],
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    await finishSync(syncId, sourceId, "success", { rows: names.length, url: csvUrl, hash });
    console.log(`[VerifyX] UK sponsor register synced: ${names.length} rows from ${csvUrl}`);
    return { status: "success", rows: names.length };
  } catch (err: any) {
    await finishSync(syncId, sourceId, "failed", { error: String(err?.message ?? err).slice(0, 500) });
    console.error("[VerifyX] UK sponsor sync failed:", err?.message);
    return { status: "failed", error: err?.message };
  }
}

/** Mirror the existing NEA sync health into the VerifyX source registry. */
export async function refreshNeaHealth(): Promise<void> {
  try {
    const { rows: [r] } = await pool.query(
      `SELECT max(finished_at) FILTER (WHERE status IN ('success','partial')) AS ok_at,
              (array_agg(status ORDER BY started_at DESC))[1] AS last_status,
              (array_agg(error_message ORDER BY started_at DESC))[1] AS last_error
         FROM nea_sync_runs WHERE started_at > now() - interval '30 days'`,
    );
    const okAt: Date | null = r?.ok_at ?? null;
    const fresh = okAt && Date.now() - new Date(okAt).getTime() < 48 * 3600_000;
    await pool.query(
      `UPDATE verifyx_official_sources SET last_success_at=$2, connector_status=$3, last_error=$4, last_attempt_at=now(), updated_at=now() WHERE id='ke_nea_register'`,
      [okAt, fresh ? (r?.last_status === "partial" ? "degraded" : "operational") : "unavailable", r?.last_error ?? null],
    );
  } catch (err: any) {
    console.warn("[VerifyX] NEA health refresh failed:", err?.message);
  }
}

/**
 * Change detection on official guidance pages. A changed hash opens a
 * rule_change_event for human review — rules are never auto-edited.
 */
export async function checkGuidanceChanges(): Promise<void> {
  const targets = OFFICIAL_SOURCES.filter((s) => s.capability !== "synced_dataset");
  for (const s of targets) {
    try {
      let body: string;
      if (s.url.startsWith("https://www.gov.uk/") && !s.url.includes("/csv-preview/")) {
        const res = await safeFetch(s.url.replace("https://www.gov.uk/", "https://www.gov.uk/api/content/"), 30_000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: any = await res.json();
        body = JSON.stringify({ t: j?.title, d: j?.description, b: j?.details?.body ?? j?.details?.parts ?? null });
      } else {
        const res = await safeFetch(s.url, 30_000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        body = (await res.text())
          .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
      const hash = sha256(body);
      const { rows: [cur] } = await pool.query(`SELECT content_hash FROM verifyx_official_sources WHERE id=$1`, [s.id]);
      if (cur?.content_hash && cur.content_hash !== hash) {
        await pool.query(
          `INSERT INTO verifyx_rule_change_events (source_id, old_hash, new_hash, summary) VALUES ($1,$2,$3,$4)`,
          [s.id, cur.content_hash, hash, `Content of "${s.title}" changed. Review the official page and update affected rules if needed.`],
        );
        await notifyAdmins(`VerifyX: official source changed — ${s.title}`, `Review needed: ${s.url}`, `vx-change-${s.id}-${hash.slice(0, 12)}`);
      }
      await pool.query(
        `UPDATE verifyx_official_sources SET content_hash=$2, last_attempt_at=now(), last_success_at=now(), last_error=NULL,
           connector_status = CASE WHEN capability='not_available' THEN 'not_built' ELSE 'awaiting_authorization' END, updated_at=now() WHERE id=$1`,
        [s.id, hash],
      );
    } catch (err: any) {
      await pool.query(`UPDATE verifyx_official_sources SET last_attempt_at=now(), last_error=$2, updated_at=now() WHERE id=$1`, [s.id, String(err?.message ?? err).slice(0, 300)]).catch(() => {});
    }
  }
}

/** Flag stale synced sources (no success within max_age_hours). */
export async function checkStaleness(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, title, last_success_at, max_age_hours FROM verifyx_official_sources
      WHERE capability='synced_dataset' AND max_age_hours IS NOT NULL
        AND (last_success_at IS NULL OR last_success_at < now() - make_interval(hours => max_age_hours))`,
  );
  for (const r of rows) {
    await pool.query(`UPDATE verifyx_official_sources SET connector_status='unavailable', updated_at=now() WHERE id=$1`, [r.id]);
    await notifyAdmins(
      `VerifyX source stale: ${r.title}`,
      `No successful sync since ${r.last_success_at ? new Date(r.last_success_at).toISOString() : "never"}. Reports now show this source as unavailable.`,
      `vx-stale-${r.id}-${new Date().toISOString().slice(0, 10)}`,
    );
  }
}

let sweepStarted = false;
export function startVerifyxSourceSweep(): void {
  if (sweepStarted || process.env.VERIFYX_SOURCE_SYNC === "off") return;
  sweepStarted = true;
  let lastGuidanceCheck = 0;
  const run = async () => {
    try {
      await seedRegistry();
      const { rows: [uk] } = await pool.query(`SELECT last_success_at FROM verifyx_official_sources WHERE id='uk_sponsor_register'`);
      if (!uk?.last_success_at || Date.now() - new Date(uk.last_success_at).getTime() > 20 * 3600_000) {
        await syncUkSponsorRegister();
      }
      await refreshNeaHealth();
      if (Date.now() - lastGuidanceCheck > 7 * 24 * 3600_000) {
        lastGuidanceCheck = Date.now();
        await checkGuidanceChanges();
      }
      await checkStaleness();
    } catch (err: any) {
      console.error("[VerifyX] source sweep error:", err?.message);
    }
  };
  setTimeout(run, 90_000);
  setInterval(run, 6 * 3600_000);
  console.log("[VerifyX] ✓ source sync sweep scheduled (6h)");
}
