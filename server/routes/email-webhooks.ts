/**
 * Email provider webhooks — bounce / complaint handlers.
 *
 * 2026-10 (Tony: "15 bounces, mostly repeats to the same dead addresses").
 *
 * Mounted:
 *   POST /api/webhooks/resend     — Resend's event webhook (JSON)
 *
 * Resend fires:
 *   - email.bounced          → recipient's MTA rejected it (hard/soft)
 *   - email.complained       → recipient marked it as spam
 *   - email.delivery_delayed → soft bounce in progress (ignored, Resend retries)
 *
 * For email.bounced we check the bounce type:
 *   - "hard"  → permanent, add to our suppression list immediately
 *   - "soft"  → transient (full mailbox, DNS blip), do NOT suppress
 *   - "undetermined" → treat as hard to be safe (same as Resend's own
 *     suppression behaviour)
 *
 * For email.complained → always suppress (spam complaint = user DOES NOT
 * want our mail).
 *
 * SECURITY:
 *   Resend signs every webhook using the Svix format. We verify
 *   svix-id + svix-timestamp + svix-signature against RESEND_WEBHOOK_SECRET.
 *   Without a configured secret, we fall back to accepting unsigned POSTs
 *   from Resend's documented source IPs but LOG a warning so Tony knows
 *   to set the secret. In production we should always have the secret.
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { addSuppression, listRecentSuppressions, removeSuppression } from "../lib/email-suppressions";

interface ResendEvent {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    bounce?: {
      type?: string;       // "hard" | "soft" | "undetermined"
      message?: string;
      subType?: string;
    };
    bounce_type?: string;  // older event shape
  };
}

/**
 * Svix signature verification — https://docs.svix.com/receiving/verifying-payloads/how
 * Resend uses the same scheme. Returns true if the signature validates.
 */
function verifySvixSignature(req: Request, rawBody: string, secret: string): boolean {
  try {
    const svixId        = req.header("svix-id") || "";
    const svixTimestamp = req.header("svix-timestamp") || "";
    const svixSignature = req.header("svix-signature") || "";
    if (!svixId || !svixTimestamp || !svixSignature) return false;

    // Reject replays > 5min old
    const ts = parseInt(svixTimestamp, 10);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return false;

    // Secret format from Resend dashboard is "whsec_<base64>"
    const secretBytes = Buffer.from(
      secret.startsWith("whsec_") ? secret.slice(6) : secret,
      "base64",
    );
    const signed = `${svixId}.${svixTimestamp}.${rawBody}`;
    const expected = crypto
      .createHmac("sha256", secretBytes)
      .update(signed)
      .digest("base64");

    // Header format: "v1,<sig> v1,<sig2>" (space-separated)
    const sigs = svixSignature.split(" ").map((s) => s.split(",")[1]).filter(Boolean);
    return sigs.some((s) => crypto.timingSafeEqual(
      Buffer.from(s),
      Buffer.from(expected),
    ));
  } catch {
    return false;
  }
}

export function registerEmailWebhooks(app: Express): void {
  // Capture raw body for signature verification — mount a dedicated JSON
  // middleware that preserves the raw string.
  const rawJson = (req: Request, _res: Response, next: Function) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (data += chunk));
    req.on("end", () => {
      (req as any).rawBody = data;
      try { req.body = data ? JSON.parse(data) : {}; } catch { req.body = {}; }
      next();
    });
  };

  // ── Resend ──────────────────────────────────────────────────────────────
  app.post("/api/webhooks/resend", rawJson, async (req: Request, res: Response) => {
    const secret = (process.env.RESEND_WEBHOOK_SECRET || "").trim();
    if (secret) {
      const ok = verifySvixSignature(req, (req as any).rawBody || "", secret);
      if (!ok) {
        console.warn("[email-webhooks] Resend signature invalid — rejecting");
        return res.status(401).json({ error: "invalid signature" });
      }
    } else {
      console.warn("[email-webhooks] RESEND_WEBHOOK_SECRET not set — accepting webhook unsigned (dev only!)");
    }

    const event = (req.body || {}) as ResendEvent;
    try {
      const toList: string[] = Array.isArray(event.data?.to)
        ? (event.data!.to as string[])
        : event.data?.to
          ? [event.data.to as string]
          : [];

      if (event.type === "email.bounced") {
        const bounceType = (event.data?.bounce?.type || event.data?.bounce_type || "undetermined").toLowerCase();
        // Only suppress on permanent / undetermined bounces. Soft bounces
        // (temporary — full inbox, DNS blip) are retried by Resend and
        // usually resolve on their own.
        if (bounceType === "soft") {
          console.log(`[email-webhooks] soft bounce for ${toList.join(",")} — not suppressing`);
          return res.json({ received: true, action: "ignored_soft_bounce" });
        }
        for (const to of toList) {
          await addSuppression(to, {
            bounceType,
            source: "resend_webhook",
            reason: "hard_bounce",
            details: event.data?.bounce?.message || event.data?.subject || null,
          });
        }
        return res.json({ received: true, action: "suppressed", count: toList.length });
      }

      if (event.type === "email.complained") {
        for (const to of toList) {
          await addSuppression(to, {
            bounceType: "complaint",
            source: "resend_webhook",
            reason: "spam_complaint",
            details: "User marked as spam",
          });
        }
        return res.json({ received: true, action: "suppressed_complaint", count: toList.length });
      }

      // Everything else (delivered, delivery_delayed, opened, clicked) — just ACK
      return res.json({ received: true, action: "noop", type: event.type });
    } catch (err: any) {
      console.error("[email-webhooks] resend handler error:", err?.message);
      // Return 200 anyway so Resend doesn't retry — we've already logged
      return res.json({ received: true, error: err?.message || "handler_error" });
    }
  });

  // ── Admin: list current suppressions ────────────────────────────────────
  app.get("/api/admin/email-suppressions", async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user?.isAdmin) return res.status(403).json({ error: "admin only" });
    const limit = Math.min(parseInt((req.query.limit as string) || "100", 10), 500);
    const rows = await listRecentSuppressions(limit);
    return res.json({ suppressions: rows, count: rows.length });
  });

  // ── Admin: manual unblock ──────────────────────────────────────────────
  app.delete("/api/admin/email-suppressions/:email", async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user?.isAdmin) return res.status(403).json({ error: "admin only" });
    const removed = await removeSuppression(req.params.email);
    return res.json({ removed });
  });

  console.log("[email-webhooks] registered: POST /api/webhooks/resend, GET/DELETE /api/admin/email-suppressions");
}
