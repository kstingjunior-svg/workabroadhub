"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLanguage = void 0;
exports.detectIntent = detectIntent;
exports.handleUserMessage = handleUserMessage;
const nanjila_1 = require("./nanjila");
const checkPayment_1 = require("./tools/checkPayment");
const utils_1 = require("./utils");
const db_1 = require("../db");
var utils_2 = require("./utils");
Object.defineProperty(exports, "detectLanguage", { enumerable: true, get: function () { return utils_2.detectLanguage; } });
/**
 * Pull the live service catalog from Postgres so Nanjila's pricing is always
 * in sync with /services and the dashboard cards. Cached in-process for 60s
 * so chat traffic doesn't hammer the DB. If the query fails, falls back to
 * a generic message — never leaks a stale price.
 */
let _priceCache = null;
const PRICE_CACHE_TTL_MS = 60000;
async function fetchServicePricing() {
    const now = Date.now();
    if (_priceCache && now - _priceCache.ts < PRICE_CACHE_TTL_MS) {
        return _priceCache.rows;
    }
    const { rows } = await db_1.pool.query(`SELECT slug, name, price, badge
       FROM services
      WHERE is_active = true AND is_subscription = false
      ORDER BY price ASC, name ASC`);
    _priceCache = { rows, ts: now };
    return rows;
}
function formatPriceLine(s) {
    const price = s.price === 0 ? "FREE" : `KES ${s.price.toLocaleString()}`;
    const badge = s.badge ? `  🔥 (${s.badge.toLowerCase()})` : "";
    return `✔ ${s.name} — ${price}${badge}`;
}
function detectIntent(message) {
    const m = message.toLowerCase();
    if (m.includes("job") || m.includes("work abroad"))
        return "lead";
    if (m.includes("price") || m.includes("how much"))
        return "pricing";
    if (m.includes("help me") || m.includes("apply"))
        return "hot";
    if (m.includes("later") || m.includes("not now"))
        return "hesitant";
    if (m === "yes" || m === "yes please" || m.includes("start now") || m.includes("i'm ready") || m.includes("im ready"))
        return "closing";
    if (m.includes("scam") || m.includes("trust") || m.includes("safe") || m.includes("fake") || m.includes("legit"))
        return "trust";
    return "general";
}
async function handleUserMessage(user, message) {
    const lower = message.toLowerCase();
    const intent = detectIntent(message);
    // 🔥 PERSONALISED — Dubai interest detected
    if (user.interests?.includes("dubai")) {
        return `
I see you're interested in Dubai jobs 🇦🇪

That market is very competitive right now.

To stand out, you need:
✔ Strong CV
✔ Proper application strategy

I can help you get started immediately.

Ready?
`;
    }
    // 🔥 PERSONALISED — general profile recommendation
    if (user.interests && user.interests.length > 0) {
        return `
🔥 Based on your profile:

You need:
✔ ATS CV Optimization
✔ Assisted Apply

I recommend starting with CV first.

👉 Start here:
https://workabroadhub.tech/pay?service=ats_cv_optimization

Let's get you moving.
`;
    }
    // 🔥 LEAD — job/work abroad interest
    if (intent === "lead") {
        return `
I can help you secure verified jobs abroad without agents.

Tell me:
👉 Which country are you targeting?

I'll guide you step-by-step.
`;
    }
    // 🔥 PRICING — pulled live from the `services` table so it never drifts
    // from the dashboard cards / /services page. 60s in-process cache.
    if (intent === "pricing") {
        try {
            const rows = await fetchServicePricing();
            if (rows.length === 0) {
                // DB returned no active services — fall through to generic copy
                throw new Error("no active services");
            }
            const menu = rows.map(formatPriceLine).join("\n");
            return `
Our services are super affordable — most cost less than a single mandazi per day.

Here's the current menu:
${menu}

For comparison, a typical career consultant in Nairobi charges KES 5,000–25,000 for the same work.

You pay by M-Pesa, AI delivers in minutes, and you download as Word or PDF.

Want me to point you at the right one for what you're trying to do?
`;
        }
        catch (err) {
            console.error("[Nanjila/pricing] DB lookup failed, using generic fallback:", err?.message);
            // Don't show stale prices ever. Give a soft answer that nudges to /services.
            return `
Our service prices are super affordable — most cost less than a single mandazi per day.

The full live menu is here: https://workabroadhub.tech/services

Tell me what you're trying to do (job application? scholarship? CV review?) and I'll point you at the right one.
`;
        }
    }
    // 🔥 HOT — ready to act
    if (intent === "hot") {
        return `
You're in the right place.

We can help you apply professionally and increase your chances.

🚀 Our Assisted Apply service handles everything for you.

Do you want me to start your application now?
`;
    }
    // 🔥 CLOSING — user confirmed, send payment link
    if (intent === "closing") {
        (0, utils_1.trackEvent)(user?.id ?? null, "click_service", { service: "ats_cv_optimization" }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        return `
🔥 Let's get you started.

Click here to begin:

👉 https://workabroadhub.tech/pay?service=ats_cv_optimization

Once you pay, I will immediately start working on your CV.
`;
    }
    // 🔥 TRUST — scam/safety concerns
    if (intent === "trust") {
        return `
We don't use agents.

Everything is:
✔ Verified
✔ Transparent
✔ Controlled by you

That's why people trust WorkAbroadHub.

I'm here to guide you safely.
`;
    }
    // 🔥 HESITANT — objection handling
    if (intent === "hesitant") {
        return `
I understand — it's a big step.

But let me be honest:

Most people lose money to fake agents because they wait or go the wrong way.

Here, everything is verified and controlled.

You don't need to risk your money.

Would you like to start safely with a CV first?
`;
    }
    // 🔥 PAYMENT CHECK
    if (lower.includes("paid") || lower.includes("payment")) {
        const payment = await (0, checkPayment_1.checkPayment)(user.id);
        if (!payment) {
            return "❌ I cannot find your payment. Please try again.";
        }
        if (payment.status === "success") {
            return `✅ Payment confirmed for ${payment.service_name} (KES ${payment.amount})`;
        }
        return `⏳ Your payment for ${payment.service_name} is ${payment.status}.`;
    }
    // 🔥 CV REQUEST
    if (lower.includes("cv")) {
        return `
⚠️ Important:

Many job openings close quickly.

If your CV is not ready, you miss the opportunity.

Let's prepare yours now so you're ready to apply immediately.

Ready to proceed?
`;
    }
    // 🔥 LANGUAGE CHANGE
    if (lower.includes("change language")) {
        return "Choose your language: English, Swahili, Arabic.";
    }
    // 🔥 DEFAULT AI RESPONSE
    return await (0, nanjila_1.nanjilaAgent)(user, message);
}
