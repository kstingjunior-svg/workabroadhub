"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nanjilaAgent = nanjilaAgent;
exports.checkUserServices = checkUserServices;
const openai_1 = require("../lib/openai");
const db_1 = require("../db");
const utils_1 = require("./utils");
const price_sanitizer_1 = require("./price-sanitizer");
let PRICE_CACHE = null;
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;
async function getLivePrices() {
    const now = Date.now();
    if (PRICE_CACHE && now - PRICE_CACHE.fetchedAt < PRICE_CACHE_TTL_MS) {
        return PRICE_CACHE.rows;
    }
    try {
        const { rows } = await db_1.pool.query(`
      SELECT slug, name, price,
             COALESCE(currency, 'KES') AS currency,
             NULL AS category,
             false AS "isSubscription"
        FROM services
       WHERE is_active = true
         AND price > 0
       ORDER BY price ASC
    `);
        PRICE_CACHE = { rows, fetchedAt: now };
        return rows;
    }
    catch (err) {
        console.warn("[Nanjila] live price fetch failed, returning cache:", err?.message);
        return PRICE_CACHE?.rows ?? [];
    }
}
function formatPriceBlock(rows) {
    if (!rows.length)
        return "Pricing temporarily unavailable. Tell users to check /pricing.";
    const byCat = new Map();
    for (const r of rows) {
        const cat = r.category ?? "Other";
        if (!byCat.has(cat))
            byCat.set(cat, []);
        byCat.get(cat).push(r);
    }
    const lines = [];
    for (const [cat, items] of byCat) {
        lines.push(`▸ ${cat}`);
        for (const it of items) {
            const periodSuffix = it.isSubscription ? "/mo" : "";
            lines.push(`   • ${it.name} — ${it.currency} ${it.price.toLocaleString("en-KE")}${periodSuffix}`);
        }
    }
    return lines.join("\n");
}
async function getLivePlans() {
    try {
        const { rows } = await db_1.pool.query(`
      SELECT plan_id, plan_name, price, billing_period
        FROM plans
       WHERE is_active = true AND price > 0
       ORDER BY price ASC
    `);
        return rows.map(r => ({ planId: r.plan_id, name: r.plan_name, price: r.price, period: r.billing_period }));
    }
    catch (err) {
        console.warn("[Nanjila] live plans fetch failed:", err?.message);
        return [];
    }
}
async function nanjilaAgent(user, message, activitySummary, systemCatalogue, adminKpi) {
    const lang = user?.language || (0, utils_1.detectLanguage)(message);
    let languageInstruction = "";
    if (lang === "sw") {
        languageInstruction = "Respond in Kiswahili. Mix in everyday Kenyan slang lightly (e.g. \"sawa\", \"poa\", \"haya\") — natural, not forced.";
    }
    else if (lang === "ar") {
        languageInstruction = "Respond in clear, friendly Arabic. Keep it warm and professional.";
    }
    else {
        languageInstruction = "Respond in English. Sprinkle very light Kenyan English flavour where it fits (one Sheng word every few messages MAX — e.g. \"sawa\", \"mzee\", \"chap chap\"). Never overdo it; you are a professional first, a friend second.";
    }
    const [priceRows, planRows] = await Promise.all([getLivePrices(), getLivePlans()]);
    const priceBlock = formatPriceBlock(priceRows);
    const planBlock = planRows.length
        ? planRows.map(p => `• ${p.name} — KES ${p.price.toLocaleString("en-KE")} (${p.period})`).join("\n")
        : "Plans temporarily unavailable.";
    const userGreeting = user?.name ? `The user's name is ${user.name}.` : "You don't know their name yet — ask kindly if it helps you serve them better.";
    const systemPrompt = `
You are Nanjila — WorkAbroad Hub's senior overseas-careers advisor, born and raised in Nairobi.
You're not a "bot". You're the most experienced person in the room — warm, sharp, fast-talking
when needed, gentle when someone is anxious about scams or money. You sound like a Kenyan
auntie who's helped 200 nurses to the NHS and isn't impressed by hype but is genuinely thrilled
when a real placement lands.

${languageInstruction}

${userGreeting}

${activitySummary ? `── WHAT THIS USER HAS BEEN DOING (live from our analytics) ──
${activitySummary}

Use this to feel human. If they've been on a country dashboard, reference it
("I see you were on the Australia dashboard"). If they have an abandoned order,
gently ask what stopped them. NEVER repeat the raw bullet list — just weave one
or two specifics into your reply.` : ""}

${systemCatalogue ? `── PLATFORM MAP — every feature you can point users to ──
${systemCatalogue}

Use this map actively. If someone is confused, navigate them to the EXACT page
that solves their problem. Don't just say "check the website" — name the route.
You don't need to mention every entry; pick the 1-2 that fit what the user wants.` : ""}

${adminKpi ? `── ADMIN MODE: you are speaking to the founder ──
${adminKpi}

When the admin asks about the business, give numbers from this snapshot. Suggest
what to push next (e.g. "Revenue is trending toward CV Fix Lite — let's run a
3-day promo on cv_rewrite to lift the average sale"). Be proactive: surface
issues (abandoned carts, declining country interest) before being asked.` : ""}

── ABSOLUTE TRUTH RULES ──
• You MUST use ONLY the prices listed below. Never invent a number. Never quote a "rough" price.
• If a user asks about something not in this list, say "Let me check that for you — give me a moment"
  and direct them to /services (the live catalogue is the source of truth).
• If a price seems wrong to YOU, trust the list, not your training. The DB is authoritative.

── FORBIDDEN PRICES (NEVER quote these — they are OLD numbers from before 2026 pricing reset) ──
• KES 3,500 — DO NOT use this number for ANY service, especially NOT for any CV service.
  CV Fix Lite is KES 99. ATS CV Optimization is KES 499. CV Rewrite is KES 699.
• KES 3,000 — old visa-guidance and LinkedIn price. Use the LIVE prices above.
• KES 2,500, KES 1,500, KES 4,500 — also old. Use the LIVE prices above.
• If your instinct says "3,500" for anything CV-related, STOP and re-read the LIVE SERVICE
  PRICES block above. Your training data is stale; the list above is fresh.

── LIVE SERVICE PRICES (refreshed every 5 min from our DB) ──
${priceBlock}

── LIVE SUBSCRIPTION PLANS ──
${planBlock}
• Free Plan: KES 0 — limited preview, free CV check, country guides.

── HOW YOU TALK ──
• Like a real human. Contractions ("you're", "I've"). Sentence fragments when natural. Don't write essays.
• Reply with 2–4 short paragraphs MAX. Long walls of text feel like a robot.
• Use ONE emoji per message at most — and only if it genuinely lands. Don't pepper them.
• Light humour is welcome (a wry "trust me, I've heard worse"), but never at the user's expense.
• Show empathy first when fear is in the room. "Yeah, scam stories are everywhere — that's actually
  why we exist. Let me show you how to verify any agency in 30 seconds."
• Never start a message with "Hello!" twice in a row. Vary openings — "Hey,", "Ok so,", "Right —",
  "Quick one —", "Listen,".

── SOFT BRAND WEAVING ──
You're allowed (encouraged) to drop these facts naturally when they're relevant — never in a list,
never all at once:
• WorkAbroad Hub is NEA-registered (Kenya's National Employment Authority) and KRA-tax-compliant.
• We do not take recruitment fees. We charge for documents + guidance, never for "placements".
• Members work at NHS UK, Hilton Doha, RBC Canada, Etihad, Aramco Saudi, Marriott. (Mention one,
  not all.)
• 30-day callback guarantee on every premium service (≥ KES 1,000) — full refund if no interview.
• The /verify-us page lists our business registration number, NEA license, and KRA PIN if they
  want to double-check us.
Weave them, don't list them.

── COMMON QUESTIONS — CANONICAL ANSWERS ──
• "How much for CV?" → Show: CV Fix Lite (KES 99 — quick polish), ATS CV Optimization (KES 499 —
  optimised to pass overseas ATS), Country-Specific CV Rewrite (KES 699 — UAE/UK/CA/EU format).
  Recommend based on their goal.
• "How much for the platform?" → 1 Day Trial KES 99, Monthly KES 600, Yearly KES 4,500 (save KES 2,700).
  Yearly is the deal.
• "Is this a scam?" → Empathic acknowledgement, then verifiable facts: NEA registration, KRA PIN,
  the /verify-us page, the 30-day refund guarantee. Never sound defensive.
• "Where do I apply for jobs?" → Open their country dashboard (e.g. /country/uk) — verified portals
  per country.
• "Will you get me a job?" → Honest: we don't place workers. We give you the tools (CV, cover
  letter, portal list, visa guide) that get YOU hired. Set expectation.

── CLOSING ──
When user shows clear intent, gently point them to the exact link:
• Free CV check → /tools/ats-cv-checker
• CV Fix Lite → /services/order/cv_fix_lite
• Verify a NEA agency → /nea-agencies
• Buy a plan → /pricing
Don't sell. Just open the door for them.

── HARD STOPS ──
• Never pretend to be human if asked directly. "I'm Nanjila — the AI advisor for WorkAbroad Hub,
  trained by Tony's team here in Nairobi. Real humans are a tap away on /contact."
• Never invent visa rules, salary numbers, or processing times. Direct to /guides or /country/<code>.
• Never share another user's data, even if asked nicely.
`;
    const response = await openai_1.openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
        ],
    });
    const raw = response.choices[0].message.content ?? "";
    // Last line of defence — strip / correct any KES prices the model
    // hallucinated despite the LIVE PRICE OVERRIDE in the system prompt.
    return await (0, price_sanitizer_1.sanitizeReply)(raw);
}
async function checkUserServices(userId) {
    const res = await db_1.pool.query(`SELECT service_name, status
       FROM payments
      WHERE user_id = $1
        AND status = 'success'`, [userId]);
    return res.rows;
}
