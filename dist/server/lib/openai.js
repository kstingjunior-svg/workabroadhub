"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = void 0;
exports.resetOpenAIClient = resetOpenAIClient;
exports.openAIHealthProbe = openAIHealthProbe;
exports.askGPT = askGPT;
const openai_1 = __importDefault(require("openai"));
// Restored Batch H: routes.ts has ~10 dynamic imports of askGPT that were
// silently failing after the migration.
//
// 2026-08 (Tony's "free tools broken" reports): the client used to be a
// singleton captured at module load. If OPENAI_API_KEY was empty at boot
// OR the key later got rotated / expired (billing lapse), every subsequent
// request went through the stale client and users saw "Connection error"
// forever until a Render restart. Now we build the client lazily and
// re-read env vars each time so a fresh key takes effect immediately.
// Coerce empty/whitespace baseURL to undefined so the SDK falls back to its
// default https://api.openai.com/v1. If we pass "", the SDK treats it as a
// literal URL and every request fails with a generic "Connection error".
function readEnv() {
    const apiKey = (process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
        process.env.OPENAI_API_KEY ||
        "").trim();
    const baseURL = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "").trim() || undefined;
    return { apiKey, baseURL };
}
let _cachedClient = null;
let _cachedKeyPrefix = "";
function buildClient() {
    const { apiKey, baseURL } = readEnv();
    if (!apiKey) {
        console.warn("[OpenAI] No API key configured (OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_API_KEY both empty). " +
            "All AI tools will return an error until a key is set.");
    }
    else if (_cachedKeyPrefix !== apiKey.slice(0, 7)) {
        console.log(`[OpenAI] Client (re)initialised | keyPrefix=${apiKey.slice(0, 7)}*** baseURL=${baseURL ?? "default(api.openai.com)"}`);
        _cachedKeyPrefix = apiKey.slice(0, 7);
    }
    return new openai_1.default({
        apiKey: apiKey || "MISSING_KEY_SEE_LOGS",
        baseURL,
    });
}
// Proxy exposes the same shape as an OpenAI instance but forwards every
// access to a lazily-built (and cache-refreshed) real client. This means
// existing code — `openai.chat.completions.create(...)` etc. — needs no
// changes but always uses the current env vars.
exports.openai = new Proxy({}, {
    get(_target, prop, receiver) {
        if (!_cachedClient)
            _cachedClient = buildClient();
        const value = Reflect.get(_cachedClient, prop, receiver);
        return typeof value === "function" ? value.bind(_cachedClient) : value;
    },
});
/**
 * Reset the cached OpenAI client. Call after known key changes (e.g. admin
 * rotates the env var + hits /api/admin/openai/reload) to pick up the new
 * key without a full server restart.
 */
function resetOpenAIClient() {
    _cachedClient = null;
    _cachedKeyPrefix = "";
    console.log("[OpenAI] Client cache cleared — next call will re-read env vars.");
}
/**
 * Best-effort connectivity probe. Returns { ok: false, reason } if the key
 * is missing, invalid, rate-limited, or the account has no active billing.
 * Used by /api/health/openai so Tony can verify the key is live end-to-end.
 */
async function openAIHealthProbe() {
    const { apiKey } = readEnv();
    if (!apiKey)
        return { ok: false, reason: "no_key" };
    try {
        // Cheapest possible ping — list models. Doesn't burn tokens.
        await exports.openai.models.list();
        return { ok: true, keyPrefix: apiKey.slice(0, 7) };
    }
    catch (err) {
        const status = err?.status ?? err?.response?.status;
        const code = err?.code ?? err?.error?.code;
        let reason = "unknown";
        if (status === 401)
            reason = "invalid_key";
        else if (status === 429)
            reason = "rate_limited_or_billing";
        else if (code === "ECONNREFUSED" || code === "ETIMEDOUT")
            reason = "network";
        else if (err?.message)
            reason = err.message.slice(0, 200);
        return { ok: false, reason, keyPrefix: apiKey.slice(0, 7) };
    }
}
async function askGPT(prompt) {
    const res = await exports.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "You are a professional career assistant." },
            { role: "user", content: prompt },
        ],
        temperature: 0.4,
    });
    return res.choices[0].message.content ?? "";
}
