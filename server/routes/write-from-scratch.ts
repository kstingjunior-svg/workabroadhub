/**
 * "Write from Scratch" routes.
 *
 * Product: a paid tool that lets a user generate a CV, cover letter,
 * recruitment CV, or reference letter from a short description of themselves
 * — no existing document to upload. All other AI tools require an upload;
 * this fills the gap for users starting from zero.
 *
 * Pricing:
 *   - Free users:   KES 300 per generation, one-off M-Pesa
 *   - Pro subs:     free (unlimited)
 *
 * Endpoints:
 *
 *   POST /api/write-from-scratch/init
 *     Body: { docType, input, phone? }
 *     - Pro user  → creates draft (status='paid'), returns { draftId }
 *     - Free user → creates draft (status='pending_payment'), STK-pushes 300
 *                   to phone, returns { draftId, mpesaCheckoutId }
 *
 *   POST /api/write-from-scratch/mpesa-callback
 *     Safaricom hits this. Looks up draft by CheckoutRequestID, marks paid.
 *
 *   GET  /api/write-from-scratch/:id/status
 *     Client polls this after payment. Returns { status, hasBody, error }.
 *
 *   POST /api/write-from-scratch/:id/generate
 *     Requires status='paid'. Runs the AI generator, stores body, marks
 *     status='generated'. Idempotent — safe to retry.
 *
 *   GET  /api/write-from-scratch/:id/download.docx
 *   GET  /api/write-from-scratch/:id/download.pdf
 *     Streams the file. Requires status='generated'. Draft ID is an
 *     unguessable UUID, so the URL itself acts as capability.
 */

import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { storage } from "../storage";
import { stkPush, isMpesaAvailable } from "../mpesa";
import { createPayPalOrder, capturePayPalOrder, isPayPalConfigured, safePayPalUrl } from "../paypal";
import { renderDocx, renderPdf } from "../services/document-renderer";
import { safaricomIpGuard } from "../middleware/safaricomIpGuard";

// 2026-08 SECURITY (Tony's fake-email report): every payment initiator
// must confirm the caller's users.email_verified = true. Signed-in users
// with fake unverified emails now get 403; guest (unauthenticated) users
// were already blocked upstream.
async function assertEmailVerified(res: Response, userId: string | null): Promise<boolean> {
  if (!userId) {
    res.status(401).json({ error: "Please sign in and verify your email first." });
    return false;
  }
  try {
    const { rows } = await pool.query<{ email_verified: boolean; is_admin: boolean; role: string }>(
      `SELECT email_verified, is_admin, role FROM users WHERE id = $1`,
      [userId],
    );
    const u = rows[0];
    if (!u) { res.status(401).json({ error: "User not found" }); return false; }
    if (u.is_admin || u.role === "ADMIN" || u.role === "SUPER_ADMIN") return true;
    if (!u.email_verified) {
      res.status(403).json({
        error: "Please verify your email before paying.",
        verificationRequired: true,
        verificationStep: "email",
      });
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[write-from-scratch] verify check failed:", err?.message);
    res.status(500).json({ error: "Verification check failed." });
    return false;
  }
}
import {
  generateDocument,
  WriteFromScratchGenerationError,
  type WriteFromScratchDocType,
  type WriteFromScratchInput,
} from "../services/writeFromScratch/generator";

const PRICE_KES = 300;
/** 2026-11: "Tailor for another job" — re-use a CV you already paid for, new job description. */
const RETAILOR_PRICE_KES = 100;
const TAILORABLE: WriteFromScratchDocType[] = ["cv", "recruitment_cv", "cover_letter"];

/** Trim + cap the free-text fields we added for tailoring. */
function sanitizeTailoring(input: any): any {
  const out = { ...input };
  if (typeof out.jobDescription === "string") out.jobDescription = out.jobDescription.trim().slice(0, 8000) || undefined;
  else delete out.jobDescription;
  if (typeof out.workHistory === "string") out.workHistory = out.workHistory.trim().slice(0, 3000) || undefined;
  else delete out.workHistory;
  return out;
}

/**
 * Resolve a "tailor for another job" request: the parent must be the caller's
 * own, already-generated document of a tailorable type. The new draft copies
 * the parent's details EXACTLY and only swaps the job description, so the
 * KES 100 price can't be used to write a different person's CV.
 */
async function resolveRetailor(userId: string | null, parentDraftId: unknown, jobDescription: unknown):
  Promise<{ ok: true; docType: WriteFromScratchDocType; input: any } | { ok: false; status: number; error: string }> {
  if (!userId) return { ok: false, status: 401, error: "Please sign in to tailor your CV for another job." };
  if (typeof parentDraftId !== "string" || !/^[0-9a-f-]{36}$/i.test(parentDraftId)) return { ok: false, status: 400, error: "Invalid document." };
  const jd = typeof jobDescription === "string" ? jobDescription.trim() : "";
  if (jd.length < 80) return { ok: false, status: 400, error: "Paste the full job description (at least a few sentences)." };
  const { rows } = await pool.query(
    `SELECT doc_type, input_json, status, user_id, created_at FROM write_from_scratch_drafts WHERE id = $1`, [parentDraftId]);
  const p = rows[0];
  if (!p || p.user_id !== userId) return { ok: false, status: 404, error: "We couldn't find that document on your account." };
  if (p.status !== "generated") return { ok: false, status: 400, error: "That document hasn't been generated yet." };
  if (!TAILORABLE.includes(p.doc_type)) return { ok: false, status: 400, error: "Only CVs and cover letters can be tailored." };
  if (Date.now() - new Date(p.created_at).getTime() > 180 * 86400_000) return { ok: false, status: 400, error: "That document is more than 6 months old — please create a new one." };
  const parentInput = typeof p.input_json === "string" ? JSON.parse(p.input_json) : p.input_json;
  return { ok: true, docType: p.doc_type, input: { ...parentInput, jobDescription: jd.slice(0, 8000) } };
}

// Simple per-user rate limit for the free match panel (it costs a model call).
const matchHits = new Map<string, number[]>();
function allowMatch(key: string): boolean {
  const now = Date.now();
  const hits = (matchHits.get(key) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 15) return false;
  hits.push(now); matchHits.set(key, hits);
  return true;
}
const VALID_DOC_TYPES: WriteFromScratchDocType[] = [
  "cv",
  "cover_letter",
  "recruitment_cv",
  "reference_letter",
];

/**
 * Match the frontend's definition of "paying customer" — any plan that isn't
 * "free" or null. The strict list (pro / pro_referral / yearly) missed users
 * on legacy plan strings ("basic", "standard", grandfathered tiers) who see
 * the "Included with your Pro plan" banner but then hit an M-Pesa phone
 * demand because the server disagreed with the UI.
 *
 * Anyone with an active non-free plan gets the tool free — same policy Tony
 * announced ("free for Pro subscribers"), just aligned to the actual plan
 * strings in storage.getUserPlan.
 */
function isProTier(plan: string | null | undefined): boolean {
  if (!plan) return false;
  const p = String(plan).trim().toLowerCase();
  if (!p) return false;
  return p !== "free";
}

/**
 * Sniff the current user id from every auth shape used in this codebase.
 * Returns null for unauthenticated requests (which are allowed — guests can
 * pay via M-Pesa without an account).
 *
 * 2026-07 FIX: previously only checked req.user (populated by Replit OAuth /
 * isAuthenticated middleware). Regular email+password users land here without
 * req.user set because this route isn't gated by isAuthenticated. Their id
 * lives at req.session.customUserId (see server/replit_integrations/auth
 * /routes.ts /api/auth/user handler). Without this fallback, logged-in users
 * saw "we need an M-Pesa phone number" even though we had one on file.
 */
function currentUserId(req: any): string | null {
  return (
    req.user?.claims?.sub ??
    req.user?.id ??
    req.session?.customUserId ??
    null
  );
}

/**
 * 2026-07: Shared generation helper. Used by BOTH the client-triggered
 * /generate endpoint AND the auto-trigger inside the M-Pesa callback +
 * PayPal capture. Keeping generation in one function means:
 *   • The tool is truly automatic — no reliance on the client staying
 *     on the page after payment confirms.
 *   • Idempotent — safe to call twice (returns already-generated body).
 *   • Same error handling everywhere.
 */
type GenerationOutcome =
  | { status: "not_found" }
  | { status: "not_paid" }
  | { status: "already_generated"; body: string; wordCount?: number }
  | { status: "generated"; body: string; wordCount: number }
  | { status: "failed"; error: string };

async function runGenerationForDraft(draftId: string): Promise<GenerationOutcome> {
  const { rows } = await pool.query(
    `SELECT id, doc_type, input_json, status, output_body
       FROM write_from_scratch_drafts
      WHERE id = $1`,
    [draftId],
  );
  if (rows.length === 0) return { status: "not_found" };
  const row = rows[0];

  if (row.status === "pending_payment") return { status: "not_paid" };
  if (row.status === "generated" && row.output_body) {
    return { status: "already_generated", body: row.output_body };
  }
  if (row.status === "failed") {
    // Reset to paid so we can try once more
    await pool.query(
      `UPDATE write_from_scratch_drafts SET status = 'paid', error_message = NULL WHERE id = $1`,
      [row.id],
    );
  }

  const request = {
    docType: row.doc_type,
    input: typeof row.input_json === "string" ? JSON.parse(row.input_json) : row.input_json,
  } as WriteFromScratchInput;

  let result;
  try {
    result = await generateDocument(request);
  } catch (err: any) {
    const isKnown = err instanceof WriteFromScratchGenerationError;
    const message = isKnown ? err.message : "Could not generate the document.";
    await pool.query(
      `UPDATE write_from_scratch_drafts SET status = 'failed', error_message = $1 WHERE id = $2`,
      [message, row.id],
    );
    return { status: "failed", error: message };
  }

  await pool.query(
    `UPDATE write_from_scratch_drafts
        SET output_body   = $1,
            status        = 'generated',
            generated_at  = NOW(),
            error_message = NULL
      WHERE id = $2`,
    [result.body, row.id],
  );

  return {
    status: "generated",
    body: result.body,
    wordCount: result.wordCount,
  };
}

export function registerWriteFromScratchRoutes(app: Express): void {
  /* ─── POST /api/write-from-scratch/init ─────────────────────────────── */
  app.post("/api/write-from-scratch/init", async (req: Request, res: Response) => {
    try {
      let { docType, input, phone } = req.body ?? {};
      let price = PRICE_KES;
      const parentDraftId: string | null = typeof req.body?.parentDraftId === "string" ? req.body.parentDraftId : null;

      // 2026-11: "Tailor for another job" (KES 100) — details come from the parent draft.
      if (parentDraftId) {
        const r = await resolveRetailor(currentUserId(req), parentDraftId, req.body?.jobDescription);
        if ("error" in r) return res.status(r.status).json({ error: r.error });
        docType = r.docType; input = r.input; price = RETAILOR_PRICE_KES;
      }
      if (input && typeof input === "object") input = sanitizeTailoring(input);

      // ── Validate ─────────────────────────────────────────────────────
      if (!VALID_DOC_TYPES.includes(docType)) {
        return res.status(400).json({
          error: `Invalid docType. Must be one of: ${VALID_DOC_TYPES.join(", ")}`,
        });
      }
      if (!input || typeof input !== "object") {
        return res.status(400).json({ error: "Missing or invalid 'input'." });
      }
      const validationError = validateInputForType(docType, input);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const userId = currentUserId(req);
      if (!(await assertEmailVerified(res, userId))) return;

      // Everyone pays KES 300 — no Pro bypass. Kept the isPro helper around in
      // case we want to add it back later, but the current policy is: uniform
      // per-generation pricing so we don't confuse users about what's "free."
      //
      // Phone resolution: prefer the phone in the request body (guest users
      // typing into the input, or logged-in users overriding), fall back to
      // the phone we already have on file from signup. This is the "auto-use
      // registered phone" UX Tony asked for — signed-in users click Generate
      // and immediately get the STK prompt on their phone.
      let payerPhone: string | null =
        typeof phone === "string" && phone.trim().length >= 9 ? phone.trim() : null;

      if (!payerPhone && userId) {
        try {
          const { rows } = await pool.query(
            `SELECT phone FROM users WHERE id = $1 LIMIT 1`,
            [userId],
          );
          const storedPhone = rows[0]?.phone as string | null | undefined;
          if (storedPhone && storedPhone.trim().length >= 9) {
            payerPhone = storedPhone.trim();
          }
        } catch (err: any) {
          console.warn("[write-from-scratch] Could not look up registered phone:", err?.message);
        }
      }

      console.log(
        `[write-from-scratch/init] userId=${userId ?? "guest"} payerPhone=${payerPhone ? payerPhone.slice(0, 6) + "…" : "none"}`,
      );

      // If we still have no phone, we can't charge — ask the client to collect one.
      if (!payerPhone) {
        return res.status(400).json({
          error: `We need an M-Pesa phone number to send the KES ${price} prompt.`,
          needsPhone: true,
        });
      }

      // ── Create draft row ─────────────────────────────────────────────
      const { rows: created } = await pool.query(
        `INSERT INTO write_from_scratch_drafts
           (user_id, doc_type, input_json, status, mpesa_amount, mpesa_phone, parent_draft_id)
         VALUES ($1, $2, $3, 'pending_payment', $4, $5, $6)
         RETURNING id`,
        [userId, docType, JSON.stringify(input), price, payerPhone, parentDraftId],
      );
      const draftId = created[0].id as string;

      // ── Kick off STK push ────────────────────────────────────────────
      if (!isMpesaAvailable()) {
        await pool.query(`DELETE FROM write_from_scratch_drafts WHERE id = $1`, [draftId]);
        return res.status(503).json({
          error: "M-Pesa is temporarily unavailable. Please try again in a moment.",
        });
      }

      let stkResponse;
      try {
        stkResponse = await stkPush(
          payerPhone,
          price,
          `WorkAbroad Hub — ${docTypeLabel(docType)}`,
          `WAH-WFS-${draftId.slice(0, 8)}`,
          // Route this STK's callback to OUR dedicated endpoint, not the
          // generic /api/payments/mpesa/callback pipeline. Isolated
          // paths = no risk of accidentally triggering plan-activation
          // logic on a 300 KES tool payment.
          `${getCallbackBaseUrl(req)}/api/write-from-scratch/mpesa-callback`,
        );
      } catch (err: any) {
        console.error("[write-from-scratch] STK push failed:", err?.message);
        await pool.query(`DELETE FROM write_from_scratch_drafts WHERE id = $1`, [draftId]);
        return res.status(502).json({
          error: "Could not send the M-Pesa prompt. Please try again.",
        });
      }

      // Save the CheckoutRequestID so we can match the callback.
      await pool.query(
        `UPDATE write_from_scratch_drafts
            SET mpesa_checkout_id = $1
          WHERE id = $2`,
        [stkResponse?.CheckoutRequestID ?? null, draftId],
      );

      return res.json({
        draftId,
        status: "pending_payment",
        mpesaCheckoutId: stkResponse?.CheckoutRequestID ?? null,
        payerPhone,
        message: "Check your phone for the M-Pesa prompt and enter your PIN.",
      });
    } catch (err: any) {
      console.error("[write-from-scratch/init] error:", err);
      return res.status(500).json({ error: "Could not start the request." });
    }
  });

  /* ─── POST /api/write-from-scratch/mpesa-callback ───────────────────── */
  // 2026-09 SECURITY: safaricomIpGuard drops forged callbacks.
  app.post("/api/write-from-scratch/mpesa-callback", safaricomIpGuard, async (req, res) => {
    // Always ACK Safaricom immediately; do work best-effort. If we return
    // non-OK Safaricom retries, which risks double-processing.
    try {
      const body = req.body?.Body?.stkCallback;
      if (!body) {
        return res.json({ ResultCode: 0, ResultDesc: "ignored" });
      }
      const checkoutId = body.CheckoutRequestID as string | undefined;
      const resultCode = Number(body.ResultCode ?? -1);
      if (!checkoutId) {
        return res.json({ ResultCode: 0, ResultDesc: "no checkout id" });
      }

      // Successful payment → grab receipt + amount from metadata.
      let receipt: string | null = null;
      if (resultCode === 0) {
        // 2026-11 audit: refuse success callbacks Safaricom contradicts.
        const { confirmStkSuccess } = await import("../lib/stk-verify");
        const conf = await confirmStkSuccess(checkoutId, 2);
        if (conf.result === "rejected") {
          console.warn(`[write-from-scratch][Security] success callback contradicted by Safaricom for ${checkoutId}: ${conf.detail} — ignored`);
          return res.json({ ResultCode: 0, ResultDesc: "ignored" });
        }
        const items = body.CallbackMetadata?.Item as Array<{ Name: string; Value: any }> | undefined;
        if (items) {
          const receiptItem = items.find((i) => i.Name === "MpesaReceiptNumber");
          if (receiptItem) receipt = String(receiptItem.Value);
        }
        await pool.query(
          `UPDATE write_from_scratch_drafts
              SET status        = 'paid',
                  mpesa_receipt = $1,
                  paid_at       = NOW()
            WHERE (mpesa_checkout_id = $2 OR $2 = ANY(coalesce(prior_checkout_ids, '{}'::text[])))
              AND status = 'pending_payment'`,
          [receipt, checkoutId],
        );
        console.log(`[write-from-scratch] Payment success: checkoutId=${checkoutId} receipt=${receipt}`);

        // 2026-07 CRITICAL: auto-trigger generation the moment the callback
        // confirms payment. Previously we relied on the client polling
        // /status and then calling /generate — if the user closed the tab
        // after paying, their draft sat at 'paid' forever with no output.
        // Now the server drives generation as soon as Safaricom confirms,
        // making the tool truly automated. Client polling still works
        // (idempotent) and picks up the completed body on next tick.
        try {
          const { rows: paidRows } = await pool.query<{ id: string }>(
            `SELECT id FROM write_from_scratch_drafts
              WHERE (mpesa_checkout_id = $1 OR $1 = ANY(coalesce(prior_checkout_ids, '{}'::text[]))) AND status = 'paid'
              LIMIT 1`,
            [checkoutId],
          );
          const draftId = paidRows[0]?.id;
          if (draftId) {
            // Fire-and-forget so we always ACK Safaricom fast. Silent errors
            // are picked up by the client's error state on next poll.
            runGenerationForDraft(draftId).catch((err: any) =>
              console.error(`[write-from-scratch] auto-generate failed for ${draftId}:`, err?.message)
            );
          }
        } catch (autoErr: any) {
          console.error("[write-from-scratch] auto-generate dispatch failed:", autoErr?.message);
        }
      } else {
        // User cancelled or STK failed. Leave draft as pending_payment so
        // client sees "not paid" and can retry.
        console.log(`[write-from-scratch] Payment result=${resultCode}: checkoutId=${checkoutId}`);
      }

      return res.json({ ResultCode: 0, ResultDesc: "acknowledged" });
    } catch (err: any) {
      console.error("[write-from-scratch] callback error:", err?.message);
      return res.json({ ResultCode: 0, ResultDesc: "handled" });
    }
  });

  /* ─── POST /api/write-from-scratch/paypal-init ──────────────────────────
   *
   * 2026-07: PayPal path so users outside Kenya (no Safaricom line, or
   * regions Safaricom doesn't operate in) can buy Write-from-Scratch documents.
   * Mirrors /init but skips STK push — creates the PayPal order and returns
   * the approval URL so the client can redirect the user to pay.
   *
   * Body: { docType, input }
   * Returns: { draftId, paypalOrderId, approvalUrl }
   */
  app.post("/api/write-from-scratch/paypal-init", async (req: Request, res: Response) => {
    try {
      let { docType, input } = req.body ?? {};
      let price = PRICE_KES;
      const parentDraftId: string | null = typeof req.body?.parentDraftId === "string" ? req.body.parentDraftId : null;
      if (parentDraftId) {
        const r = await resolveRetailor(currentUserId(req), parentDraftId, req.body?.jobDescription);
        if ("error" in r) return res.status(r.status).json({ error: r.error });
        docType = r.docType; input = r.input; price = RETAILOR_PRICE_KES;
      }
      if (input && typeof input === "object") input = sanitizeTailoring(input);

      if (!docType || !VALID_DOC_TYPES.includes(docType as WriteFromScratchDocType)) {
        return res.status(400).json({ error: "Invalid docType" });
      }
      if (!input || typeof input !== "object") {
        return res.status(400).json({ error: "input required" });
      }

      if (!isPayPalConfigured()) {
        return res.status(503).json({
          error: "PayPal is temporarily unavailable. Please try M-Pesa or contact support.",
        });
      }

      const userId = currentUserId(req);
      if (!(await assertEmailVerified(res, userId))) return;

      // Pro users get the tool for free — reuse the same fast path as /init.
      if (userId) {
        const plan = await storage.getUserPlan(userId);
        if (isProTier(plan)) {
          const { rows } = await pool.query(
            `INSERT INTO write_from_scratch_drafts
               (user_id, doc_type, input_json, status)
             VALUES ($1, $2, $3, 'paid')
             RETURNING id`,
            [userId, docType, JSON.stringify(input)],
          );
          return res.json({
            draftId: rows[0].id,
            status: "paid",
            paypalOrderId: null,
            approvalUrl: null,
            message: "Included with your Pro plan — no payment needed.",
          });
        }
      }

      // Create draft in pending_payment; PayPal order ID stored in mpesa_checkout_id
      // (repurposed as generic payment_ref — schema keeps the column name for now).
      const { rows: created } = await pool.query(
        `INSERT INTO write_from_scratch_drafts
           (user_id, doc_type, input_json, status, mpesa_amount, parent_draft_id)
         VALUES ($1, $2, $3, 'pending_payment', $4, $5)
         RETURNING id`,
        [userId, docType, JSON.stringify(input), price, parentDraftId],
      );
      const draftId = created[0].id as string;

      let order;
      try {
        order = await createPayPalOrder(
          price,
          `WorkAbroad Hub — ${docTypeLabel(docType as WriteFromScratchDocType)}`,
          `WAH-WFS-${draftId.slice(0, 8)}`,
          {
            returnUrl: safePayPalUrl("/tools/write-from-scratch", "/tools/write-from-scratch", { paypalReturn: "1" }),
            cancelUrl: safePayPalUrl("/tools/write-from-scratch", "/tools/write-from-scratch", { paypalCancel: "1" }),
          },
        );
      } catch (err: any) {
        console.error("[write-from-scratch] PayPal order creation failed:", err?.message);
        await pool.query(`DELETE FROM write_from_scratch_drafts WHERE id = $1`, [draftId]);
        return res.status(502).json({
          error: "Could not start the PayPal payment. Please try again.",
        });
      }

      await pool.query(
        `UPDATE write_from_scratch_drafts
            SET mpesa_checkout_id = $1
          WHERE id = $2`,
        [order.id, draftId],
      );

      return res.json({
        draftId,
        status: "pending_payment",
        paypalOrderId: order.id,
        approvalUrl: order.approvalUrl,
      });
    } catch (err: any) {
      console.error("[write-from-scratch/paypal-init] error:", err);
      return res.status(500).json({ error: "Could not start the PayPal payment." });
    }
  });

  /* ─── POST /api/write-from-scratch/:id/paypal-capture ────────────────────
   *
   * After the user approves on PayPal's site and returns to our app, the
   * client calls this to capture the funds and mark the draft as paid.
   *
   * Body: { paypalOrderId }
   * Returns: { status: "paid", transactionId }
   */
  app.post("/api/write-from-scratch/:id/paypal-capture", async (req: Request, res: Response) => {
    try {
      const { paypalOrderId } = req.body ?? {};
      if (!paypalOrderId || typeof paypalOrderId !== "string") {
        return res.status(400).json({ error: "paypalOrderId required" });
      }

      const { rows } = await pool.query(
        `SELECT id, status, mpesa_checkout_id, user_id
           FROM write_from_scratch_drafts
          WHERE id = $1`,
        [req.params.id],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Draft not found" });
      const draft = rows[0];

      // Idempotent — if already paid, don't re-capture (PayPal would 422).
      if (draft.status === "paid" || draft.status === "generated") {
        return res.json({ status: draft.status, transactionId: null });
      }

      if (draft.mpesa_checkout_id && draft.mpesa_checkout_id !== paypalOrderId) {
        return res.status(400).json({
          error: "PayPal order mismatch — this draft was created with a different order.",
        });
      }

      let capture;
      try {
        capture = await capturePayPalOrder(paypalOrderId);
      } catch (err: any) {
        console.error("[write-from-scratch] PayPal capture failed:", err?.message);
        return res.status(502).json({
          error: "PayPal payment could not be captured. Please try again.",
        });
      }

      if (capture.status !== "COMPLETED") {
        return res.status(400).json({
          error: `PayPal payment status is ${capture.status}, not COMPLETED.`,
        });
      }

      await pool.query(
        `UPDATE write_from_scratch_drafts
            SET status        = 'paid',
                mpesa_receipt = $1,
                paid_at       = NOW()
          WHERE id = $2
            AND status = 'pending_payment'`,
        [`PP-${capture.transactionId}`, draft.id],
      );

      console.log(
        `[write-from-scratch] PayPal captured: draftId=${draft.id} txn=${capture.transactionId} $${capture.amountUSD}`,
      );

      // 2026-07: same auto-trigger as the M-Pesa callback. Kick off
      // generation immediately so the user doesn't have to leave the
      // browser tab open after paying.
      runGenerationForDraft(draft.id).catch((err: any) =>
        console.error(`[write-from-scratch] PayPal auto-generate failed for ${draft.id}:`, err?.message)
      );

      return res.json({
        status: "paid",
        transactionId: capture.transactionId,
      });
    } catch (err: any) {
      console.error("[write-from-scratch/paypal-capture] error:", err);
      return res.status(500).json({ error: "Could not capture the PayPal payment." });
    }
  });

  /* ─── GET /api/write-from-scratch/:id/status ────────────────────────── */
  app.get("/api/write-from-scratch/:id/status", async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT status, output_body IS NOT NULL AS has_body, error_message
           FROM write_from_scratch_drafts
          WHERE id = $1`,
        [req.params.id],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      const row = rows[0];
      return res.json({
        status: row.status,
        hasBody: Boolean(row.has_body),
        error: row.error_message ?? null,
      });
    } catch (err: any) {
      console.error("[write-from-scratch/status] error:", err?.message);
      return res.status(500).json({ error: "Could not check status." });
    }
  });

  /* ─── POST /api/write-from-scratch/:id/generate ─────────────────────── */
  app.post("/api/write-from-scratch/:id/generate", async (req, res) => {
    try {
      const result = await runGenerationForDraft(req.params.id);
      if (result.status === "not_found")        return res.status(404).json({ error: "Not found" });
      if (result.status === "not_paid")         return res.status(402).json({ error: "Payment not yet confirmed. Please complete the M-Pesa prompt." });
      if (result.status === "failed")           return res.status(500).json({ error: result.error });
      // "generated" or "already_generated" — return the body
      return res.json({
        status:    "generated",
        body:      result.body,
        wordCount: result.wordCount,
      });
    } catch (err: any) {
      console.error("[write-from-scratch/generate] error:", err);
      return res.status(500).json({ error: "Could not generate." });
    }
  });

  /* ─── GET /api/write-from-scratch/:id/download.(docx|pdf) ───────────── */
  const download = async (req: Request, res: Response, format: "docx" | "pdf") => {
    try {
      const { rows } = await pool.query(
        `SELECT id, doc_type, input_json, output_body, status
           FROM write_from_scratch_drafts
          WHERE id = $1`,
        [req.params.id],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      const row = rows[0];
      if (row.status !== "generated" || !row.output_body) {
        return res.status(409).json({ error: "Document not ready for download." });
      }

      const input =
        typeof row.input_json === "string" ? JSON.parse(row.input_json) : row.input_json;
      const filename = filenameFor(row.doc_type, input, format);

      const renderInput = {
        body: row.output_body,
        footer: "Generated by WorkAbroad Hub — workabroadhub.tech",
      };

      const buffer =
        format === "docx" ? await renderDocx(renderInput) : await renderPdf(renderInput);

      res.setHeader(
        "Content-Type",
        format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(buffer.length));
      return res.send(buffer);
    } catch (err: any) {
      console.error(`[write-from-scratch/download.${format}] error:`, err?.message);
      return res.status(500).json({ error: "Could not build the download." });
    }
  };

  app.get("/api/write-from-scratch/:id/download.docx", (req, res) => download(req, res, "docx"));
  app.get("/api/write-from-scratch/:id/download.pdf",  (req, res) => download(req, res, "pdf"));

  /* ─── GET /api/write-from-scratch/mine ─────────────────────────────────
   *
   * 2026-07: Post-payment recovery. Users reported paying for a document
   * but losing the download when their internet dropped or they refreshed
   * mid-generation. Draft state was locked to a in-tab draftId. This
   * endpoint lists the current user's recent drafts so a "My documents"
   * surface (or the tool landing page itself) can offer a one-click
   * "Resume" for any paid-but-not-downloaded row. Guests get an empty list.
   */
  /* ─── POST /api/write-from-scratch/:id/repay ───────────────────────────
   * 2026-11 (abandoned-payment recovery): re-send the M-Pesa prompt for a
   * draft the customer filled in but never paid. Same draft, same amount —
   * they don't retype anything. Owner only.
   */
  app.post("/api/write-from-scratch/:id/repay", async (req: Request, res: Response) => {
    try {
      const userId = currentUserId(req);
      if (!userId) return res.status(401).json({ error: "Please sign in to finish this payment." });
      const id = String(req.params.id);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: "Document not found." });
      const { rows } = await pool.query(
        `SELECT id, user_id, doc_type, status, mpesa_amount, mpesa_phone FROM write_from_scratch_drafts WHERE id = $1`, [id]);
      const d = rows[0];
      if (!d || d.user_id !== userId) return res.status(404).json({ error: "Document not found." });
      if (d.status !== "pending_payment") return res.json({ draftId: id, status: d.status });
      if (!(await assertEmailVerified(res, userId))) return;

      let payerPhone: string | null = typeof req.body?.phone === "string" && req.body.phone.trim().length >= 9 ? req.body.phone.trim() : (d.mpesa_phone ?? null);
      if (!payerPhone) {
        const { rows: u } = await pool.query(`SELECT phone FROM users WHERE id = $1`, [userId]);
        payerPhone = u[0]?.phone ?? null;
      }
      if (!payerPhone) return res.status(400).json({ error: "We need an M-Pesa phone number.", needsPhone: true });

      const { checkUnreachable } = await import("../lib/mpesa-retry-guard");
      const g = await checkUnreachable(payerPhone);
      if (g.blocked) return res.status(429).json({ error: g.message, code: "MPESA_PHONE_UNREACHABLE" });
      if (!isMpesaAvailable()) return res.status(503).json({ error: "M-Pesa is temporarily unavailable. Please try again in a moment." });

      const amount = Number(d.mpesa_amount) > 0 ? Number(d.mpesa_amount) : PRICE_KES;
      let stk;
      try {
        stk = await stkPush(payerPhone, amount, `WorkAbroad Hub — ${docTypeLabel(d.doc_type)}`, `WAH-WFS-${id.slice(0, 8)}`,
          `${getCallbackBaseUrl(req)}/api/write-from-scratch/mpesa-callback`);
      } catch (err: any) {
        console.error("[write-from-scratch/repay] STK failed:", err?.message);
        return res.status(502).json({ error: "Could not send the M-Pesa prompt. Please try again." });
      }
      await pool.query(
        // Keep earlier checkout ids: if the customer pays the OLD prompt late, the callback must still find this draft.
        `UPDATE write_from_scratch_drafts
            SET prior_checkout_ids = CASE WHEN mpesa_checkout_id IS NULL THEN prior_checkout_ids
                                          ELSE array_append(coalesce(prior_checkout_ids, '{}'::text[]), mpesa_checkout_id) END,
                mpesa_checkout_id = $1, mpesa_phone = $2
          WHERE id = $3 AND status = 'pending_payment'`,
        [stk?.CheckoutRequestID ?? null, payerPhone, id]);
      return res.json({ draftId: id, status: "pending_payment", amount, message: "Check your phone for the M-Pesa prompt and enter your PIN." });
    } catch (err: any) {
      console.error("[write-from-scratch/repay] error:", err?.message);
      return res.status(500).json({ error: "Could not restart the payment." });
    }
  });

  /* ─── POST /api/write-from-scratch/match ────────────────────────────────
   * 2026-11: free "How well you match this job" panel, shown before payment.
   * Body: { input, jobDescription } → MatchReport. Signed-in users only.
   */
  app.post("/api/write-from-scratch/match", async (req: Request, res: Response) => {
    try {
      const userId = currentUserId(req);
      if (!userId) return res.status(401).json({ error: "Please sign in to check your match." });
      const jd = typeof req.body?.jobDescription === "string" ? req.body.jobDescription.trim() : "";
      if (jd.length < 80) return res.status(400).json({ error: "Paste the full job description (at least a few sentences)." });
      const input = sanitizeTailoring(req.body?.input && typeof req.body.input === "object" ? req.body.input : {});
      if (!input.role && !input.keySkills) return res.status(400).json({ error: "Fill in your target role and key skills first." });
      if (!allowMatch(userId)) return res.status(429).json({ error: "You've checked a lot of jobs in the last hour. Please try again a bit later." });
      const { matchAgainstJob } = await import("../services/writeFromScratch/job-match");
      const report = await matchAgainstJob(input, jd);
      return res.json(report);
    } catch (err: any) {
      console.error("[write-from-scratch/match] error:", err?.message);
      return res.status(500).json({ error: "Could not compare with the job right now. You can still generate your CV." });
    }
  });

  app.get("/api/write-from-scratch/mine", async (req: Request, res: Response) => {
    try {
      const userId = currentUserId(req);
      if (!userId) return res.json({ drafts: [], count: 0 });
      const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
      const { rows } = await pool.query(
        `SELECT id, doc_type, status,
                output_body IS NOT NULL AS has_body,
                parent_draft_id, mpesa_amount,
                left(coalesce(input_json::jsonb->>'jobDescription',''), 80) AS job_snippet,
                error_message,
                mpesa_receipt,
                created_at, paid_at, generated_at
           FROM write_from_scratch_drafts
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [userId, limit],
      );
      return res.json({ drafts: rows, count: rows.length });
    } catch (err: any) {
      console.error("[write-from-scratch/mine] error:", err?.message);
      return res.status(500).json({ error: "Could not load your documents." });
    }
  });

  /* ─── GET /api/write-from-scratch/:id/body ─────────────────────────────
   *
   * Returns the generated body so a page reloaded from a URL like
   * /tools/write-from-scratch?draftId=… can rehydrate the result view
   * without re-running the AI. Only returns the body if the draft belongs
   * to the current user, or the requester is a guest with the raw draftId
   * (which is unguessable enough to act as capability for post-payment
   * recovery). Never returns paid/failed drafts as bodies.
   */
  app.get("/api/write-from-scratch/:id/body", async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, user_id, doc_type, status, output_body, error_message
           FROM write_from_scratch_drafts
          WHERE id = $1`,
        [req.params.id],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      const row = rows[0];

      // Owner check — if the draft has a user_id, the caller MUST be that
      // signed-in user. Guest drafts (row.user_id IS NULL) remain capability-only:
      // knowing the unguessable UUID is proof of ownership.
      //
      // 2026-07 LEAK FIX: previous condition required both row.user_id AND
      // userId to be truthy, meaning an UNAUTH request (userId=null) with a
      // leaked draftId would bypass the check and read the paid document body.
      // Now: signed-in drafts are strictly owner-only; unauth callers can only
      // read guest drafts.
      const userId = currentUserId(req);
      if (row.user_id && row.user_id !== userId) {
        return res.status(403).json({ error: "Not yours" });
      }

      return res.json({
        status:  row.status,
        docType: row.doc_type,
        body:    row.output_body,
        error:   row.error_message,
      });
    } catch (err: any) {
      console.error("[write-from-scratch/body] error:", err?.message);
      return res.status(500).json({ error: "Could not load draft." });
    }
  });
}

// ─── helpers ────────────────────────────────────────────────────────────────

function docTypeLabel(t: WriteFromScratchDocType): string {
  switch (t) {
    case "cv":               return "CV";
    case "cover_letter":     return "Cover Letter";
    case "recruitment_cv":   return "Recruitment CV";
    case "reference_letter": return "Reference Letter";
  }
}

function filenameFor(
  docType: WriteFromScratchDocType,
  input: any,
  format: "docx" | "pdf",
): string {
  const safe = (s: string) =>
    String(s ?? "").replace(/[^a-zA-Z0-9\-_\s]/g, "").trim().replace(/\s+/g, "_") || "document";
  switch (docType) {
    case "cv":               return `CV_${safe(input.fullName)}.${format}`;
    case "cover_letter":
      return `Cover_Letter_${safe(input.fullName)}${input.employerName ? "_" + safe(input.employerName) : ""}.${format}`;
    case "recruitment_cv":
      return `Recruitment_CV_${safe(input.fullName)}_${safe(input.destinationCountry)}.${format}`;
    case "reference_letter":
      return `Reference_Letter_${safe(input.candidateName)}.${format}`;
  }
}

function validateInputForType(docType: WriteFromScratchDocType, input: any): string | null {
  const requireString = (field: string) => {
    if (!input[field] || typeof input[field] !== "string" || !input[field].trim()) {
      return `Missing required field: ${field}`;
    }
    return null;
  };
  const requireNumber = (field: string) => {
    const n = Number(input[field]);
    if (!Number.isFinite(n) || n < 0 || n > 60) {
      return `Field "${field}" must be a number between 0 and 60.`;
    }
    return null;
  };

  switch (docType) {
    case "cv":
    case "cover_letter":
      return (
        requireString("fullName") ||
        requireString("role") ||
        requireNumber("yearsExperience") ||
        requireString("keySkills")
      );
    case "recruitment_cv":
      return (
        requireString("fullName") ||
        requireString("role") ||
        requireNumber("yearsExperience") ||
        requireString("keySkills") ||
        requireString("destinationCountry")
      );
    case "reference_letter":
      return (
        requireString("employerName") ||
        requireString("employerTitle") ||
        requireString("employerCompany") ||
        requireString("candidateName") ||
        requireString("candidateRole") ||
        requireNumber("yearsWorked") ||
        requireString("keyStrengths")
      );
  }
}

/**
 * Same idea as server/mpesa.ts getCallbackBaseUrl but scoped locally so we
 * can override just this route without touching the module-level default.
 * Falls back to APP_URL / X-Forwarded-Host.
 */
function getCallbackBaseUrl(req: Request): string {
  const explicit = (process.env.APP_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
  return `${proto}://${host}`;
}
