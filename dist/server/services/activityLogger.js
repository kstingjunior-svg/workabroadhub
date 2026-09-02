"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = logActivity;
const db_1 = require("../db");
const schema_1 = require("../../shared/schema");
/**
 * Fire-and-forget activity logger. Never throws — errors are swallowed
 * so a logging failure never disrupts the main request flow.
 */
function logActivity(opts) {
    setImmediate(async () => {
        try {
            await db_1.db.insert(schema_1.activityLogs).values({
                event: opts.event,
                userId: opts.userId ?? null,
                email: opts.email ?? null,
                meta: opts.meta ?? null,
                ip: opts.ip ?? null,
            });
        }
        catch (err) {
            // Silent — logging must never crash the app
            console.warn("[ActivityLogger] Failed to write log:", err.message);
        }
    });
}
