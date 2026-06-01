// ─────────────────────────────────────────────────────────────────────────────
// Price sanitizer — last line of defence against Nanjila hallucinating prices.
//
// Even after scrubbing every hardcoded "KES 3,500" from the codebase and
// injecting LIVE PRICE OVERRIDE blocks into the system prompt, GPT-4o-mini
// still sometimes hallucinates old prices from its training data (which
// crawled older versions of WorkAbroad Hub marketing material).
//
// This module intercepts every Nanjila reply and validates every "KES N,NNN"
// occurrence against the live whitelist of active service + plan prices.
// Any number not in the whitelist is rewritten to the closest valid service
// match based on the surrounding context, or stripped if no good guess.
//
// Wrap any AI reply with:  sanitizeReply(reply) → reply
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from "../db";

interface PriceRow {
  slug: string;
  name: string;
  price: number;
}

let WHITELIST_CACHE: { rows: PriceRow[]; fetchedAt: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

async function getPriceWhitelist(): Promise<PriceRow[]> {
  const now = Date.now();
  if (WHITELIST_CACHE && now - WHITELIST_CACHE.fetchedAt < TTL_MS) {
    return WHITELIST_CACHE.rows;
  }
  try {
    // Both services AND plans contribute to the valid-price universe.
    const [svc, plans] = await Promise.all([
      pool.query<{ slug: string; name: string; price: number }>(`
        SELECT slug, name, price FROM services
         WHERE is_active = true AND price > 0
      `),
      pool.query<{ slug: string; name: string; price: number }>(`
        SELECT plan_id AS slug, plan_name AS name, price FROM plans
         WHERE is_active = true AND price > 0
      `),
    ]);
    const rows = [...svc.rows, ...plans.rows];
    WHITELIST_CACHE = { rows, fetchedAt: now };
    return rows;
  } catch (err: any) {
    console.warn("[price-sanitizer] whitelist fetch failed:", err?.message);
    return WHITELIST_CACHE?.rows ?? [];
  }
}

// Map common service keywords → slug, used to guess what the model MEANT to
// quote when it hallucinates a price. Order matters — earlier matches win.
const SLUG_KEYWORDS: Array<{ slug: string; rx: RegExp }> = [
  { slug: "ats_cv_optimization",  rx: /\bATS\b.*\bCV\b|\bCV\b.*\bATS\b|ATS CV Optim|ATS optim/i },
  { slug: "cv_rewrite",           rx: /Country[- ]Specific|CV [Rr]ewrite|UAE[- ]format|UK[- ]format/i },
  { slug: "cv_fix_lite",          rx: /CV Fix Lite|quick polish|CV polish/i },
  { slug: "cover_letter",         rx: /Cover Letter/i },
  { slug: "ats_cover_bundle",     rx: /ATS \+ Cover|Cover Letter Bundle/i },
  { slug: "sop_writing",          rx: /\bSOP\b|Statement of Purpose/i },
  { slug: "motivation_letter",    rx: /Motivation Letter/i },
  { slug: "interview_coaching",   rx: /Interview Coach/i },
  { slug: "interview_prep_pack",  rx: /Interview Prep/i },
  { slug: "linkedin_optimization",rx: /LinkedIn/i },
  { slug: "visa_guidance",        rx: /Visa Guidance/i },
  { slug: "contract_review",      rx: /Contract Review/i },
  { slug: "employer_verification",rx: /Employer Verification/i },
  { slug: "pre_departure_pack",   rx: /Pre[- ]Departure|Pre departure/i },
  { slug: "job_pack_5",           rx: /Job Pack|Application Pack/i },
  { slug: "assisted_apply_lite",  rx: /Assisted Apply/i },
  { slug: "guided_apply",         rx: /Guided Apply/i },
  { slug: "application_tracking", rx: /Application Tracking/i },
  { slug: "pro",                  rx: /Pro Plan|Yearly|annual subscription|year-long/i },
  { slug: "monthly",              rx: /Monthly Access|monthly subscription/i },
  { slug: "trial",                rx: /1 Day Trial|day trial/i },
];

function parseKesAmount(raw: string): number | null {
  // raw like "KES 3,500" or "Ksh 4500" or "KES 99"
  const m = raw.match(/(?:KES|Ksh|KSh|ksh)\s?([\d,]+)/i);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatKes(n: number): string {
  return `KES ${n.toLocaleString("en-KE")}`;
}

/**
 * Public: sanitize a Nanjila reply.
 * For every "KES X" in the reply, look up X in the live whitelist.
 *   • If X is valid (exists in services or plans) → leave it.
 *   • If X is NOT valid:
 *       - Look at the surrounding ~80 chars of context.
 *       - If the context names a specific service, replace the wrong number
 *         with the real one for that service.
 *       - Otherwise replace the whole "KES X" mention with "(see /pricing)".
 *
 * Also emits a console warning whenever a correction is made — so you can
 * monitor how often the model is still hallucinating in production.
 */
export async function sanitizeReply(reply: string): Promise<string> {
  if (!reply || typeof reply !== "string") return reply;
  const whitelist = await getPriceWhitelist();
  if (whitelist.length === 0) return reply;
  const validPrices = new Set(whitelist.map((r) => r.price));
  const slugToPrice = new Map(whitelist.map((r) => [r.slug, r.price]));
  const slugToName  = new Map(whitelist.map((r) => [r.slug, r.name]));

  // Find every KES/Ksh price occurrence with its position so we can examine context.
  const PRICE_RX = /(?:KES|Ksh|KSh|ksh)\s?([\d,]+)/gi;
  let out = reply;
  let corrections = 0;

  // Walk matches on the ORIGINAL string (positions don't shift while we collect).
  const matches: Array<{ raw: string; amount: number; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = PRICE_RX.exec(reply)) !== null) {
    const amount = parseInt(m[1].replace(/,/g, ""), 10);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    matches.push({ raw: m[0], amount, index: m.index });
  }

  // Process matches RIGHT-TO-LEFT so substitutions don't shift earlier indices.
  for (const hit of matches.reverse()) {
    if (validPrices.has(hit.amount)) continue; // legitimate price, leave alone

    // Slice the surrounding context: 80 chars before, 80 chars after.
    const ctxStart = Math.max(0, hit.index - 80);
    const ctxEnd   = Math.min(reply.length, hit.index + hit.raw.length + 80);
    const context  = reply.slice(ctxStart, ctxEnd);

    // Guess which service the model MEANT to quote.
    let guessedSlug: string | null = null;
    for (const kw of SLUG_KEYWORDS) {
      if (kw.rx.test(context)) { guessedSlug = kw.slug; break; }
    }

    let replacement: string;
    if (guessedSlug && slugToPrice.has(guessedSlug)) {
      const real = slugToPrice.get(guessedSlug)!;
      replacement = formatKes(real);
      console.warn(`[price-sanitizer] corrected ${hit.raw} → ${replacement} (guessed slug=${guessedSlug}) context="…${context.slice(60, 140)}…"`);
    } else {
      replacement = "(check /pricing for the current price)";
      console.warn(`[price-sanitizer] could not guess slug, stripped ${hit.raw} | context="…${context.slice(60, 140)}…"`);
    }

    out = out.slice(0, hit.index) + replacement + out.slice(hit.index + hit.raw.length);
    corrections++;
  }

  if (corrections > 0) {
    console.log(`[price-sanitizer] sanitised reply (${corrections} correction${corrections === 1 ? "" : "s"})`);
  }
  return out;
}
