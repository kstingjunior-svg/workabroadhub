/**
 * "Your CV is ready to generate" — ONE reminder for unfinished Write from
 * Scratch payments (2026-11).
 *
 * In the 60 days to 17 Nov, 21 people filled in a full CV and stopped at the
 * M-Pesa step. Their details are saved; one tap on the link re-sends the
 * prompt (POST /api/write-from-scratch/:id/repay) — nothing to retype.
 *
 * Rules
 *   • OFF unless WFS_PAYMENT_REMINDERS=on (Tony approves the wording first).
 *   • One email per draft, ever (payment_reminder_sent_at), and at most one
 *     per person per 24 hours.
 *   • Only 1–48 hours after they stopped, only verified emails, never if
 *     they have since paid for a document, never to suppressed addresses
 *     (sendEmail enforces that).
 *   • No discounts, no fake urgency. Plain "your details are saved".
 */
import { pool } from "../db";

const SWEEP_MS = 30 * 60 * 1000;
const BATCH = 40;
const BASE_URL = (process.env.APP_URL || "https://workabroadhub.tech").replace(/\/$/, "");

const DOC_LABEL: Record<string, string> = {
  cv: "CV", cover_letter: "cover letter", recruitment_cv: "recruitment CV", reference_letter: "reference letter",
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** PURE — exact email we send. Wording approved by Tony 2026-11-17 (option C). */
export function buildReminderEmail(a: { firstName: string | null; docType: string; draftId: string; amount: number; jobTitle?: string | null }) {
  const doc = DOC_LABEL[a.docType] ?? "document";
  const Doc = doc === "CV" ? "CV" : doc.charAt(0).toUpperCase() + doc.slice(1);
  const link = `${BASE_URL}/tools/write-from-scratch?draftId=${encodeURIComponent(a.draftId)}`;
  const hi = a.firstName ? `Hi ${a.firstName},` : "Hi,";
  const forJob = a.jobTitle ? ` for the ${a.jobTitle} job` : "";
  const subject = `Finish your ${doc}, details saved`;
  const line = `${hi} your ${doc}${forJob} is saved but not paid yet. Tap below, approve KES ${a.amount} on M-Pesa, done in 20 seconds.`;
  const text =
`${line}

Finish my ${Doc}: ${link}

Help: WhatsApp +254 111 467 601. We'll only remind you once.`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:560px">
<p>${esc(line)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Finish my ${esc(Doc)}</a></p>
<p style="font-size:13px;color:#555">Help: WhatsApp +254 111 467 601. We'll only remind you once.</p>
</div>`;
  return { subject, text, html, link };
}

export async function findEligible(limit = BATCH) {
  const { rows } = await pool.query(
    `SELECT d.id, d.doc_type, d.mpesa_amount, d.user_id, d.input_json->>'jobTitle' AS job_title,
            u.email, u.first_name
       FROM write_from_scratch_drafts d
       JOIN users u ON u.id = d.user_id
      WHERE d.status = 'pending_payment'
        AND d.payment_reminder_sent_at IS NULL
        AND d.created_at < now() - interval '1 hour'
        AND d.created_at > now() - interval '48 hours'
        AND u.email IS NOT NULL AND u.email_verified = true
        AND NOT EXISTS (SELECT 1 FROM write_from_scratch_drafts x
                         WHERE x.user_id = d.user_id AND x.created_at > d.created_at AND x.status IN ('paid','generated'))
        AND NOT EXISTS (SELECT 1 FROM write_from_scratch_drafts y
                         WHERE y.user_id = d.user_id AND y.payment_reminder_sent_at > now() - interval '24 hours')
      ORDER BY d.created_at ASC
      LIMIT $1`, [limit]);
  // Newest draft per person only.
  const seen = new Set<string>();
  return rows.filter((r: any) => (seen.has(r.user_id) ? false : (seen.add(r.user_id), true)));
}

export async function runWfsPaymentReminders(): Promise<{ sent: number; skipped: number }> {
  if (String(process.env.WFS_PAYMENT_REMINDERS || "").toLowerCase() !== "on") return { sent: 0, skipped: 0 };
  let sent = 0, skipped = 0;
  const { sendEmail } = await import("../email");
  for (const r of await findEligible()) {
    // Claim first so two instances can't both send.
    const { rowCount } = await pool.query(
      `UPDATE write_from_scratch_drafts SET payment_reminder_sent_at = now() WHERE id = $1 AND payment_reminder_sent_at IS NULL`, [r.id]);
    if (!rowCount) { skipped++; continue; }
    const e = buildReminderEmail({ firstName: r.first_name, docType: r.doc_type, draftId: r.id, amount: Number(r.mpesa_amount) || 300, jobTitle: r.job_title });
    try {
      const res: any = await sendEmail({ to: r.email, subject: e.subject, html: e.html, text: e.text });
      if (res && res.success === false) skipped++; else sent++;
    } catch (err: any) {
      skipped++;
      console.warn("[wfs-reminder] send failed:", err?.message);
    }
    await new Promise((ok) => setTimeout(ok, 300));
  }
  if (sent || skipped) console.log(`[wfs-reminder] sent=${sent} skipped=${skipped}`);
  return { sent, skipped };
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startWfsPaymentReminders(): void {
  if (timer) return;
  timer = setInterval(() => { runWfsPaymentReminders().catch((e) => console.warn("[wfs-reminder]", e?.message)); }, SWEEP_MS);
  console.log(`[wfs-reminder] sweep started (${String(process.env.WFS_PAYMENT_REMINDERS || "off")})`);
}
