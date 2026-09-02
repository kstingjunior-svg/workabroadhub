"use strict";
/**
 * server/utils/retry.ts
 *
 * Generic async retry wrapper with fixed 2 s delay between attempts.
 * Mirrors the reference implementation exactly; retries defaults to 3
 * (meaning up to 4 total attempts: 1 initial + 3 retries).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWithRetry = generateWithRetry;
async function generateWithRetry(fn, retries = 3) {
    try {
        return await fn();
    }
    catch (err) {
        if (retries === 0)
            throw err;
        await new Promise((r) => setTimeout(r, 2000));
        return generateWithRetry(fn, retries - 1);
    }
}
