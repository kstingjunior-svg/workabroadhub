/**
 * Daily "Needs your attention" email to Tony (2026-11).
 *
 * Sent at 07:00 Nairobi from support@workabroadhub.tech to ADMIN_DIGEST_TO
 * (default kstingjunior@gmail.com). Lists ONLY things that need a decision
 * or action. Nothing actionable → no email that day.
 *
 * Turn off: set ADMIN_DIGEST=off on Render. Change recipient: ADMIN_DIGEST_TO.
 * Each day is claimed in admin_digest_runs so two server instances never
 * send twice.
 */
import { pool } from "../db";

const BASE = (process.env.APP_URL || "https://workabroadhub.tech").replace(/\/$/, "");
const FROM = "WorkAbroad Hub <support@workabroadhub.tech>";
const SEND_HOUR_NAIROBI = 7;

export interface DigestItem { title: string; detail: string; link: string; urgent?: boolean; lines?: string[] }

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const ago = (d: Date) => {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600_000);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)} days ago`;
};

async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  try { return (await pool.query(sql, params)).rows as T[]; }
  catch (e: any) { console.warn("[admin-digest] query skipped:", e?.message); return []; }
}

export async function collectDigest(): Promise<DigestItem[]> {
  const items: DigestItem[] = [];
  const { DELIVERY_SQL, PURPOSE_KEY_SQL } = await import("../routes/finance-admin");
  const REVENUE = `l.payment_status IN ('success','completed') AND l.reconciliation_status IN ('matched','manually_matched','unmatched')`;

  // 1. Paid but not delivered (> 2 h, last 30 days) — customers waiting for something they paid for.
  const undelivered = await q(
    `SELECT l.amount, l.created_at, ${PURPOSE_KEY_SQL} AS what, ${DELIVERY_SQL} AS d
       FROM finance_ledger l
      WHERE ${REVENUE} AND l.created_at BETWEEN now() - interval '30 days' AND now() - interval '2 hours'
        AND ${DELIVERY_SQL} IN ('awaiting_delivery','processing','delivery_failed','not_activated')
      ORDER BY l.created_at ASC LIMIT 20`);
  if (undelivered.length) {
    items.push({
      urgent: true,
      title: `${undelivered.length} paid order${undelivered.length === 1 ? "" : "s"} not delivered`,
      detail: "Customers paid but haven't received what they bought.",
      link: `${BASE}/admin/finance`,
      lines: undelivered.slice(0, 6).map((r: any) => `${kes(Number(r.amount))} · ${String(r.what ?? "").replace(/_/g, " ")} · ${String(r.d).replace(/_/g, " ")} · ${ago(r.created_at)}`),
    });
  }

  // 2. Money we can't attribute to a customer.
  const [un] = await q(
    // Only real money. "unverified_receipt" = receipts Tony already confirmed don't exist — not money.
    `SELECT count(*)::int n, coalesce(sum(amount),0)::numeric kes FROM finance_ledger l
      WHERE l.reconciliation_status = 'unmatched' AND l.payment_status IN ('success','completed')`);
  if (un?.n > 0) items.push({ title: `${un.n} payment${un.n === 1 ? "" : "s"} need matching (${kes(Number(un.kes))})`, detail: "Money received that isn't linked to a customer yet.", link: `${BASE}/admin/finance` });

  // 3. Refund requests.
  const [rf] = await q(`SELECT count(*)::int n FROM payments WHERE refund_requested IS TRUE AND status NOT IN ('refunded')`);
  if (rf?.n > 0) items.push({ urgent: true, title: `${rf.n} refund request${rf.n === 1 ? "" : "s"}`, detail: "A customer asked for their money back.", link: `${BASE}/admin/finance` });

  // 4. PayPal health.
  try {
    const { paypalHealth } = await import("./paypal-health");
    const h = await paypalHealth();
    if (h.status === "no_approvals") items.push({ urgent: true, title: "PayPal payments are not completing", detail: h.message, link: `${BASE}/admin/analytics` });
  } catch { /* skip */ }

  // 5. Customer disputes / review requests on document checks.
  const [vx] = await q(`SELECT count(*)::int n, count(*) FILTER (WHERE kind='dispute')::int disputes FROM verifyx_review_cases WHERE status <> 'resolved'`);
  if (vx?.n > 0) items.push({ title: `${vx.n} document-check review${vx.n === 1 ? "" : "s"} open${vx.disputes ? ` (${vx.disputes} dispute${vx.disputes === 1 ? "" : "s"})` : ""}`, detail: "Customers asked for a manual review of their VerifyX report.", link: `${BASE}/admin/verifyx` });

  // 6. Scam Intelligence matches.
  const [ia] = await q(`SELECT count(*)::int n FROM intel_alerts WHERE status = 'new'`);
  if (ia?.n > 0) items.push({ title: `${ia.n} new scam-intelligence match${ia.n === 1 ? "" : "es"}`, detail: "A new check or report shares a phone, email or payment account with earlier cases.", link: `${BASE}/admin/intelligence` });

  // 7. New scam reports in the last 24 h.
  const [sr] = await q(`SELECT count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int new, count(*) FILTER (WHERE status='pending')::int pending FROM scam_reports`);
  if (sr?.new > 0) items.push({ title: `${sr.new} new scam report${sr.new === 1 ? "" : "s"}`, detail: `${sr.pending} reports are waiting for review in total.`, link: `${BASE}/admin/scam-reports` });

  // 8. Write-from-Scratch paid but stuck.
  const [wf] = await q(`SELECT count(*)::int n FROM write_from_scratch_drafts WHERE status IN ('paid','failed') AND paid_at IS NOT NULL AND paid_at < now() - interval '1 hour' AND paid_at > now() - interval '7 days'`);
  if (wf?.n > 0) items.push({ urgent: true, title: `${wf.n} paid CV/cover letter${wf.n === 1 ? "" : "s"} not generated`, detail: "Paid in Write from Scratch but the document wasn't produced.", link: `${BASE}/admin/finance` });

  // 9. Silent failures — server errors, page crashes, failed self-checks (last 24 h).
  try {
    const { failureDigestItems } = await import("./failure-monitor");
    items.push(...(await failureDigestItems()));
  } catch (e: any) { console.warn("[admin-digest] failure items skipped:", e?.message); }

  return items;
}

/** PURE — builds the email. */
export function buildDigestEmail(items: DigestItem[], now = new Date()) {
  const date = now.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", weekday: "long", day: "numeric", month: "long" });
  const urgent = items.filter((i) => i.urgent).length;
  const subject = `${urgent ? "⚠️ " : ""}${items.length} thing${items.length === 1 ? "" : "s"} need${items.length === 1 ? "s" : ""} your attention — WorkAbroad Hub`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const ordered = [...items].sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:600px">
<p style="color:#555;margin:0 0 4px">${esc(date)}</p>
<h2 style="margin:0 0 16px">Needs your attention today</h2>
${ordered.map((i) => `<div style="border:1px solid ${i.urgent ? "#fca5a5" : "#e5e7eb"};background:${i.urgent ? "#fef2f2" : "#fff"};border-radius:10px;padding:12px 14px;margin:0 0 10px">
<p style="margin:0;font-weight:bold">${i.urgent ? "⚠️ " : ""}${esc(i.title)}</p>
<p style="margin:4px 0 0;color:#444">${esc(i.detail)}</p>
${i.lines?.length ? `<ul style="margin:6px 0 0;padding-left:18px;color:#444;font-size:13px">${i.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
<p style="margin:8px 0 0"><a href="${esc(i.link)}" style="color:#15803d;font-weight:bold">Open →</a></p></div>`).join("\n")}
<p style="color:#888;font-size:12px;margin-top:16px">Sent automatically every morning at 7:00 when something needs action. Nothing to do = no email.</p>
</div>`;
  const text = `Needs your attention today (${date})\n\n` + ordered.map((i) =>
    `${i.urgent ? "[URGENT] " : ""}${i.title}\n${i.detail}\n${(i.lines ?? []).map((l) => `  - ${l}`).join("\n")}${i.lines?.length ? "\n" : ""}${i.link}\n`).join("\n");
  return { subject, html, text };
}

export async function runAdminDigest(force = false): Promise<{ sent: boolean; items: number; reason?: string }> {
  if (String(process.env.ADMIN_DIGEST || "on").toLowerCase() === "off") return { sent: false, items: 0, reason: "disabled" };
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }); // YYYY-MM-DD
  if (!force) {
    const claimed = await q(`INSERT INTO admin_digest_runs (day) VALUES ($1) ON CONFLICT DO NOTHING RETURNING day`, [day]);
    if (!claimed.length) return { sent: false, items: 0, reason: "already ran today" };
  }
  const items = await collectDigest();
  if (!items.length) {
    await q(`UPDATE admin_digest_runs SET items = 0, sent = false WHERE day = $1`, [day]);
    return { sent: false, items: 0, reason: "nothing needs attention" };
  }
  const to = (process.env.ADMIN_DIGEST_TO || "kstingjunior@gmail.com").trim();
  const e = buildDigestEmail(items);
  const { sendEmail } = await import("../email");
  const r = await sendEmail({ to, subject: e.subject, html: e.html, text: e.text, from: FROM });
  await q(`UPDATE admin_digest_runs SET items = $2, sent = $3 WHERE day = $1`, [day, items.length, !!r.success]);
  console.log(`[admin-digest] ${items.length} item(s) → ${to}: ${r.success ? "sent" : "FAILED " + r.error}`);
  return { sent: !!r.success, items: items.length, reason: r.success ? undefined : r.error };
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startAdminDigest(): void {
  if (timer) return;
  const tick = () => {
    const hour = Number(new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", hour12: false }));
    if (hour === SEND_HOUR_NAIROBI) runAdminDigest().catch((e) => console.warn("[admin-digest]", e?.message));
  };
  timer = setInterval(tick, 10 * 60 * 1000);
  setTimeout(tick, 60_000);
  console.log(`[admin-digest] daily 07:00 Nairobi → ${(process.env.ADMIN_DIGEST_TO || "kstingjunior@gmail.com")} (${process.env.ADMIN_DIGEST || "on"})`);
}
