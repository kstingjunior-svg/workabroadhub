// ─────────────────────────────────────────────────────────────────────────────
// Price sanitizer — last line of defence against Nanjila hallucinating prices.
//
// Even after scrubbing every hardcoded "KES 3,500" from the codebase and
// injecting LIVE PRICE OVERRIDE blocks into the system prompt, GPT-4o-mini
// still sometimes hallucinates old prices from its training data (which
// crawled older versions of WorkAbroad Hub marketing material).
//
// This module intercepts every Nanjila reply and validates every price-like
// occurrence against the live whitelist of active service + plan prices.
// Any number not in the whitelist is rewritten to the closest valid service
// match based on the surrounding context, or stripped if no good guess.
//
// 2026-06 hardening pass (kstingjunior report: Nanjila STILL quotes 3,500):
//   • FORBIDDEN_PRICES — explicit blacklist that ALWAYS wins, even if the
//     amount happens to coincide with some other service's real price.
//     3500 is on this list because Nanjila's training data is full of old
//     WAH marketing pages quoting "KES 3,500 for ATS CV Optimization".
//   • Broadened regex — catches "Ksh. 3,500", "Sh 3500", "3500/-", "3500 KES",
//     "3500 shillings", "3500 bob", and unprefixed "3,500" when it sits next
//     to a service mention.
//   • Verbose pre-sanitize log — prints the FIRST 300 chars of every raw AI
//     reply so production logs show exactly what the model said before
//     correction (lets us spot new hallucination patterns fast).
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

// ── HARD BLACKLIST ───────────────────────────────────────────────────────────
// Numbers Nanjila must NEVER quote, regardless of whitelist coincidence.
// These are old WorkAbroad Hub prices from pre-2026 marketing material that
// the model continues to regurgitate. Add any newly-discovered hallucinated
// price here — it will be force-rewritten even if some other service happens
// to be priced at the same number.
const FORBIDDEN_PRICES = new Set<number>([3500, 3000, 2500, 1500, 4500]);
// Note: 4500 was the OLD Pro yearly price; the current Pro plan price lives
// in the plans table and the sanitizer's whitelist will route it correctly.

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

// Force-invalidate the cache. Call this if you've just updated prices in the
// admin panel and want sanitiser corrections to reflect the new prices
// immediately rather than waiting up to 5 min.
export function invalidatePriceWhitelist(): void {
  WHITELIST_CACHE = null;
}

// Map common service keywords → slug, used to guess what the model MEANT to
// quote when it hallucinates a price. Order matters — earlier matches win.
// Specific patterns FIRST so they don't get swallowed by broader catch-alls.
const SLUG_KEYWORDS: Array<{ slug: string; rx: RegExp }> = [
  // ── CV services (most-hallucinated category) ────────────────────────────
  { slug: "ats_cv_optimization",  rx: /\bATS\b.{0,30}\bCV\b|\bCV\b.{0,30}\bATS\b|ATS CV Optim|ATS optim|ATS [Cc]ompat/i },
  { slug: "cv_rewrite",           rx: /Country[- ]Specific|CV [Rr]ewrite|UAE[- ]format|UK[- ]format|target country|tailored to.{0,30}country/i },
  { slug: "cv_fix_lite",          rx: /CV Fix Lite|quick polish|CV polish|fix lite|cv fix\b|CV fix\b|\blight fix\b|lite CV|polish your CV/i },
  // ── Other documents ────────────────────────────────────────────────────
  { slug: "cover_letter",         rx: /Cover Letter Writing|cover letter|Cover Letter/i },
  { slug: "ats_cover_bundle",     rx: /ATS \+ Cover|Cover Letter Bundle|ATS bundle/i },
  { slug: "sop_writing",          rx: /\bSOP\b|Statement of Purpose/i },
  { slug: "motivation_letter",    rx: /Motivation Letter/i },
  // ── Coaching ───────────────────────────────────────────────────────────
  { slug: "interview_coaching",   rx: /Interview Coach/i },
  { slug: "interview_prep_pack",  rx: /Interview Prep/i },
  { slug: "linkedin_optimization",rx: /LinkedIn/i },
  // ── Visa & verification ────────────────────────────────────────────────
  { slug: "visa_guidance",        rx: /Visa Guidance|visa.{0,30}guidance|visa article/i },
  { slug: "contract_review",      rx: /Contract Review/i },
  { slug: "employer_verification",rx: /Employer Verification/i },
  { slug: "pre_departure_pack",   rx: /Pre[- ]Departure|Pre departure/i },

  // ── Work Permit Assistance — country + tier specific ───────────────────
  // Order matters: country-specific PRO patterns first, then MID, then LIGHT,
  // so "UK Work Permit Full Hand-Holding" doesn't accidentally route to the
  // KES 249 light tier.
  // UK
  { slug: "work_permit_uk_pro",     rx: /UK.{0,40}(Pro|Full Hand|Hand[- ]Holding|2,?999)|2,?999.{0,40}UK/i },
  { slug: "work_permit_uk_mid",     rx: /UK.{0,40}(Mid|Form Pre[- ]?fill|Assist|599)|599.{0,40}UK/i },
  { slug: "work_permit_uk_light",   rx: /UK.{0,40}(Work Permit|Skilled Worker|CoS|Certificate of Sponsorship)/i },
  // UAE
  { slug: "work_permit_uae_pro",    rx: /UAE.{0,40}(Pro|Full Hand|Hand[- ]Holding|2,?999)|2,?999.{0,40}UAE/i },
  { slug: "work_permit_uae_mid",    rx: /UAE.{0,40}(Mid|Form Pre[- ]?fill|Assist|599)|599.{0,40}UAE/i },
  { slug: "work_permit_uae_light",  rx: /UAE.{0,40}(Work Permit|MOHRE|Tasheel|Employment Visa|Emirates ID)/i },
  // Saudi
  { slug: "work_permit_saudi_pro",  rx: /(Saudi|KSA).{0,40}(Pro|Full Hand|Hand[- ]Holding|2,?999)|2,?999.{0,40}(Saudi|KSA)/i },
  { slug: "work_permit_saudi_mid",  rx: /(Saudi|KSA).{0,40}(Mid|Form Pre[- ]?fill|Assist|599)|599.{0,40}(Saudi|KSA)/i },
  { slug: "work_permit_saudi_light",rx: /(Saudi|KSA|Iqama).{0,40}(Work Permit|Enjazit|MoFA|Wakalah|Block Visa)/i },
  // Canada
  { slug: "work_permit_canada_pro", rx: /Canada.{0,40}(Pro|Full Hand|Hand[- ]Holding|2,?999)|2,?999.{0,40}Canada/i },
  { slug: "work_permit_canada_mid", rx: /Canada.{0,40}(Mid|Form Pre[- ]?fill|Assist|599)|599.{0,40}Canada/i },
  { slug: "work_permit_canada_light",rx: /Canada.{0,40}(Work Permit|LMIA|Express Entry|NOC code|IRCC|IMM)/i },
  // Qatar
  { slug: "work_permit_qatar_pro",  rx: /Qatar.{0,40}(Pro|Full Hand|Hand[- ]Holding|2,?999)|2,?999.{0,40}Qatar/i },
  { slug: "work_permit_qatar_mid",  rx: /Qatar.{0,40}(Mid|Form Pre[- ]?fill|Assist|599)|599.{0,40}Qatar/i },
  { slug: "work_permit_qatar_light",rx: /Qatar.{0,40}(Work Permit|MOI|Hukoomi|QID|Qatar Visa Center)/i },
  // Generic work-permit fallback — if the model says "work permit" without
  // naming a country, route to UK light as the cheapest representative price
  // so the catch-all rewrite uses KES 249 not KES 3,500.
  { slug: "work_permit_uk_light",   rx: /work permit|residence permit|work visa/i },
  // ── Application packs ──────────────────────────────────────────────────
  { slug: "job_pack_5",           rx: /Job Pack|Application Pack/i },
  { slug: "assisted_apply_lite",  rx: /Assisted Apply/i },
  { slug: "guided_apply",         rx: /Guided Apply/i },
  { slug: "application_tracking", rx: /Application Tracking/i },
  // ── Subscription plans ─────────────────────────────────────────────────
  { slug: "pro",                  rx: /Pro Plan|Yearly|annual subscription|year-long/i },
  { slug: "monthly",              rx: /Monthly Access|monthly subscription/i },
  { slug: "trial",                rx: /1 Day Trial|day trial/i },
  // ── Broad CV catch-all — only if NO specific match above hit. Since
  //    the most popular CV entry point is CV Fix Lite (KES 99 tripwire),
  //    default any vague "CV" mention to its price.
  { slug: "cv_fix_lite",          rx: /\bCV\b|\bresume\b|curriculum vitae/i },
];

function formatKes(n: number): string {
  return `KES ${n.toLocaleString("en-KE")}`;
}

/**
 * Public: sanitize a Nanjila reply.
 * For every price-like occurrence in the reply, validate it against the live
 * whitelist AND the explicit forbidden list, then rewrite or strip.
 *
 * Emits verbose console output in production so we can see exactly which
 * code path is still producing 3,500 (or any other stale figure).
 */
export async function sanitizeReply(reply: string): Promise<string> {
  if (!reply || typeof reply !== "string") return reply;
  const whitelist = await getPriceWhitelist();
  if (whitelist.length === 0) return reply;
  const validPrices = new Set(whitelist.map((r) => r.price));
  const slugToPrice = new Map(whitelist.map((r) => [r.slug, r.price]));

  // Pre-sanitize log: print first 300 chars of the raw AI reply so we can
  // see in Render logs WHAT the model actually said before we rewrote it.
  const replyPreview = reply.replace(/\s+/g, " ").slice(0, 300);
  console.log(`[price-sanitizer] raw reply preview: "${replyPreview}${reply.length > 300 ? "..." : ""}"`);

  // Broad price-occurrence regex.
  const PRICE_RX =
    /(?:(?:KES|Ksh\.?|KSh\.?|Sh\.?|ksh|sh|bei|gharama)\s*[:.]?\s*([\d,]+)|([\d,]+)\s*(?:KES|Ksh\.?|shillings?|bob|\/=|\/-))/gi;

  let out = reply;
  let corrections = 0;

  const matches: Array<{ raw: string; amount: number; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = PRICE_RX.exec(reply)) !== null) {
    const numStr = m[1] ?? m[2] ?? "";
    const amount = parseInt(numStr.replace(/,/g, ""), 10);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (amount >= 10000) continue;
    matches.push({ raw: m[0], amount, index: m.index });
  }

  for (const hit of matches.reverse()) {
    const isForbidden = FORBIDDEN_PRICES.has(hit.amount);
    const isValid = validPrices.has(hit.amount);
    if (isValid && !isForbidden) continue;

    const ctxStart = Math.max(0, hit.index - 120);
    const ctxEnd   = Math.min(reply.length, hit.index + hit.raw.length + 120);
    const context  = reply.slice(ctxStart, ctxEnd);

    let guessedSlug: string | null = null;
    for (const kw of SLUG_KEYWORDS) {
      if (kw.rx.test(context)) { guessedSlug = kw.slug; break; }
    }

    let replacement: string;
    if (guessedSlug && slugToPrice.has(guessedSlug)) {
      const real = slugToPrice.get(guessedSlug)!;
      replacement = formatKes(real);
      const tag = isForbidden ? "FORBIDDEN" : "stale";
      console.warn(`[price-sanitizer] ${tag} ${hit.raw} -> ${replacement} (slug=${guessedSlug})`);
    } else {
      replacement = "(check /pricing for the current price)";
      const tag = isForbidden ? "FORBIDDEN" : "stale";
      console.warn(`[price-sanitizer] ${tag} ${hit.raw} unmappable -> stripped`);
    }

    out = out.slice(0, hit.index) + replacement + out.slice(hit.index + hit.raw.length);
    corrections++;
  }

  if (corrections > 0) {
    console.log(`[price-sanitizer] sanitised reply (${corrections} corrections)`);
  }
  return out;
}
