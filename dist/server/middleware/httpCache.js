"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// HTTP cache header helpers.
//
// These are Express middleware factories that set Cache-Control on responses
// so that Cloudflare / Vercel edge / browser caches can absorb most of the
// read traffic before it ever hits Render.
//
// IMPORTANT — only use on PUBLIC, NON-PERSONALISED responses.
// Anything that varies per user (their plan, their CV, their applications)
// must NEVER be public-cached. Use `noStore()` for those instead.
//
// Defaults are conservative: low max-age + revalidation, so cache busts are
// fast when admin edits content.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicCache = publicCache;
exports.privateCache = privateCache;
exports.noStore = noStore;
/**
 * Public CDN cache with stale-while-revalidate.
 *
 *   maxAge:  how long browsers/CDN treat the response as fresh
 *   swr:     how long they can serve stale while re-fetching in background
 *
 * Use for catalogue endpoints: services list, jobs list, country list, public pricing.
 */
function publicCache(maxAge = 60, swr = 300) {
    const value = `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${swr}`;
    return (_req, res, next) => {
        res.setHeader("Cache-Control", value);
        res.setHeader("Vary", "Accept-Encoding");
        next();
    };
}
/**
 * Private (per-user) cache hint. Tells browsers they CAN cache but CDN MUST NOT.
 * Use for /api/user/plan, /api/me, etc.
 */
function privateCache(maxAge = 30) {
    const value = `private, max-age=${maxAge}, no-store`;
    return (_req, res, next) => {
        res.setHeader("Cache-Control", value);
        res.setHeader("Vary", "Cookie");
        next();
    };
}
/**
 * Hard no-store. Use on mutations + sensitive personalised data.
 */
function noStore() {
    return (_req, res, next) => {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        res.setHeader("Pragma", "no-cache");
        next();
    };
}
