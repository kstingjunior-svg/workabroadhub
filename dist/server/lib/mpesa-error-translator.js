"use strict";
/**
 * Translate Daraja STK Push error codes into Kenyan-friendly messages with a
 * clear next step. The goal: every M-Pesa failure ends with the user knowing
 * exactly what to do, not staring at a Safaricom error code.
 *
 * Founder ask (2026-06): "make sure that we don't have failed M Pesa's when
 * people are trying to upgrade." Failed M-Pesa is almost never a code bug —
 * it's usually one of the same 8 user-facing situations, and each one has
 * an obvious next action if we tell the user what it is.
 *
 * Sources:
 *   - Daraja Stk Push response codes  https://developer.safaricom.co.ke
 *   - M-Pesa receipt error codes (1, 1019, 1032, 1037, etc.)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MPESA_FALLBACK = void 0;
exports.friendlyMpesaError = friendlyMpesaError;
const PAYBILL_FALLBACK_MESSAGE = "If this keeps failing, pay manually: M-Pesa Paybill 4153025, Account = your email.";
// Common Daraja STK + receipt error codes mapped to friendly Kenyan messages.
const MAP = [
    // ── Insufficient balance ──────────────────────────────────────────────
    {
        match: /1037|Insufficient balance|insufficient funds/i,
        build: (raw) => ({
            daraja_code: raw,
            title: "Not enough M-Pesa balance",
            message: "Your M-Pesa wallet doesn't have enough to pay this right now.",
            next_step: "Top up via Lipa Na M-Pesa, M-Pesa agent, or your bank, then try again. " + PAYBILL_FALLBACK_MESSAGE,
            retry_safe: false,
            offer_paybill: true,
            bad_phone: false,
        }),
    },
    // ── Wrong PIN entered ─────────────────────────────────────────────────
    {
        match: /1032|Wrong PIN|invalid PIN/i,
        build: (raw) => ({
            daraja_code: raw,
            title: "Wrong M-Pesa PIN",
            message: "The PIN you entered didn't match your M-Pesa account.",
            next_step: "Tap 'Pay again' below and enter your correct PIN — same one you use at the M-Pesa shop.",
            retry_safe: true,
            offer_paybill: false,
            bad_phone: false,
        }),
    },
    // ── User cancelled / "DS Timeout user cannot be reached" ──────────────
    {
        match: /1032|Request cancelled by user|DS timeout user cannot be reached|1037/i,
        build: (raw) => ({
            daraja_code: raw,
            title: "You cancelled or missed the prompt",
            message: "The M-Pesa pop-up went away before you finished. That's fine — happens to all of us.",
            next_step: "Tap 'Pay again' below. When the M-Pesa screen appears on your phone, enter your PIN and tap OK.",
            retry_safe: true,
            offer_paybill: true,
            bad_phone: false,
        }),
    },
    // ── Phone unreachable / off / no signal ───────────────────────────────
    {
        match: /1019|1001|SMSC ID|Subscriber tagging mismatch|cannot be reached/i,
        build: (raw) => ({
            daraja_code: raw,
            title: "Your phone didn't get the M-Pesa prompt",
            message: "Safaricom couldn't reach your phone right now — could be poor network, or your line is busy.",
            next_step: "Make sure your phone has signal (the same line you pay with), close any other M-Pesa pop-ups, then try again.",
            retry_safe: true,
            offer_paybill: true,
            bad_phone: false,
        }),
    },
    // ── Phone number not registered for M-Pesa ────────────────────────────
    {
        match: /subscriber not registered|not a valid M[ -]?Pesa|MSISDN does not exist/i,
        build: (raw) => ({
            daraja_code: raw,
            title: "This phone isn't on M-Pesa",
            message: "The number you entered isn't registered for M-Pesa. We can only pull payments from Safaricom-active M-Pesa lines.",
            next_step: "Enter your real M-Pesa phone (the SIM you use for M-Pesa transactions). It must be a Safaricom number with M-Pesa active.",
            retry_safe: true,
            offer_paybill: true,
            bad_phone: true,
        }),
    },
    // ── Shortcode not activated for STK push (admin issue) ────────────────
    {
        match: /400\.002\.02|Bad Request - Invalid BusinessShortCode/i,
        build: (raw) => ({
            daraja_code: raw,
            title: "Our M-Pesa setup hit a snag",
            message: "Our shortcode isn't fully activated for STK Push yet. This is on our side — not your fault.",
            next_step: PAYBILL_FALLBACK_MESSAGE + " We're on it. Sorry.",
            retry_safe: false,
            offer_paybill: true,
            bad_phone: false,
        }),
    },
    // ── Wrong credentials (admin issue) ───────────────────────────────────
    {
        match: /500\.001\.1001|Wrong credentials|invalid (consumer key|access token)/i,
        build: (raw) => ({
            daraja_code: raw,
            title: "M-Pesa connection problem on our end",
            message: "Our connection to Safaricom hiccupped. Definitely our problem, not yours.",
            next_step: PAYBILL_FALLBACK_MESSAGE + " We've been alerted.",
            retry_safe: false,
            offer_paybill: true,
            bad_phone: false,
        }),
    },
    // ── Duplicate request / already pending ───────────────────────────────
    {
        match: /transaction is being processed|duplicate request|Request cancelled by user/i,
        build: (raw) => ({
            daraja_code: raw,
            title: "We already sent an M-Pesa prompt to your phone",
            message: "Check your phone — there's probably an M-Pesa screen waiting. If you don't see one, wait 30 seconds and try again.",
            next_step: "Look at your phone first. If the M-Pesa pop-up is there, enter your PIN. If not, wait half a minute, then tap 'Pay again'.",
            retry_safe: false,
            offer_paybill: true,
            bad_phone: false,
        }),
    },
    // ── Rate limit ────────────────────────────────────────────────────────
    {
        match: /too many requests|rate limit|throttl/i,
        build: (raw) => ({
            daraja_code: raw,
            title: "Too many attempts in a row",
            message: "M-Pesa is asking us to wait a moment before trying again.",
            next_step: "Wait one minute, then tap 'Pay again'. " + PAYBILL_FALLBACK_MESSAGE,
            retry_safe: false,
            offer_paybill: true,
            bad_phone: false,
        }),
    },
];
/**
 * Translate any raw Safaricom-shaped error into a friendly user-facing object.
 * Accepts:
 *   - A string (Daraja errorMessage / ResultDesc / our own thrown Error)
 *   - A Daraja response body { errorCode, errorMessage }
 *   - A Daraja STK callback { ResultCode, ResultDesc }
 *   - Any thrown Error (.message used as the haystack)
 */
function friendlyMpesaError(raw) {
    let haystack = "";
    let daraja_code = null;
    if (raw && typeof raw === "object") {
        const r = raw;
        daraja_code = r.errorCode || r.ResultCode || r.errorcode || null;
        haystack = [
            r.errorMessage, r.errormessage, r.ResultDesc, r.resultDesc,
            r.message, r.description, r.error_description,
            daraja_code ? String(daraja_code) : "",
        ].filter(Boolean).join(" ");
    }
    else if (typeof raw === "string") {
        haystack = raw;
    }
    else {
        haystack = String(raw);
    }
    for (const rule of MAP) {
        const pattern = typeof rule.match === "string" ? rule.match : rule.match;
        if (typeof pattern === "string" ? haystack.includes(pattern) : pattern.test(haystack)) {
            return rule.build(daraja_code || haystack.slice(0, 60));
        }
    }
    // Fallback — never leave the user stuck. Always offer Paybill.
    return {
        daraja_code,
        title: "M-Pesa didn't go through",
        message: "Something stopped the payment from completing. We don't know exactly what.",
        next_step: "Try once more — if it still fails, " + PAYBILL_FALLBACK_MESSAGE,
        retry_safe: true,
        offer_paybill: true,
        bad_phone: false,
    };
}
/** Constants the client can show without an extra round-trip. */
exports.MPESA_FALLBACK = {
    paybill: "4153025",
    accountKey: "your email address",
};
