/**
 * CV Email Drip Sequence
 *
 * Three timed emails after a user uploads their CV (web or WhatsApp):
 *
 *   email1 — immediately  : "✅ Your CV Analysis is Ready!"
 *   email2 — +2 days      : "🔥 3 Jobs Closing Soon That Match Your Profile"
 *   email3 — +5 days      : "💼 Your CV vs. Top Candidates" (Pro upsell)
 *
 * Each email is stored as a row in `cv_email_queue`.
 * A 10-minute poller sends any rows where `send_after <= NOW()` and marks them sent.
 */

import { db } from "./db";
import { cvEmailQueue } from "@shared/schema";
import { and, eq, lte } from "drizzle-orm";
import { sendEmail } from "./email";

const POLL_INTERVAL_MS = 10 * 60 * 1000;
const BASE_URL         = "https://workabroadhub.tech";
const BRAND_COLOR      = "#0e7490";  // teal-700

type TopJob = { title: string; company: string; country: string };

// ── HTML helpers ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function btn(href: string, label: string): string {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${href}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;font-weight:700;
       font-size:14px;padding:13px 30px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
      ${label}
    </a>
  </div>`;
}

function shell(title: string, body: string, preheader = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
${preheader ? `<span style="display:none;font-size:1px;color:#f3f4f6;">${esc(preheader)}</span>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">

      <!-- Header -->
      <tr><td style="background:${BRAND_COLOR};padding:22px 28px;text-align:center;">
        <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:0.5px;">WorkAbroad Hub</span><br>
        <span style="color:#a5f3fc;font-size:12px;">Your Global Career Partner</span>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:28px 32px;color:#111827;font-size:15px;line-height:1.7;">
        ${body}
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.8;">
          WorkAbroad Hub Ltd · Nairobi, Kenya<br>
          Questions? <a href="mailto:support@workabroadhub.tech" style="color:${BRAND_COLOR};">support@workabroadhub.tech</a> ·
          <a href="${BASE_URL}/contact" style="color:${BRAND_COLOR};">WhatsApp: +254 742 619 777</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Email 1: Immediate — analysis ready ──────────────────────────────────────

function buildEmail1(
  firstName:  string | null,
  jobCount:   number | null,
  topCountry: string | null
): { subject: string; html: string; text: string } {
  const name    = esc(firstName || "there");
  const country = topCountry ? esc(topCountry) : null;
  const jobLine = jobCount != null && jobCount > 0
    ? `<p>Nanjila analysed your CV and found <strong>${jobCount} overseas job${jobCount !== 1 ? "s" : ""}
       ${country ? `in ${country}` : ""}</strong> that match your profile.`
    : `<p>Nanjila has finished analysing your CV and found several overseas roles that match your profile.`;

  const body = `
    <p style="font-size:24px;margin:0 0 8px;">✅</p>
    <h2 style="margin:0 0 16px;font-size:18px;color:#0e7490;">Your CV Analysis is Ready!</h2>
    <p>Hi ${name},</p>
    ${jobLine}</p>
    <p style="margin:16px 0;">Here's what's waiting for you:</p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#374151;">
      <li style="margin-bottom:8px;">📊 Your ATS readiness score</li>
      <li style="margin-bottom:8px;">🌍 Top destination matches for your skills</li>
      <li style="margin-bottom:8px;">💼 Verified overseas jobs aligned to your profile</li>
    </ul>
    ${btn(`${BASE_URL}/upload-cv`, "View My CV Analysis →")}
    <p style="color:#6b7280;font-size:13px;">
      💡 <strong>Pro tip:</strong> Upgrade to Pro (KES 4,500/year) for an ATS-optimised CV rewrite
      and direct application links.<br>
      <a href="${BASE_URL}/pricing" style="color:${BRAND_COLOR};">See Pro benefits →</a>
    </p>`;

  const subject = "✅ Your CV Analysis is Ready! — WorkAbroad Hub";
  const text = `Hi ${firstName || "there"},\n\nYour CV analysis is ready! ${
    jobCount ? `We found ${jobCount} matching jobs.` : "Visit your dashboard to see matching jobs."
  }\n\nView your results: ${BASE_URL}/upload-cv\n\n— WorkAbroad Hub`;

  return { subject, html: shell("CV Analysis Ready", body, "Your overseas job matches are waiting — view them now"), text };
}

// ── Email 2: Day 2 — jobs closing soon ───────────────────────────────────────

function buildEmail2(
  firstName:  string | null,
  topJobs:    TopJob[],
  topCountry: string | null
): { subject: string; html: string; text: string } {
  const name    = esc(firstName || "there");
  const country = topCountry ? esc(topCountry) : "overseas";
  const jobs    = topJobs.slice(0, 3);

  const jobCards = jobs.length > 0
    ? jobs.map(j => `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:12px;">
          <p style="margin:0 0 4px;font-weight:700;font-size:15px;color:#0f172a;">${esc(j.title)}</p>
          <p style="margin:0;font-size:13px;color:#64748b;">📍 ${esc(j.company)} — ${esc(j.country)}</p>
        </div>`).join("")
    : `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;color:#374151;">
         Several roles matching your profile are available — view them in your dashboard.
       </div>`;

  const body = `
    <p style="font-size:24px;margin:0 0 8px;">🔥</p>
    <h2 style="margin:0 0 16px;font-size:18px;color:#dc2626;">Jobs Closing Soon That Match Your Profile</h2>
    <p>Hi ${name},</p>
    <p>These ${country} jobs match your CV and have <strong>upcoming application deadlines</strong>.
       Don't let them pass you by:</p>
    <div style="margin:20px 0;">
      ${jobCards}
    </div>
    <p style="color:#dc2626;font-weight:600;font-size:14px;">⚠️ Many overseas roles fill up weeks before their listed deadline.</p>
    ${btn(`${BASE_URL}/upload-cv`, "View All My Job Matches →")}
    <p style="color:#6b7280;font-size:13px;">
      Want direct application links and a Pro-level CV? Reply to this email or
      <a href="${BASE_URL}/pricing" style="color:${BRAND_COLOR};">upgrade to Pro →</a>
    </p>`;

  const subject = "🔥 Jobs Closing Soon That Match Your Profile — Act Now";
  const text = `Hi ${firstName || "there"},\n\nJobs matching your CV have upcoming deadlines.\n\n${
    jobs.map((j, i) => `${i + 1}. ${j.title} — ${j.company} (${j.country})`).join("\n")
  }\n\nView & apply: ${BASE_URL}/upload-cv\n\n— WorkAbroad Hub`;

  return { subject, html: shell("Jobs Closing Soon", body, "These roles match your CV — apply before deadlines close"), text };
}

// ── Email 3: Day 5 — CV comparison + Pro upsell ──────────────────────────────

function buildEmail3(
  firstName:  string | null,
  topCountry: string | null,
  profession: string | null
): { subject: string; html: string; text: string } {
  const name       = esc(firstName || "there");
  const country    = esc(topCountry || "your target country");
  const role       = profession ? esc(profession) : "your field";
  const upgradeUrl = `${BASE_URL}/pricing`;

  const body = `
    <p style="font-size:24px;margin:0 0 8px;">💼</p>
    <h2 style="margin:0 0 16px;font-size:18px;color:#0e7490;">How Your CV Compares to Hired Candidates in ${country}</h2>
    <p>Hi ${name},</p>
    <p>We compared your CV to candidates who successfully secured ${role} roles in ${country}.
       Here's what the <strong>top-ranked applicants</strong> typically have that gives them an edge:</p>
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0 0 8px;font-weight:700;color:#92400e;">What successful applicants include:</p>
      <ul style="margin:0;padding-left:20px;color:#78350f;font-size:14px;line-height:1.9;">
        <li>Quantified achievements (e.g. "reduced costs by 20%")</li>
        <li>Country-specific keywords (e.g. "NHS", "CQC", "IELTS 7.0")</li>
        <li>ATS-friendly formatting with clear section headers</li>
        <li>A tailored professional summary for overseas roles</li>
        <li>Relevant certifications listed prominently</li>
      </ul>
    </div>
    <p>Our <strong>ATS CV Rewrite</strong> service optimises your CV against these exact criteria —
       delivered in under 3 minutes.</p>
    ${btn(upgradeUrl, "Upgrade to Pro — KES 4,500/year →")}
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 18px;margin:20px 0;">
      <p style="margin:0;font-size:13px;color:#166534;"><strong>Pro includes:</strong>
         ATS CV rewrite · Cover letter generation · Direct job application links ·
         Priority WhatsApp support · 360 days full access</p>
    </div>
    <p style="color:#6b7280;font-size:13px;">
      Questions? WhatsApp us at +254 742 619 777 or reply to this email.
    </p>`;

  const subject = "💼 How Your CV Compares to Top Candidates (and How to Close the Gap)";
  const text = `Hi ${firstName || "there"},\n\nWe compared your CV to successful ${role} applicants in ${country}.\n\nTop candidates include quantified achievements, ATS keywords, and role-specific certifications.\n\nUpgrade to Pro for an ATS-optimised CV rewrite: ${upgradeUrl}\n\n— WorkAbroad Hub`;

  return { subject, html: shell("CV Comparison Report", body, "See what top candidates have that you might be missing"), text };
}

// ── Poller ────────────────────────────────────────────────────────────────────

async function processEmailQueue(): Promise<void> {
  try {
    const now = new Date();
    const due = await db
      .select()
      .from(cvEmailQueue)
      .where(and(
        eq(cvEmailQueue.sent,   false),
        eq(cvEmailQueue.failed, false),
        lte(cvEmailQueue.sendAfter, now)
      ))
      .limit(50);

    if (due.length === 0) return;

    console.log(`[CvEmail] Processing ${due.length} email(s)…`);
    let sent = 0;
    let failed = 0;

    for (const row of due) {
      try {
        const jobs = (Array.isArray(row.topJobs) ? row.topJobs : []) as TopJob[];

        let email: { subject: string; html: string; text: string };
        if (row.type === "email2") {
          email = buildEmail2(row.firstName, jobs, row.topCountry);
        } else if (row.type === "email3") {
          email = buildEmail3(row.firstName, row.topCountry, row.profession);
        } else {
          email = buildEmail1(row.firstName, row.jobCount, row.topCountry);
        }

        const result = await sendEmail({ to: row.email, subject: email.subject, html: email.html, text: email.text });

        if (result.success) {
          await db.update(cvEmailQueue).set({ sent: true, sentAt: new Date(), errorMsg: null }).where(eq(cvEmailQueue.id, row.id));
          console.log(`[CvEmail] Sent ${row.type} to ${row.email}`);
          sent++;
        } else {
          await db.update(cvEmailQueue).set({ failed: true, errorMsg: (result.error || "").slice(0, 500) }).where(eq(cvEmailQueue.id, row.id));
          failed++;
        }
      } catch (err: any) {
        console.error(`[CvEmail] Error sending ${row.type} to ${row.email}:`, err.message);
        await db.update(cvEmailQueue).set({ failed: true, errorMsg: err.message.slice(0, 500) }).where(eq(cvEmailQueue.id, row.id));
        failed++;
      }
    }

    console.log(`[CvEmail] Done — ${sent} sent, ${failed} failed.`);
  } catch (err: any) {
    console.error("[CvEmail] Poll failed:", err.message);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startCvEmailSequenceScheduler(): void {
  console.log("[CvEmail] Scheduler started (10-minute poll, 3-email drip).");
  setTimeout(() => {
    processEmailQueue();
    setInterval(processEmailQueue, POLL_INTERVAL_MS);
  }, 60_000);
}

/**
 * Schedule the 3-email drip for a CV uploader.
 * email1 fires immediately (queued with sendAfter = now),
 * email2 fires at now + 2 days,
 * email3 fires at now + 5 days.
 * Safe to call fire-and-forget.
 */
export async function scheduleCvEmailSequence(opts: {
  email:       string;
  firstName?:  string | null;
  jobCount?:   number | null;
  topCountry?: string | null;
  profession?: string | null;
  topJobs?:    TopJob[];
}): Promise<void> {
  try {
    // Deduplicate: skip if we already queued an email1 for this address in the last 24h
    const recent = await db
      .select({ id: cvEmailQueue.id })
      .from(cvEmailQueue)
      .where(and(
        eq(cvEmailQueue.email, opts.email),
        eq(cvEmailQueue.type,  "email1")
      ))
      .limit(1);

    if (recent.length > 0) {
      console.log(`[CvEmail] Sequence already scheduled for ${opts.email}, skipping.`);
      return;
    }

    const now      = Date.now();
    const day2     = new Date(now + 2 * 24 * 60 * 60 * 1000);
    const day5     = new Date(now + 5 * 24 * 60 * 60 * 1000);
    const base = {
      email:      opts.email,
      firstName:  opts.firstName  ?? null,
      jobCount:   opts.jobCount   ?? null,
      topCountry: opts.topCountry ?? null,
      profession: opts.profession ?? null,
      topJobs:    (opts.topJobs && opts.topJobs.length > 0 ? opts.topJobs : null) as any,
    };

    await db.insert(cvEmailQueue).values([
      { ...base, type: "email1", sendAfter: new Date(now) },
      { ...base, type: "email2", sendAfter: day2 },
      { ...base, type: "email3", sendAfter: day5 },
    ]);

    console.log(`[CvEmail] 3-email sequence scheduled for ${opts.email} (now / +2d / +5d)`);
  } catch (err: any) {
    console.error("[CvEmail] Failed to schedule email sequence:", err.message);
  }
}
