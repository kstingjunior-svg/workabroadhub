/**
 * Multi-provider email sender with automatic failover + diagnostic logging.
 *
 * Why this exists
 * ───────────────
 * 2026-06: founder reported "people are complaining they cannot see their email
 * codes again". Root causes were:
 *   1. GMAIL_APP_PASSWORD revoked or rate-limited by Google
 *   2. From-header rewrite (Gmail rejects when From ≠ authenticated address
 *      AND DKIM not configured on workabroadhub.tech)
 *   3. SPF/DKIM missing on workabroadhub.tech → mail lands in spam
 *   4. SMTP timeout → registration returned 200 but no email was sent
 *
 * Fix: try Gmail SMTP → fall back to Resend HTTP API. Both providers logged.
 * Recent attempts (success + failure) are kept in a 200-entry ring buffer so
 * the admin diagnostic endpoint can show what's actually happening.
 */
import nodemailer from "nodemailer";

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendOutcome {
  success: boolean;
  provider?: "gmail" | "smtp" | "resend" | "console";
  messageId?: string;
  error?: string;
  errorCode?: string;          // EAUTH, ECONN, 5xx, etc.
  durationMs?: number;
}

/** Ring buffer of recent send attempts for admin diagnostic. */
const RECENT_ATTEMPTS: Array<SendOutcome & { to: string; subject: string; at: string }> = [];
const MAX_LOG = 200;

function recordOutcome(args: SendArgs, outcome: SendOutcome): void {
  RECENT_ATTEMPTS.unshift({
    ...outcome,
    to: args.to,
    subject: args.subject,
    at: new Date().toISOString(),
  });
  if (RECENT_ATTEMPTS.length > MAX_LOG) RECENT_ATTEMPTS.pop();
}

export function getRecentEmailAttempts(limit = 50): Array<SendOutcome & { to: string; subject: string; at: string }> {
  return RECENT_ATTEMPTS.slice(0, Math.min(limit, MAX_LOG));
}

export function getProviderStats(): {
  gmailConfigured: boolean;
  smtpConfigured: boolean;
  resendConfigured: boolean;
  recentSuccess: number;
  recentFail: number;
  recentFailureReasons: Record<string, number>;
  lastFailureAt: string | null;
} {
  const successes = RECENT_ATTEMPTS.filter((a) => a.success).length;
  const failures = RECENT_ATTEMPTS.filter((a) => !a.success);
  const reasons: Record<string, number> = {};
  for (const f of failures) {
    const key = f.errorCode || (f.error?.slice(0, 60) ?? "unknown");
    reasons[key] = (reasons[key] || 0) + 1;
  }
  return {
    gmailConfigured: Boolean((process.env.GMAIL_USER || "").trim() && (process.env.GMAIL_APP_PASSWORD || "").trim()),
    smtpConfigured: Boolean((process.env.SMTP_HOST || "").trim() && (process.env.SMTP_USER || "").trim() && (process.env.SMTP_PASS || "").trim()),
    resendConfigured: Boolean((process.env.RESEND_API_KEY || "").trim()),
    recentSuccess: successes,
    recentFail: failures.length,
    recentFailureReasons: reasons,
    lastFailureAt: failures[0]?.at ?? null,
  };
}

// ── Gmail / SMTP transport ────────────────────────────────────────────────
let _smtpTransport: nodemailer.Transporter | null = null;
let _smtpAuthedAs: string | null = null;

function buildSmtpTransport(): { transport: nodemailer.Transporter; authedAs: string; kind: "gmail" | "smtp" } | null {
  // 2026-06: SMTP_* now takes precedence over GMAIL_*. The founder migrated
  // from Gmail SMTP to Hostinger business email
  // (workabroadhub.tech@workabroadhub.tech) so verification codes come FROM
  // the business address, not a random personal Gmail. The previous order
  // (Gmail first) silently overrode Hostinger config and left codes coming
  // from the wrong address.
  const smtpHost = (process.env.SMTP_HOST || "").trim();
  const smtpUser = (process.env.SMTP_USER || "").trim();
  const smtpPass = (process.env.SMTP_PASS || "").trim();
  if (smtpHost && smtpUser && smtpPass) {
    const port = parseInt(process.env.SMTP_PORT || "465", 10);
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
      connectionTimeout: 8000,
      socketTimeout: 12000,
    });
    return { transport, authedAs: smtpUser, kind: "smtp" };
  }

  // Fallback: Gmail SMTP (only used if no generic SMTP is configured)
  const gmailUser = (process.env.GMAIL_USER || "").trim();
  // Strip spaces — Google shows app passwords as "xxxx xxxx xxxx xxxx" but SMTP needs no spaces
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || "").trim().replace(/\s+/g, "");
  if (gmailUser && gmailPass) {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
      // Don't hang the whole request if Google's SMTP is slow
      connectionTimeout: 8000,
      socketTimeout: 12000,
    });
    return { transport, authedAs: gmailUser, kind: "gmail" };
  }

  return null;
}

let _smtpKind: "gmail" | "smtp" | null = null;

function getSmtpTransport(): { transport: nodemailer.Transporter; authedAs: string; kind: "gmail" | "smtp" } | null {
  if (!_smtpTransport) {
    const built = buildSmtpTransport();
    if (!built) return null;
    _smtpTransport = built.transport;
    _smtpAuthedAs = built.authedAs;
    _smtpKind = built.kind;
    return built;
  }
  return {
    transport: _smtpTransport,
    authedAs: _smtpAuthedAs || "",
    kind: _smtpKind || "smtp",
  };
}

/** Clear cached SMTP transport — call after env vars change. */
export function clearProviderCache(): void {
  _smtpTransport = null;
  _smtpAuthedAs = null;
  _smtpKind = null;
}

/** Which SMTP provider is currently being used (for the admin diagnostic). */
export function getActiveSmtpProfile(): {
  configured: boolean;
  host?: string;
  port?: number;
  user?: string;
  kind?: "gmail" | "smtp";
  isHostinger?: boolean;
} {
  const smtpHost = (process.env.SMTP_HOST || "").trim();
  const smtpUser = (process.env.SMTP_USER || "").trim();
  const smtpPass = (process.env.SMTP_PASS || "").trim();
  if (smtpHost && smtpUser && smtpPass) {
    return {
      configured: true,
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || "465", 10),
      user: smtpUser,
      kind: "smtp",
      isHostinger: /hostinger\.com$/i.test(smtpHost),
    };
  }
  const gmailUser = (process.env.GMAIL_USER || "").trim();
  if (gmailUser) {
    return {
      configured: true,
      host: "smtp.gmail.com",
      port: 465,
      user: gmailUser,
      kind: "gmail",
      isHostinger: false,
    };
  }
  return { configured: false };
}

/**
 * Choose the From address. CRITICAL: when we're SMTP-authenticated as a Gmail
 * account, we MUST use that authenticated address as From — otherwise Gmail
 * either rewrites the header (showing the wrong sender) or rejects the message
 * outright. The previous bug was using support@workabroadhub.tech as From
 * while auth'd as a Gmail user without proper "Send mail as" + DKIM setup.
 */
function resolveFromAddress(authedAs: string | null): string {
  const configured = (process.env.SMTP_FROM || process.env.EMAIL_FROM || "").trim();
  if (configured) {
    // If admin explicitly set a From AND it matches the auth'd account, use it.
    // Otherwise prefer the authed account (safer — guaranteed deliverable).
    if (!authedAs) return configured;
    if (configured.toLowerCase().endsWith(authedAs.toLowerCase()) || configured.toLowerCase() === authedAs.toLowerCase()) {
      return configured;
    }
    // Configured from-address doesn't match authed account. Use authed to
    // avoid Gmail rewrite/rejection — but log it so the founder knows the
    // configured EMAIL_FROM isn't being honored.
    console.warn(
      `[email] EMAIL_FROM=${configured} doesn't match authed=${authedAs} — using authed address to avoid header rewrite. ` +
      `Set up DKIM on the configured domain to use it as From.`,
    );
    return authedAs;
  }
  return authedAs || "support@workabroadhub.tech";
}

async function sendViaSmtp(args: SendArgs): Promise<SendOutcome> {
  const start = Date.now();
  const built = getSmtpTransport();
  if (!built) return { success: false, error: "SMTP not configured" };

  try {
    const fromAddress = resolveFromAddress(built.authedAs);
    const info = await built.transport.sendMail({
      from: `"WorkAbroad Hub" <${fromAddress}>`,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
    });
    return {
      success: true,
      provider: built.kind,
      messageId: info.messageId,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    // Mark transport stale on auth errors so the next call rebuilds (in case
    // the env was rotated). Don't clear on transient timeouts.
    if (err?.code === "EAUTH" || /invalid login|535|534/i.test(String(err?.message || ""))) {
      clearProviderCache();
    }
    return {
      success: false,
      provider: built.kind,
      error: err?.message ?? "SMTP send failed",
      errorCode: err?.code,
      durationMs: Date.now() - start,
    };
  }
}

// ── Resend HTTP API (fallback provider) ──────────────────────────────────
async function sendViaResend(args: SendArgs): Promise<SendOutcome> {
  const start = Date.now();
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return { success: false, error: "Resend not configured" };

  const fromAddress = (process.env.RESEND_FROM || "WorkAbroad Hub <noreply@workabroadhub.tech>").trim();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        success: false,
        provider: "resend",
        error: `Resend HTTP ${res.status}: ${body.slice(0, 200)}`,
        errorCode: String(res.status),
        durationMs: Date.now() - start,
      };
    }
    const data = (await res.json()) as { id?: string };
    return {
      success: true,
      provider: "resend",
      messageId: data.id,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false,
      provider: "resend",
      error: err?.message ?? "Resend send failed",
      errorCode: err?.name,
      durationMs: Date.now() - start,
    };
  }
}

// ── Public API: sendWithFailover ──────────────────────────────────────────
/**
 * Send email through the best available provider. Tries Gmail/SMTP first,
 * automatically falls back to Resend if the primary fails. Every attempt is
 * recorded in the ring buffer so the admin diagnostic can show what's
 * happening when users complain about missing codes.
 */
export async function sendWithFailover(args: SendArgs): Promise<SendOutcome> {
  // Attempt 1: SMTP
  const smtpAttempt = await sendViaSmtp(args);
  if (smtpAttempt.success) {
    recordOutcome(args, smtpAttempt);
    console.log(`[email] Sent via ${smtpAttempt.provider} to ${args.to}: ${smtpAttempt.messageId} (${smtpAttempt.durationMs}ms)`);
    return smtpAttempt;
  }
  if (smtpAttempt.error !== "SMTP not configured") {
    console.warn(
      `[email] SMTP send failed to ${args.to}: ${smtpAttempt.errorCode || ""} ${smtpAttempt.error?.slice(0, 200)} — trying fallback`,
    );
  }

  // Attempt 2: Resend
  const resendAttempt = await sendViaResend(args);
  if (resendAttempt.success) {
    recordOutcome(args, resendAttempt);
    console.log(`[email] Sent via Resend to ${args.to}: ${resendAttempt.messageId} (${resendAttempt.durationMs}ms)`);
    return resendAttempt;
  }

  // Both failed — record the SMTP failure (more informative) but report Resend if SMTP wasn't even configured
  const finalOutcome: SendOutcome =
    smtpAttempt.error === "SMTP not configured" ? resendAttempt : smtpAttempt;

  recordOutcome(args, finalOutcome);

  // Console fallback — last resort so codes are at least visible in Render logs
  console.error(
    `[email] BOTH PROVIDERS FAILED for ${args.to}\n` +
    `  SMTP: ${smtpAttempt.error}\n` +
    `  Resend: ${resendAttempt.error}\n` +
    `  Subject: ${args.subject}\n` +
    `  Body (text): ${(args.text || "").slice(0, 300)}`,
  );
  return finalOutcome;
}
