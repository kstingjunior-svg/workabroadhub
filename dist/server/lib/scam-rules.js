"use strict";
/**
 * scam-rules.ts — pre-publish content review for Kazi Karibu posts.
 *
 * Layer 3 of the six-layer trust model. See
 * docs/kazi-karibu/STRATEGY.md §8 and Appendix B.
 *
 * DESIGN NOTES
 *   - Pure functions, no I/O. This module is fast, testable, and
 *     side-effect-free by design.
 *   - Rules run in the order they're declared. All rules run; we
 *     don't short-circuit on the first reject so the poster sees
 *     every problem in one pass.
 *   - Two severities: "reject" (post can't go live) and "flag"
 *     (post proceeds but is marked for enhanced review at Layer 4).
 *   - Rules that are category-specific carry an `onlyIfCategoryIn` set.
 *     Rules without that set apply to every category.
 *
 * ADDING A NEW RULE:
 *   - Append to SCAM_RULES.
 *   - Add a test case in server/lib/__tests__/scam-rules.test.ts.
 *   - Keep `poster_reason` in plain, friendly Kenyan English —
 *     posters should read it once and know what to fix.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCAM_RULES = void 0;
exports.evaluatePostAgainstRules = evaluatePostAgainstRules;
// ─── The rule set (§Appendix B) ──────────────────────────────────────────────
exports.SCAM_RULES = [
    // ── Applicant-pays language ────────────────────────────────────────────
    // Fires on any wording where the poster asks the applicant to pay
    // upfront — the most common scam pattern in Kenyan household hiring.
    {
        id: "applicant_pays_upfront",
        severity: "reject",
        pattern: /\b(pay|deposit|registration|processing|uniform|training)\s+(fee|kes|ksh|ksh\.?|kshs?|shillings?|\d)/i,
        poster_reason: "Kazi Karibu never asks applicants to pay. If your post asks for a registration fee, uniform fee, deposit, or any upfront payment from the applicant, please remove it.",
        moderator_note: "Applicant-pays language matched.",
    },
    {
        id: "training_fee_scam",
        severity: "reject",
        pattern: /\b(training|starter\s*kit|starter\s*pack|onboarding)\s+(fee|kes|ksh|cost|charge)/i,
        poster_reason: "Training and starter-kit fees paid by the applicant are not allowed on Kazi Karibu.",
        moderator_note: "Training-fee / starter-kit charge language matched.",
    },
    // ── Guaranteed placement / no interview ────────────────────────────────
    {
        id: "guaranteed_placement",
        severity: "reject",
        pattern: /\b(guarantee|guaranteed|100%\s*sure)\b.*\b(hire|hiring|placement|job|start|deployment)\b/i,
        poster_reason: "Real employers interview applicants — nothing is guaranteed. Please remove wording that promises hiring.",
        moderator_note: "Guaranteed-placement language matched.",
    },
    {
        id: "no_interview_needed",
        severity: "reject",
        pattern: /\b(no\s+(interview|questions|screening)\s+(needed|required|asked))\b/i,
        poster_reason: "Every legitimate hire involves at least a phone conversation. Please remove 'no interview' wording.",
        moderator_note: "'No interview' language matched.",
    },
    // ── Overseas placement in a Kazi Karibu category ───────────────────────
    // Overseas placements belong on the main board. Only fires for LOCAL
    // categories — event promoters legitimately mention travel domestically.
    {
        id: "overseas_placement",
        severity: "reject",
        pattern: /\b(dubai|qatar|saudi|kuwait|oman|bahrain|abu\s*dhabi|riyadh|jeddah|abroad|overseas|(?:united\s+(?:states|kingdom)))\b/i,
        poster_reason: "Overseas placements belong on the main WorkAbroad Hub board, not Kazi Karibu. Please post there instead.",
        moderator_note: "Overseas destination keyword — belongs on main board.",
        onlyIfCategoryIn: [
            "house_help", "cleaner", "cook_caterer", "driver",
            "fundi_mason", "fundi_plumber", "fundi_electrician", "fundi_painter", "fundi_carpenter",
            "delivery_errand", "security_guard", "gardener", "tutor",
        ],
    },
    // ── MLM / opportunity roles ────────────────────────────────────────────
    {
        id: "mlm_opportunity",
        severity: "reject",
        pattern: /\b(unlimited\s+earnings?|be\s+your\s+own\s+boss|team\s+leader\s+position|business\s+opportunity|passive\s+income|financial\s+freedom)\b/i,
        poster_reason: "Business opportunities, MLM, and network marketing roles are not allowed on Kazi Karibu.",
        moderator_note: "MLM / opportunity language matched.",
    },
    // ── Adult / escort ─────────────────────────────────────────────────────
    {
        id: "adult_adjacent",
        severity: "reject",
        pattern: /\b(escort|massage\s+(?:therapist|parlour)|companion(?:ship)?|adult\s+entertainment)\b/i,
        poster_reason: "This category isn't supported on Kazi Karibu.",
        moderator_note: "Adult / escort-adjacent language matched.",
    },
    // ── Drug-mule pattern ──────────────────────────────────────────────────
    {
        id: "drug_mule_pattern",
        severity: "reject",
        pattern: /\b(carry\s+(?:items|packages|parcels)|no\s+questions\s+asked|sealed\s+packages?|deliver\s+.*\s+without\s+opening)\b/i,
        poster_reason: "This description contains language commonly associated with unsafe or illegal work. Please rephrase what the job actually involves.",
        moderator_note: "Drug-mule-adjacent language matched.",
    },
    // ── Impersonation of corporate employers ───────────────────────────────
    {
        id: "corporate_impersonation",
        severity: "reject",
        pattern: /\b(naivas|quickmart|kra|kenya\s+revenue|kenya\s+power|kplc|equity\s+bank|kcb|safaricom|county\s+government|ministry\s+of\s+\w+)\b/i,
        poster_reason: "Posts on behalf of established companies or government bodies must go through Kenya Careers with company verification, not Kazi Karibu.",
        moderator_note: "Corporate/government name mentioned — possible impersonation.",
    },
    // ── FLAG rules (proceed but mark for enhanced review) ──────────────────
    {
        id: "vague_location",
        severity: "flag",
        pattern: (ctx) => {
            const text = `${ctx.title} ${ctx.description}`.toLowerCase();
            return (/\banywhere\s+in\s+kenya\b/.test(text) ||
                /\bany\s+county\b/.test(text) ||
                /\bcountry-?wide\b/.test(text));
        },
        poster_reason: "Real households and employers have a specific location. Please add the sub-county or estate.",
        moderator_note: "Vague location wording.",
        // Only fires for categories where a location is clearly required.
        onlyIfCategoryIn: [
            "house_help", "cleaner", "cook_caterer", "driver", "gardener",
            "security_guard", "tutor", "delivery_errand",
        ],
    },
    {
        id: "unrealistic_pay",
        severity: "flag",
        pattern: (ctx) => {
            if (!ctx.budgetMaxKes || !ctx.budgetPeriod)
                return false;
            // Sanity check: monthly household work paying >100k is either a data
            // error or bait. Day rate >5000 for casual work is a similar smell.
            if (ctx.budgetPeriod === "month" && ctx.budgetMaxKes > 100000)
                return true;
            if (ctx.budgetPeriod === "day" && ctx.budgetMaxKes > 5000)
                return true;
            if (ctx.budgetPeriod === "hour" && ctx.budgetMaxKes > 1000)
                return true;
            return false;
        },
        poster_reason: "The pay you've listed is significantly higher than typical for this kind of role. If this is correct, please add a note explaining the details so applicants understand.",
        moderator_note: "Unrealistic pay for described work.",
        // Skip for skilled fundi work where high day-rates can be legitimate.
        exceptIfCategoryIn: ["fundi_electrician", "fundi_plumber", "tutor"],
    },
    {
        id: "gmail_yahoo_for_business",
        severity: "flag",
        pattern: /@(gmail|yahoo|hotmail|outlook)\.com/i,
        poster_reason: "Real businesses usually contact from a branded email. If you're a household, that's fine — no action needed. If you're a business, add your company name in the description.",
        moderator_note: "Free-email address in a post; check for consistency with claim.",
    },
    {
        id: "budget_negotiable_without_range",
        severity: "flag",
        pattern: (ctx) => {
            const text = `${ctx.title} ${ctx.description}`.toLowerCase();
            const saysNegotiable = /\bnegotiable\b|\bopen\s+to\s+offer\b/.test(text);
            const noRange = ctx.budgetMinKes === null && ctx.budgetMaxKes === null;
            return saysNegotiable && noRange;
        },
        poster_reason: "Please give at least a rough pay range. 'Negotiable' with no range makes it hard for applicants to know if the role fits them.",
        moderator_note: "Says 'negotiable' but no budget range given.",
    },
    {
        id: "urgent_without_context",
        severity: "flag",
        pattern: (ctx) => {
            const text = `${ctx.title} ${ctx.description}`.toLowerCase();
            const hasUrgent = /\burgent(?:ly)?\b/.test(text);
            const hasContext = /\b(before|by|deadline|event on|starting on|from|until)\b/.test(text);
            return hasUrgent && !hasContext;
        },
        poster_reason: "'Urgent' works better when you say why. Add the deadline or the day you need the person to start.",
        moderator_note: "'Urgent' without a specific deadline or reason.",
    },
];
// ─── Engine ─────────────────────────────────────────────────────────────────
/**
 * Evaluate every rule against the post. Returns all hits so the poster
 * gets a comprehensive edit list in one round-trip.
 *
 * This function is pure — no DB, no network, no logging. Testable with
 * plain unit tests. Cost per call ~sub-millisecond for typical posts.
 */
function evaluatePostAgainstRules(ctx) {
    const combinedText = `${ctx.title}\n${ctx.description}`;
    const hits = [];
    for (const rule of exports.SCAM_RULES) {
        if (rule.onlyIfCategoryIn && !rule.onlyIfCategoryIn.includes(ctx.category))
            continue;
        if (rule.exceptIfCategoryIn && rule.exceptIfCategoryIn.includes(ctx.category))
            continue;
        const matched = typeof rule.pattern === "function"
            ? rule.pattern(ctx)
            : rule.pattern.test(combinedText);
        if (matched) {
            hits.push({
                ruleId: rule.id,
                severity: rule.severity,
                posterReason: rule.poster_reason,
                moderatorNote: rule.moderator_note,
            });
        }
    }
    const hasReject = hits.some(h => h.severity === "reject");
    const hasFlag = hits.some(h => h.severity === "flag");
    return {
        hits,
        hasReject,
        hasFlag,
        layer3Decision: hasReject ? "reject" : hasFlag ? "flag" : "approve",
    };
}
