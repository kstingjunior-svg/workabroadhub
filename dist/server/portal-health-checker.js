"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPortalHealthCheck = runPortalHealthCheck;
exports.startPortalHealthChecker = startPortalHealthChecker;
// @ts-nocheck
const db_1 = require("./db");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TIMEOUT_MS = 5000;
const STARTUP_DELAY_MS = 20000;
async function runPortalHealthCheck() {
    const portals = await db_1.db
        .select()
        .from(schema_1.verifiedPortals)
        .where((0, drizzle_orm_1.eq)(schema_1.verifiedPortals.isActive, true));
    let active = 0, down = 0, unreachable = 0;
    await Promise.allSettled(portals.map(async (portal) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const start = Date.now();
        try {
            const response = await fetch(portal.url, {
                method: "HEAD",
                signal: controller.signal,
                headers: { "User-Agent": "WorkAbroadHub-PortalChecker/1.0" },
                redirect: "follow",
            });
            clearTimeout(timer);
            const responseTimeMs = Date.now() - start;
            const isOk = response.ok || response.status === 405; // 405 = HEAD not allowed but server is up
            if (isOk)
                active++;
            else
                down++;
            await db_1.db.update(schema_1.verifiedPortals).set({
                lastChecked: new Date(),
                status: isOk ? "active" : "down",
                statusCode: response.status,
                responseTimeMs,
                errorMessage: null,
            }).where((0, drizzle_orm_1.eq)(schema_1.verifiedPortals.id, portal.id));
        }
        catch (err) {
            clearTimeout(timer);
            unreachable++;
            const isTimeout = err?.name === "AbortError";
            await db_1.db.update(schema_1.verifiedPortals).set({
                lastChecked: new Date(),
                status: "unreachable",
                statusCode: null,
                responseTimeMs: null,
                errorMessage: isTimeout ? "Request timeout (5s)" : (err?.message ?? "Unknown error"),
            }).where((0, drizzle_orm_1.eq)(schema_1.verifiedPortals.id, portal.id));
        }
    }));
    return { checked: portals.length, active, down, unreachable };
}
function startPortalHealthChecker() {
    console.log(`[PortalHealth] Health checker started (every 6h, timeout ${TIMEOUT_MS / 1000}s per portal)`);
    setTimeout(async () => {
        try {
            const result = await runPortalHealthCheck();
            console.log(`[PortalHealth] Initial check: ${result.checked} portals — ${result.active} active, ${result.down} down, ${result.unreachable} unreachable`);
        }
        catch (err) {
            console.error("[PortalHealth] Initial check failed:", err);
        }
    }, STARTUP_DELAY_MS);
    setInterval(async () => {
        try {
            const result = await runPortalHealthCheck();
            console.log(`[PortalHealth] Scheduled check: ${result.checked} portals — ${result.active} active, ${result.down} down, ${result.unreachable} unreachable`);
        }
        catch (err) {
            console.error("[PortalHealth] Scheduled check failed:", err);
        }
    }, CHECK_INTERVAL_MS);
}
