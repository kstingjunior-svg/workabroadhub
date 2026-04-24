// Email sending service for WorkAbroad Hub
// Uses nodemailer with Gmail (GMAIL_USER + GMAIL_APP_PASSWORD) or generic SMTP (SMTP_* vars)
import nodemailer from "nodemailer";

/** Escapes user-controlled strings before interpolating into HTML email templates. */
function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

let _transporter: nodemailer.Transporter | null = null;

function buildTransporter(): nodemailer.Transporter | null {
  // ── Option 1: Gmail / Google Workspace ───────────────────────────────────
  const gmailUser = (process.env.GMAIL_USER || "").trim();
  // Strip spaces — Google shows app passwords as "xxxx xxxx xxxx xxxx" but SMTP needs no spaces
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || "").trim().replace(/\s+/g, "");
  if (gmailUser && gmailPass) {
    console.log(`[Email] Using Gmail SMTP transporter (${gmailUser})`);
    // Use explicit host/port instead of service:"gmail" for better Google Workspace compatibility
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });
  }

  // ── Option 2: Generic SMTP ────────────────────────────────────────────────
  const smtpHost = (process.env.SMTP_HOST || "").trim();
  const smtpUser = (process.env.SMTP_USER || "").trim();
  const smtpPass = (process.env.SMTP_PASS || "").trim();
  if (smtpHost && smtpUser && smtpPass) {
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    console.log(`[Email] Using SMTP transporter (${smtpHost}:${port})`);
    return nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
  }

  return null;
}

function getTransporter(): nodemailer.Transporter | null {
  if (!_transporter) _transporter = buildTransporter();
  return _transporter;
}

/** Clears cached transporter (call after env vars change) */
export function clearEmailCache() {
  _transporter = null;
}

function getFromAddress(): string {
  return (
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    process.env.GMAIL_USER ||
    process.env.SMTP_USER ||
    "noreply@workabroadhub.tech"
  );
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<EmailResult> {
  const transporter = getTransporter();

  if (!transporter) {
    // Fallback: log to console so OTPs are visible in dev even without SMTP
    console.warn(
      `[Email] No email provider configured. Would send to ${options.to}:\n  Subject: ${options.subject}\n  Body: ${options.text || options.html}`,
    );
    return {
      success: false,
      error: "Email provider not configured. Set GMAIL_USER + GMAIL_APP_PASSWORD or SMTP_* secrets.",
    };
  }

  try {
    const info = await transporter.sendMail({
      from: `"WorkAbroad Hub" <${getFromAddress()}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    console.log(`[Email] Sent to ${options.to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[Email] Failed to send to ${options.to}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ── Templated emails ─────────────────────────────────────────────────────────

export async function sendOtpEmail(to: string, otp: string, firstName?: string): Promise<EmailResult> {
  const name = escapeHtml(firstName || "there");
  const safeOtp = escapeHtml(otp);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="color:#1d4ed8;margin:0;">WorkAbroad Hub</h2>
        <p style="color:#6b7280;font-size:13px;margin:4px 0 0;">Powered by Exovia Connect, Kenya</p>
      </div>
      <p style="color:#111827;font-size:15px;">Hi ${name},</p>
      <p style="color:#374151;font-size:14px;">
        You requested to <strong>permanently delete your WorkAbroad Hub account</strong>. 
        Enter this code to confirm:
      </p>
      <div style="text-align:center;margin:28px 0;">
        <span style="display:inline-block;font-size:36px;font-weight:700;letter-spacing:10px;color:#1d4ed8;background:#eff6ff;padding:16px 28px;border-radius:10px;border:2px dashed #bfdbfe;">
          ${safeOtp}
        </span>
      </div>
      <p style="color:#6b7280;font-size:13px;text-align:center;">
        This code expires in <strong>5 minutes</strong>.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="color:#9ca3af;font-size:12px;text-align:center;">
        If you did not request account deletion, please ignore this email or contact us immediately at 
        <a href="mailto:support@workabroadhub.tech" style="color:#1d4ed8;">support@workabroadhub.tech</a>.
      </p>
    </div>`;

  return sendEmail({
    to,
    subject: "WorkAbroad Hub — Account Deletion Code",
    html,
    text: `Hi ${name},\n\nYour WorkAbroad Hub account deletion code is: ${otp}\n\nIt expires in 5 minutes.\n\nIf you did not request this, contact support immediately.`,
  });
}

export async function sendProActivationEmail(
  to: string,
  firstName: string | null | undefined,
  expiresAt: Date,
  transactionRef?: string | null,
): Promise<EmailResult> {
  const name = escapeHtml((firstName || "").trim() || "there");
  const expiry = escapeHtml(expiresAt.toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" }));
  const ref = transactionRef ? `<p style="color:#6b7280;font-size:12px;text-align:center;margin-top:4px;">Reference: ${escapeHtml(transactionRef)}</p>` : "";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;border:1px solid #e5e7eb;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="color:#1d4ed8;margin:0 0 4px;">WorkAbroad Hub</h2>
        <p style="color:#6b7280;font-size:13px;margin:0;">Powered by Exovia Connect, Kenya</p>
      </div>

      <p style="color:#111827;font-size:15px;">Hi ${name},</p>
      <p style="color:#374151;font-size:14px;line-height:1.6;">
        Great news — your <strong>WorkAbroad Hub Pro plan is now active!</strong>
        You now have full access to all Pro features for 360 days.
      </p>

      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:18px 20px;margin:22px 0;">
        <p style="color:#92400e;font-size:13px;font-weight:700;margin:0 0 10px;">✓ Your Pro plan includes:</p>
        <ul style="color:#78350f;font-size:13px;margin:0;padding-left:18px;line-height:2;">
          <li>Unlimited access to all tools &amp; guides</li>
          <li>AI job assistant &amp; smart job matching</li>
          <li>ATS CV checker &amp; application tracker</li>
          <li>WhatsApp consultation support</li>
          <li>Priority job listings from verified employers</li>
        </ul>
        <p style="color:#92400e;font-size:13px;margin:12px 0 0;">
          <strong>Expires:</strong> ${expiry}
        </p>
      </div>

      ${ref}

      <div style="text-align:center;margin:28px 0 20px;">
        <a href="https://workabroadhub.tech/dashboard"
           style="display:inline-block;background:#1d4ed8;color:#fff;font-size:14px;font-weight:600;
                  padding:12px 32px;border-radius:8px;text-decoration:none;">
          Go to My Dashboard →
        </a>
      </div>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="color:#9ca3af;font-size:12px;text-align:center;">
        Questions? Reach us at
        <a href="mailto:support@workabroadhub.tech" style="color:#1d4ed8;">support@workabroadhub.tech</a>
        or WhatsApp +254 700 000 000.
      </p>
    </div>`;

  return sendEmail({
    to,
    subject: "🎉 Your WorkAbroad Hub Pro Plan is Now Active",
    html,
    text: `Hi ${name},\n\nYour WorkAbroad Hub Pro plan is now active!\n\nExpires: ${expiry}\n\nLog in at https://workabroadhub.tech/dashboard to access all Pro features.\n\nQuestions? Contact support@workabroadhub.tech\n\n— Exovia Connect Team`,
  });
}

export async function sendAccountDeletedEmail(to: string, firstName?: string): Promise<EmailResult> {
  const name = escapeHtml(firstName || "there");
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="color:#1d4ed8;margin:0;">WorkAbroad Hub</h2>
        <p style="color:#6b7280;font-size:13px;margin:4px 0 0;">Powered by Exovia Connect, Kenya</p>
      </div>
      <p style="color:#111827;font-size:15px;">Hi ${name},</p>
      <p style="color:#374151;font-size:14px;">
        Your <strong>WorkAbroad Hub account has been permanently deleted</strong> as you requested.
        All personal data associated with your account has been removed from our systems.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin:20px 0;">
        <p style="color:#166534;font-size:13px;margin:0;">
          ✓ Profile data deleted<br>
          ✓ Payment history anonymised<br>
          ✓ Orders and applications removed<br>
          ✓ Subscription cancelled
        </p>
      </div>
      <p style="color:#374151;font-size:14px;">
        We're sorry to see you go. If you ever want to return, you're always welcome to create a new account at 
        <a href="https://workabroadhub.tech" style="color:#1d4ed8;">workabroadhub.tech</a>.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="color:#9ca3af;font-size:12px;text-align:center;">
        Questions? Contact us at 
        <a href="mailto:support@workabroadhub.tech" style="color:#1d4ed8;">support@workabroadhub.tech</a>
      </p>
    </div>`;

  return sendEmail({
    to,
    subject: "Your WorkAbroad Hub account has been deleted",
    html,
    text: `Hi ${name},\n\nYour WorkAbroad Hub account has been permanently deleted as requested. All your personal data has been removed.\n\nWe hope to see you again in the future.\n\n— Exovia Connect Team`,
  });
}

export async function sendDeadlineReminderEmail(
  to: string,
  firstName: string | null | undefined,
  job: { title: string; company: string; deadline: Date; daysLeft: number },
): Promise<EmailResult> {
  const name = escapeHtml((firstName || "").trim() || "there");
  const jobTitle = escapeHtml(job.title);
  const company = escapeHtml(job.company);
  const deadlineStr = escapeHtml(
    job.deadline.toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
  );
  const urgencyColor = job.daysLeft <= 1 ? "#dc2626" : job.daysLeft <= 3 ? "#ea580c" : "#d97706";
  const urgencyLabel = job.daysLeft <= 1 ? "TODAY" : job.daysLeft <= 3 ? `${job.daysLeft} DAYS LEFT` : `${job.daysLeft} days left`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
      <div style="text-align:center;margin-bottom:20px;">
        <h2 style="color:#0f766e;margin:0;">WorkAbroad Hub</h2>
        <p style="color:#6b7280;font-size:12px;margin:4px 0 0;">Application Deadline Reminder</p>
      </div>
      <p style="color:#111827;font-size:15px;">Hi ${name},</p>
      <p style="color:#374151;font-size:14px;line-height:1.6;">
        This is a reminder that your application deadline for the following job is approaching:
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin:20px 0;">
        <p style="margin:0 0 6px;font-weight:700;font-size:16px;color:#0f172a;">${jobTitle}</p>
        <p style="margin:0 0 12px;color:#64748b;font-size:14px;">${company}</p>
        <div style="display:inline-block;background:${urgencyColor};color:#fff;font-weight:700;font-size:13px;padding:6px 16px;border-radius:20px;letter-spacing:0.5px;">
          ⏰ ${urgencyLabel}
        </div>
        <p style="margin:12px 0 0;color:#374151;font-size:13px;">Deadline: <strong>${deadlineStr}</strong></p>
      </div>
      <p style="color:#374151;font-size:14px;line-height:1.6;">
        Don't miss this opportunity! Visit your <a href="https://workabroadhub.tech/application-tracker" style="color:#0f766e;font-weight:600;">Application Tracker</a> to update your status or find the job link.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://workabroadhub.tech/application-tracker" style="display:inline-block;background:#0f766e;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
          View Application Tracker →
        </a>
      </div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#9ca3af;font-size:12px;text-align:center;">
        You're receiving this because you set a deadline reminder in WorkAbroad Hub.<br>
        Questions? <a href="mailto:support@workabroadhub.tech" style="color:#0f766e;">support@workabroadhub.tech</a>
      </p>
    </div>`;

  return sendEmail({
    to,
    subject: `⏰ Deadline reminder: ${job.title} at ${job.company} — ${urgencyLabel}`,
    html,
    text: `Hi ${name},\n\nReminder: Your application deadline for "${job.title}" at "${job.company}" is ${deadlineStr} (${urgencyLabel}).\n\nVisit your tracker: https://workabroadhub.tech/application-tracker\n\n— WorkAbroad Hub`,
  });
}
