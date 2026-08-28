/**
 * Daily digest emailer — sends the "morning report" that makes AutoApply
 * feel magic. Delivered right after the overnight scan completes.
 *
 * Subject: "Your AutoApply hunt: 5 new matches — top pick is a KES 320,000/mo NHS role"
 *
 * The subject line is the marketing hook. It gets Kenyans to open the
 * email even if they're skeptical, because it names a specific salary
 * and a specific employer.
 */

import { sendEmail } from "../../email";
import { pool } from "../../db";

interface DigestArgs {
  agent:   { id: string; user_id: string };
  matches: Array<{
    id:              string;
    job_title:       string;
    employer:        string | null;
    country:         string | null;
    city:            string | null;
    salary_display:  string | null;
    salary_kes_monthly: number | null;
    apply_url:       string;
    match_score:     number;
    match_reasons:   string[] | null;
    cover_letter:    string | null;
  }>;
}

export async function sendDailyDigest({ agent, matches }: DigestArgs): Promise<void> {
  if (matches.length === 0) return;

  const { rows } = await pool.query<{ email: string; first_name: string | null }>(
    `SELECT email, first_name FROM users WHERE id = $1`,
    [agent.user_id],
  );
  const user = rows[0];
  if (!user?.email) return;

  const firstName = user.first_name || "there";
  const top = matches[0];

  // Subject line uses the top match's numbers for maximum CTR
  const salaryHook = top.salary_display
    ? ` — top pick pays ${top.salary_display}`
    : "";
  const subject = `${matches.length} new job matches for you${salaryHook}`;

  const html = renderHtml({ firstName, matches });
  const text = renderText({ firstName, matches });

  await sendEmail({ to: user.email, subject, html, text });
}

function renderHtml(args: { firstName: string; matches: DigestArgs["matches"] }): string {
  const rowsHtml = args.matches.map((m, idx) => {
    const badge = idx === 0
      ? `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">TOP MATCH</span>`
      : `<span style="background:#f1f5f9;color:#334155;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">${m.match_score}% match</span>`;

    const reasons = (m.match_reasons ?? []).slice(0, 2).map((r) =>
      `<span style="color:#64748b;font-size:12px;">• ${escapeHtml(r)}</span>`
    ).join(" &nbsp;");

    const salaryLine = m.salary_display
      ? `<div style="color:#059669;font-weight:600;font-size:14px;margin:6px 0;">${escapeHtml(m.salary_display)}${m.salary_kes_monthly ? ` <span style="color:#64748b;font-weight:400;">(~KES ${m.salary_kes_monthly.toLocaleString()}/mo)</span>` : ""}</div>`
      : "";

    return `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:12px;background:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:8px;margin-bottom:6px;">
          <div style="font-weight:700;font-size:16px;color:#0f172a;line-height:1.3;">${escapeHtml(m.job_title)}</div>
          ${badge}
        </div>
        <div style="color:#475569;font-size:14px;">
          ${escapeHtml(m.employer ?? "Unnamed employer")}${m.city ? ` · ${escapeHtml(m.city)}` : ""}${m.country ? ` · ${escapeHtml(m.country.toUpperCase())}` : ""}
        </div>
        ${salaryLine}
        <div style="margin-top:6px;">${reasons}</div>
        <div style="margin-top:12px;">
          <a href="https://workabroadhub.tech/autoapply" style="display:inline-block;background:#0f172a;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Open in inbox →</a>
          <a href="${escapeAttr(m.apply_url)}" style="display:inline-block;background:#fff;border:1px solid #cbd5e1;color:#0f172a;padding:8px 14px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;margin-left:6px;">View job on employer site</a>
        </div>
        ${m.cover_letter ? `<div style="margin-top:10px;font-size:12px;color:#64748b;">✓ Cover letter drafted — read it in your inbox</div>` : ""}
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="margin-bottom:20px;">
      <h1 style="font-size:22px;color:#0f172a;margin:0 0 4px;">Good morning, ${escapeHtml(args.firstName)} ☀️</h1>
      <p style="color:#475569;font-size:14px;margin:0;">Your AutoApply agent found <b>${args.matches.length}</b> new job${args.matches.length === 1 ? "" : "s"} matching your CV overnight.</p>
    </div>

    ${rowsHtml}

    <div style="margin-top:20px;padding:14px;background:#eff6ff;border-radius:8px;color:#1e40af;font-size:13px;">
      💡 <b>Tip:</b> Applying within 24 hours of a job posting increases response rate by 8×. Open your inbox now and hit &ldquo;Apply&rdquo; on the top match.
    </div>

    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:24px;">
      You're receiving this because you have an active AutoApply agent on WorkAbroad Hub.
      <br />
      <a href="https://workabroadhub.tech/autoapply" style="color:#64748b;">Manage settings</a> · <a href="https://workabroadhub.tech/autoapply?pause=1" style="color:#64748b;">Pause daily reports</a>
    </p>
  </div>
</body>
</html>`;
}

function renderText(args: { firstName: string; matches: DigestArgs["matches"] }): string {
  const lines = args.matches.map((m, idx) => {
    const s = m.salary_display ? ` – ${m.salary_display}` : "";
    return `${idx + 1}. ${m.job_title} @ ${m.employer ?? "unnamed"}${s}\n   ${m.match_score}% match · ${m.apply_url}`;
  }).join("\n\n");

  return `Good morning ${args.firstName},

Your AutoApply agent found ${args.matches.length} new job matches overnight:

${lines}

Open your inbox: https://workabroadhub.tech/autoapply
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s: string): string { return escapeHtml(s); }
