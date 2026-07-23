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
import { createPayPalOrder, capturePayPalOrder, isPayPalConfigured } from "../paypal";
import { renderDocx, renderPdf } from "../services/document-renderer";
import {
  generateDocument,
  WriteFromScratchGenerationError,
  type WriteFromScratchDocType,
  type WriteFromScratchInput,
} from "../services/writeFromScratch/generator";

const PRICE_KES = 300;
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
      const { docType, input, phone } = req.body ?? {};

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
          error: "We need an M-Pesa phone number to send the KES 300 prompt.",
          needsPhone: true,
        });
      }

      // ── Create draft row ─────────────────────────────────────────────
      const { rows: created } = await pool.query(
        `INSERT INTO write_from_scratch_drafts
           (user_id, doc_type, input_json, status, mpesa_amount, mpesa_phone)
         VALUES ($1, $2, $3, 'pending_payment', $4, $5)
         RETURNING id`,
        [userId, docType, JSON.stringify(input), PRICE_KES, payerPhone],
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
          PRICE_KES,
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
  app.post("/api/write-from-scratch/mpesa-callback", async (req, res) => {
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
            WHERE mpesa_checkout_id = $2
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
              WHERE mpesa_checkout_id = $1 AND status = 'paid'
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
      const { docType, input } = req.body ?? {};

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
           (user_id, doc_type, input_json, status, mpesa_amount)
         VALUES ($1, $2, $3, 'pending_payment', $4)
         RETURNING id`,
        [userId, docType, JSON.stringify(input), PRICE_KES],
      );
      const draftId = created[0].id as string;

      let order;
      try {
        order = await createPayPalOrder(
          PRICE_KES,
          `WorkAbroad Hub — ${docTypeLabel(docType as WriteFromScratchDocType)}`,
          `WAH-WFS-${draftId.slice(0, 8)}`,
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
  app.get("/api/write-from-scratch/mine", async (req: Request, res: Response) => {
    try {
      const userId = currentUserId(req);
      if (!userId) return res.json({ drafts: [], count: 0 });
      const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
      const { rows } = await pool.query(
        `SELECT id, doc_type, status,
                output_body IS NOT NULL AS has_body,
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
