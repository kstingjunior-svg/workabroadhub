/**
 * Kazi Karibu — routes.
 *
 * See docs/kazi-karibu/STRATEGY.md §17 for the design and §22 for the
 * Phase-1 scope.
 *
 * FLAG GATE: every route in this file short-circuits with 404 when
 * NanjilaFlags.kaziKaribuEnabled is false. Shipping the code without
 * setting KAZI_KARIBU_ENABLED=true on Render is safe — none of it is
 * visible to end users.
 *
 * PHASE 1 STATUS (2026-07-03):
 *   Draft-and-preview flow (POST /posts/draft, GET /posts, GET /posts/:id)
 *   is fully implemented and exercisable. Submission (POST /posts/:id/submit)
 *   returns 501 until the M-Pesa payment binding and pipeline wiring lands
 *   in Phase 1b. Applicant interest + contact-reveal likewise scaffold
 *   with 501 until the UI is built. This lets the schema + rules engine +
 *   Nanjila capability go live behind the flag without waiting on UI.
 *
 * All state transitions are:
 *   draft → awaiting_payment → pending_moderation → live | held | rejected
 *   live → expired (sweep) | removed (admin)
 */

import type { Express, Request, Response } from "express";
import { nanoid } from "nanoid";
import { pool } from "../db";
import { NanjilaFlags } from "../nanjila/feature-flags";
import {
  ALLOWED_KAZI_KARIBU_CATEGORY_IDS,
  KAZI_KARIBU_STANDARD_POST_PRICE_KES,
  KAZI_KARIBU_SERVICE_CODES,
  defaultPosterDisplayName,
} from "@shared/kazi-karibu";
import { evaluatePostAgainstRules, type RuleContext } from "../lib/scam-rules";
import { kaziKaribuReviewCapability, type KaziKaribuReviewOutput } from "../nanjila/capabilities/kaziKaribuReview";

// ─── Feature-flag guard ─────────────────────────────────────────────────────

/**
 * Short-circuits with 404 when the feature is off. Using 404 (not 403) so
 * probes can't detect the surface's existence when we haven't shipped yet.
 */
function requireKaziKaribuEnabled(_req: Request, res: Response, next: () => void) {
  if (!NanjilaFlags.kaziKaribuEnabled) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
}

// ─── Session helper (reused pattern from local-jobs-routes.ts) ──────────────

function readSessionUserId(req: any): string | null {
  const fromReqUser = req.user?.claims?.sub ?? req.user?.id;
  if (fromReqUser) return String(fromReqUser);
  const fromSession = req.session?.customUserId;
  if (fromSession) return String(fromSession);
  if (req.isAuthenticated?.() && req.user) {
    const fromPassport = req.user?.claims?.sub ?? req.user?.id;
    if (fromPassport) return String(fromPassport);
  }
  return null;
}

// ─── Draft validation helper ────────────────────────────────────────────────

interface DraftBody {
  category?:      string;
  county?:        string;
  subCounty?:     string | null;
  title?:         string;
  description?:   string;
  budgetMinKes?:  number | null;
  budgetMaxKes?:  number | null;
  budgetPeriod?:  string | null;
  duration?:      string | null;
  posterShowsName?: boolean;
  /** Migration 0014 — toggle for direct-contact visibility. Defaults TRUE. */
  posterShowsPhone?: boolean;
}

function validateDraft(body: DraftBody): { ok: true; ctx: RuleContext; duration: string | null; posterShowsName: boolean; posterShowsPhone: boolean }
                                       | { ok: false; error: string; field: string } {
  const category    = String(body.category ?? "").trim();
  const county      = String(body.county ?? "").trim();
  const subCounty   = body.subCounty == null ? null : String(body.subCounty).trim() || null;
  const title       = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const budgetMinKes = body.budgetMinKes == null || body.budgetMinKes === 0 ? null : Number(body.budgetMinKes);
  const budgetMaxKes = body.budgetMaxKes == null || body.budgetMaxKes === 0 ? null : Number(body.budgetMaxKes);
  const budgetPeriod = body.budgetPeriod == null ? null : String(body.budgetPeriod).trim() || null;
  const duration     = body.duration     == null ? null : String(body.duration).trim() || null;

  if (!ALLOWED_KAZI_KARIBU_CATEGORY_IDS.has(category)) {
    return { ok: false, error: "Category is required and must be one of the supported types.", field: "category" };
  }
  if (!county) {
    return { ok: false, error: "County is required.", field: "county" };
  }
  const allowlist = NanjilaFlags.kaziKaribuCountyAllowlist;
  if (allowlist.length > 0 && !allowlist.includes(county)) {
    return { ok: false, error: `Kazi Karibu is currently only accepting posts from: ${allowlist.join(", ")}. We'll open more counties soon.`, field: "county" };
  }
  if (title.length < 5)   return { ok: false, error: "Title must be at least 5 characters.", field: "title" };
  if (title.length > 120) return { ok: false, error: "Title must be under 120 characters.", field: "title" };
  if (description.length < 30)   return { ok: false, error: "Description must be at least 30 characters — help applicants understand the role.", field: "description" };
  if (description.length > 4000) return { ok: false, error: "Description must be under 4,000 characters.", field: "description" };
  if (budgetMinKes !== null && budgetMinKes < 0) return { ok: false, error: "Budget must not be negative.", field: "budgetMinKes" };
  if (budgetMaxKes !== null && budgetMaxKes < 0) return { ok: false, error: "Budget must not be negative.", field: "budgetMaxKes" };
  if (budgetMinKes !== null && budgetMaxKes !== null && budgetMinKes > budgetMaxKes) {
    return { ok: false, error: "Minimum budget can't be higher than maximum.", field: "budgetMinKes" };
  }
  if (budgetPeriod !== null && !["hour","day","month","project"].includes(budgetPeriod)) {
    return { ok: false, error: "Budget period must be hour, day, month, or project.", field: "budgetPeriod" };
  }
  if (duration !== null && !["one_off","recurring_weekly","permanent"].includes(duration)) {
    return { ok: false, error: "Duration must be one_off, recurring_weekly, or permanent.", field: "duration" };
  }

  return {
    ok: true,
    ctx: { category, county, subCounty, title, description, budgetMinKes, budgetMaxKes, budgetPeriod },
    duration,
    posterShowsName: Boolean(body.posterShowsName),
    // Default to true — matches Jiji/OLX pattern where posters expect their
    // phone to be reachable directly. Poster can opt out at post time.
    posterShowsPhone: body.posterShowsPhone !== false,
  };
}

// ─── Nanjila Layer-4 review runner (shared by submit + status) ──────────────

/**
 * Runs the Nanjila pre-publish review capability against a post that is
 * currently in state 'pending_moderation' and transitions the post to its
 * final state:
 *
 *   APPROVE  → moderation_state='live', publishes for 7 days
 *   CLARIFY  → moderation_state='held', the poster edits + resubmits
 *   HOLD     → moderation_state='held', admin queue picks it up
 *
 * The capability handler itself writes the audit trail row to
 * kazi_karibu_moderation; this function only handles the post-state
 * transition and any side effects (publish timestamps, first-post-free
 * reputation increment, etc.).
 *
 * Returns the final moderation_state so callers can shape their response.
 */
async function runNanjilaAndTransition(
  postId: string,
  layer3FlagCodes: string[],
): Promise<"live" | "held" | "rejected"> {
  // Flag OFF short-circuit: skip Nanjila entirely and route straight to
  // human review (state='held') so a broken model outage doesn't block
  // legitimate posts from getting reviewed manually.
  if (!NanjilaFlags.nanjilaKaziKaribuReviewEnabled) {
    await pool.query(
      `UPDATE kazi_karibu_posts
          SET moderation_state = 'held', updated_at = NOW()
        WHERE id = $1 AND moderation_state = 'pending_moderation'`,
      [postId],
    );
    await pool.query(
      `INSERT INTO kazi_karibu_moderation (post_id, layer, decision, reason_codes, narrative, actor)
       VALUES ($1, 'human', 'hold', $2, 'Nanjila review flag OFF — routed to human queue', 'system')`,
      [postId, ["nanjila_flag_off"]],
    );
    return "held";
  }

  // Invoke the capability. It writes its own moderation-audit row.
  const decision: KaziKaribuReviewOutput = await kaziKaribuReviewCapability.handler(
    { postId, layer3FlagCodes },
    { userId: null, entitlement: { authenticated: false, paid: false, admin: false, planId: null, userId: null }, traceId: `kk-submit-${postId}` },
  ).catch((err: any) => {
    console.error(`[KaziKaribu] Nanjila review call threw — falling through to human hold. err=${err?.message}`);
    return {
      ok: false,
      decision: "hold" as const,
      confidence: 0,
      rationale: `Nanjila review threw: ${err?.message ?? "unknown"}`,
      hold_reason_code: "other" as const,
      promptVersion: "v1.0.0",
    };
  });

  // Transition based on Nanjila's verdict.
  if (decision.decision === "approve") {
    await pool.query(
      `UPDATE kazi_karibu_posts
          SET moderation_state = 'live',
              published_at     = NOW(),
              expires_at       = NOW() + INTERVAL '7 days',
              updated_at       = NOW()
        WHERE id = $1 AND moderation_state = 'pending_moderation'`,
      [postId],
    );
    // Bump the poster's reputation counter.
    await pool.query(
      `INSERT INTO kazi_karibu_poster_reputation (user_id, posts_published, updated_at)
       SELECT poster_user_id, 1, NOW() FROM kazi_karibu_posts WHERE id = $1
       ON CONFLICT (user_id) DO UPDATE SET
         posts_published = kazi_karibu_poster_reputation.posts_published + 1,
         updated_at      = NOW()`,
      [postId],
    ).catch(err => console.warn(`[KaziKaribu] reputation bump failed postId=${postId}: ${err?.message}`));
    return "live";
  }

  // clarify OR hold — both land in 'held' so the poster sees the question
  // OR the admin queue picks it up. The kazi_karibu_moderation row already
  // captures which one it was and the specific reason.
  await pool.query(
    `UPDATE kazi_karibu_posts
        SET moderation_state = 'held', updated_at = NOW()
      WHERE id = $1 AND moderation_state = 'pending_moderation'`,
    [postId],
  );
  return "held";
}

// ─── Notification helpers ───────────────────────────────────────────────────

/**
 * Notify the poster that someone expressed interest in their post. Sends
 * SMS + WhatsApp best-effort in parallel. Never throws — notification
 * failure must not block the interest submission.
 *
 * Kenya is phone-first: SMS + WhatsApp is the highest-signal way to reach
 * a poster who won't check the web dashboard every day.
 */
async function notifyPosterOfInterest(opts: {
  posterPhone:    string | null;
  posterFirstName: string | null;
  postTitle:      string;
  applicantName:  string;
}): Promise<void> {
  if (!opts.posterPhone) return;
  const greeting = opts.posterFirstName ? `Hi ${opts.posterFirstName}` : "Hi";
  const message =
    `${greeting}, ${opts.applicantName} is interested in your Kazi Karibu post: "${opts.postTitle}". ` +
    `Review their profile: https://workabroadhub.tech/kazi-karibu/my-posts — WorkAbroad Hub`;

  try {
    const { sendSMS, sendWhatsApp } = await import("../sms");
    // Fire both in parallel — WhatsApp is free-ish and preferred, SMS is
    // universal fallback.
    await Promise.allSettled([
      sendSMS(opts.posterPhone, message),
      sendWhatsApp(opts.posterPhone, message),
    ]);
    console.log(`[KaziKaribu] Notified poster ${opts.posterPhone} of new interest on "${opts.postTitle}"`);
  } catch (err: any) {
    console.warn(`[KaziKaribu] notifyPosterOfInterest failed: ${err?.message}`);
  }
}

/**
 * Notify the applicant that the poster released their contact. Same
 * dual-channel strategy.
 */
async function notifyApplicantOfReveal(opts: {
  applicantPhone: string | null;
  applicantFirstName: string | null;
  postTitle:      string;
  posterFirstName: string | null;
  posterPhone:    string | null;
}): Promise<void> {
  if (!opts.applicantPhone) return;
  const greeting = opts.applicantFirstName ? `Hi ${opts.applicantFirstName}` : "Hi";
  const poster = opts.posterFirstName ?? "The poster";
  const message =
    `${greeting}, great news — ${poster} on Kazi Karibu shortlisted you for "${opts.postTitle}" ` +
    `and shared their contact${opts.posterPhone ? ` (${opts.posterPhone})` : ""}. ` +
    `See details: https://workabroadhub.tech/kazi-karibu/my-interests — WorkAbroad Hub`;

  try {
    const { sendSMS, sendWhatsApp } = await import("../sms");
    await Promise.allSettled([
      sendSMS(opts.applicantPhone, message),
      sendWhatsApp(opts.applicantPhone, message),
    ]);
    console.log(`[KaziKaribu] Notified applicant ${opts.applicantPhone} of contact reveal on "${opts.postTitle}"`);
  } catch (err: any) {
    console.warn(`[KaziKaribu] notifyApplicantOfReveal failed: ${err?.message}`);
  }
}

// ─── Registration ───────────────────────────────────────────────────────────

export function registerKaziKaribuRoutes(
  app:              Express,
  isAuthenticated:  any,
  isAdmin:          any,
): void {
  // ─── POSTER FLOW ──────────────────────────────────────────────────────────

  /**
   * POST /api/kazi-karibu/posts/draft
   * Save a draft. Runs Layer-3 rules; returns any rule hits so the poster
   * can edit before spending money. No payment initiated here.
   */
  app.post(
    "/api/kazi-karibu/posts/draft",
    requireKaziKaribuEnabled, isAuthenticated,
    async (req: any, res: Response) => {
      try {
        const userId = readSessionUserId(req);
        if (!userId) return res.status(401).json({ error: "Please sign in first." });

        const parsed = validateDraft(req.body ?? {});
        if (parsed.ok !== true) {
          // TS narrows to the failure branch here — parsed.error and .field
          // are guaranteed to exist. Using === false rather than !parsed.ok
          // sidesteps a narrowing quirk seen in certain tsc versions.
          const fail = parsed as { ok: false; error: string; field: string };
          return res.status(400).json({ error: fail.error, field: fail.field });
        }

        // Layer 3.
        const ruleResult = evaluatePostAgainstRules(parsed.ctx);
        if (ruleResult.hasReject) {
          // Don't persist a rejected draft — surface the rule hits and let
          // the poster edit and resubmit. Failing fast saves DB churn.
          return res.status(422).json({
            ok:       false,
            layer:    "rules",
            decision: "reject",
            hits:     ruleResult.hits.map(h => ({
              ruleId:       h.ruleId,
              severity:     h.severity,
              posterReason: h.posterReason,
            })),
          });
        }

        // Insert draft.
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO kazi_karibu_posts (
             poster_user_id, category, county, sub_county, title, description,
             budget_min_kes, budget_max_kes, budget_period, duration,
             poster_display_name, poster_shows_name, poster_shows_phone, moderation_state
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft')
           RETURNING id`,
          [
            userId,
            parsed.ctx.category,
            parsed.ctx.county,
            parsed.ctx.subCounty,
            parsed.ctx.title,
            parsed.ctx.description,
            parsed.ctx.budgetMinKes,
            parsed.ctx.budgetMaxKes,
            parsed.ctx.budgetPeriod,
            parsed.duration,
            parsed.posterShowsName ? null : defaultPosterDisplayName(parsed.ctx.subCounty, parsed.ctx.county),
            parsed.posterShowsName,
            parsed.posterShowsPhone,
          ],
        );

        return res.status(201).json({
          ok:       true,
          postId:   rows[0].id,
          layer:    "rules",
          decision: ruleResult.layer3Decision,
          flags:    ruleResult.hits.filter(h => h.severity === "flag").map(h => ({
            ruleId:       h.ruleId,
            posterReason: h.posterReason,
          })),
          nextStep: {
            action:      "submit_for_payment",
            endpoint:    `/api/kazi-karibu/posts/${rows[0].id}/submit`,
            priceKes:    KAZI_KARIBU_STANDARD_POST_PRICE_KES,
            firstPostFree: NanjilaFlags.kaziKaribuFirstPostFreeEnabled,
          },
        });
      } catch (err: any) {
        console.error("[POST /api/kazi-karibu/posts/draft]", err?.message);
        return res.status(500).json({ error: "Could not save draft. Please try again." });
      }
    },
  );

  /**
   * POST /api/kazi-karibu/posts/:id/submit
   *
   * Transitions the draft into the paid+moderated lifecycle. See
   * docs/kazi-karibu/STRATEGY.md §6-§9.
   *
   * State flow:
   *   draft | held  →  (re-run Layer 3)  →  awaiting_payment  →  (M-Pesa STK)
   *     →  (client polls /status)  →  pending_moderation  →  (Nanjila review)
   *     →  live | held
   *
   * First-post-free short-circuit: if the poster has zero previously-published
   * posts AND the flag is on, skips the payment step and goes straight to
   * pending_moderation. Phone verification is still required.
   *
   * Response shape (paid path):
   *   { ok, postId, needsPayment: true, transactionRef, amountKes, state: "awaiting_payment" }
   *
   * Response shape (free path):
   *   { ok, postId, needsPayment: false, state: "live"|"held" }
   */
  app.post(
    "/api/kazi-karibu/posts/:id/submit",
    requireKaziKaribuEnabled, isAuthenticated,
    async (req: any, res: Response) => {
      const t0 = Date.now();
      const postId = String(req.params.id);
      const userId = readSessionUserId(req);
      if (!userId) return res.status(401).json({ error: "Please sign in first." });

      try {
        // 1. Load the draft and verify ownership + resubmittable state.
        const { rows: postRows } = await pool.query<{
          id: string;
          poster_user_id: string;
          category: string;
          county: string;
          sub_county: string | null;
          title: string;
          description: string;
          budget_min_kes: number | null;
          budget_max_kes: number | null;
          budget_period: string | null;
          duration: string | null;
          moderation_state: string;
        }>(
          `SELECT id, poster_user_id, category, county, sub_county, title, description,
                  budget_min_kes, budget_max_kes, budget_period, duration, moderation_state
             FROM kazi_karibu_posts
            WHERE id = $1
            LIMIT 1`,
          [postId],
        );
        const post = postRows[0];
        if (!post) return res.status(404).json({ error: "Draft not found." });
        if (post.poster_user_id !== userId) {
          return res.status(403).json({ error: "This isn't your draft." });
        }
        if (!["draft", "held"].includes(post.moderation_state)) {
          return res.status(409).json({
            error: `This post is in state "${post.moderation_state}" and cannot be re-submitted.`,
            state: post.moderation_state,
          });
        }

        // 2. Phone-verified check (Layer 2). Required for every submit.
        //    Uses users.phone_verified_at (any non-null value counts as verified;
        //    aging out to 90 days is enforced by /api/pay upstream flows, not here
        //    — keeping this endpoint's contract narrow).
        const { rows: userRows } = await pool.query<{
          phone: string | null; phone_verified_at: Date | null;
        }>(
          `SELECT phone, phone_verified_at FROM users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        const user = userRows[0];
        if (!user?.phone) {
          return res.status(400).json({
            error: "No phone number on file. Please add your phone number in profile settings before posting.",
            code: "NO_PHONE",
          });
        }
        if (!user.phone_verified_at) {
          return res.status(400).json({
            error: "Please verify your phone number before posting on Kazi Karibu.",
            code: "PHONE_NOT_VERIFIED",
          });
        }

        // 3. Re-run Layer 3 rules on the server — never trust the draft state
        //    to have been rules-checked client-side.
        const ruleCtx: RuleContext = {
          category:     post.category,
          county:       post.county,
          subCounty:    post.sub_county,
          title:        post.title,
          description:  post.description,
          budgetMinKes: post.budget_min_kes,
          budgetMaxKes: post.budget_max_kes,
          budgetPeriod: post.budget_period,
        };
        const ruleResult = evaluatePostAgainstRules(ruleCtx);
        if (ruleResult.hasReject) {
          // Poster edited to include reject-worthy content since drafting.
          // Kick it back to 'draft' so they can fix, no payment initiated.
          await pool.query(
            `UPDATE kazi_karibu_posts SET moderation_state = 'draft', updated_at = NOW() WHERE id = $1`,
            [postId],
          );
          return res.status(422).json({
            ok:       false,
            layer:    "rules",
            decision: "reject",
            hits:     ruleResult.hits.map(h => ({
              ruleId:       h.ruleId,
              severity:     h.severity,
              posterReason: h.posterReason,
            })),
          });
        }

        // 4. First-post-free eligibility.
        const { rows: repRows } = await pool.query<{ posts_published: number }>(
          `SELECT posts_published FROM kazi_karibu_poster_reputation WHERE user_id = $1 LIMIT 1`,
          [userId],
        );
        const previouslyPublished = repRows[0]?.posts_published ?? 0;
        const isFirstPostFree =
          NanjilaFlags.kaziKaribuFirstPostFreeEnabled && previouslyPublished === 0;

        // Layer 3 flag codes accumulate — passed to Nanjila either way.
        const layer3FlagCodes = ruleResult.hits
          .filter(h => h.severity === "flag")
          .map(h => h.ruleId);

        // ── Path A: first post free — skip payment, run Nanjila immediately ──
        if (isFirstPostFree) {
          await pool.query(
            `UPDATE kazi_karibu_posts
                SET moderation_state    = 'pending_moderation',
                    is_first_post_free  = true,
                    updated_at          = NOW()
              WHERE id = $1 AND moderation_state IN ('draft','held')`,
            [postId],
          );
          const finalState = await runNanjilaAndTransition(postId, layer3FlagCodes);
          console.log(
            `[KaziKaribu] SUBMIT free postId=${postId} userId=${userId} finalState=${finalState} ` +
            `layer3Flags=${layer3FlagCodes.length} took=${Date.now() - t0}ms`,
          );
          return res.status(200).json({
            ok:            true,
            postId,
            needsPayment:  false,
            isFirstPostFree: true,
            state:         finalState,
          });
        }

        // ── Path B: paid post ────────────────────────────────────────────────
        // Look up the canonical price for kazi_karibu_post_standard. The
        // service row exists (migration 0013) even when is_active=false — we
        // don't gate on is_active here since KAZI_KARIBU_ENABLED is the
        // authoritative on/off switch for this whole surface.
        const { rows: svcRows } = await pool.query<{ price: number; id: string }>(
          `SELECT id, price FROM services WHERE code = $1 LIMIT 1`,
          [KAZI_KARIBU_SERVICE_CODES.STANDARD_POST],
        );
        const svc = svcRows[0];
        if (!svc) {
          console.error(`[KaziKaribu] SUBMIT missing service row for ${KAZI_KARIBU_SERVICE_CODES.STANDARD_POST}`);
          return res.status(500).json({ error: "Payment service is not configured. Please contact support." });
        }
        const amountKes = Number(svc.price ?? KAZI_KARIBU_STANDARD_POST_PRICE_KES);

        // Create a payment record. Same pattern as /api/pay.
        const transactionRef = `KK-${nanoid(12)}`;
        const normalizedPhone = user.phone.startsWith("0")
          ? `254${user.phone.slice(1)}`
          : user.phone;

        await pool.query(
          `INSERT INTO payments (id, user_id, amount, currency, status, method, service_id, transaction_ref, created_at)
           VALUES ($1, $2, $3, 'KES', 'pending', 'mpesa', $4, $1, NOW())`,
          [transactionRef, userId, amountKes, svc.id],
        );

        // Fire the STK push using the same helper /api/pay uses.
        let stkResponse: any;
        try {
          const { stkPush } = await import("../mpesa");
          stkResponse = await stkPush(
            normalizedPhone,
            amountKes,
            "Kazi Karibu — post fee",
            transactionRef,
          );
        } catch (err: any) {
          console.error(`[KaziKaribu] SUBMIT STK push failed postId=${postId} err=${err?.message}`);
          // Roll back the payment row to failed so we don't leave orphans.
          await pool.query(
            `UPDATE payments SET status = 'failed', updated_at = NOW() WHERE id = $1`,
            [transactionRef],
          ).catch(() => {});
          return res.status(502).json({
            error: "Could not reach M-Pesa. Please try again in a moment.",
          });
        }

        // Transition the post to awaiting_payment and link the payment record.
        await pool.query(
          `UPDATE kazi_karibu_posts
              SET moderation_state = 'awaiting_payment',
                  payment_id       = $2,
                  updated_at       = NOW()
            WHERE id = $1 AND moderation_state IN ('draft','held')`,
          [postId, transactionRef],
        );

        console.log(
          `[KaziKaribu] SUBMIT paid postId=${postId} userId=${userId} tx=${transactionRef} ` +
          `amount=${amountKes} stk=${stkResponse?.CheckoutRequestID ?? "?"} took=${Date.now() - t0}ms`,
        );

        return res.status(200).json({
          ok:               true,
          postId,
          needsPayment:     true,
          transactionRef,
          amountKes,
          checkoutRequestId: stkResponse?.CheckoutRequestID ?? null,
          state:            "awaiting_payment",
          hint:             "Approve the KES 100 M-Pesa prompt on your phone, then poll /api/kazi-karibu/posts/:id/status to watch for publication.",
        });
      } catch (err: any) {
        console.error(`[KaziKaribu] SUBMIT unexpected postId=${postId} err=${err?.message}`);
        return res.status(500).json({ error: "Could not submit your post. Please try again." });
      }
    },
  );

  /**
   * GET /api/kazi-karibu/posts/:id/status
   *
   * Drives the post-payment state transitions and returns the current
   * lifecycle position. Client polls this after submitting a paid post to
   * detect when the M-Pesa callback has landed and the post is either live
   * or held for review.
   *
   * This endpoint is idempotent — safe to poll repeatedly. The state
   * transition uses conditional UPDATE so two concurrent calls can't both
   * trigger Nanjila.
   */
  app.get(
    "/api/kazi-karibu/posts/:id/status",
    requireKaziKaribuEnabled, isAuthenticated,
    async (req: any, res: Response) => {
      const postId = String(req.params.id);
      const userId = readSessionUserId(req);
      if (!userId) return res.status(401).json({ error: "Please sign in first." });

      try {
        // 1. Load post + latest payment status.
        const { rows: postRows } = await pool.query<{
          id: string;
          poster_user_id: string;
          moderation_state: string;
          payment_id: string | null;
          payment_status: string | null;
          published_at: Date | null;
          expires_at: Date | null;
        }>(
          `SELECT p.id, p.poster_user_id, p.moderation_state, p.payment_id,
                  pay.status  AS payment_status,
                  p.published_at, p.expires_at
             FROM kazi_karibu_posts p
        LEFT JOIN payments pay ON pay.id = p.payment_id
            WHERE p.id = $1
            LIMIT 1`,
          [postId],
        );
        const post = postRows[0];
        if (!post) return res.status(404).json({ error: "Post not found." });
        if (post.poster_user_id !== userId) {
          return res.status(403).json({ error: "This isn't your post." });
        }

        // 2. If awaiting payment, check whether the payment has succeeded.
        if (post.moderation_state === "awaiting_payment") {
          const paidStatuses = new Set(["success", "completed", "paid"]);
          if (post.payment_status && paidStatuses.has(post.payment_status)) {
            // Transition to pending_moderation atomically — only if we're
            // still the first observer. If two concurrent polls race, only
            // one wins the UPDATE and only one triggers Nanjila.
            const { rowCount } = await pool.query(
              `UPDATE kazi_karibu_posts
                  SET moderation_state = 'pending_moderation', updated_at = NOW()
                WHERE id = $1 AND moderation_state = 'awaiting_payment'`,
              [postId],
            );
            if ((rowCount ?? 0) > 0) {
              // We won the race — run Nanjila now.
              const finalState = await runNanjilaAndTransition(postId, []);
              return res.json({
                state:        finalState,
                paymentState: post.payment_status,
                message:      finalState === "live"
                  ? "Payment received. Post is live for 7 days."
                  : finalState === "held"
                  ? "Payment received. Post is being reviewed by our team — you'll hear back within a few hours."
                  : "Payment received but review returned an issue. Check the moderation history.",
              });
            }
            // Another poll got here first; fall through and read the
            // now-current state below.
          } else if (post.payment_status === "failed") {
            // Payment failed — return the draft to editable state.
            await pool.query(
              `UPDATE kazi_karibu_posts
                  SET moderation_state = 'draft', updated_at = NOW()
                WHERE id = $1 AND moderation_state = 'awaiting_payment'`,
              [postId],
            );
            return res.json({
              state:        "draft",
              paymentState: "failed",
              message:      "Your M-Pesa payment did not go through. Please try again.",
            });
          }
        }

        // 3. Reload after any transitions above to return the freshest state.
        const { rows: freshRows } = await pool.query<{
          moderation_state: string;
          published_at: Date | null;
          expires_at: Date | null;
        }>(
          `SELECT moderation_state, published_at, expires_at
             FROM kazi_karibu_posts WHERE id = $1 LIMIT 1`,
          [postId],
        );
        const fresh = freshRows[0];

        return res.json({
          state:        fresh?.moderation_state ?? post.moderation_state,
          paymentState: post.payment_status,
          publishedAt:  fresh?.published_at ?? null,
          expiresAt:    fresh?.expires_at ?? null,
        });
      } catch (err: any) {
        console.error(`[KaziKaribu] STATUS postId=${postId} err=${err?.message}`);
        return res.status(500).json({ error: "Could not check post status." });
      }
    },
  );

  /**
   * GET /api/kazi-karibu/posts/mine
   * The signed-in user's own posts + moderation state.
   */
  app.get(
    "/api/kazi-karibu/posts/mine",
    requireKaziKaribuEnabled, isAuthenticated,
    async (req: any, res: Response) => {
      try {
        const userId = readSessionUserId(req);
        if (!userId) return res.status(401).json({ error: "Please sign in first." });

        const { rows } = await pool.query(
          `SELECT id, category, county, sub_county, title, moderation_state,
                  is_boosted, published_at, expires_at, created_at
             FROM kazi_karibu_posts
            WHERE poster_user_id = $1
            ORDER BY created_at DESC
            LIMIT 100`,
          [userId],
        );
        return res.json({ posts: rows });
      } catch (err: any) {
        console.error("[GET /api/kazi-karibu/posts/mine]", err?.message);
        return res.status(500).json({ error: "Could not load your posts." });
      }
    },
  );

  // ─── PUBLIC BROWSE ────────────────────────────────────────────────────────

  /**
   * GET /api/kazi-karibu/posts
   * Public browse. Live posts only. Paginated. Category + county filters.
   */
  app.get(
    "/api/kazi-karibu/posts",
    requireKaziKaribuEnabled,
    async (req: any, res: Response) => {
      try {
        const category = req.query.category ? String(req.query.category) : null;
        const county   = req.query.county   ? String(req.query.county)   : null;
        const limit    = Math.min(Number(req.query.limit  ?? 24), 100);
        const offset   = Math.max(0, Number(req.query.offset ?? 0));

        // 2026-07: read the session user (if any) so we can flag each row
        // with is_mine=true when the current viewer is the poster. Anonymous
        // viewers get is_mine=false on every row. We never expose the raw
        // poster_user_id to the client — it's stripped before send.
        const sessionUserId = readSessionUserId(req);

        const where: string[] = [`moderation_state = 'live'`, `expires_at > NOW()`];
        const params: any[] = [];
        if (category) { params.push(category); where.push(`category = $${params.length}`); }
        if (county)   { params.push(county);   where.push(`county = $${params.length}`);   }

        const listSql = `
          SELECT id, category, county, sub_county, title, description,
                 budget_min_kes, budget_max_kes, budget_period, duration,
                 poster_display_name, is_boosted, published_at,
                 poster_user_id
            FROM kazi_karibu_posts
           WHERE ${where.join(" AND ")}
           ORDER BY is_boosted DESC, published_at DESC
           LIMIT ${limit} OFFSET ${offset}
        `;
        const countSql = `SELECT COUNT(*)::text AS c FROM kazi_karibu_posts WHERE ${where.join(" AND ")}`;

        const [list, count] = await Promise.all([
          pool.query(listSql, params),
          pool.query<{ c: string }>(countSql, params),
        ]);

        // Strip poster_user_id, add is_mine boolean so the client can render
        // the inline delete button on the poster's own cards.
        const posts = list.rows.map(({ poster_user_id, ...rest }: any) => ({
          ...rest,
          is_mine: sessionUserId != null && poster_user_id === sessionUserId,
        }));

        return res.json({
          total:  Number(count.rows[0]?.c ?? 0),
          limit,
          offset,
          posts,
        });
      } catch (err: any) {
        console.error("[GET /api/kazi-karibu/posts]", err?.message);
        return res.status(500).json({ error: "Could not load posts." });
      }
    },
  );

  /**
   * GET /api/kazi-karibu/posts/:id
   * Single-post detail. Public read — but poster contact never returned
   * here; the applicant must express interest and be granted a reveal.
   */
  app.get(
    "/api/kazi-karibu/posts/:id",
    requireKaziKaribuEnabled,
    async (req: any, res: Response) => {
      try {
        const id = String(req.params.id);
        if (!/^[0-9a-f-]{8,}$/i.test(id)) return res.status(400).json({ error: "Invalid id." });

        // 2026-07: read session user so the response can carry is_mine=true
        // when the caller is the poster. Powers the "This is your post" owner
        // banner + delete button on the detail page.
        const sessionUserId = readSessionUserId(req);

        const { rows } = await pool.query(
          `SELECT id, category, county, sub_county, title, description,
                  budget_min_kes, budget_max_kes, budget_period, duration,
                  poster_display_name, poster_shows_phone,
                  is_boosted, published_at, expires_at,
                  poster_user_id
             FROM kazi_karibu_posts
            WHERE id = $1 AND moderation_state = 'live' AND expires_at > NOW()
            LIMIT 1`,
          [id],
        );
        if (rows.length === 0) return res.status(404).json({ error: "Post not found or no longer active." });

        // Strip raw poster_user_id, expose only the is_mine boolean.
        const { poster_user_id, ...post } = rows[0] as any;
        return res.json({
          post: {
            ...post,
            is_mine: sessionUserId != null && poster_user_id === sessionUserId,
          },
        });
      } catch (err: any) {
        console.error("[GET /api/kazi-karibu/posts/:id]", err?.message);
        return res.status(500).json({ error: "Could not load post." });
      }
    },
  );

  /**
   * GET /api/kazi-karibu/posts/:id/contact
   *
   * Direct-contact reveal (Option B). Returns the poster's phone/email
   * ONLY when:
   *   1. The post's poster_shows_phone flag is TRUE
   *   2. The requester is signed in (kills anonymous scrapers)
   *   3. The requester hasn't hit the rate limit (20 views/hour/user)
   *
   * Every reveal is logged to kazi_karibu_contact_views for fraud audit
   * and rate-limit enforcement.
   */
  app.get(
    "/api/kazi-karibu/posts/:id/contact",
    requireKaziKaribuEnabled, isAuthenticated,
    async (req: any, res: Response) => {
      const postId = String(req.params.id);
      const userId = readSessionUserId(req);
      if (!userId) {
        return res.status(401).json({
          error: "Please sign in to see the poster's contact.",
          code:  "SIGNIN_REQUIRED",
        });
      }

      try {
        // Rate limit: 20 phone views per hour per user. Anyone scraping
        // beyond that gets a friendly but firm rejection.
        const { rows: countRows } = await pool.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM kazi_karibu_contact_views
            WHERE viewer_user_id = $1 AND viewed_at > NOW() - INTERVAL '1 hour'`,
          [userId],
        );
        const viewsThisHour = Number(countRows[0]?.c ?? 0);
        if (viewsThisHour >= 20) {
          console.log(`[KaziKaribu] CONTACT rate-limit blocked userId=${userId} views=${viewsThisHour}`);
          return res.status(429).json({
            error: "You've viewed a lot of contacts recently. Please try again in an hour.",
            code:  "RATE_LIMIT",
          });
        }

        const { rows } = await pool.query<{
          poster_user_id:     string;
          poster_shows_phone: boolean;
          moderation_state:   string;
          poster_first_name:  string | null;
          poster_phone:       string | null;
          poster_email:       string | null;
        }>(
          `SELECT p.poster_user_id,
                  p.poster_shows_phone,
                  p.moderation_state,
                  u.first_name AS poster_first_name,
                  u.phone      AS poster_phone,
                  u.email      AS poster_email
             FROM kazi_karibu_posts p
             JOIN users u ON u.id = p.poster_user_id
            WHERE p.id = $1 AND p.moderation_state = 'live' AND p.expires_at > NOW()
            LIMIT 1`,
          [postId],
        );
        const rec = rows[0];
        if (!rec) return res.status(404).json({ error: "Post not found or no longer active." });

        if (!rec.poster_shows_phone) {
          return res.status(403).json({
            error: "The poster keeps their contact private. Express interest to be shortlisted.",
            code:  "CONTACT_HIDDEN",
          });
        }

        // Log the view (best-effort; never block on this).
        pool.query(
          `INSERT INTO kazi_karibu_contact_views (post_id, viewer_user_id) VALUES ($1, $2)`,
          [postId, userId],
        ).catch(err => console.warn(`[KaziKaribu] contact-view log failed: ${err?.message}`));

        return res.json({
          firstName: rec.poster_first_name,
          phone:     rec.poster_phone,
          email:     rec.poster_email,
          viewsThisHour: viewsThisHour + 1,
        });
      } catch (err: any) {
        console.error(`[GET /api/kazi-karibu/posts/${postId}/contact]`, err?.message);
        return res.status(500).json({ error: "Could not load contact." });
      }
    },
  );

  /**
   * DELETE /api/kazi-karibu/posts/:id
   *
   * Poster's self-serve removal — used when they've hired someone and
   * don't want more calls. Transitions state to 'removed' rather than a
   * hard delete so the moderation audit trail survives.
   */
  app.delete(
    "/api/kazi-karibu/posts/:id",
    requireKaziKaribuEnabled, isAuthenticated,
    async (req: any, res: Response) => {
      const postId = String(req.params.id);
      const userId = readSessionUserId(req);
      if (!userId) return res.status(401).json({ error: "Please sign in first." });

      try {
        const { rows } = await pool.query<{ poster_user_id: string; moderation_state: string }>(
          `SELECT poster_user_id, moderation_state
             FROM kazi_karibu_posts WHERE id = $1 LIMIT 1`,
          [postId],
        );
        const rec = rows[0];
        if (!rec) return res.status(404).json({ error: "Post not found." });
        if (rec.poster_user_id !== userId) {
          return res.status(403).json({ error: "Only the poster can remove this post." });
        }
        if (rec.moderation_state === "removed") {
          return res.status(200).json({ ok: true, message: "This post was already removed." });
        }

        await pool.query(
          `UPDATE kazi_karibu_posts
              SET moderation_state = 'removed',
                  removed_reason   = 'poster_removed',
                  updated_at       = NOW()
            WHERE id = $1`,
          [postId],
        );
        console.log(`[KaziKaribu] DELETE postId=${postId} userId=${userId}`);
        return res.json({ ok: true, message: "Your post has been removed. Your contact is no longer visible on Kazi Karibu." });
      } catch (err: any) {
        console.error(`[DELETE /api/kazi-karibu/posts/${postId}]`, err?.message);
        return res.status(500).json({ error: "Could not remove your post. Please try again." });
      }
    },
  );

  // ─── APPLICANT FLOW ────────────────────────────────────────────────────────

  /**
   * POST /api/kazi-karibu/posts/:id/interest
   *
   * Applicant expresses interest in a live post. Snapshots the applicant's
   * profile (frozen at click-time so a later profile edit doesn't retroactively
   * change what the poster saw) and inserts into kazi_karibu_interest.
   *
   * Layer 5 (contact isolation): the poster does NOT get the applicant's
   * phone / email in the response. They see the profile snapshot in their
   * own /my-posts view. To message the applicant they must first reveal
   * their contact (which reciprocally shares poster's contact with applicant).
   *
   * Idempotent — the unique constraint on (post_id, applicant_user_id)
   * means a second click is treated as an update, not a duplicate.
   */
  app.post(
    "/api/kazi-karibu/posts/:id/interest",
    requireKaziKaribuEnabled, isAuthenticated,
    async (req: any, res: Response) => {
      const postId = String(req.params.id);
      const userId = readSessionUserId(req);
      if (!userId) return res.status(401).json({ error: "Please sign in first." });

      try {
        // 1. Verify the post is live.
        const { rows: postRows } = await pool.query<{
          id: string; poster_user_id: string; moderation_state: string;
        }>(
          `SELECT id, poster_user_id, moderation_state
             FROM kazi_karibu_posts WHERE id = $1 LIMIT 1`,
          [postId],
        );
        const post = postRows[0];
        if (!post) return res.status(404).json({ error: "Job not found or no longer active." });
        if (post.moderation_state !== "live") {
          return res.status(410).json({ error: "This job is no longer accepting applicants." });
        }
        if (post.poster_user_id === userId) {
          return res.status(400).json({ error: "You can't apply to your own post." });
        }

        // 2. Snapshot the applicant profile. Include contactable fields so
        //    the poster can shortlist based on what they see, but NOT expose
        //    them until reveal.
        const { rows: userRows } = await pool.query<{
          first_name: string | null;
          last_name:  string | null;
          email:      string | null;
          phone:      string | null;
          city:       string | null;
          country:    string | null;
        }>(
          `SELECT first_name, last_name, email, phone, city, country
             FROM users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        const u = userRows[0];
        if (!u) return res.status(404).json({ error: "Profile not found." });

        // 3. Best-effort career profile (may not exist for every user).
        const { rows: careerRows } = await pool.query<{
          headline: string | null;
          summary:  string | null;
        }>(
          `SELECT headline, summary FROM user_career_profiles WHERE user_id = $1 LIMIT 1`,
          [userId],
        ).catch(() => ({ rows: [] }) as any);
        const career = careerRows[0] ?? null;

        const message = String(req.body?.message ?? "").trim().slice(0, 2000) || null;

        const profileSnapshot = {
          firstName:  u.first_name ?? null,
          lastName:   u.last_name  ?? null,
          email:      u.email      ?? null,
          phone:      u.phone      ?? null,
          city:       u.city       ?? null,
          country:    u.country    ?? null,
          headline:   career?.headline ?? null,
          summary:    career?.summary  ?? null,
          snapshotAt: new Date().toISOString(),
        };

        // 4. Insert. Unique constraint means re-clicking updates the message
        //    without creating a duplicate.
        const { rows: interestRows } = await pool.query<{ id: string; created_at: Date }>(
          `INSERT INTO kazi_karibu_interest
             (post_id, applicant_user_id, message, shared_profile_snapshot)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (post_id, applicant_user_id) DO UPDATE SET
             message = EXCLUDED.message,
             shared_profile_snapshot = EXCLUDED.shared_profile_snapshot
           RETURNING id, created_at`,
          [postId, userId, message, profileSnapshot],
        );

        console.log(`[KaziKaribu] INTEREST postId=${postId} applicantId=${userId} interestId=${interestRows[0]?.id}`);

        // Fire-and-forget: notify the poster via SMS + WhatsApp. Don't await —
        // if Twilio/AT is slow the applicant still gets an instant response.
        (async () => {
          try {
            const { rows: posterRows } = await pool.query<{
              phone: string | null; first_name: string | null; title: string;
            }>(
              `SELECT u.phone, u.first_name, p.title
                 FROM kazi_karibu_posts p JOIN users u ON u.id = p.poster_user_id
                WHERE p.id = $1 LIMIT 1`,
              [postId],
            );
            const posterInfo = posterRows[0];
            if (posterInfo) {
              const applicantName = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || "A candidate";
              await notifyPosterOfInterest({
                posterPhone:     posterInfo.phone,
                posterFirstName: posterInfo.first_name,
                postTitle:       posterInfo.title,
                applicantName,
              });
            }
          } catch (err: any) {
            console.warn(`[KaziKaribu] notify-poster background failed: ${err?.message}`);
          }
        })();

        return res.status(201).json({
          ok:        true,
          interestId: interestRows[0].id,
          createdAt: interestRows[0].created_at,
          message:   "Your interest has been shared with the poster. They'll reach out if they want to shortlist you — check /kazi-karibu/my-interests.",
        });
      } catch (err: any) {
        console.error(`[KaziKaribu] INTEREST postId=${postId} err=${err?.message}`);
        return res.status(500).json({ error: "Could not record your interest. Please try again." });
      }
    },
  );

  /**
   * GET /api/kazi-karibu/posts/:id/interests
   *
   * Poster-only. Returns the list of applicants who expressed interest,
   * with their profile snapshots (contact fields ARE included here because
   * only the poster can call this endpoint on their own post).
   */
  app.get(
    "/api/kazi-karibu/posts/:id/interests",
    requireKaziKaribuEnabled, isAuthenticated,
    async (req: any, res: Response) => {
      const postId = String(req.params.id);
      const userId = readSessionUserId(req);
      if (!userId) return res.status(401).json({ error: "Please sign in first." });

      try {
        // Verify caller is the poster.
        const { rows: postRows } = await pool.query<{ poster_user_id: string }>(
          `SELECT poster_user_id FROM kazi_karibu_posts WHERE id = $1 LIMIT 1`,
          [postId],
        );
        if (postRows.length === 0) return res.status(404).json({ error: "Post not found." });
        if (postRows[0].poster_user_id !== userId) {
          return res.status(403).json({ error: "Only the poster can view applicants." });
        }

        const { rows } = await pool.query(
          `SELECT id, applicant_user_id, message, shared_profile_snapshot,
                  contact_revealed_at, reported, created_at
             FROM kazi_karibu_interest
            WHERE post_id = $1
            ORDER BY created_at DESC`,
          [postId],
        );
        return res.json({ count: rows.length, interests: rows });
      } catch (err: any) {
        console.error(`[KaziKaribu] LIST_INTERESTS postId=${postId} err=${err?.message}`);
        return res.status(500).json({ error: "Could not load applicants." });
      }
    },
  );

  /**
   * POST /api/kazi-karibu/interests/:id/reveal-contact
   *
   * Poster-only. Releases the poster's contact to a specific applicant.
   * The reveal is bilateral — the applicant sees the poster's contact via
   * GET /interests/mine, and the poster has always had the applicant's
   * contact in the profile snapshot.
   *
   * Logged so if a fraud report comes in later, we can trace every
   * poster→applicant contact release.
   */
  app.post(
    "/api/kazi-karibu/interests/:id/reveal-contact",
    requireKaziKaribuEnabled, isAuthenticated,
    async (req: any, res: Response) => {
      const interestId = String(req.params.id);
      const userId = readSessionUserId(req);
      if (!userId) return res.status(401).json({ error: "Please sign in first." });

      try {
        // Fetch interest + post + poster contact.
        const { rows } = await pool.query<{
          id: string;
          post_id: string;
          poster_user_id: string;
          poster_phone: string | null;
          poster_email: string | null;
          poster_first_name: string | null;
          contact_revealed_at: Date | null;
        }>(
          `SELECT i.id,
                  i.post_id,
                  p.poster_user_id,
                  u.phone      AS poster_phone,
                  u.email      AS poster_email,
                  u.first_name AS poster_first_name,
                  i.contact_revealed_at
             FROM kazi_karibu_interest i
             JOIN kazi_karibu_posts   p ON p.id = i.post_id
             JOIN users               u ON u.id = p.poster_user_id
            WHERE i.id = $1
            LIMIT 1`,
          [interestId],
        );
        const rec = rows[0];
        if (!rec) return res.status(404).json({ error: "Interest not found." });
        if (rec.poster_user_id !== userId) {
          return res.status(403).json({ error: "Only the poster can release their contact." });
        }

        const isFirstReveal = !rec.contact_revealed_at;
        if (isFirstReveal) {
          await pool.query(
            `UPDATE kazi_karibu_interest SET contact_revealed_at = NOW() WHERE id = $1`,
            [interestId],
          );
        }
        console.log(`[KaziKaribu] REVEAL interestId=${interestId} posterId=${userId}`);

        // Only notify on the FIRST reveal (idempotent) — don't spam if the
        // poster re-clicks the button.
        if (isFirstReveal) {
          (async () => {
            try {
              const { rows: notifyRows } = await pool.query<{
                applicant_phone: string | null;
                applicant_first_name: string | null;
                post_title: string;
              }>(
                `SELECT u.phone AS applicant_phone,
                        u.first_name AS applicant_first_name,
                        p.title AS post_title
                   FROM kazi_karibu_interest i
                   JOIN users u ON u.id = i.applicant_user_id
                   JOIN kazi_karibu_posts p ON p.id = i.post_id
                  WHERE i.id = $1 LIMIT 1`,
                [interestId],
              );
              const info = notifyRows[0];
              if (info) {
                await notifyApplicantOfReveal({
                  applicantPhone:     info.applicant_phone,
                  applicantFirstName: info.applicant_first_name,
                  postTitle:          info.post_title,
                  posterFirstName:    rec.poster_first_name,
                  posterPhone:        rec.poster_phone,
                });
              }
            } catch (err: any) {
              console.warn(`[KaziKaribu] notify-applicant background failed: ${err?.message}`);
            }
          })();
        }

        return res.json({
          ok: true,
          posterContact: {
            firstName: rec.poster_first_name,
            phone:     rec.poster_phone,
            email:     rec.poster_email,
          },
          message: "Your contact has been shared with this applicant. They'll see it on their My Interests page and get an SMS + WhatsApp.",
        });
      } catch (err: any) {
        console.error(`[KaziKaribu] REVEAL interestId=${interestId} err=${err?.message}`);
        return res.status(500).json({ error: "Could not release your contact." });
      }
    },
  );

  /**
   * POST /api/kazi-karibu/interests/:id/report
   *
   * Either side can flag a suspicious interaction. Sets reported=true and
   * captures the reason for admin review.
   */
  app.post(
    "/api/kazi-karibu/interests/:id/report",
    requireKaziKaribuEnabled, isAuthenticated,
    async (req: any, res: Response) => {
      const interestId = String(req.params.id);
      const userId = readSessionUserId(req);
      if (!userId) return res.status(401).json({ error: "Please sign in first." });

      try {
        const { rows } = await pool.query<{
          applicant_user_id: string;
          poster_user_id:    string;
        }>(
          `SELECT i.applicant_user_id, p.poster_user_id
             FROM kazi_karibu_interest i
             JOIN kazi_karibu_posts   p ON p.id = i.post_id
            WHERE i.id = $1 LIMIT 1`,
          [interestId],
        );
        const rec = rows[0];
        if (!rec) return res.status(404).json({ error: "Interest not found." });
        if (rec.applicant_user_id !== userId && rec.poster_user_id !== userId) {
          return res.status(403).json({ error: "Only the applicant or poster of this interaction can report it." });
        }

        const reason = String(req.body?.reason ?? "").trim().slice(0, 1000) || "unspecified";
        await pool.query(
          `UPDATE kazi_karibu_interest
              SET reported = true,
                  report_reason = $2,
                  reported_at = NOW()
            WHERE id = $1`,
          [interestId, reason],
        );
        console.log(`[KaziKaribu] REPORT interestId=${interestId} reporterId=${userId} reason=${reason.slice(0, 60)}`);
        return res.json({ ok: true, message: "Thanks for reporting. Our team will investigate." });
      } catch (err: any) {
        console.error(`[KaziKaribu] REPORT interestId=${interestId} err=${err?.message}`);
        return res.status(500).json({ error: "Could not submit report." });
      }
    },
  );

  /**
   * GET /api/kazi-karibu/interests/mine
   *
   * Applicant view — see every interest they've expressed, with post details
   * and (if released) the poster's contact.
   */
  app.get(
    "/api/kazi-karibu/interests/mine",
    requireKaziKaribuEnabled, isAuthenticated,
    async (req: any, res: Response) => {
      const userId = readSessionUserId(req);
      if (!userId) return res.status(401).json({ error: "Please sign in first." });

      try {
        const { rows } = await pool.query(
          `SELECT i.id,
                  i.message,
                  i.contact_revealed_at,
                  i.created_at,
                  p.id      AS post_id,
                  p.title,
                  p.category,
                  p.county,
                  p.sub_county,
                  p.moderation_state,
                  p.budget_min_kes,
                  p.budget_max_kes,
                  p.budget_period,
                  p.poster_display_name,
                  CASE WHEN i.contact_revealed_at IS NOT NULL
                       THEN u.first_name ELSE NULL END AS poster_first_name,
                  CASE WHEN i.contact_revealed_at IS NOT NULL
                       THEN u.phone      ELSE NULL END AS poster_phone,
                  CASE WHEN i.contact_revealed_at IS NOT NULL
                       THEN u.email      ELSE NULL END AS poster_email
             FROM kazi_karibu_interest i
             JOIN kazi_karibu_posts    p ON p.id = i.post_id
             JOIN users                u ON u.id = p.poster_user_id
            WHERE i.applicant_user_id = $1
            ORDER BY i.created_at DESC
            LIMIT 100`,
          [userId],
        );
        return res.json({ count: rows.length, interests: rows });
      } catch (err: any) {
        console.error(`[KaziKaribu] MY_INTERESTS userId=${userId} err=${err?.message}`);
        return res.status(500).json({ error: "Could not load your interests." });
      }
    },
  );

  // ─── ADMIN ────────────────────────────────────────────────────────────────

  /**
   * GET /api/admin/kazi-karibu/queue
   * Moderation queue for held posts. Sorted by hold-age (oldest first).
   */
  app.get(
    "/api/admin/kazi-karibu/queue",
    requireKaziKaribuEnabled, isAuthenticated, isAdmin,
    async (_req: any, res: Response) => {
      try {
        const { rows } = await pool.query(
          `SELECT p.id, p.category, p.county, p.title, p.description,
                  p.moderation_state, p.created_at, p.updated_at,
                  m.narrative AS latest_narrative,
                  m.decided_at AS latest_decided_at,
                  m.confidence AS latest_confidence,
                  m.reason_codes AS latest_reason_codes,
                  u.email AS poster_email,
                  u.phone AS poster_phone
             FROM kazi_karibu_posts p
             JOIN users u ON u.id = p.poster_user_id
        LEFT JOIN LATERAL (
              SELECT narrative, decided_at, confidence, reason_codes
                FROM kazi_karibu_moderation
               WHERE post_id = p.id
               ORDER BY decided_at DESC
               LIMIT 1
             ) m ON true
            WHERE p.moderation_state IN ('held','pending_moderation')
            ORDER BY p.updated_at ASC
            LIMIT 200`,
        );
        return res.json({ count: rows.length, queue: rows });
      } catch (err: any) {
        console.error("[GET /api/admin/kazi-karibu/queue]", err?.message);
        return res.status(500).json({ error: "Could not load moderation queue." });
      }
    },
  );

  /**
   * POST /api/admin/kazi-karibu/posts/:id/decide
   * Admin approves, rejects, or asks for clarification on a held post.
   */
  app.post(
    "/api/admin/kazi-karibu/posts/:id/decide",
    requireKaziKaribuEnabled, isAuthenticated, isAdmin,
    async (req: any, res: Response) => {
      try {
        const id = String(req.params.id);
        const { decision, narrative, reasonCodes } = req.body ?? {};
        const adminId = req.user?.claims?.sub ?? req.user?.id ?? "unknown";

        if (!["approve","clarify","reject"].includes(decision)) {
          return res.status(400).json({ error: "decision must be approve, clarify, or reject." });
        }

        const targetState =
          decision === "approve" ? "live"
          : decision === "reject" ? "rejected"
          : "held"; // clarify: keep held until poster edits

        const { rows } = await pool.query(
          `UPDATE kazi_karibu_posts
              SET moderation_state = $2,
                  published_at     = CASE WHEN $2 = 'live' THEN COALESCE(published_at, NOW()) ELSE published_at END,
                  expires_at       = CASE WHEN $2 = 'live' THEN COALESCE(expires_at, NOW() + INTERVAL '7 days') ELSE expires_at END,
                  removed_reason   = CASE WHEN $2 = 'rejected' THEN $3 ELSE removed_reason END,
                  updated_at       = NOW()
            WHERE id = $1
        RETURNING id, moderation_state, published_at, expires_at`,
          [id, targetState, narrative ?? null],
        );
        if (rows.length === 0) return res.status(404).json({ error: "Post not found." });

        await pool.query(
          `INSERT INTO kazi_karibu_moderation
             (post_id, layer, decision, reason_codes, narrative, actor)
           VALUES ($1, 'human', $2, $3, $4, $5)`,
          [id, decision, reasonCodes ?? null, narrative ?? null, String(adminId)],
        );

        console.log(`[Admin] Kazi Karibu decision: post=${id} decision=${decision} state=${targetState} by=${adminId}`);
        return res.json({ ok: true, post: rows[0] });
      } catch (err: any) {
        console.error("[POST /api/admin/kazi-karibu/posts/:id/decide]", err?.message);
        return res.status(500).json({ error: "Could not record decision." });
      }
    },
  );

  /**
   * GET /api/admin/kazi-karibu/stats
   * Rolling daily counts + revenue for the admin dashboard.
   */
  app.get(
    "/api/admin/kazi-karibu/stats",
    requireKaziKaribuEnabled, isAuthenticated, isAdmin,
    async (_req: any, res: Response) => {
      try {
        const { rows: byState } = await pool.query<{ moderation_state: string; c: string }>(
          `SELECT moderation_state, COUNT(*)::text AS c
             FROM kazi_karibu_posts
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY moderation_state`,
        );
        return res.json({
          period:  "30d",
          byState: Object.fromEntries(byState.map(r => [r.moderation_state, Number(r.c)])),
        });
      } catch (err: any) {
        console.error("[GET /api/admin/kazi-karibu/stats]", err?.message);
        return res.status(500).json({ error: "Could not load stats." });
      }
    },
  );
}
